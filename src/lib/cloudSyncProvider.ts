import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { logger } from '@/lib/logger'
import {
  authorizeGoogleDriveOnAndroid,
  clearGoogleDriveTokenOnAndroid,
} from './nativeGoogleDriveAuthorization';
import { loadTokens, saveTokens, clearTokens } from './tokenStorage';
import {
  DRIVE_BACKUP_APP_PROPERTY,
  type DriveBackupGeneration,
  type DriveGenerationStore,
  type UploadDriveGenerationRequest,
} from './libraryBundle/adapters/drive';
import {
  GisLoader,
  getCloudSyncWindow,
  type GoogleTokenClient,
  type GoogleTokenResponse,
} from './cloudSyncGisLoader';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface GoogleOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/**
 * Cloud sync interface - can be implemented for Google Drive, Dropbox, etc.
 */
export interface CloudProvider extends Partial<DriveGenerationStore> {
  name: string;
  authenticate(): Promise<void>;
  upload(fileName: string, data: string): Promise<void>;
  download(fileName: string): Promise<string | null>;
  isAuthenticated(): boolean;
  ensureWebSdkReady?(): Promise<void>;
  isWebSdkReady?(): boolean;
}

interface DriveFileResource {
  id?: string;
  name?: string;
  createdTime?: string;
  size?: string;
  appProperties?: Record<string, string>;
}

/**
 * Google Drive cloud provider implementation
 * Uses Google Identity Services (GIS) - new recommended approach
 */
export class GoogleDriveProvider implements CloudProvider {
  name = 'Google Drive';
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private accessTokenExpiresAt: number | null = null;
  private CLIENT_ID = ''; // Set this in your app
  private SCOPES = 'https://www.googleapis.com/auth/drive.file';
  private tokenClient: GoogleTokenClient | null = null;
  private debugLog: string[] = [];
  private readonly tokenExpiryLeewayMs = 60 * 1000;
  private readonly gis = new GisLoader((message, extra) => this.debug(message, extra));

  private readonly desktopClientId: string | null;

  constructor(clientId: string) {
    this.CLIENT_ID = clientId;

    // Desktop (Electron) client ID - separate from web and mobile
    const envDesktopClientId =
      typeof import.meta !== 'undefined' ? import.meta.env.VITE_GOOGLE_CLIENT_ID_DESKTOP ?? null : null;
    this.desktopClientId = envDesktopClientId;

  }

  private debug(message: string, extra?: unknown) {
    const entry = extra !== undefined ? `${message} ${JSON.stringify(extra)}` : message;
    logger.log(`[CloudSync] ${entry}`);
    this.debugLog = [...this.debugLog, entry].slice(-200);
    // Only mirror the debug log onto `window` in development. In production this
    // internal log has no consumer and would just be an extra surface exposed to
    // any script on the page.
    if (import.meta.env.DEV) {
      const cloudSyncWindow = getCloudSyncWindow();
      if (cloudSyncWindow) {
        cloudSyncWindow.CloudSyncDebug = this.debugLog;
        window.dispatchEvent(new CustomEvent('cloud-sync-debug', { detail: entry }));
      }
    }
  }

  async authenticate(): Promise<void> {
    this.debug('authenticate() called');

    // Check for Electron by looking for the electronOAuth bridge
    const isElectron = !!getCloudSyncWindow()?.electronOAuth;

    if (isElectron) {
      await this.authenticateElectron();
      return;
    }

    if (Capacitor.isNativePlatform()) {
      await this.authenticateNative();
      return;
    }

    if (!this.CLIENT_ID) {
      throw new Error('Google Drive client ID is not configured.');
    }

    await this.authenticateWeb();
  }

