import { Capacitor } from '@capacitor/core';
import { logger } from '@/lib/logger'
import { gzipSync, gunzipSync } from 'fflate';
import { Encryption } from './encryption';
import { db, type ImageAsset } from './database';
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
  createDriveBackupGeneration,
  encryptedGenerationIntegrity,
  type DriveBackupGeneration,
  type DriveGenerationStore,
} from './libraryBundle/adapters/drive';
import { previewBundleZipImport } from './libraryBundle/importPreview';
import {
  importCanonicalLibraryModel,
  removeCanonicalAssetsAbsentFromModel,
} from './libraryBundle/restore';
import { prepareLibraryReplacement, replaceLibraryWithRecovery } from './recovery/replacement';
import { createRuntimeRecoveryStore } from './recovery/runtime';
import type { RecoveryStore } from './recovery/model';
import type { CloudProvider } from './cloudSyncProvider';

// The Google Drive provider lives in its own module (OAuth lifecycle + GIS SDK
// loading + Drive REST). Re-exported here so existing importers of
// `@/lib/cloudSync` keep working.
export { GoogleDriveProvider } from './cloudSyncProvider';
export type { CloudProvider } from './cloudSyncProvider';

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
   * Restore the pre-bundle legacy JSON backup format (a decrypted, already
   * decompressed JSON document). Writes image content to the runtime store when
   * one is available and rolls that content back if the database import fails.
   */
  private async restoreLegacyJsonBackup(decrypted: Uint8Array): Promise<boolean> {
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

    return this.restoreLegacyJsonBackup(decrypted);
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
