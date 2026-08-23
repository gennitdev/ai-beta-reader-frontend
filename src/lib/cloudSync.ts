import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { logger } from '@/lib/logger'
import { gzipSync, gunzipSync } from 'fflate';
import { Encryption } from './encryption';
import { db, type ImageAsset } from './database';
import {
  authorizeGoogleDriveOnAndroid,
  clearGoogleDriveTokenOnAndroid,
} from './nativeGoogleDriveAuthorization';
import { loadTokens, saveTokens, clearTokens } from './tokenStorage';
import {
  dataUrlToBlob,
  inspectImageContent,
  type ImageContentStore,
} from './imageContentStore';
import { createRuntimeImageContentStore } from './runtimeImageContentStore';
import {
  captureImageContentSnapshot,
  enrichImageRowsForBackup,
  restoreImageContentSnapshot,
  restoreImageRows,
  stripImageDataFromRows,
  type ImageContentSnapshot,
} from './cloudSyncImageAssets';
import { parseDatabaseImportData, type ImportRow } from './databaseImportExport';
import packageInfo from '../../package.json';
import { createFullLibraryBundleExport } from './libraryBundle/export';
import { LIBRARY_BUNDLE_FORMAT_VERSION } from './libraryBundle/schemas';
import { createPortableId } from './portableIds';
import {
  DRIVE_BACKUP_APP_PROPERTY,
  createDriveBackupGeneration,
  encryptedGenerationIntegrity,
  type DriveBackupGeneration,
  type DriveGenerationStore,
  type UploadDriveGenerationRequest,
} from './libraryBundle/adapters/drive';
import { previewBundleZipImport } from './libraryBundle/importPreview';
import {
  importCanonicalLibraryModel,
  removeCanonicalAssetsAbsentFromModel,
} from './libraryBundle/restore';
import { prepareLibraryReplacement, replaceLibraryWithRecovery } from './recovery/replacement';
import { createRuntimeRecoveryStore } from './recovery/runtime';
import type { RecoveryStore } from './recovery/model';

// Prefix to identify compressed backups
const COMPRESSED_PREFIX = 'GZ1:';

function hasZipSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  return (bytes[2] === 0x03 && bytes[3] === 0x04)
    || (bytes[2] === 0x05 && bytes[3] === 0x06)
    || (bytes[2] === 0x07 && bytes[3] === 0x08);
}

interface BackupPayload {
  image_assets?: ImportRow[];
  [key: string]: unknown;
}

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

interface GoogleTokenClient {
  requestAccessToken(options: { prompt: string }): void;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
}

interface GoogleOauth2Namespace {
  initTokenClient?: (config: GoogleTokenClientConfig) => GoogleTokenClient;
  default?: {
    initTokenClient?: (config: GoogleTokenClientConfig) => GoogleTokenClient;
  };
  _default?: {
    initTokenClient?: (config: GoogleTokenClientConfig) => GoogleTokenClient;
  };
}

interface CloudSyncWindow extends Window {
  google?: {
    accounts?: {
      oauth2?: GoogleOauth2Namespace;
    };
  };
  CloudSyncDebug?: string[];
}