  private async authenticateElectron(): Promise<void> {
    this.debug('authenticateElectron() invoked');

    // Check for cached tokens first
    try {
      const cached = await loadTokens();
      if (cached) {
        this.debug('authenticateElectron() found cached tokens');
        this.accessToken = cached.accessToken;
        this.refreshToken = cached.refreshToken ?? null;
        this.accessTokenExpiresAt = cached.expiresAt;

        if (this.accessTokenExpiresAt && this.accessTokenExpiresAt > Date.now() + this.tokenExpiryLeewayMs) {
          this.debug('authenticateElectron() using cached access token');
          return;
        }

        if (this.refreshToken) {
          this.debug('authenticateElectron() refreshing expired token');
          try {
            await this.refreshAccessToken();
            return;
          } catch (error) {
            console.warn('[CloudSync] Failed to refresh cached Google token', error);
            this.debug('authenticateElectron() refresh failed, clearing cache');
            await this.wipeStoredTokens();
          }
        } else {
          this.debug('authenticateElectron() cached token expired with no refresh token');
          await this.wipeStoredTokens();
        }
      }
    } catch (err) {
      this.debug(`authenticateElectron() error checking cache: ${String(err)}`);
    }

    // Use loopback OAuth
    const electronOAuth = getCloudSyncWindow()?.electronOAuth;
    if (!electronOAuth) {
      throw new Error('Electron OAuth bridge not available');
    }

    // Use desktop client ID if available, otherwise fall back to web client ID
    const clientId = this.desktopClientId || this.CLIENT_ID;
    if (!clientId) {
      throw new Error('No OAuth client ID configured for desktop');
    }

    // Get desktop client secret if available
    const clientSecret =
      typeof import.meta !== 'undefined' ? import.meta.env.VITE_GOOGLE_CLIENT_SECRET_DESKTOP ?? undefined : undefined;

    this.debug('authenticateElectron() starting loopback OAuth flow', { clientId, hasSecret: !!clientSecret });
    const result = await electronOAuth.authenticate({
      clientId,
      clientSecret,
      scope: this.SCOPES,
    });

    if (!result.success) {
      throw new Error(result.error || 'OAuth authentication failed');
    }
    if (!result.tokens) {
      throw new Error('OAuth authentication succeeded without returning tokens');
    }

    this.debug('authenticateElectron() received tokens');
    const accessToken = result.tokens.access_token;
    const refreshToken = result.tokens.refresh_token ?? null;
    const expiresAt = Date.now() + (result.tokens.expires_in * 1000);

    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.accessTokenExpiresAt = expiresAt;

    // Save tokens for future use
    await saveTokens({
      accessToken,
      refreshToken: refreshToken ?? undefined,
      expiresAt,
    });

    this.debug('authenticateElectron() completed successfully');
  }

  async upload(fileName: string, data: string): Promise<void> {
    await this.ensureValidAccessToken();

    const accessToken = this.accessToken;
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    // Check if file exists
    const existingFileId = await this.findFile(fileName);
    this.debug(`upload() existingFileId: ${existingFileId || 'none (will create new)'}`);

    const metadata = {
      name: fileName,
      mimeType: 'application/octet-stream'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([data], { type: 'application/octet-stream' }));

    const url = existingFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    const method = existingFileId ? 'PATCH' : 'POST';

    this.debug(`upload() starting ${method} to Google Drive (${(data.length / 1024 / 1024).toFixed(1)} MB)...`);

    try {
      const response = await this.fetchDrive(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        this.debug(`upload() failed: ${response.status} ${errorText}`);
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      this.debug('upload() completed successfully');
      logger.log('File uploaded to Google Drive successfully');
    } catch (error) {
      this.debug(`upload() error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async download(fileName: string): Promise<string | null> {
    await this.ensureValidAccessToken();

    const accessToken = this.accessToken;
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    this.debug(`download() called for ${fileName}`);
    const fileId = await this.findFile(fileName);
    if (!fileId) {
      this.debug(`No Drive file found for ${fileName}`);
      return null;
    }

    const response = await this.fetchDrive(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    return await response.text();
  }

  private generationFromDriveFile(file: DriveFileResource): DriveBackupGeneration {
    const properties = file.appProperties ?? {};
    const createdAt = properties.createdAt;
    const encryptedByteLength = Number(properties.encryptedByteLength);
    const bundleFormatVersion = Number(properties.bundleFormatVersion);
    if (
      !file.id || !file.name || !createdAt || Number.isNaN(Date.parse(createdAt))
      || properties[DRIVE_BACKUP_APP_PROPERTY] !== 'true'
      || !properties.appVersion
      || !Number.isSafeInteger(bundleFormatVersion) || bundleFormatVersion < 1
      || !Number.isSafeInteger(encryptedByteLength) || encryptedByteLength < 1
      || !/^[a-f0-9]{64}$/.test(properties.ciphertextSha256 ?? '')
      || file.size !== undefined && Number(file.size) !== encryptedByteLength
    ) throw new Error('Google Drive returned invalid backup generation metadata.');
    return {
      id: file.id,
      name: file.name,
      createdAt,
      appVersion: properties.appVersion,
      bundleFormatVersion,
      encryptedByteLength,
      ciphertextSha256: properties.ciphertextSha256,
    };
  }

  async uploadGeneration(request: UploadDriveGenerationRequest): Promise<DriveBackupGeneration> {
    await this.ensureValidAccessToken();
    if (!this.accessToken) throw new Error('Not authenticated');
    const appProperties = {
      [DRIVE_BACKUP_APP_PROPERTY]: 'true',
      createdAt: request.metadata.createdAt,
      appVersion: request.metadata.appVersion,
      bundleFormatVersion: String(request.metadata.bundleFormatVersion),
      encryptedByteLength: String(request.metadata.encryptedByteLength),
      ciphertextSha256: request.metadata.ciphertextSha256,
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({
      name: request.name,
      mimeType: 'application/octet-stream',
      appProperties,
    })], { type: 'application/json' }));
    form.append('file', new Blob([request.encryptedData], { type: 'application/octet-stream' }));
    const response = await this.fetchDrive(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,size,appProperties',
      { method: 'POST', headers: { Authorization: `Bearer ${this.accessToken}` }, body: form },
    );
    if (!response.ok) throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    return this.generationFromDriveFile(await response.json() as DriveFileResource);
  }

  async listGenerations(): Promise<DriveBackupGeneration[]> {
    await this.ensureValidAccessToken();
    if (!this.accessToken) throw new Error('Not authenticated');
    const query = `appProperties has { key='${DRIVE_BACKUP_APP_PROPERTY}' and value='true' } and trashed=false`;
    const fields = 'files(id,name,createdTime,size,appProperties)';
    const response = await this.fetchDrive(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime%20desc&fields=${encodeURIComponent(fields)}`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } },
    );
    if (!response.ok) throw new Error(`Backup generation search failed: ${response.statusText}`);
    const data = await response.json() as { files?: DriveFileResource[] };
    return (data.files ?? []).map((file) => this.generationFromDriveFile(file));
  }

