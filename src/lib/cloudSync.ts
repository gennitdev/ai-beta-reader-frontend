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

  constructor(clientId: string, _apiKey?: string) {
    this.CLIENT_ID = clientId;
  }

  async authenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Load Google Identity Services library
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => {
        try {
          // @ts-ignore - Google Identity Services global
          this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.CLIENT_ID,
            scope: this.SCOPES,
            callback: (response: any) => {
              if (response.error) {
                console.error('Auth error:', response);
                reject(new Error(response.error));
                return;
              }

              this.accessToken = response.access_token;
              console.log('✅ Google Drive authenticated successfully');
              resolve();
            },
          });

          // Request access token
          this.tokenClient.requestAccessToken({ prompt: 'consent' });
        } catch (error) {
          console.error('Authentication error:', error);
          reject(error);
        }
      };
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
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

    const fileId = await this.findFile(fileName);
    if (!fileId) {
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