function getCloudSyncWindow(): CloudSyncWindow | null {
  return typeof window === 'undefined' ? null : window as CloudSyncWindow;
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
  private gisLoadingPromise: Promise<void> | null = null;
  private debugLog: string[] = [];
  private readonly tokenExpiryLeewayMs = 60 * 1000;
  // On Electron, we use web auth which requires GIS SDK, so webSdkReady starts as false
  private webSdkReady = Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'electron';

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
    if (!this.webSdkReady) {
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
   * Ensure Google Identity Services is available. Handles web and native environments.
   */
  private ensureGoogleIdentityServicesLoaded(): Promise<void> {
    this.debug('Ensuring GIS loaded');

    if (typeof window === 'undefined') {
      return Promise.reject(new Error('Window is undefined'));
    }

    if (getCloudSyncWindow()?.google?.accounts?.oauth2) {
      this.debug('GIS already present');
      this.webSdkReady = true;
      return Promise.resolve();
    }

    if (this.gisLoadingPromise) {
      this.debug('Reusing existing GIS promise');
      return this.gisLoadingPromise;
    }

    const isHostedHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const isElectron = Capacitor.getPlatform() === 'electron';
    this.debug(`ensureGoogleIdentityServicesLoaded native=${Capacitor.isNativePlatform()} electron=${isElectron} hostedHttps=${isHostedHttps} scriptPresent=${Boolean(document.querySelector('script[data-google-identity]'))}`);

    // On Electron, always use loadGisForWeb since it can load external scripts
    if (isElectron) {
      this.gisLoadingPromise = this.loadGisForWeb().then(() => this.debug('GIS loaded via web script (Electron)'));
    } else if (Capacitor.isNativePlatform()) {
      if (isHostedHttps) {
        this.gisLoadingPromise = this.loadGisForWeb()
          .then(() => this.debug('GIS loaded via web script'))
          .catch(async (err) => {
            console.warn('[CloudSync] Web GIS load failed on native platform, falling back to native loader.', err);
            this.debug(`Web GIS load failed on native platform: ${String(err)}`);
            await this.loadGisForNative();
            this.debug('GIS loaded via native fetch fallback');
          });
      } else {
        this.gisLoadingPromise = this.loadGisForNative();
        this.debug('Using native GIS loader (non-HTTPS origin)');
      }
    } else {
      this.gisLoadingPromise = this.loadGisForWeb().then(() => this.debug('GIS loaded via web script'));
    }

    this.gisLoadingPromise = this.gisLoadingPromise.then(() => {
      this.webSdkReady = true;
    });

    return this.gisLoadingPromise;
  }

  async ensureWebSdkReady(): Promise<void> {
    // On Electron, we use loopback OAuth (no GIS SDK needed)
    // On native mobile, we use native OAuth (no GIS SDK needed)
    const isElectron = !!getCloudSyncWindow()?.electronOAuth;
    if (isElectron || Capacitor.isNativePlatform()) {
      return;
    }

    // Only web browser needs GIS SDK
    if (!this.webSdkReady) {
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
    return this.webSdkReady;
  }

  private async loadGisForNative(): Promise<void> {
    try {
      this.debug('loadGisForNative: fetching script');
      const response = await CapacitorHttp.get({
        url: 'https://accounts.google.com/gsi/client',
        responseType: 'text',
      });

      const scriptSource = typeof response.data === 'string' ? response.data : null;

      if (!scriptSource) {
        throw new Error('Empty Google Identity Services payload');
      }

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.dataset.googleIdentity = 'true';
      script.text = scriptSource;

      script.onload = () => {
        this.debug('loadGisForNative: script onload');
        const oauth2 = getCloudSyncWindow()?.google?.accounts?.oauth2;
        if (oauth2 && oauth2._default && !oauth2.default) {
          oauth2.default = oauth2._default;
        }
      };

      document.head.appendChild(script);
      this.debug('loadGisForNative: script appended, waiting for readiness');

      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          console.error('[CloudSync] loadGisForNative: timeout waiting for GIS readiness');
          this.debug('loadGisForNative: timeout waiting for readiness');
          reject(new Error('Google Identity Services failed to initialize'));
        }, 5000);

        const wrappedResolve = () => {
          clearTimeout(timeoutId);
          this.debug('loadGisForNative: GIS ready');
          resolve();
        };

        const wrappedReject = (error: Error) => {
          clearTimeout(timeoutId);
          this.debug(`loadGisForNative error: ${String(error)}`);
          reject(error);
        };

        script.addEventListener('error', () => wrappedReject(new Error('Failed to load Google Identity Services')));

        const checkLoop = () => {
          const oauth2 = getCloudSyncWindow()?.google?.accounts?.oauth2;
          if (oauth2 && (oauth2.initTokenClient || oauth2.default?.initTokenClient)) {
            if (!oauth2.initTokenClient && oauth2.default?.initTokenClient) {
              oauth2.initTokenClient = oauth2.default.initTokenClient.bind(oauth2.default);
            }
            wrappedResolve();
            return;
          }
          setTimeout(checkLoop, 50);
        };

        checkLoop();
      });
    } catch (error) {
      this.gisLoadingPromise = null;
      console.error('[CloudSync] loadGisForNative failed', error);
      this.debug(`loadGisForNative failed: ${String(error)}`);
      throw error instanceof Error ? error : new Error('Failed to load Google Identity Services');
    }
  }

  private loadGisForWeb(): Promise<void> {
    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity]');

      if (existingScript) {
        if (getCloudSyncWindow()?.google?.accounts?.oauth2) {
          this.debug('loadGisForWeb: existing GIS present');
          resolve();
          return;
        }

        existingScript.addEventListener('load', () => {
          this.debug('loadGisForWeb: existing script load event');
          resolve();
        }, { once: true });
        existingScript.addEventListener('error', () => {
          this.gisLoadingPromise = null;
          reject(new Error('Failed to load Google Identity Services'));
        }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = 'true';
      script.onload = () => {
        this.debug('loadGisForWeb: script load event');
        resolve();
      };
      script.onerror = () => {
        console.error('[CloudSync] Failed to load Google Identity Services script via <script> element.');
        this.gisLoadingPromise = null;
        reject(new Error('Failed to load Google Identity Services'));
      };

      document.head.appendChild(script);
    });
  }
}

