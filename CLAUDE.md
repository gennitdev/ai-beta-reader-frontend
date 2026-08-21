# beta bot development guide

beta bot is a local-first Vue 3 and TypeScript writing application. One application codebase targets the browser, Electron, and Android. It does not require the deprecated Express backend: SQLite data lives on the user's device, and optional OpenAI and Google Drive requests go directly from the running client to those services.

Repository-wide contribution and safety rules live in [AGENTS.md](AGENTS.md). This file summarizes the application architecture and common development commands for coding assistants.

## Quick start

Requires Node.js 22.12+ or 24+.

```bash
npm install
npm run dev
```

The Vite development server is available at `http://localhost:5173`. Google Drive configuration is optional; copy [.env.example](.env.example) to `.env.local` only when exercising OAuth and backup flows.

## Verification commands

```bash
npm run lint
npm run type-check
npm run build
npm run test:unit
npm run test:coverage
npm run test:e2e
npm run test:electron
npm run type-check:electron
npm run validate:bundle -- /absolute/path/to/bundle-or.zip
```

CI installs with `--ignore-scripts`, copies the sql.js WASM explicitly, and runs lint, browser and Electron type checks, the production build, coverage, Electron runtime tests, and Playwright.

## Platform commands

```bash
# Android
npm run build
npx cap sync android
npx cap run android --target <serial>

# Electron
npm install --prefix electron
npm run electron:dev
npm run electron:build
```

## Architecture

```text
src/
  components/               shared and feature UI
  composables/              feature orchestration and reactive state
  views/                    route-level Vue components
  lib/
    db/                     platform-neutral repositories and transactions
    libraryBundle/          canonical bundle codec, planning, and transports
    recovery/               verified external recovery stores and Replace flow
    database.ts             sql.js/native SQLite runtime facade
    imageContentStore.ts    browser/Electron image-byte abstraction
    cloudSync.ts            encrypted Drive generations and legacy restore
    openai.ts               direct OpenAI client and prompt workflows
  services/api.ts           legacy, currently unused backend client
  router/                   Vue Router configuration
  content/                  in-app legal documents
scripts/
  validate-bundle.ts        standalone canonical-bundle validator CLI
electron/
  src/                      Electron main/preload bridges
  tests/                    Electron runtime and security tests
android/                    generated/configured Capacitor Android project
e2e/                       Playwright browser scenarios
docs/                      architecture and operational documentation
```

Use `@/` imports when crossing feature directories. New Vue components use `<script setup lang="ts">`, Composition API patterns, and Tailwind utilities.

## Storage model

- Browser and Electron use `sql.js`; serialized SQLite bytes are persisted in the `ai-beta-reader-db` IndexedDB database.
- Android uses `@capacitor-community/sqlite` in the device sandbox.
- Browser image bytes are IndexedDB Blobs. Electron image bytes live below the app-data directory through a preload/IPC bridge.
- Android currently preserves image metadata but has no local image-binary management.
- Browser/Electron persistence writes are serialized. Use the existing flush boundary before export, import, or another operation that must report durable completion.
- OpenAI API keys and Google refreshable tokens use secure storage on Electron/Android. Browser credentials remain browser-local and browser OAuth tokens are short-lived.

## Portable data and backups

The canonical library bundle under `src/lib/libraryBundle/` is the only current user-facing serialization format. A directory and ZIP contain the same deterministic tree of Markdown, YAML, JSONL history, inventory, and image bytes.

- Settings can export a full-library ZIP, import/apply a ZIP or folder, Replace from an eligible full bundle after verified recovery, and write a Git workspace folder where the File System Access API is available.
- Drive backup encrypts a canonical full-library ZIP with the WC2 AES-GCM envelope and keeps the three newest successful immutable generations.
- WC1, WC2, and CryptoJS-encrypted legacy JSON backups remain restore-compatible.
- Never bypass validation, immutable planning, Replace eligibility, or external recovery when changing import/restore behavior.

Read [docs/book-folder-format.md](docs/book-folder-format.md) before changing the codec and [docs/agent-workspaces.md](docs/agent-workspaces.md) before changing directory export.

## Images

`useImageLibrary` exposes capabilities instead of platform-name checks. Browser and Electron support image selection, storage, covers, notes/tags, replacement, download, and deletion through the same UI. Keep image metadata transactions and image-byte writes rollback-safe; do not put new browser image bytes back into SQLite `image_data`.

See [docs/desktop-images.md](docs/desktop-images.md) for the current storage contract and [docs/browser-image-parity-plan.md](docs/browser-image-parity-plan.md) for the completed migration record.

## External services

- OpenAI calls use the user-provided API key directly from `src/lib/openai.ts`.
- Browser Drive OAuth uses Google Identity Services.
- Electron Drive OAuth uses the desktop client and a loopback callback through the Electron bridge.
- Android Drive OAuth uses Authorization Code + PKCE and an app redirect.
- The `drive.file` scope limits the app to files it creates or the user explicitly shares with it.

There is no backend process to start. `src/services/api.ts` remains only as unused legacy compatibility code and should not be used for new features.

## Related documentation

- [README.md](README.md): product overview, setup, and deployment
- [docs/cloud-sync.md](docs/cloud-sync.md): Google OAuth and Drive troubleshooting
- [docs/releases.md](docs/releases.md): Conventional PR titles and Release Please
- [docs/developer/electron-macos-packaging.md](docs/developer/electron-macos-packaging.md): macOS distribution limitations
