# Image content integrity and deduplication

Image assets have stable IDs for their user-visible identity and content hashes
for verifying their binary data. These identifiers serve different purposes:
an asset ID owns metadata and lifecycle, while a content hash describes only
the bytes stored for that asset.

## Hash format

The current format is `sha256-v1`:

- Hash the original image bytes exactly as stored, without decoding,
  normalizing, or re-encoding the image.
- Use SHA-256 through the browser-compatible Web Crypto API.
- Encode the digest as 64 lowercase hexadecimal characters.
- Store the byte length alongside the digest.
- Treat the algorithm/version, digest, and byte length as one integrity record.

The database columns are nullable so libraries created by older releases remain
readable. Newly ingested images receive integrity metadata immediately. Existing
images are backfilled when read, and legacy SQLite-embedded images are hashed as
part of their Blob migration.

When integrity metadata exists, load, migration, backup, and restore paths must
verify it. A mismatch is a recovery error: the app must not replace the recorded
hash with the unexpected bytes or clear a recoverable legacy copy.

## Deduplication decision

Physical content deduplication is intentionally **not enabled** in the current
storage model. Identical images receive the same content hash but continue to
have separate asset IDs and separate stored copies.

This preserves the existing lifecycle guarantees:

- captions, wiki tags, cover assignments, timestamps, and filenames remain
  independent per asset;
- deleting or replacing one asset cannot remove another asset's bytes;
- rollback can restore one asset without coordinating shared ownership; and
- browser IndexedDB keys and Electron filesystem paths remain asset-based.

Using a hash directly as the storage key would break those guarantees because
the current delete operation assumes one asset owns one content record.

## Requirements before enabling physical deduplication

A future deduplication migration should introduce an explicit shared-content
layer rather than reusing asset rows as reference counts. At minimum it needs:

1. Content records keyed by algorithm/version plus digest and byte length.
2. Asset-to-content references that preserve asset-level metadata.
3. Transactional reference creation and removal across SQLite and binary
   storage, with rollback when either side fails.
4. Garbage collection that deletes bytes only after proving no live asset,
   cover, restore snapshot, or backup generation references them.
5. Collision handling that treats matching hashes as candidates and verifies
   byte length and, when required, the bytes before sharing content.
6. A two-phase migration that retains each asset's existing bytes until the
   shared content record and every reference have been verified.

Until those conditions are implemented and tested, hashes provide integrity
checking and duplicate detection only—not shared storage ownership.
