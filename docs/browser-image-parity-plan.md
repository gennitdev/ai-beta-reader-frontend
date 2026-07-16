# Browser Image Parity and IndexedDB Blob Storage Plan

> Status: Phases 1–6 were implemented in July 2026. Deferred follow-ups are tracked as GitHub issues.

## Summary

The browser and Electron builds already run `sql.js` and persist the exported SQLite database in IndexedDB. The remaining parity problem is image-binary storage and UI capability:

- Electron stores image files in its app-data directory and keeps their metadata in SQLite.
- The browser can display images restored from backup because their base64 data is stored in the SQLite `image_assets.image_data` column.
- A browser file-to-base64 helper exists, but the upload capability remains disabled and is not connected to a browser file picker.
- Every browser database mutation currently exports and writes the entire sql.js database. Keeping base64 images in that snapshot makes routine saves increasingly expensive.

The target design keeps the existing SQLite metadata model and backup compatibility, but stores browser image bytes as `Blob` records in a dedicated IndexedDB object store.

## Goals

1. Let browser users add, view, download, replace, and delete images anywhere Electron supports those operations.
2. Store browser image bytes as `Blob` values rather than base64 SQLite text.
3. Preserve restore compatibility with existing encrypted backups and cross-platform restores.
4. Prevent stale, incomplete, or overlapping sql.js snapshot writes from losing recent changes.
5. Migrate existing browser image data without requiring the user to export and re-import a project.
6. Detect quota, missing-image, and partial-operation failures and explain them to the user.

## Non-goals

- Replacing sql.js with SQLite OPFS or another WASM SQLite distribution.
- Changing Android to support image binaries. That can use the same image-store contract later.
- Splitting a Drive backup into one file per image. The existing single encrypted snapshot remains the compatibility format for this project.
- Removing `image_assets.image_data` immediately. It remains available for old backup import and compatibility during rollout.

## Current State

### Database persistence

`AppDatabase` uses native SQLite only on iOS/Android. Browser and Electron initialize sql.js, load an exported database from IndexedDB, and fall back to the legacy `localStorage.sqliteDb` value when IndexedDB is empty.

The current save method calls `db.export()` and starts an IndexedDB write without awaiting it from the mutation that triggered the save. This has three consequences:

- A caller can report success before the durable write finishes.
- Multiple saves may overlap without an explicit latest-write-wins guarantee.
- Closing or navigating immediately after a mutation may leave the most recent state unpersisted.

### Image storage

The existing `image_assets` schema is already platform-neutral enough for this work. It includes a generated image ID, ownership and asset type, filename, relative/virtual path, MIME type, notes, timestamps, and the compatibility `image_data` column. Cover relationships point to image IDs.

Electron stores bytes on disk through `window.desktopImages`. Browser-restored images use base64 data URLs from `image_data`. `addImagesFromFiles()` also creates base64 data URLs, but `canUploadImages()` currently enables upload only when the Electron bridge is available.

### Backup and restore

The Drive backup is a versioned JSON database export that is gzip-compressed and encrypted. On Electron, backup reads image files and embeds data URLs into the exported `image_assets` rows. Restore writes those files back to Electron storage and clears their live `image_data` values. On the browser, restored data URLs currently stay in SQLite.

## Target Architecture

### Shared IndexedDB module

Extract the browser/Electron IndexedDB opening and transaction code from `AppDatabase` into a shared module such as `src/lib/indexedDbStorage.ts`.

Upgrade `ai-beta-reader-db` from version 1 to version 2 and maintain these object stores:

| Store | Key | Value | Purpose |
| --- | --- | --- | --- |
| `database` | `sqliteDb` | `Uint8Array` | Exported sql.js database bytes; preserve the existing record format. |
| `imageBlobs` | image ID | `{ blob, byteSize, updatedAt }` | Browser image binaries. |
| `metadata` | string | version/status values | Migration progress and storage-format markers. |

All transaction helpers must resolve on `transaction.oncomplete`, reject on `transaction.onerror` or `transaction.onabort`, and close connections cleanly. Open connections must handle `versionchange` by closing so upgrades are not blocked by another tab.

### Image content store

Add a narrow platform abstraction, separate from database persistence:

```ts
interface ImageContentStore {
  read(asset: ImageAsset): Promise<Blob | null>
  write(asset: ImageAsset, blob: Blob): Promise<void>
  delete(asset: ImageAsset): Promise<void>
  exists(asset: ImageAsset): Promise<boolean>
  listStoredIds?(): Promise<string[]>
}
```

Implementations:

- `IndexedDbImageContentStore` keys `Blob` records by `asset.id` in `imageBlobs`.
- `ElectronImageContentStore` adapts the existing preload/IPC bridge and resolves storage through `asset.file_path`.
- A future Capacitor implementation can be added without changing the browser work.

Enumeration is optional because it is needed for IndexedDB orphan reconciliation but is not required for normal Electron reads and writes.

Keep file selection separate from byte storage. Electron can retain its native picker, while the browser uses `File` objects from a file input or drag-and-drop.

### Live data and compatibility data

For newly added browser images:

- Store the original `File`/`Blob` in `imageBlobs`.
- Store metadata in `image_assets` with `image_data = NULL`.
- Keep the current virtual `file_path` convention for backward compatibility, but do not use it as the IndexedDB key.
- Render using `URL.createObjectURL(blob)` and revoke URLs when a component replaces an image or unmounts.

The `image_data` column remains an import/export compatibility field. Normal live browser records should not retain base64 content after migration.

## Implementation Phases

### Phase 1: Baseline tests and persistence hardening

Before moving image data, add tests that characterize the existing IndexedDB migration and database snapshot behavior.

Implement a serialized persistence coordinator inside `AppDatabase`:

1. Mutations call `requestPersistence()` and mark the database dirty.
2. Only one IndexedDB write runs at a time.
3. The coordinator exports the latest database state when the write begins.
4. If another mutation occurs during the write, the coordinator loops and writes the new latest state.
5. `flushPersistence()` waits until no dirty state or active write remains.

Use `flushPersistence()` after imports, before backup export, and for operations where the UI must not report durable success early. A short debounce may coalesce rapid editor changes, but it must not be the only durability mechanism.

Harden startup recovery:

- Verify a legacy localStorage migration by reading the IndexedDB value back and opening it with sql.js before marking migration complete.
- Do not silently replace a corrupt stored database with an empty one. Surface a recoverable error with Drive restore/export guidance.
- Retain the legacy value for a release or mark it as migrated instead of deleting it immediately. It must never take precedence after a verified IndexedDB snapshot exists.

Tests:

- Legacy JSON-array and base64 localStorage formats migrate successfully.
- Rapid mutations cannot leave an older snapshot as the final IndexedDB value.
- `flushPersistence()` includes the last mutation.
- Failed and aborted transactions reject and leave recoverable state.
- A corrupt snapshot does not silently create an empty library.

### Phase 2: IndexedDB image store and unified reads

Create the version-2 object stores and the two `ImageContentStore` implementations. Change `useImageLibrary.getImageSource()` to read through the selected store rather than branching directly between Electron and `image_data`.

During this phase, keep a compatibility fallback:

1. Try the content store.
2. If no blob/file exists and `image_data` is present, return the data URL.
3. Record enough information to make the later migration restartable.

Add reconciliation helpers:

- Identify metadata rows whose binary content is missing.
- Identify IndexedDB blobs with no `image_assets` row.
- Delete orphans only after an explicit successful reconciliation pass; never during an uncertain or failed restore.

Tests:

- Store, load, overwrite, and delete several MIME types.
- Object URLs are revoked when no longer used.
- Missing blobs fall back to legacy `image_data`.
- An IndexedDB version upgrade preserves the existing SQLite snapshot.

### Phase 3: Backup and restore integration

Update backup/restore before clearing any live `image_data` values.

Backup flow:

1. Flush database persistence.
2. Export the versioned JSON snapshot.
3. For each image row, read bytes through `ImageContentStore`.
4. Encode the bytes into the existing `image_data` data-URL field in the temporary export object.
5. Preserve an existing `image_data` value only as a compatibility fallback when binary storage is missing.
6. Continue with the existing gzip and AES-GCM pipeline.

Restore flow:

1. Decrypt, decompress, parse, and validate the snapshot.
2. Decode each populated `image_data` field and write it through the active `ImageContentStore`.
3. Clear `image_data` from rows destined for live browser/Electron SQLite storage.
4. Import database metadata and flush persistence.
5. Reconcile missing/orphaned image content after the database import succeeds.

Keep the existing backup schema version readable. If new optional image metadata is added, bump the snapshot version and keep normalization tolerant of older object and positional rows.

Tests must cover browser-to-Electron, Electron-to-browser, and old-backup-to-new-browser restores, including a row with missing image content. Verify that a failed image write does not masquerade as a fully successful restore.

### Phase 4: Existing browser data migration

Run a restartable migration for browser rows with non-null `image_data`:

