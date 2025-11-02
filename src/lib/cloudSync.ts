import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Encryption } from './encryption';
import { db } from './database';
import { performNativeGoogleOAuth } from './googleOAuth';
import type { GoogleOAuthTokens } from './googleOAuth';
import { loadTokens, saveTokens, clearTokens } from './tokenStorage';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Cloud sync interface - can be implemented for Google Drive, Dropbox, etc.
 */
export interface CloudProvider {
  name: string;
  authenticate(): Promise<void>;
  upload(fileName: string, data: string): Promise<void>;
  download(fileName: string): Promise<string | null>;
  isAuthenticated(): boolean;
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
  private tokenClient: any = null;
  private gisLoadingPromise: Promise<void> | null = null;
  private debugLog: string[] = [];
  private readonly redirectUri =
    import.meta.env.VITE_GOOGLE_REDIRECT_URI ?? 'https://www.beta-bot.net/oauth2redirect';
  private readonly tokenExpiryLeewayMs = 60 * 1000;

  constructor(clientId: string, _apiKey?: string) {
    this.CLIENT_ID = clientId;
  }

  private debug(message: string, extra?: unknown) {
    const entry = extra !== undefined ? `${message} ${JSON.stringify(extra)}` : message;
    console.log(`[CloudSync] ${entry}`);
    this.debugLog = [...this.debugLog, entry].slice(-200);
    if (typeof window !== 'undefined') {
      (window as any).CloudSyncDebug = this.debugLog;
      window.dispatchEvent(new CustomEvent('cloud-sync-debug', { detail: entry }));
    }
  }

  async authenticate(): Promise<void> {
    this.debug('authenticate() called');

    if (!this.CLIENT_ID) {
      throw new Error('Google Drive client ID is not configured.');
    }

    if (Capacitor.isNativePlatform()) {
      await this.authenticateNative();
      return;
    }

    await this.authenticateWeb();
  }

