# Image Library Storage

The image library supports browser, Electron, and Android builds through a shared content-store contract.

## Storage architecture

SQLite stores platform-neutral image metadata in `image_assets`, including the generated image ID, owner, asset type, filename, MIME type, notes, and compatibility `image_data` column. Cover relationships point to image IDs.

Binary content is handled through `ImageContentStore`:

- Browser: `IndexedDbImageContentStore` stores `Blob` records in the `imageBlobs` object store, keyed by image ID.
- Electron: `ElectronImageContentStore` uses `window.desktopImages` to read and write files beneath the Electron app-data directory.
- Android: `CapacitorImageContentStore` stores bytes in the app-private data directory, keyed by image ID and outside SQLite.

Normal browser rows keep `image_data = NULL`. Legacy data URLs are migrated to Blob storage at startup, verified, and cleared from SQLite in restartable batches. Invalid legacy rows are retained and reported in the storage diagnostics.

## Capabilities and UI

`useImageLibrary` exposes capabilities rather than platform UI gates:

- `canSelectImages`
- `canStoreImages`
- `canDeleteImages`
- `canDownloadImages`

Browser and Android selection use the platform file chooser. Electron uses its native picker. All paths share the same chapter illustration, cover, lightbox, notes, tags, replace, and delete UI. Android’s download action opens the native save/share sheet.

Browser uploads accept PNG, JPEG, GIF, and WebP files up to 20 MB. Files must be non-empty and decodable. The Blob is written first, metadata is persisted second, and a failed metadata write rolls back the new Blob.

## Backup and restore

The live Blob/file store remains separate from SQLite, while encrypted Drive backups use the canonical full-library bundle:

1. Flush SQLite persistence.
2. Read each image through `ImageContentStore`.
3. Add the verified bytes to the bundle ZIP and its inventory.
4. Encrypt the ZIP and upload it as a new immutable Drive generation.

Restore verifies the encrypted generation and bundle, creates an external recovery, writes and verifies binary content, then replaces the database. This supports cross-platform restores, including Android. The three newest successful Drive generations are retained; older JSON snapshots remain restoreable.

A full bundle never silently omits required image bytes. On a platform without an image content store, backup/export fails clearly if image metadata exists but its bytes are unavailable.

## Browser storage diagnostics

Settings displays browser-reported usage, quota, persistence status, and partial migration warnings. The first intentional upload requests persistent storage where supported. Quota, ephemeral/private browsing, missing Blob, and generic IndexedDB failures produce distinct user-facing messages.

Browser storage can still be deleted through browser settings. Keep encrypted Drive backups for recovery.

## Troubleshooting

- Missing preview: check Library Data → Browser Storage and restore a backup containing the image if the Blob/file is missing.
- Browser storage full: free device space or remove unused images, then retry.
- Temporary/private browsing: use a regular browser window and allow site storage.
- Electron IPC failure: inspect `electron/src/image-bridge.ts` logs and verify filesystem permissions.
- Android storage full: free device space or remove images. Missing content can be recovered from an image-complete backup.

Trace shared operations through `UI → useImageLibrary → ImageContentStore` and metadata operations through `UI → useImageLibrary → useDatabase → AppDatabase`.