1. Select a small batch of unmigrated rows.
2. Validate and decode each data URL into a `Blob`.
3. Write the blob under the image ID.
4. Read it back and verify at least ID, byte size, and MIME type.
5. Set the row's `image_data` to `NULL` only after verification.
6. Flush the SQLite snapshot after each batch.
7. Update the migration marker only after all rows have been checked.

The migration must be safe to interrupt and rerun. Invalid data URLs remain in SQLite and produce a visible diagnostic rather than being discarded.

For the first release containing the migration, retain the ability to read both storage forms. Remove the fallback only after a later release demonstrates that migrated and restored libraries are stable.

### Phase 5: Browser image-management UI

Replace platform checks with explicit capabilities such as:

- `canSelectImages`
- `canStoreImages`
- `canDeleteImages`
- `canDownloadImages`

Browser selection uses `<input type="file" accept="image/*" multiple>` and may add drag-and-drop using the same handler. Store `File` objects directly without a base64 conversion.

Wire browser support into every currently supported Electron surface:

- Chapter illustrations and chapter covers.
- Book and part covers.
- Image library views, lightbox, and downloads.
- Notes and wiki-tag editing.
- Delete and replace operations.

Validate files before writing:

- Allow only explicitly supported image MIME types.
- Enforce a configurable per-file limit and show the limit in the error.
- Reject zero-byte or unreadable files.
- Sanitize display filenames while retaining the original filename as metadata if desired.

For an add operation, write the blob first, insert metadata second, and flush the database third. If metadata or persistence fails, delete the newly written blob. For deletion, unlink cover relationships and metadata, flush the database, then delete the blob; reconciliation handles a final cleanup failure.

### Phase 6: Storage UX, documentation, and rollout

- Call `navigator.storage.persist()` after an intentional user action such as the first image upload, where supported.
- Use `navigator.storage.estimate()` to display usage and quota diagnostics without promising a fixed browser capacity.
- Distinguish quota exhaustion, private/ephemeral browsing, missing binary data, and generic IndexedDB failure in user-facing errors.
- Warn users that browser-local data can still be removed through browser settings and recommend encrypted Drive backups.
- Update `README.md`, `docs/desktop-images.md`, and `docs/cloud-sync.md` together when the feature ships.

Roll out in this order:

1. Persistence coordinator and recovery behavior.
2. Image store plus dual-read compatibility.
3. Backup/restore integration.
4. Existing-data migration.
5. Browser upload and management UI.
6. Removal of obsolete platform gates and, in a later release, legacy read paths.

## Verification Matrix

| Scenario | Chromium | Firefox | Safari | Electron | Android |
| --- | --- | --- | --- | --- | --- |
| Fresh library | Required | Required | Required | Required | Regression |
| Legacy localStorage database | Required | Required | Required | N/A | N/A |
| Existing web `image_data` migration | Required | Required | Required | N/A | N/A |
| Add/view/delete image | Required | Required | Required | Regression | Not yet supported |
| Electron backup restored on web | Required | Required | Required | Source | Metadata only |
| Web backup restored on Electron | Source | Source | Source | Required | Metadata only |
| Interrupted migration | Required | Required | Required | N/A | N/A |
| Quota exhaustion | Required | Required | Required | N/A | N/A |
| Private/ephemeral browsing | Required | Required | Required | N/A | N/A |

Automated coverage should use Vitest for storage coordination, migration, and import/export normalization. Add browser-level tests for real IndexedDB, file selection, reload persistence, and object URL lifecycle. Manually verify at least one current Safari release because its storage behavior differs most from the Chromium development path.

## Acceptance Criteria

- A browser user can add an image, reload the page, and still view and manage it.
- Normal browser image rows store `image_data = NULL`; their bytes exist as IndexedDB `Blob` records.
- Editing manuscript text does not rewrite image bytes as part of the sql.js snapshot.
- Existing restored browser images migrate without user action or data loss.
- A backup made on web restores images on Electron, and an Electron backup restores images on web.
- Failed persistence, quota exhaustion, and missing image content produce visible errors rather than silent success.
- Rapid consecutive database mutations cannot persist out of order.
- The browser remains able to read backups produced before this migration.

## Deferred Follow-ups

- Native Android image storage and UI parity.
- Streaming backup creation to reduce peak memory for very large libraries.
- Content hashing for deduplication and stronger migration verification.
- Separate encrypted Drive objects for images, incremental upload, and manifest-based backup generations.
- Replacing sql.js snapshot persistence with an OPFS-backed SQLite implementation if database size or save latency justifies the larger migration.
