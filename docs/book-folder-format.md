# Design: Beta Bot Library Bundle as Canonical Format

**Status:** Core rollout implemented through Phase 6; follow-ups tracked

**Primary repo:** `ai-beta-reader-frontend`

**Backend changes:** None expected
**Replaces:** Draft “Book Folder as Canonical Format”

## Summary

Define one versioned **Beta Bot library bundle** as the canonical portable representation of a library. A bundle is either a directory or a ZIP containing the same directory tree. Human-authored and agent-editable material is stored as Markdown and YAML. App-owned recovery data that would be noisy or unsafe to flatten into Markdown is stored under a reserved `_beta-bot/` directory as typed JSON Lines files.

The same codec powers:

- export to ZIP;
- export to a directory where the platform supports directory writes;
- import from ZIP or directory;
- encrypted Google Drive backup and restore;
- agent-maintained Git repositories.

The format is lossless for a full backup, including revision history, activity, images, links, and audit records. A text-only or selected-book bundle is allowed, but it is explicitly marked as incomplete and can never replace an entire library.

This design deliberately distinguishes three concepts:

1. **Bundle format:** the files and their semantics.
2. **Codec:** database-to-bundle and bundle-to-typed-model conversion.
3. **Transport:** ZIP download, directory access, or encrypted Google Drive storage.

No transport implements its own serialization rules.

### Implementation status

Phases 1–6 are implemented. The application ships the canonical model and schema migrations, deterministic writer and ZIP export, validation and three-way Apply planning, verified recovery and Replace, encrypted Drive generations, directory updates, workspace scaffolding, and the standalone validator.

Remaining product and release-hardening work is tracked separately:

