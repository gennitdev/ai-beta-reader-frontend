import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Encryption } from './encryption';
import { db } from './database';

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
  private CLIENT_ID = ''; // Set this in your app
  private SCOPES = 'https://www.googleapis.com/auth/drive.file';
  private tokenClient: any = null;
  private gisLoadingPromise: Promise<void> | null = null;
  private debugLog: string[] = [];

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
    try {
      await this.ensureGoogleIdentityServicesLoaded();
      this.debug('GIS ready, creating token client');
    } catch (error) {
      console.error('Failed to initialize Google Identity Services:', error);
      throw error instanceof Error ? error : new Error(String(error));
    }

    return new Promise((resolve, reject) => {
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
            this.debug('Google Drive authenticated successfully');
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

  async upload(fileName: string, data: string): Promise<void> {
    if (!this.accessToken) {
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
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    console.log('File uploaded to Google Drive successfully');
  }

  async download(fileName: string): Promise<string | null> {
    if (!this.accessToken) {
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
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    return await response.text();
  }

  private async findFile(fileName: string): Promise<string | null> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    this.debug(`findFile() searching for ${fileName}`);
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and trashed=false&fields=files(id,name)`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
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
    return this.accessToken !== null;
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