/**
 * Cloud sync manager - handles backup and restore
 */
export class CloudSync {
  private provider: CloudProvider;
  private backupFileName = 'ai-beta-reader-backup.enc';
  private readonly recoveryStore?: RecoveryStore;
  private readonly now: () => Date;
  private readonly appVersion: string;

  constructor(provider: CloudProvider, options: {
    recoveryStore?: RecoveryStore;
    now?: () => Date;
    appVersion?: string;
  } = {}) {
    this.provider = provider;
    this.recoveryStore = options.recoveryStore;
    this.now = options.now ?? (() => new Date());
    this.appVersion = options.appVersion ?? packageInfo.version;
  }

  private generationStore(): DriveGenerationStore {
    if (
      !this.provider.uploadGeneration || !this.provider.listGenerations
      || !this.provider.downloadGeneration || !this.provider.deleteGeneration
    ) throw new Error('This cloud provider does not support versioned library backups.');
    return this.provider as DriveGenerationStore;
  }

  private hasGenerationStore(): boolean {
    return Boolean(
      this.provider.uploadGeneration && this.provider.listGenerations
      && this.provider.downloadGeneration && this.provider.deleteGeneration,
    );
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.provider.isAuthenticated()) await this.provider.authenticate();
  }

  async listBackupGenerations(): Promise<DriveBackupGeneration[]> {
    await this.ensureAuthenticated();
    return (await this.generationStore().listGenerations())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
  }

  private async assetBytes(asset: ImageAsset, store: ImageContentStore | null): Promise<Uint8Array> {
    let stored: Blob | null = null;
    try {
      stored = store ? await store.read(asset) : null;
    } catch (error) {
      if (!asset.image_data) throw error;
    }
    if (stored) return new Uint8Array(await stored.arrayBuffer());
    if (asset.image_data) return new Uint8Array(await dataUrlToBlob(asset.image_data).arrayBuffer());
    throw new Error(`Image ${asset.id} is missing required bytes.`);
  }

  /** Create an encrypted canonical ZIP as a new immutable Drive generation. */
  async backup(password: string): Promise<DriveBackupGeneration> {
    await this.ensureAuthenticated();
    const createdAt = this.now().toISOString();
    const databaseBackup = await db.exportDatabase();
    const imageStore = createRuntimeImageContentStore();
    const bundle = await createFullLibraryBundleExport(databaseBackup, {
      bundleId: createPortableId('bundle'),
      exportedAt: createdAt,
      appVersion: this.appVersion,
      readAssetBytes: (asset) => this.assetBytes(asset, imageStore),
    });
    const encrypted = await Encryption.encrypt(bundle.zipBytes, password);
    return createDriveBackupGeneration(this.generationStore(), encrypted, {
      createdAt,
      appVersion: this.appVersion,
      bundleFormatVersion: LIBRARY_BUNDLE_FORMAT_VERSION,
    });
  }

  /**
   * Internal one-release fallback for creating the pre-bundle JSON backup.
   * This is intentionally not exposed in Settings; restore support is permanent.
   */
  async backupLegacyJson(password: string): Promise<void> {
    if (!this.provider.isAuthenticated()) {
      await this.provider.authenticate();
    }

    logger.log('Exporting database...');
    const dbData = await db.exportDatabase();

    // Enrich temporary export rows from the active image content store. Live
    // browser/Electron SQLite rows keep image_data null.
    let enrichedData = dbData;
    const imageContentStore = createRuntimeImageContentStore();
    if (imageContentStore) {
      logger.log('[CloudSync] Reading image content for backup...');
      try {
        const exportJson = JSON.parse(new TextDecoder().decode(dbData)) as BackupPayload;
        logger.log('[CloudSync] Export has image_assets:', exportJson.image_assets?.length || 0, 'items');
        if (Array.isArray(exportJson.image_assets) && exportJson.image_assets.length > 0) {
          const result = await enrichImageRowsForBackup(
            exportJson.image_assets,
            imageContentStore,
          );
          exportJson.image_assets = result.rows;
          if (result.missingImageIds.length > 0) {
            console.warn(
              '[CloudSync] Backup contains image metadata with no local content:',
              result.missingImageIds,
            );
          }
        }

        logger.log(`Enriched backup with ${exportJson.image_assets?.length || 0} images`);

        // Stringify and encode, then immediately clear the object
        const jsonString = JSON.stringify(exportJson);
        // Clear the large object to free memory before encoding
        exportJson.image_assets = [];

        enrichedData = new TextEncoder().encode(jsonString);
      } catch (error) {
        console.error('Failed to enrich backup with images:', error);
        throw new Error(
          `Failed to prepare images for backup: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Compress data before encryption to reduce memory usage and upload size
    logger.log(`Compressing ${(enrichedData.length / 1024 / 1024).toFixed(2)} MB of data...`);

    // Use lower compression level for speed and less memory
    const compressed = gzipSync(enrichedData, { level: 4 });
    logger.log(`Compressed to ${(compressed.length / 1024 / 1024).toFixed(2)} MB (${((1 - compressed.length / enrichedData.length) * 100).toFixed(1)}% reduction)`);

    // Free the uncompressed data immediately
    enrichedData = new Uint8Array(0);

    // Small delay to encourage garbage collection
    await new Promise(resolve => setTimeout(resolve, 50));

    logger.log('Encrypting database...');
    const encrypted = await Encryption.encrypt(compressed, password);

    // Prefix with compression marker so restore knows to decompress
    const finalData = COMPRESSED_PREFIX + encrypted;

    logger.log(`Uploading to ${this.provider.name}...`);
    try {
      await this.provider.upload(this.backupFileName, finalData);
      logger.log('✅ Backup complete!');
    } catch (error) {
      console.error('Upload failed:', error);
      throw new Error(`Failed to upload backup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async importCanonicalDatabase(data: Uint8Array): Promise<void> {
    const importJson = JSON.parse(new TextDecoder().decode(data)) as BackupPayload;
    const imageStore = createRuntimeImageContentStore();
    if (Array.isArray(importJson.image_assets) && importJson.image_assets.length > 0 && !imageStore) {
      importJson.image_assets = importJson.image_assets.map((row) => (
        Array.isArray(row) ? row : { ...row, image_data: null }
      ));
      await db.importDatabase(new TextEncoder().encode(JSON.stringify(importJson)));
      return;
    }
    if (imageStore && Array.isArray(importJson.image_assets) && importJson.image_assets.length > 0) {
      importJson.image_assets = importJson.image_assets.map((row) => {
        if (Array.isArray(row) || typeof row !== 'object' || row === null) return row;
        const id = String(row.id ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
        return { ...row, file_path: row.file_path || `images/library/${id}/${String(row.file_name ?? 'image')}` };
      });
      const snapshot = await captureImageContentSnapshot(importJson.image_assets, imageStore);
      try {
        const restored = await restoreImageRows(importJson.image_assets, imageStore);
        importJson.image_assets = restored.rows;
        await db.importDatabase(new TextEncoder().encode(JSON.stringify(importJson)));
        return;
      } catch (error) {
        try {
          await restoreImageContentSnapshot(snapshot, imageStore);
        } catch (rollbackError) {
          console.error('[CloudSync] Failed to roll back canonical image content:', rollbackError);
        }
        throw error;
      }
    }
    await db.importDatabase(data);
  }

  private async restoreBundle(zipBytes: Uint8Array): Promise<boolean> {
    let currentBackup = await db.exportDatabase();
    const imageStore = createRuntimeImageContentStore();
    const preview = await previewBundleZipImport(zipBytes, currentBackup, {
      readLocalAssetBytes: (asset) => this.assetBytes(asset, imageStore),
    });
    currentBackup = new Uint8Array(0);
    if (!preview.plan.replaceEligible) {
      throw new Error('The Drive backup is not a complete, validated full-library bundle.');
    }
    const createdAt = this.now().toISOString();
    const recoveryStore = this.recoveryStore ?? createRuntimeRecoveryStore();
    const recovery = await prepareLibraryReplacement(
      recoveryStore,
      preview.plan,
      preview.localModel,
      preview.databaseGeneration,
      {
        recoveryId: createPortableId('recovery').replace(/:/g, '-'),
        recoveryBundleId: createPortableId('bundle'),
        createdAt,
        appVersion: this.appVersion,
      },
    );
    // The verified recovery now owns the prior image bytes. They are no longer
    // needed in the active restore heap and can be loaded lazily on rollback.
    preview.localModel.assets.forEach((asset) => { asset.bytes = null; });
    await replaceLibraryWithRecovery(
      recoveryStore,
      preview.plan,
      preview.incomingModel,
      recovery,
      preview.databaseGeneration,
      async (model, phase) => {
        await importCanonicalLibraryModel(model, {
          imageStore,
          importDatabaseBackup: (data) => db.importDatabase(data),
        });
        if (phase === 'rollback') {
          await removeCanonicalAssetsAbsentFromModel(
            imageStore,
            preview.incomingModel.assets,
            model,
          );
        }
      },
    );
    return true;
  }

  /**
   * Restore database from cloud storage (decrypt)
   * Writes image files to desktop filesystem if available
   */
  async restore(password: string, generationId?: string): Promise<boolean> {
    await this.ensureAuthenticated();

    logger.log('[CloudSync] Starting restore workflow');
    logger.log(`Downloading from ${this.provider.name}...`);
    let downloaded: string | null = null;
    let selectedGeneration: DriveBackupGeneration | undefined;
    if (this.hasGenerationStore()) {
      const generations = await this.listBackupGenerations();
      selectedGeneration = generationId
        ? generations.find((generation) => generation.id === generationId)
        : generations[0];
      if (generationId && !selectedGeneration) throw new Error('The selected Drive backup generation was not found.');
      if (selectedGeneration) downloaded = await this.generationStore().downloadGeneration(selectedGeneration.id);
    }
    if (downloaded === null) downloaded = await this.provider.download(this.backupFileName);

    if (!downloaded) {
      logger.log('No backup found in cloud storage');
      throw new Error('No backup found in your Google Drive. Please create a backup first.');
    }

    if (selectedGeneration) {
      const integrity = await encryptedGenerationIntegrity(downloaded);
      if (
        integrity.encryptedByteLength !== selectedGeneration.encryptedByteLength
        || integrity.ciphertextSha256 !== selectedGeneration.ciphertextSha256
      ) throw new Error('The downloaded Drive backup generation failed its integrity check.');
    }

    // Check if the backup is compressed (has GZ1: prefix)
    const isCompressed = downloaded.startsWith(COMPRESSED_PREFIX);
    if (isCompressed) {
      logger.log('Detected compressed backup format');
      downloaded = downloaded.slice(COMPRESSED_PREFIX.length);
    }

    logger.log('Decrypting database...');
    let decrypted: Uint8Array;
    try {
      decrypted = await Encryption.decrypt(downloaded, password);
      logger.log('Decryption successful,', decrypted.length, 'bytes');
    } catch (error) {
      console.error('Failed to decrypt - wrong password?', error);
      throw new Error('Incorrect password. Please check your encryption password and try again.');
    }

    // Decompress if needed
    if (isCompressed) {
      const compressedSizeMB = decrypted.length / 1024 / 1024;
      logger.log(`Decompressing data (${compressedSizeMB.toFixed(1)} MB compressed)...`);

      // On mobile, warn if backup is very large (may crash)
      const isMobile = Capacitor.isNativePlatform() &&
        !(typeof window !== 'undefined' && window.desktopImages);
      if (isMobile && compressedSizeMB > 20) {
        console.warn(`[CloudSync] Large backup (${compressedSizeMB.toFixed(1)} MB) on mobile - may run out of memory`);
      }

      try {
        decrypted = gunzipSync(decrypted);
        logger.log('Decompressed to', (decrypted.length / 1024 / 1024).toFixed(1), 'MB');
      } catch (error) {
        console.error('Failed to decompress backup:', error);
        if (isMobile) {
          throw new Error('Backup is too large for mobile device. Please restore using the desktop app or web browser first, then sync.');
        }
        throw new Error('Failed to decompress backup. The file may be corrupted or the password may be incorrect.');
      }
    }

    if (hasZipSignature(decrypted)) return this.restoreBundle(decrypted);

    let restoreStoreForRollback: ImageContentStore | null = null;
    let imageContentSnapshot: ImageContentSnapshot[] = [];
    try {
      let parsedLegacy: unknown;
      try {
        const legacyText = new TextDecoder('utf-8', { fatal: true }).decode(decrypted).replace(/^\uFEFF/, '');
        parsedLegacy = JSON.parse(legacyText);
        parseDatabaseImportData(parsedLegacy);
      } catch (error) {
        throw new Error('The decrypted backup is corrupt or uses an unsupported format.', { cause: error });
      }
      const importJson = parsedLegacy as BackupPayload;
      let dataToImport = new TextEncoder().encode(JSON.stringify(importJson));

      // Free the decrypted buffer now that we've parsed it
      decrypted = new Uint8Array(0);

      logger.log('[CloudSync] Restore: image_assets in backup:', importJson.image_assets?.length || 0, 'items');

      const restoreStore = createRuntimeImageContentStore();
      let restoredAssets: ImageAsset[] = [];
      if (Array.isArray(importJson.image_assets) && importJson.image_assets.length > 0) {
        if (restoreStore) {
          logger.log('[CloudSync] Writing image content from backup...');
          restoreStoreForRollback = restoreStore;
          imageContentSnapshot = await captureImageContentSnapshot(
            importJson.image_assets,
            restoreStore,
          );
          const result = await restoreImageRows(importJson.image_assets, restoreStore);
          importJson.image_assets = result.rows;
          restoredAssets = result.assets;
          if (result.missingImageIds.length > 0) {
            console.warn(
              '[CloudSync] Restore contains image metadata with no embedded content:',
              result.missingImageIds,
            );
          }
        } else {
          logger.log('[CloudSync] Native platform without image storage - stripping image data');
          const result = stripImageDataFromRows(importJson.image_assets);
          importJson.image_assets = result.rows;
          restoredAssets = result.assets;
        }
        dataToImport = new TextEncoder().encode(JSON.stringify(importJson));
      }

      // Import the data into the database
      await db.importDatabase(dataToImport);

      if (restoreStore && restoredAssets.length > 0) {
        const reconciliation = await inspectImageContent(restoreStore, restoredAssets);
        if (reconciliation.missingImageIds.length > 0) {
          console.warn('[CloudSync] Restored image content is missing:', reconciliation.missingImageIds);
        }
        if (reconciliation.orphanedImageIds.length > 0) {
          console.warn(
            '[CloudSync] Unreferenced image content retained for manual reconciliation:',
            reconciliation.orphanedImageIds,
          );
        }
      }

      logger.log('✅ Database restored successfully!');
      return true;
    } catch (error) {
      console.error('Failed to import database after decryption:', error);
      if (restoreStoreForRollback && imageContentSnapshot.length > 0) {
        try {
          await restoreImageContentSnapshot(imageContentSnapshot, restoreStoreForRollback);
        } catch (rollbackError) {
          console.error('[CloudSync] Failed to roll back image content after restore failure:', rollbackError);
        }
      }
      throw error; // Re-throw to show the actual error
    }
  }

  /**
   * Auto-sync: backup on interval
   */
  startAutoSync(password: string, intervalMs: number = 5 * 60 * 1000): number {
    return window.setInterval(async () => {
      try {
        await this.backup(password);
        logger.log('Auto-backup completed');
      } catch (error) {
        console.error('Auto-backup failed:', error);
      }
    }, intervalMs);
  }

  stopAutoSync(intervalId: number): void {
    clearInterval(intervalId);
  }

  async ensureWebSdkReady(): Promise<void> {
    if (this.provider.ensureWebSdkReady) {
      await this.provider.ensureWebSdkReady();
    }
  }

  isWebSdkReady(): boolean {
    return this.provider.isWebSdkReady ? this.provider.isWebSdkReady() : true;
  }
}