  async upload(fileName: string, data: string): Promise<void> {
    await this.ensureValidAccessToken();

    const accessToken = this.accessToken;
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    // Check if file exists
    const existingFileId = await this.findFile(fileName);

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

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    console.log('File uploaded to Google Drive successfully');
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

    const response = await fetch(
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

  private async findFile(fileName: string): Promise<string | null> {
    await this.ensureValidAccessToken();

    const accessToken = this.accessToken;
    if (!accessToken) {
      throw new Error('Not authenticated');
    }

    this.debug(`findFile() searching for ${fileName}`);
    const response = await fetch(
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
    try {
      await this.ensureGoogleIdentityServicesLoaded();
      this.debug('GIS ready, creating token client');
    } catch (error) {
      console.error('Failed to initialize Google Identity Services:', error);
      throw error instanceof Error ? error : new Error(String(error));
    }

    await new Promise<void>((resolve, reject) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        const googleAccounts: any = (window as any).google?.accounts;
        if (!googleAccounts?.oauth2?.initTokenClient) {
          reject(new Error('Google Identity Services is unavailable in this environment'));
          return;
        }

        this.debug('Initializing google.accounts.oauth2.initTokenClient');
        this.tokenClient = googleAccounts.oauth2.initTokenClient({
          client_id: this.CLIENT_ID,
          scope: this.SCOPES,
          callback: (response: any) => {
            this.debug('Token client callback', response);
            if (response.error) {
              console.error('Auth error:', response);
              reject(new Error(response.error));
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
      const cached = await loadTokens();
      if (cached) {
        this.debug('authenticateNative() found cached tokens');
        this.accessToken = cached.accessToken;
        this.refreshToken = cached.refreshToken ?? null;
        this.accessTokenExpiresAt = cached.expiresAt;

        if (this.accessTokenExpiresAt && this.accessTokenExpiresAt > Date.now() + this.tokenExpiryLeewayMs) {
          this.debug('authenticateNative() using cached access token');
          return;
        }

        if (this.refreshToken) {
          this.debug('authenticateNative() refreshing expired token');
          try {
            await this.refreshAccessToken();
            return;
          } catch (error) {
            console.warn('[CloudSync] Failed to refresh cached Google token', error);
            this.debug('authenticateNative() refresh failed, clearing cache');
            await this.wipeStoredTokens();
          }
        } else {
          this.debug('authenticateNative() cached token expired with no refresh token');
          await this.wipeStoredTokens();
        }
      }

      this.debug('authenticateNative() starting OAuth flow');
      const tokens = await performNativeGoogleOAuth({
        clientId: this.CLIENT_ID,
        redirectUri: this.redirectUri,
        scope: this.SCOPES,
        prompt: 'consent',
      });
      await this.applyNativeTokenResponse(tokens);
      this.debug('authenticateNative() obtained new tokens');
    } catch (error) {
      console.error('[CloudSync] Native authentication failed', error);
      await this.wipeStoredTokens();
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
      client_id: this.CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    });

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

  /**
   * Ensure Google Identity Services is available. Handles web and native environments.
   */
  private ensureGoogleIdentityServicesLoaded(): Promise<void> {
    this.debug('Ensuring GIS loaded');

    if (typeof window === 'undefined') {
      return Promise.reject(new Error('Window is undefined'));
    }

    if ((window as any).google?.accounts?.oauth2) {
      this.debug('GIS already present');
      return Promise.resolve();
    }

    if (this.gisLoadingPromise) {
      this.debug('Reusing existing GIS promise');
      return this.gisLoadingPromise;
    }

    const isHostedHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    this.debug(`ensureGoogleIdentityServicesLoaded native=${Capacitor.isNativePlatform()} hostedHttps=${isHostedHttps} scriptPresent=${Boolean(document.querySelector('script[data-google-identity]'))}`);

    if (Capacitor.isNativePlatform()) {
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

    return this.gisLoadingPromise;
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
        const oauth2 = (window as any).google?.accounts?.oauth2;
        if (oauth2 && oauth2._default && !oauth2.default) {
          oauth2.default = oauth2._default;
        }
      };

      document.head.appendChild(script);
      this.debug('loadGisForNative: script appended, waiting for readiness');

      await new Promise<void>((resolve, reject) => {
        const checkReady = () => {
          const oauth2 = (window as any).google?.accounts?.oauth2;
          if (oauth2 && (oauth2.initTokenClient || oauth2.default?.initTokenClient)) {
            if (!oauth2.initTokenClient && oauth2.default?.initTokenClient) {
              oauth2.initTokenClient = oauth2.default.initTokenClient.bind(oauth2.default);
            }
            resolve();
            return;
          }
          setTimeout(checkReady, 50);
        };

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
          const oauth2 = (window as any).google?.accounts?.oauth2;
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
        if ((window as any).google?.accounts?.oauth2) {
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

  constructor(provider: CloudProvider) {
    this.provider = provider;
  }

  /**
   * Backup database to cloud storage (encrypted)
   */
  async backup(password: string): Promise<void> {
    if (!this.provider.isAuthenticated()) {
      await this.provider.authenticate();
    }

    console.log('Exporting database...');
    const dbData = await db.exportDatabase();

    console.log('Encrypting database...');
    const encrypted = Encryption.encrypt(dbData, password);

    console.log(`Uploading to ${this.provider.name}...`);
    await this.provider.upload(this.backupFileName, encrypted);

    console.log('✅ Backup complete!');
  }

  /**
   * Restore database from cloud storage (decrypt)
   */
  async restore(password: string): Promise<boolean> {
    if (!this.provider.isAuthenticated()) {
      await this.provider.authenticate();
    }

    console.log('[CloudSync] Starting restore workflow');
    console.log(`Downloading from ${this.provider.name}...`);
    const encrypted = await this.provider.download(this.backupFileName);

    if (!encrypted) {
      console.log('No backup found in cloud storage');
      return false;
    }

    console.log('Decrypting database...');
    try {
      const decrypted = Encryption.decrypt(encrypted, password);
      console.log('Importing database...', decrypted.length, 'bytes');

      // Import the decrypted data back into the database
      await db.importDatabase(decrypted);

      console.log('✅ Database restored successfully!');
      return true;
    } catch (error) {
      console.error('Failed to decrypt - wrong password?', error);
      return false;
    }
  }

  /**
   * Auto-sync: backup on interval
   */
  startAutoSync(password: string, intervalMs: number = 5 * 60 * 1000): number {
    return window.setInterval(async () => {
      try {
        await this.backup(password);
        console.log('Auto-backup completed');
      } catch (error) {
        console.error('Auto-backup failed:', error);
      }
    }, intervalMs);
  }

  stopAutoSync(intervalId: number): void {
    clearInterval(intervalId);
  }
}
