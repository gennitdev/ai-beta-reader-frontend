# Git and agent workspaces

Beta Bot can export the canonical library bundle directly to a folder in browsers that support the File System Access API. Choose **Export Git workspace to folder** in Settings, then select either an empty folder or a folder containing an earlier Beta Bot bundle.

ZIP remains available on every supported platform. Folder export is progressive enhancement for Chromium-class browsers and compatible desktop builds.

## Safe folder updates

Folder export treats the prior `_beta-bot/inventory.json` as the ownership boundary:

- New managed files are written and read back byte-for-byte before obsolete files are removed.
- Only canonical files owned by the prior inventory, the manifest, inventory, declared history files, and an asset's inventoried binary are eligible for replacement or deletion.
- Unknown files are preserved. If an unknown file occupies a path needed by the new bundle, export stops instead of overwriting it.
- `AGENTS.md` and `.gitattributes` are created only when absent. Subsequent exports never replace customized copies.
- A failed multi-file update restores overwritten and deleted content and removes files created by the failed attempt. If that rollback cannot finish, the app reports the combined failure instead of claiming success.

The browser directory API cannot provide a single atomic transaction across an arbitrary folder. The preflight, write verification, delete-last ordering, and rollback journal are the strongest portable behavior available through that API.

## Standalone validator

The validator reads a directory or ZIP and runs the same resource limits, parser, format migrations, runtime schemas, referential checks, inventory checks, and asset integrity checks as the app. It does not initialize or access a database.

From a checkout of this repository:

```bash
npm install
npm run validate:bundle -- /absolute/path/to/library-folder
npm run validate:bundle -- /absolute/path/to/library.zip
```

Errors produce a nonzero exit status. Warnings are printed but do not make an otherwise valid bundle fail. A successful full library bundle is also reported as eligible for Replace.

The directory validator ignores the root `.git/` directory and recognizes the generated `AGENTS.md`, optional `CLAUDE.md`, and `.gitattributes` as workspace support files. Other unknown files remain visible as warnings while being ignored by database import.

## Generated agent instructions

New folder workspaces receive an `AGENTS.md` containing the operating rules from the canonical-format design:

1. Read the format specification before editing managed files.
2. Never change an existing entity ID or edit `_beta-bot/inventory.json`.
3. Give new entities globally unique, correctly namespaced IDs.
4. Search page names and aliases when reconciling wiki pages.
5. Preserve explicit wiki mentions.
6. Record wiki review state against the exact chapter content hash.
7. Run the standalone validator before opening a pull request.
8. Use a pull request rather than committing directly to a protected branch.

The source template is `src/lib/libraryBundle/agentWorkspace.ts`, which keeps the generated instructions and the policy documented here in one maintained implementation.

## Recommended `.gitattributes`

The generated policy normalizes authored YAML, Markdown, JSON, JSONL, and SVG text to LF. It disables automatic merges for the generated inventory and history/review-state JSONL files: those files should be regenerated after authored conflicts are resolved, not line-merged speculatively.

Common raster asset extensions are marked binary. Their sibling `asset.yaml` metadata remains ordinary diffable text. This preserves useful manuscript diffs without asking Git to merge image bytes or app-owned recovery records.
