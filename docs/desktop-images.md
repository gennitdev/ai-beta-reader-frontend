# Image Library Storage

The image library supports the browser and Electron builds. Android retains image metadata during backup and restore but does not yet provide local image-binary storage.

## Storage architecture

SQLite stores platform-neutral image metadata in `image_assets`, including the generated image ID, owner, asset type, filename, MIME type, notes, and compatibility `image_data` column. Cover relationships point to image IDs.

Binary content is handled through `ImageContentStore`:

- Browser: `IndexedDbImageContentStore` stores `Blob` records in the `imageBlobs` object store, keyed by image ID.
- Electron: `ElectronImageContentStore` uses `window.desktopImages` to read and write files beneath the Electron app-data directory.

Normal browser rows keep `image_data = NULL`. Legacy data URLs are migrated to Blob storage at startup, verified, and cleared from SQLite in restartable batches. Invalid legacy rows are retained and reported in the storage diagnostics.

## Capabilities and UI

`useImageLibrary` exposes capabilities rather than platform UI gates:

- `canSelectImages`
- `canStoreImages`
- `canDeleteImages`
- `canDownloadImages`

Browser selection uses a file input. Electron uses its native picker. Both paths share the same chapter illustration, cover, lightbox, download, notes, tags, replace, and delete UI.

Browser uploads accept PNG, JPEG, GIF, and WebP files up to 20 MB. Files must be non-empty and decodable. The Blob is written first, metadata is persisted second, and a failed metadata write rolls back the new Blob.

## Backup and restore

The live Blob/file store remains separate from SQLite, but encrypted Drive backups retain the existing portable single-snapshot format:

1. Flush SQLite persistence.
2. Read each image through `ImageContentStore`.
3. Add a temporary data URL to the exported image row.
4. Compress and encrypt the complete snapshot.

Restore reverses that process, verifies binary writes, imports metadata, and clears compatibility `image_data` values from live browser and Electron rows. This allows browser-to-Electron and Electron-to-browser restores.

## Browser storage diagnostics

Settings displays browser-reported usage, quota, persistence status, and partial migration warnings. The first intentional upload requests persistent storage where supported. Quota, ephemeral/private browsing, missing Blob, and generic IndexedDB failures produce distinct user-facing messages.

Browser storage can still be deleted through browser settings. Keep encrypted Drive backups for recovery.

## Troubleshooting

- Missing preview: check Settings → Browser Storage and restore a backup containing the image if the Blob/file is missing.
- Browser storage full: free device space or remove unused images, then retry.
- Temporary/private browsing: use a regular browser window and allow site storage.
- Electron IPC failure: inspect `electron/src/image-bridge.ts` logs and verify filesystem permissions.

Trace shared operations through `UI → useImageLibrary → ImageContentStore` and metadata operations through `UI → useImageLibrary → useDatabase → AppDatabase`.