  async downloadGeneration(id: string): Promise<string> {
    await this.ensureValidAccessToken();
    if (!this.accessToken) throw new Error('Not authenticated');
    const response = await this.fetchDrive(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } },
    );
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
    return response.text();
  }

  async deleteGeneration(id: string): Promise<void> {
    await this.ensureValidAccessToken();
    if (!this.accessToken) throw new Error('Not authenticated');
    const response = await this.fetchDrive(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${this.accessToken}` } },
    );
    if (!response.ok && response.status !== 404) throw new Error(`Delete failed: ${response.statusText}`);
  }

  private async findFile(fileName: string): Promise<string | null> {
    await this.ensureValidAccessToken();

    const accessToken = this.accessToken;
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    this.debug(`findFile() searching for ${fileName}`);
    const response = await this.fetchDrive(
      `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and trashed=false&fields=files(id,name)`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.files?.[0]?.id || null;
  }

  isAuthenticated(): boolean {
    if (!this.accessToken) {
      return false;
    }

    if (!Capacitor.isNativePlatform()) {
      return true;
    }

    if (!this.accessTokenExpiresAt) {
      return true;
    }

    return this.accessTokenExpiresAt > Date.now() + this.tokenExpiryLeewayMs;
  }

  private async authenticateWeb(): Promise<void> {
    if (!this.gis.isReady()) {
      await this.ensureWebSdkReady();
    }

    return new Promise<void>((resolve, reject) => {
      try {
        const googleAccounts = getCloudSyncWindow()?.google?.accounts;
        if (!googleAccounts?.oauth2?.initTokenClient) {
          reject(new Error('Google Identity Services is unavailable in this environment'));
          return;
        }

        this.debug('Initializing google.accounts.oauth2.initTokenClient');
        this.tokenClient = googleAccounts.oauth2.initTokenClient({
          client_id: this.CLIENT_ID,
          scope: this.SCOPES,
          callback: (response: GoogleTokenResponse) => {
            this.debug('Token client callback', response);
            if (response.error) {
              console.error('Auth error:', response);
              reject(new Error(response.error));
              return;
            }
            if (!response.access_token) {
              reject(new Error('Google Identity Services response did not include an access token'));
              return;
            }

            this.accessToken = response.access_token;
            this.refreshToken = null;
            this.accessTokenExpiresAt = null;
            this.debug('Google Drive authenticated successfully (web)');
            resolve();
          },
        });

        this.debug('Requesting access token with prompt=consent');
        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (error) {
        console.error('Authentication error:', error);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async authenticateNative(): Promise<void> {
    this.debug('authenticateNative() invoked');

    try {
      this.debug('authenticateNative() requesting an Android authorization token');
      const token = await authorizeGoogleDriveOnAndroid();
      this.accessToken = token.accessToken;
      this.refreshToken = null;
      this.accessTokenExpiresAt = Date.now() + token.expiresIn * 1000;
      this.debug('authenticateNative() obtained new tokens');
    } catch (error) {
      console.error('[CloudSync] Native authentication failed', error);
      this.accessToken = null;
      this.refreshToken = null;
      this.accessTokenExpiresAt = null;
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async refreshAccessToken(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('refreshAccessToken is only supported on native platforms.');
    }

    if (!this.refreshToken) {
      throw new Error('No refresh token available.');
    }

    const params = new URLSearchParams({
      client_id: this.desktopClientId || this.CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    });
    this.appendClientSecret(params);

    const response = await CapacitorHttp.post({
      url: GOOGLE_TOKEN_ENDPOINT,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: params.toString(),
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Token refresh failed with status ${response.status}`);
    }

    if (!response.data?.access_token) {
      throw new Error('Token refresh response missing access_token.');
    }

    await this.applyNativeTokenResponse(response.data as GoogleOAuthTokens);
    this.debug('refreshAccessToken() succeeded');
  }

  private async ensureValidAccessToken(): Promise<void> {
    if (!this.accessToken) {
      this.debug('ensureValidAccessToken(): no token loaded, authenticating');
      await this.authenticate();
    }

    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    if (this.accessTokenExpiresAt && this.accessTokenExpiresAt > Date.now() + this.tokenExpiryLeewayMs) {
      return;
    }

    if (Capacitor.getPlatform() === 'android') {
      const expiredToken = this.accessToken;
      this.accessToken = null;
      this.accessTokenExpiresAt = null;
      if (expiredToken) {
        await clearGoogleDriveTokenOnAndroid(expiredToken).catch((error) => {
          console.warn('[CloudSync] Failed to clear expired Android Google token', error);
        });
      }
      await this.authenticateNative();
      return;
    }

    if (this.refreshToken) {
      try {
        this.debug('ensureValidAccessToken(): refreshing token');
        await this.refreshAccessToken();
        return;
      } catch (error) {
        console.warn('[CloudSync] Access token refresh failed', error);
        this.debug('ensureValidAccessToken(): refresh failed, wiping tokens');
        await this.wipeStoredTokens();
      }
    } else {
      await this.wipeStoredTokens();
    }

    throw new Error('Access token expired; please sign in again.');
  }

  private async fetchDrive(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    await this.ensureValidAccessToken();
    const request = () => fetch(input, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    let response = await request();
    if (response.status !== 401 || Capacitor.getPlatform() !== 'android') {
      return response;
    }

    this.debug('Drive rejected the Android access token; clearing it and retrying once');
    const rejectedToken = this.accessToken;
    this.accessToken = null;
    this.accessTokenExpiresAt = null;
    if (rejectedToken) {
      await clearGoogleDriveTokenOnAndroid(rejectedToken).catch((error) => {
        console.warn('[CloudSync] Failed to clear rejected Android Google token', error);
      });
    }
    await this.authenticateNative();
    response = await request();
    return response;
  }

  private async applyNativeTokenResponse(tokens: GoogleOAuthTokens): Promise<void> {
    const expiresInRaw = tokens.expires_in ?? 0;
    const expiresIn = Number.isFinite(Number(expiresInRaw)) ? Number(expiresInRaw) : 0;
    const expiresAt = Date.now() + expiresIn * 1000;
    const refreshToken = tokens.refresh_token ?? this.refreshToken ?? null;

    this.accessToken = tokens.access_token;
    this.refreshToken = refreshToken;
    this.accessTokenExpiresAt = expiresAt;

    await saveTokens({
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiresAt: this.accessTokenExpiresAt,
    });
    this.debug('applyNativeTokenResponse(): tokens persisted');
  }

  private async wipeStoredTokens(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.accessTokenExpiresAt = null;
    await clearTokens();
  }

  private appendClientSecret(params: URLSearchParams): void {
    const clientSecret =
      typeof import.meta !== 'undefined' ? import.meta.env.VITE_GOOGLE_CLIENT_SECRET_DESKTOP ?? undefined : undefined;
    if (clientSecret && clientSecret.length > 0) {
      params.append('client_secret', clientSecret);
    }
  }

  /**
   * Ensure Google Identity Services is available. Handles web and native
   * environments. Delegates the actual script loading to {@link GisLoader}.
   */
  private ensureGoogleIdentityServicesLoaded(): Promise<void> {
    return this.gis.ensureLoaded();
  }

  async ensureWebSdkReady(): Promise<void> {
    // On Electron, we use loopback OAuth (no GIS SDK needed)
    // On native mobile, we use native OAuth (no GIS SDK needed)
    const isElectron = !!getCloudSyncWindow()?.electronOAuth;
    if (isElectron || Capacitor.isNativePlatform()) {
      return;
    }

    // Only web browser needs GIS SDK
    if (!this.gis.isReady()) {
      await this.ensureGoogleIdentityServicesLoaded();
    }
  }

  isWebSdkReady(): boolean {
    // Electron uses loopback OAuth (always ready)
    const isElectron = !!getCloudSyncWindow()?.electronOAuth;
    if (isElectron) {
      return true;
    }

    // Native mobile uses native OAuth (always ready)
    if (Capacitor.isNativePlatform()) {
      return true;
    }

    // Web browser needs GIS SDK
    return this.gis.isReady();
  }

  private loadGisForNative(): Promise<void> {
    return this.gis.loadForNative();
  }
}