- [#128](https://github.com/gennitdev/ai-beta-reader-frontend/issues/128): selected-book export;
- [#129](https://github.com/gennitdev/ai-beta-reader-frontend/issues/129): text-only workspace export;
- [#130](https://github.com/gennitdev/ai-beta-reader-frontend/issues/130): additional import-preview detail;
- [#131](https://github.com/gennitdev/ai-beta-reader-frontend/issues/131): optional Import as copy;
- [#132](https://github.com/gennitdev/ai-beta-reader-frontend/issues/132): fuzz, stress, and cross-platform acceptance validation.

Platform and real-persistence results for #132 are recorded in the
[release-hardening evidence matrix](release-hardening/platform-persistence-acceptance.md).

The current export UI creates full-library bundles. `selection` and `text-only` are already recognized by the schemas, validator, planner, and Replace-eligibility boundary, but their dedicated export flows are follow-up work.

## Decision summary

- Stable entity IDs, never paths, are authoritative.
- One global chapter order per book is canonical. Part-local order is derived.
- Full bundles preserve every current backup table and all image bytes.
- Revisions and activity remain in every full backup under `_beta-bot/history/`.
- File import defaults to a three-way **Apply changes** operation, not an unconditional overwrite called “merge.”
- Replace is offered only for complete library bundles.
- External edits are detected with semantic hashes stored in an immutable export inventory.
- Conflicting edits require an explicit user choice; timestamps never silently choose a winner.
- A verified recovery bundle is stored outside the main database before replace.
- Wiki review progress is tracked per page and per chapter content hash, not with a single linear cursor.
- New backups use the existing Web Crypto encryption envelope. CryptoJS remains restore-only compatibility code.
- Old JSON backups remain restorable indefinitely.

## Goals

- Make `database -> full bundle -> fresh database` lossless for all persistent user data.
- Provide readable, stable files that users and coding agents can safely edit.
- Make Drive and filesystem paths exercise the same serialization implementation.
- Make imports explainable: validate first, preview exact changes, then commit atomically.
- Detect local-versus-file conflicts without pretending that last-write-wins is a merge.
- Support Git history without making Git a prerequisite for backup completeness.
- Support future schema evolution through explicit format versions and pure migrations.
- Preserve the existing in-app revision, activity, image, and wiki-link experiences after restore.

## Non-goals

- In-app Git hosting, authentication, commits, branches, or pull requests.
- Real-time or multi-device synchronization.
- Automatic semantic merging of conflicting prose.
- Treating filenames or directory positions as database identity.
- Making arbitrary YAML extensions or unknown files executable.
- Supporting partial folders that do not contain a valid manifest and inventory.

## Terminology

### Bundle

A directory tree rooted at `beta-bot.yaml`, or a ZIP whose root contains that file.

### Full bundle

A bundle with `content_mode: full`. It contains all scoped rows and all required binary assets.

### Text-only bundle

A bundle with `content_mode: text-only`. It preserves textual material and image metadata but may omit image bytes and app history. It is useful as an agent workspace, never as a complete backup.

### Library bundle

A bundle with `bundle_kind: library`, containing every book plus all library-global records.

### Selection bundle

A bundle with `bundle_kind: selection`, containing the listed books and only the global records needed to interpret them. It cannot express deletion of entities outside its declared scope.

### Apply changes

A three-way import using the export inventory as the base, the current database as local, and the edited bundle as incoming.

### Replace library

An atomic restore that makes the database match a complete full library bundle.

## Canonical layout

```text
<bundle-root>/
  beta-bot.yaml
  books/
    <book-slug>--<book-short-id>/
      book.yaml
      characters.yaml
      parts/
        <part-slug>--<part-short-id>/
          part.yaml
          summary.md
      chapters/
        <chapter-slug>--<chapter-short-id>/
          chapter.md
          notes.md
          summary.md
          reviews/
            <created-at>--<review-short-id>.md
      wiki/
        <page-slug>--<page-short-id>.md
      assets/
        <asset-short-id>/
          asset.yaml
          <original-file-name>
  profiles/
    <profile-slug>--<profile-short-id>.yaml
  _beta-bot/
    inventory.json
    history/
      chapter-revisions.jsonl
      chapter-activity.jsonl
      wiki-updates.jsonl
    review-state.jsonl
```

Empty optional directories may be omitted. Files defined as optional may be absent only when the corresponding entity does not exist or the manifest explicitly permits omission for the bundle's `content_mode`.

`_beta-bot/` is reserved for the app. Agents may read it but must not edit it unless a future format specification explicitly permits that operation.

## Persistent data mapping

Every current user-data table has one authoritative bundle representation:

| Database table | Bundle representation |
|---|---|
| `books` | `books/*/book.yaml` |
| `book_parts` | `books/*/parts/*/part.yaml`; redundant part chapter order is derived |
| `chapters` | `books/*/chapters/*/chapter.md` |
| `chapter_notes` | `books/*/chapters/*/notes.md` |
| `chapter_summaries` | `books/*/chapters/*/summary.md` |
| `part_summaries` | `books/*/parts/*/summary.md` |
| `chapter_reviews` | `books/*/chapters/*/reviews/*.md` |
| `wiki_pages` | `books/*/wiki/*.md` |
| `book_characters` | `books/*/characters.yaml` |
| `chapter_wiki_mentions` | `wiki_mentions` in the owning `chapter.md` |
| `image_assets` | `books/*/assets/*/asset.yaml` plus bytes |
| `image_wiki_tags` | `wiki_page_ids` in the owning `asset.yaml` |
| `custom_reviewer_profiles` | `profiles/*.yaml` with `profile_kind: custom` |
| `ai_profiles` | `profiles/*.yaml` with `profile_kind: ai` or `system` |
| `chapter_revisions` | `_beta-bot/history/chapter-revisions.jsonl` |
| `chapter_activity` | `_beta-bot/history/chapter-activity.jsonl` |
| `wiki_updates` | `_beta-bot/history/wiki-updates.jsonl` |
| `wiki_review_state` | `_beta-bot/review-state.jsonl` |

`schema_migrations` is implementation state, not user data, and is intentionally not serialized. A new database runs its own schema migrations before importing the logical model.

## Paths and slugs

Paths are for readability and Git diffs only. Every entity file contains its stable ID.

Slug rules are deterministic:

1. Unicode-normalize the display name with NFKD.
2. Lowercase it.
3. Replace runs of characters outside `[a-z0-9]` with `-`.
4. Trim leading and trailing `-`.
5. Use `untitled` if the result is empty.
6. Append `--` and a filesystem-safe short form of the stable ID.

The ID suffix is mandatory. It prevents collisions on case-insensitive filesystems and makes paths stable when two entities share a title. Import never derives an ID from the suffix.

On export, title changes may rename paths. Paths are generated in a stable sort order, so an unchanged database produces the same tree. Review filenames use the stored creation time and stable review ID, never the current export time.

## Root manifest

`beta-bot.yaml` is the only entry-point manifest.

```yaml
format: beta-bot-library
format_version: 1
bundle_id: bundle:01K3G9T2G8C2M82R6N4Y0P5R4B
bundle_kind: library       # library | selection
content_mode: full         # full | text-only
exported_at: 2026-08-20T15:00:00.000Z
app_version: 1.14.0
book_ids:
  - life-balance-lx2a8f
includes:
  image_bytes: true
  history: true
  audit_records: true
hash_algorithm: sha256
```

Rules:

- `bundle_id` is unique for each export.
- `book_ids` declares the exact book scope.
- A bundle is replace-capable only when it is `bundle_kind: library`, `content_mode: full`, and all `includes` values required by that format version are true.
- Unknown manifest keys generate a warning. Unknown enum values or missing required keys are errors.
- A higher `format_version` is rejected. Lower supported versions are migrated in memory before validation.

## Human-editable file formats

All YAML uses the YAML 1.2 core schema with custom tags disabled. Writers quote ambiguous strings. Readers reject duplicate keys, aliases, anchors, merge keys, non-string mapping keys, and values outside the expected schema.

All text files are UTF-8 without a byte-order mark. Markdown bodies are preserved exactly after the closing frontmatter delimiter; import does not trim whitespace or append a newline.

### `book.yaml`

```yaml
id: life-balance-lx2a8f
title: Life Balance
chapter_order:
  - the-long-walk-m3kx9q
part_order:
  - part-one-m1a0bc
cover_image_id: null
created_at: 2026-03-01T10:00:00.000Z
updated_at: 2026-08-19T02:10:55.000Z
```

`chapter_order` is the sole canonical total order of chapters in a book. Every chapter in the book appears exactly once. `part_order` similarly contains every part exactly once.

There is no part-local chapter order in the bundle. The importer derives each database `book_parts.chapter_order` by filtering `book.yaml.chapter_order` for chapters whose `part_id` matches that part.

### `part.yaml`

```yaml
id: part-one-m1a0bc
book_id: life-balance-lx2a8f
name: Part One
cover_image_id: null
created_at: 2026-03-01T10:00:00.000Z
updated_at: 2026-08-19T02:10:55.000Z
```

Moving a chapter between parts changes only `part_id` in `chapter.md`. Reordering chapters changes only `book.yaml.chapter_order`.

### `chapter.md`

```markdown
---
id: the-long-walk-m3kx9q
book_id: life-balance-lx2a8f
part_id: part-one-m1a0bc
title: The Long Walk
cover_image_id: null
created_at: 2026-03-02T18:41:07.000Z
updated_at: 2026-08-19T02:10:55.000Z
wiki_mentions:
  - id: the-long-walk-m3kx9q-marisol-vance-m2p1qz
    wiki_page_id: marisol-vance-m2p1qz
    source: manual
    created_at: 2026-08-10T14:00:00.000Z
    updated_at: 2026-08-10T14:00:00.000Z
---
Body of the chapter in Markdown.
```

`word_count` is derived from the body on import. `wiki_mentions` preserves curated and generated chapter-page associations; it is never reconstructed solely from text matching. The importer may offer a separate command to discover additional mentions.

If an external editor changes semantic chapter content but leaves `updated_at` unchanged, import assigns the transaction time. External tools are not required to manage timestamps correctly.

### `notes.md`

```markdown
---
id: the-long-walk-note-m3kx9r
chapter_id: the-long-walk-m3kx9q
created_at: 2026-03-02T19:00:00.000Z
updated_at: 2026-08-19T02:10:55.000Z
---
Author notes.
```

At most one note file may exist for a chapter.

### Chapter `summary.md`

```markdown
---
id: the-long-walk-summary-m3kx9s
chapter_id: the-long-walk-m3kx9q
pov: Marisol
characters:
  - Marisol Vance
beats:
  - Marisol leaves home
spoilers_ok: true
generated_by: ai
model: gpt-4o-mini
created_at: 2026-03-02T19:00:00.000Z
updated_at: 2026-08-19T02:10:55.000Z
---
Summary prose.
```

`characters` and `beats` are real YAML lists in the bundle and JSON strings only inside the current database adapter. `generated_by` and `model` are nullable provenance fields added to the database schema.

### Part `summary.md`

```markdown
---
id: part-one-summary-m1a0bd
part_id: part-one-m1a0bc
characters:
  - Marisol Vance
beats:
  - The family separates
generated_by: ai
model: gpt-4o-mini
created_at: 2026-03-10T19:00:00.000Z
updated_at: 2026-08-19T02:10:55.000Z
---
Part summary prose.
```

### Reviews

```markdown
---
id: 01K3GAF6Q5AJM4T9ZJZP95W8FP
chapter_id: the-long-walk-m3kx9q
profile_ref: profile:01K3G98H8MZBM6M60BXNYEC3TG
profile_name: Developmental Editor
tone_key: editorial
prompt_used: Review pacing and continuity.
created_at: 2026-08-18T17:42:11.000Z
updated_at: 2026-08-18T17:42:11.000Z
---
Review body.
```

`profile_name` and `tone_key` remain as snapshots so a review stays intelligible if its profile is later renamed or deleted. An unknown `profile_ref` is permitted with a warning because the snapshot fields preserve meaning.

### Wiki pages

```markdown
---
id: marisol-vance-m2p1qz
book_id: life-balance-lx2a8f
page_name: Marisol Vance
page_type: character
aliases:
  - Vee's mom
  - Mrs. Vance
  - Mari
tags:
  - family
  - keen
is_major: true
is_pinned: false
created_by_ai: true
cover_image_id: null
created_at: 2026-04-11T09:02:00.000Z
updated_at: 2026-08-19T02:10:55.000Z
summary: One-line summary shown in lists.
---
Wiki page body.
```

Aliases are not required to be globally unique. Ambiguities are warnings in the preview and are available to mention-discovery tools.

Review progress is intentionally not stored as `reviewed_through`. See “Wiki review state.”

### `characters.yaml`

```yaml
characters:
  - id: 01K3GB0KAT3PRVZQJ1X6SR8YQ2
    book_id: life-balance-lx2a8f
    character_name: Marisol Vance
    wiki_page_id: marisol-vance-m2p1qz
    created_at: 2026-04-11T09:02:00.000Z
    updated_at: 2026-08-19T02:10:55.000Z
```

The file is omitted when the book has no character rows.

### Profiles

```yaml
id: profile:01K3G98H8MZBM6M60BXNYEC3TG
profile_kind: custom       # custom | ai | system
name: Developmental Editor
description: Focuses on structure, pacing, and continuity.
tone_key: editorial
system_prompt: null
is_default: false
created_at: 2026-05-01T10:00:00.000Z
updated_at: 2026-08-19T02:10:55.000Z
```

File-level profile identity uses a stable text `id`. Built-in profiles use namespaced IDs such as `system:editorial`; custom profiles use generated IDs. Existing integer database IDs remain internal compatibility keys during migration and are not portable identity.

System profiles are serialized in full bundles because reviews may depend on the exact historical prompt. On import, a bundled system profile never silently replaces a newer app-owned system definition; it is retained as a versioned profile snapshot when definitions differ.

## Images and asset metadata

Every image asset is stored exactly once under its book’s `assets/` directory.

`asset.yaml` contains all database metadata and tag relationships:

```yaml
id: 01K3GBC9V9Z3SZD58A25NWV49Y
book_id: life-balance-lx2a8f
chapter_id: the-long-walk-m3kx9q
asset_type: chapter
file_name: bridge-sketch.png
mime_type: image/png
notes: Early concept sketch.
wiki_page_ids:
  - marisol-vance-m2p1qz
created_at: 2026-06-01T12:00:00.000Z
updated_at: 2026-08-19T02:10:55.000Z
sha256: 99f4...
byte_length: 182734
```

The sibling binary filename is given by `file_name`. Import ignores legacy absolute `file_path` values and assigns a platform-appropriate local path. `image_data` is reconstructed for browser storage when needed.

Books, parts, chapters, and wiki pages refer to covers through `cover_image_id`. Validation requires each non-null cover reference to resolve to an included asset in a full bundle.

Rules by content mode:

- `full`: every asset has verified bytes. Missing or hash-mismatched bytes are fatal.
- `text-only`: `asset.yaml` may be present without bytes. Import preserves existing matching local bytes during Apply changes and never deletes image bytes merely because they were omitted.

Google Drive backup always uses `full` mode. An export that cannot read an image fails clearly rather than producing a replace-capable incomplete backup.

## App-owned recovery data

Some persistent records are important for recovery but poor candidates for individually editable Markdown. Full bundles store them as versioned JSON Lines under `_beta-bot/history/`:

- `chapter-revisions.jsonl`: all `chapter_revisions` rows, including discarded markers;
- `chapter-activity.jsonl`: all `chapter_activity` rows, including delete activity;
- `wiki-updates.jsonl`: all `wiki_updates` audit rows.

Each line is one JSON object with named fields and a stable ID. Keys are emitted in a deterministic order. Files are sorted by `(created_at, id)`.

These files are required for a full library bundle. They may be omitted only in `text-only` mode, where the manifest declares `history: false` or `audit_records: false`.

Git history complements these records; it does not replace them. The in-app revision UI must work identically after a full restore.

## Wiki review state

A single “reviewed through chapter” marker is insufficient when chapters are edited, reordered, deleted, or reviewed out of order. The canonical model stores review state per wiki page and chapter content version.

`_beta-bot/review-state.jsonl` contains records such as:

```json
{"wiki_page_id":"marisol-vance-m2p1qz","chapter_id":"the-long-walk-m3kx9q","chapter_content_sha256":"c13a...","reviewed_at":"2026-08-19T02:10:55.000Z","reviewed_by":"agent"}
```

A review remains current only while the chapter’s semantic content hash matches `chapter_content_sha256`. Reordering does not invalidate it; editing the chapter does. Deleted chapters are reported as stale state and removed only with explicit confirmation.

For this purpose, the chapter content hash covers the chapter title and exact body text, but not timestamps, ordering, cover art, or wiki-mention metadata. The broader inventory semantic hash covers all mutable chapter fields and relationships.

The app may derive a display-only “reviewed through” cursor when all chapters up to a point have current review records. It is never authoritative.

This requires a new `wiki_review_state` table keyed by `(wiki_page_id, chapter_id)`.

## Export inventory and semantic hashes

`_beta-bot/inventory.json` makes safe three-way import possible. It is written at export time and is never edited by users or agents.

It contains:

```json
{
  "inventory_version": 1,
  "bundle_id": "bundle:01K3G9T2G8C2M82R6N4Y0P5R4B",
  "entities": [
    {
      "entity_type": "chapter",
      "id": "the-long-walk-m3kx9q",
      "path": "books/life-balance--.../chapters/the-long-walk--.../chapter.md",
      "semantic_sha256": "c13a..."
    }
  ]
}
```

The semantic hash is computed from the typed, canonical entity representation, not raw file bytes. Reformatting YAML, moving a file, or changing line endings in metadata therefore does not create a false content edit. Mutable content and relationships are included; derived fields and `updated_at` are excluded.

The inventory serves four purposes:

- establishes the base version for conflict detection;
- distinguishes deliberate file deletion from an entity that was never in scope;
- detects duplicate or substituted IDs;
- permits integrity checks without making paths authoritative.

The inventory is not a security signature. A malicious bundle remains untrusted input.

## Round-trip contract

For a full library bundle:

```text
import(export(database)) == database
```

The only permitted normalizations are:

- `word_count` is recomputed from chapter text;
- platform-local image paths and browser `image_data` encodings may differ while decoded bytes remain identical;
- redundant `book_parts.chapter_order` is derived from total book order plus `part_id`;
- legacy integer profile references are mapped to stable profile IDs;
- timestamps are normalized to ISO 8601 UTC with millisecond precision.

No authored association, audit record, revision, or image metadata is derived from prose when it can be serialized directly.

Round-trip equality is defined by a versioned logical database dump, not raw SQLite page bytes or row order.

## Import modes

### Apply changes — default for files

Apply changes performs a three-way comparison for every entity in scope:

- **Base:** semantic hash in the inventory.
- **Local:** semantic hash of the current database entity.
- **Incoming:** semantic hash parsed from the current bundle file.

| Local vs. base | Incoming vs. base | Result |
|---|---|---|
| unchanged | unchanged | no operation |
| unchanged | changed | apply incoming |
| changed | unchanged | keep local |
| changed | same change | no conflict |
| changed | different change | conflict; user chooses |
| absent | new incoming entity | create |
| new local entity | absent from base | keep |

If an entity listed in the base inventory is now missing from the bundle, that is an incoming deletion. It is applied only if local is unchanged; otherwise it is a delete-versus-edit conflict.

New files not present in the inventory are valid only when they contain new globally unique IDs and pass all validation.

Apply changes never modifies entities outside `book_ids` and never removes global profiles merely because a selection bundle does not contain them.

### Replace library — default for Drive restore

Replace is available only when all of these are true:

- `bundle_kind` is `library`;
- `content_mode` is `full`;
- required history, audit, and image data is present;
- validation and integrity checks succeed;
- a verified recovery bundle has been created.

Replace makes every in-scope table match the bundle, inside one database transaction. A write, constraint, or persistence failure rolls back the entire operation.

The UI may additionally offer Apply changes for a Drive backup, but it never offers Replace for a selection or text-only bundle.

### Import as copy

Import as copy is optional but recommended for long-term usability. It assigns new IDs to a selected book and all contained entities, preserving internal references. It is the explicit solution for intentionally duplicating a book; missing IDs are still never silently generated during normal import.

## Conflict handling

The preview groups conflicts by book and entity. For structured YAML fields, it shows field-level differences. For Markdown bodies, it shows a text diff. Users may choose:

- keep local;
- use incoming;
- manually edit the incoming file and revalidate.

“Use newest timestamp” is not a default conflict policy. Timestamps are advisory because external editors may not update them and device clocks may disagree.

Bulk “keep all local” and “use all incoming” actions are allowed after the conflicts are visible. The chosen resolution becomes part of the immutable import plan.

## Preview and immutable import plan

Import has four phases:

1. Read the bundle into an untrusted file map with resource limits.
2. Parse and migrate it into a typed intermediate model.
3. Validate the whole model and build an immutable import plan.
4. After confirmation, execute exactly that plan in one transaction.

The preview is rendered from the import plan, not by querying or reparsing files a second time. If the database changes after the plan is built, a database generation counter invalidates the plan and requires a refreshed preview.

The preview includes:

- created, changed, unchanged, deleted, and conflicted counts by entity type;
- titles and paths for every changed or deleted authored entity;
- text and structured diffs on demand;
- stale or missing wiki review state;
- image byte totals and omissions;
- ambiguous aliases;
- warnings about unknown profile references or ignored unknown files;
- whether the bundle is eligible for Replace.

Nothing is written before confirmation.

## Validation

Validation is exhaustive and produces path, entity ID, and reason for each error.

### Fatal structural errors

- Missing or invalid `beta-bot.yaml`.
- Unsupported `format_version` or inventory version.
- Manifest and inventory `bundle_id` mismatch.
- Invalid UTF-8, YAML, JSON, or Markdown frontmatter.
- YAML duplicate keys, aliases, anchors, merge keys, or custom tags.
- Missing required fields or incorrect field types.
- Duplicate entity IDs, including duplicates across different paths.
- An inventory entity whose file has been replaced with a different ID.
- Duplicate entries in order arrays.
- Unsafe paths, absolute paths, `..`, NUL bytes, symlinks, or path collisions after Unicode/case normalization.
- Exceeded archive limits for file count, path length, per-file bytes, total uncompressed bytes, or compression ratio.

### Fatal referential errors

- A book-scoped entity refers to a book outside the declared scope.
- A chapter refers to an unknown part or a part in a different book.
- A chapter or part order entry is unknown, duplicated, or belongs to another book.
- A book chapter or part is absent from its corresponding total order.
- A note, summary, review, mention, revision, or activity row refers to an unknown parent where the schema requires one.
- More than one note or summary exists for the same parent.
- A non-null cover or image-tag reference cannot be resolved in a full bundle.
- Asset bytes fail the declared hash or length.

### Warnings

- Two wiki pages share an alias.
- A review references an unknown profile but contains profile snapshot fields.
- A text-only bundle omits image bytes or history as declared.
- Unknown files appear outside `_beta-bot/`; they are ignored and preserved only by directory-to-directory tools, not by database round-trip.
- `updated_at` is earlier than `created_at`.
- Review-state records are stale because chapter content changed.

Missing IDs are always fatal for existing entity files. The explicit Import as copy flow is the only operation that generates replacement IDs.

## Resource limits and untrusted input

ZIPs and directories are untrusted. The importer must enforce centrally configured limits before materializing all content in memory. Initial limits should be generous enough for real libraries and adjustable without a format-version change:

- maximum 50,000 files;
- maximum 1 GiB total uncompressed bytes on web and a platform-appropriate higher native limit;
- maximum 100 MiB per non-image file;
- maximum path length of 1,024 UTF-8 bytes;
- maximum compression ratio of 200:1 per entry;
- no executable interpretation of YAML, Markdown, or filenames.

Limits are product policy, not part of bundle semantics. The UI reports which limit was exceeded and suggests exporting smaller selections where appropriate.

## Recovery before replace

Before Replace, the app creates a full recovery bundle of the current database and stores it outside the database being replaced:

- web: a dedicated IndexedDB recovery store;
- Electron/native: the app recovery directory;
- optional: an additional user download.

The app writes the recovery bundle, reads it back, verifies its SHA-256 checksum, and only then enables confirmation. Triggering a browser download alone is not considered verification.

Keep the three most recent verified recovery bundles, with timestamp, app version, and source operation. Recovery bundles are listed in Settings and can be restored or downloaded. Retention cleanup happens only after a newer bundle has been verified.

## Export behavior

- Full library export is the default and is replace-capable.
- Selected-book export produces `bundle_kind: selection` and is never replace-capable.
- Text-only export is an advanced option intended for Git/agent workflows.
- The existing combined Markdown export remains as a reading and printing convenience and is clearly labeled non-importable.
- The current structured ZIP exporter is replaced by this bundle exporter.
- Export flushes database persistence and reads all scoped data from one consistent database snapshot.
- Export never updates entity timestamps.
- An unchanged database produces semantically identical entity files and inventory hashes. Only manifest export metadata and `bundle_id` change.
- Failure to read required image bytes makes a full export fail; it never silently downgrades the bundle.

On platforms with directory write support, exporting to an existing bundle updates managed files and removes obsolete managed files listed in the prior inventory. It does not delete unknown user files. ZIP export always creates a fresh archive.

## Google Drive backup

Drive stores encrypted bytes of a full library ZIP. Serialization is identical to local ZIP export.

### Encryption

New backups use the existing versioned Web Crypto envelope:

- PBKDF2-HMAC-SHA256 password derivation;
- AES-256-GCM authenticated encryption;
- random salt and IV;
- iteration count stored in the envelope.

CryptoJS decryption remains only for legacy backups. The design does not introduce new CryptoJS encryption.

### Generations

Drive backup creates a new generation before retiring an old one. It keeps the three newest successful generations, identified with Drive `appProperties` under the existing `drive.file` scope. The UI lists generation time, app version, and bundle format version.

A generation is considered successful only after upload completes and its encrypted byte length and local ciphertext hash match recorded metadata. Old generations are removed only after the new generation is recorded successfully. Failure leaves prior backups untouched.

### Restore detection

After decryption:

1. If bytes have a valid ZIP signature, parse as a bundle ZIP and require `beta-bot.yaml`.
2. Otherwise, decode UTF-8, remove an optional legacy BOM, and attempt strict legacy JSON parsing.
3. Reject anything else as corrupt or unsupported.

Detection does not rely only on the first plaintext character.

Legacy JSON backups remain restoreable indefinitely. Creating a new bundle backup does not delete the legacy restore code.

## Database schema changes

Schema changes should make portable identity and modification tracking consistent rather than adding one-off exceptions.

### Required

- `books.updated_at TIMESTAMP`.
- `chapters.updated_at TIMESTAMP`.
- `book_characters.updated_at TIMESTAMP`.
- `custom_reviewer_profiles.stable_id TEXT UNIQUE` and `updated_at` if absent.
- `ai_profiles.stable_id TEXT UNIQUE` and `updated_at TIMESTAMP`.
- `chapter_summaries.generated_by TEXT`, `model TEXT`.
- `part_summaries.generated_by TEXT`, `model TEXT`.
- `wiki_review_state(wiki_page_id, chapter_id, chapter_content_sha256, reviewed_at, reviewed_by)` with a composite primary key.

### Profile references

Add a stable text profile reference to `chapter_reviews` while retaining the legacy integer `profile_id` during migration. New code resolves profiles by stable ID. After all supported databases have migrated, the integer field may remain as compatibility data but is no longer used for portable identity.

### Backfills

- Backfill entity `updated_at` from the latest relevant child/audit timestamp, otherwise `created_at`.
- Assign deterministic namespaced IDs to built-in profiles.
- Assign generated stable IDs once to custom profiles and persist them.
- Backfill review stable references from existing profile IDs; retain snapshot fields when unresolved.
- Derive `book_parts.chapter_order` from existing valid ordering during migration, then keep it synchronized as a database compatibility field.

All migrations are idempotent, transactional, and covered for both sql.js and native Capacitor SQLite.

## Codec architecture

Implement the format as platform-independent core modules:

```text
src/lib/libraryBundle/
  model.ts             # typed canonical model
  schemas.ts           # runtime validation schemas
  read.ts              # file map -> untrusted parsed model
  migrate.ts           # older model -> current model
  validate.ts          # whole-bundle validation
  semanticHash.ts      # canonical entity hashing
  inventory.ts
  plan.ts              # three-way import planning
  write.ts             # database snapshot -> file map
  apply.ts             # immutable plan -> transaction
  adapters/
    zip.ts
    directory.ts
    drive.ts
```

The core operates on a small file-map abstraction and byte arrays. It does not access DOM download APIs, Google Drive, or platform filesystems. Adapters are thin and separately tested.

Database export uses named fields throughout. Positional SQL row arrays never cross the codec boundary.

Format migrations are pure functions over the typed intermediate representation. Database migrations and bundle migrations are separate concerns.

## Testing strategy

One round-trip property test is necessary but not sufficient.

### Codec tests

- Full logical database round-trip covering every table and nullable field.
- Empty library, large library, Unicode, duplicate titles, unusual Markdown, and binary assets.
- Deterministic output and semantic hashes.
- Selection and text-only scope behavior.
- Every supported older format migrated through golden fixtures.
- Invalid types, duplicate IDs, broken references, malformed frontmatter, and resource-limit fixtures.
- Fuzz tests for YAML/frontmatter boundaries and ZIP entry paths.

### Import-plan tests

- All three-way comparison cases, including delete-versus-edit conflicts.
- Entities moved or renamed without semantic changes.
- Local changes preserved when incoming is unchanged.
- Conflicts require resolution before execution.
- Database generation change invalidates a preview.
- Apply and Replace rollback after injected failures.

### Transport tests

- ZIP byte round-trip independent of the database round-trip.
- Directory adapter parity with ZIP.
- Encrypted binary ZIP round-trip through the current Web Crypto envelope.
- Golden restores for WC1, WC2, and CryptoJS-encrypted legacy JSON.
- Drive upload, generation retention, download, and failed-upload preservation using mocked APIs.
- Browser, Electron, and native persistence behavior.

### UI and end-to-end tests

- Preview counts and diffs.
- Conflict resolution.
- Replace eligibility rules.
- Verified recovery creation and restoration.
- Selected-book import cannot delete unrelated books.
- Missing image bytes prevent full restore but are allowed as declared in text-only Apply changes.

Coverage for new codec and planning modules should be at least 90 percent because they protect destructive data operations.

## Agent workflow

A bundle intended for Git includes a sample `AGENTS.md` or `CLAUDE.md` outside the managed format tree. The instructions should say:

1. Read this specification before editing managed files.
2. Never change an existing entity ID or edit `_beta-bot/inventory.json`.
3. New entities require globally unique, correctly namespaced IDs.
4. Search both `page_name` and every alias when reconciling a wiki page.
5. Preserve explicit `wiki_mentions`; do not infer that absence of a text match means the relationship should be deleted.
6. Record wiki review state with the exact semantic chapter content hash.
7. Run a standalone bundle validator before opening a pull request.
8. Open a pull request instead of committing directly to the protected branch.

Provide a small Node-based validator command that uses the same schema, migration, and validation modules as the app. It performs no database access and exits nonzero on errors.

## User interface

Settings presents separate, accurately named actions:

- **Export full library backup**
- **Export selected books**
- **Export text-only workspace**
- **Import or apply bundle changes**
- **Restore library from bundle**
- **Manage recovery bundles**

Folder selection is progressive enhancement. ZIP is supported everywhere; Chromium-class browsers and desktop builds may additionally read or write directories.

Suggested import help text:

> Import a Beta Bot bundle from a ZIP or folder. Files are matched by stable IDs, so they may be renamed or reorganized. Beta Bot compares the bundle with both its original export and your current library, then asks you to resolve any conflicting edits before anything is changed.

Suggested Replace confirmation:

> This complete backup can replace your current library. Beta Bot has created and verified a recovery copy of your current library. This restore will remove N books, M chapters, and K wiki pages that are not in the backup. Continue?

The UI never calls Apply changes “sync” and never describes a text-only bundle as a backup.

## Rollout

### Phase 1: schema and canonical model — complete

- Add schema migrations and backfills.
- Define runtime schemas and typed canonical entities.
- Add logical database dump helpers and fixtures.
- Ship without changing export or Drive behavior.

### Phase 2: writer and local full export — complete

- Implement deterministic file-map writer, inventory, ZIP adapter, and full round-trip tests.
- Add full bundle export beside the existing exporter.
- Compare bundle contents with the current JSON backup in automated fixtures.

### Phase 3: parser, validation, and import planning — complete

- Implement ZIP/directory readers, migrations, exhaustive validation, semantic hashing, and three-way planning.
- Add preview and Apply changes UI.
- Keep Replace disabled until recovery storage and failure-injection tests pass.

### Phase 4: recovery and Replace — complete

- Implement verified external recovery storage and retention.
- Enable Replace only for eligible bundles.
- Exercise browser and native rollback and persistence paths.

### Phase 5: Drive generations — complete

- Upload encrypted bundle ZIPs as new Drive generations.
- Keep existing JSON backup creation available behind an internal fallback for one release.
- Restore both bundle and every legacy JSON/encryption format.
- Switch the default only after cross-platform restore tests pass.

### Phase 6: directory and agent tooling — complete

- Add directory write/update where supported.
- Publish the standalone validator and sample agent instructions.
- Document a recommended `.gitattributes` policy for generated history files and binary assets.

## Acceptance criteria

The design is complete when all of the following are demonstrated:

- A fixture containing every persistent table round-trips through a full bundle without losing logical data.
- Full Drive restore preserves in-app revisions, activity, images, wiki links, summaries, reviews, profiles, and audit records.
- A selected-book or text-only bundle cannot trigger Replace through either UI or internal API.
- A local chapter edit and a different incoming chapter edit produce a visible conflict and no write before resolution.
- Renaming folders or files without changing IDs produces no database change.
- Duplicate titles do not collide on macOS, Windows, Linux, Android, or ZIP extraction.
- A corrupt or hostile archive fails before any database write.
- Replace cannot begin until a recovery bundle is written and verified outside the main database.
- Failure at any point in transactional import leaves the prior library usable.
- Legacy JSON backups from every supported encryption generation still restore.

## Consequences

This is more implementation work than a Markdown-only exporter. The additional machinery—typed schemas, inventory hashes, three-way planning, recovery storage, and complete history—is intentional. Import and backup are destructive-data boundaries, and long-term maintainability is better served by one explicit canonical model than by accumulating transport-specific exceptions.

The resulting format remains pleasant for its motivating use case: chapters and wiki pages are normal Markdown files, aliases are first-class lists, Git diffs are useful, and agents can validate their work. At the same time, users who never adopt Git receive a backup that is at least as complete and recoverable as the format it replaces.
