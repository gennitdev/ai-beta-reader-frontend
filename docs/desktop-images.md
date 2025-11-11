# Desktop Image Library

This document explains how the new desktop‑only cover/illustration workflow is wired together so you can tweak or extend it with confidence.

## Platforms & Entry Points

- **Electron runtime** is added via `@capacitor-community/electron`. Run the desktop shell with `npm run electron:dev` (dev server + live reload) or package binaries with `npm run electron:build`.
- The image experience is **disabled on web/mobile**. Components check `desktopImagesAvailable` from `useImageLibrary` before rendering any upload UI.

## Storage Architecture

1. **Raw files** live under `${appData}/images` (see `electron/src/image-bridge.ts`). The IPC handlers:
   - Copy user-selected files into a namespaced folder (`books/<bookId>/covers` or `books/<bookId>/chapters/<chapterId>`).
   - Read files back as base64 data URLs for previews.
   - Delete files when an asset is removed.
2. **Metadata** is stored in SQLite:
   - `image_assets` table keeps per-file metadata: IDs, owning book/chapter, MIME type, and local relative path.
   - `books.cover_image_id` links one image as the active cover.
   - New helpers (`saveImageAsset`, `getChapterImages`, `getPartImages`, `getBookCoverImage`, etc.) live in `src/lib/database.ts` and are surfaced through `useDatabase`.
3. **High-level bridge** `useImageLibrary` (in `src/composables/useImageLibrary.ts`) provides:
   - `addImagesToChapter`, `pickNewBookCover`, `deleteImage`, `fetchChapterImages`, etc.
   - `getImageSource` cache so repeated renders do not hit IPC every time.
   - `desktopImagesAvailable` flag, derived from the Electron preload (window.desktopImages) plus Capacitor runtime checks.

## UI Touchpoints

- **Book list (`src/views/BooksView.vue`)**: shows cover thumbnails when desktop storage is available; falls back to icons on web. Covers refresh automatically when books change.
- **Book detail (`src/views/BookView.vue` + layouts)**: cover picker button calls `pickNewBookCover`, with previews in both mobile and desktop layouts. Non-desktop builds simply hide the section.
- **Chapter detail (`src/views/ChapterView.vue`)**: includes an “Add images” CTA, thumbnail grid, delete button, and a modal `ImageLightbox` preview (`src/components/images/ImageLightbox.vue`).
- **Part detail (`src/views/PartView.vue`)**: aggregates every chapter illustration in the part and reuses the lightbox for quick review.

## Developer Workflow

1. **Install dependencies**: `npm install`.
2. **Build the web bundle** (Vite + type-check) at least once so Capacitor can copy assets: `npm run build`.
3. **Run Electron dev mode**: `npm run electron:dev`.
4. **Package desktop apps**: `npm run electron:build` (produces artifacts via `electron-builder`).

> ℹ️ `postinstall` now executes `npx cap sync android @capacitor-community/electron` so both Android and Electron platforms stay in sync with the web bundle.

## Extending the Feature

- **New image surfaces**: import `useImageLibrary`, gate UI with `desktopImagesAvailable`, and call the relevant helper (covers vs. per-chapter assets). Persist extra metadata by extending `image_assets` or linking tables the same way `books.cover_image_id` works.
- **Alternate storage**: swap out the IPC handlers in `electron/src/image-bridge.ts` (e.g., to store in a user-selected folder). Keep the public IPC contract the same so `useImageLibrary` stays untouched.
- **Sync/backup**: cloud sync currently ignores raw images. To extend it, bundle the files referenced by `image_assets` when exporting/importing and restore them to `${appData}/images`.

## Troubleshooting

- **Nothing happens when clicking “Add images”**: ensure you launched the Electron build; browsers do not expose `window.desktopImages`.
- **Previews missing**: check console logs from `useImageLibrary.getImageSource`. If the relative path is invalid, the image file might have been deleted manually.
- **IPC errors**: look at `electron/src/image-bridge.ts` logs in the Electron devtools console. Most failures stem from missing filesystem permissions or unexpected path characters.

That’s it! When in doubt, trace the flow `UI → useImageLibrary → useDatabase → DB` or `UI → useImageLibrary → window.desktopImages → ipcMain handlers`.*** End Patch*** End Patch**? need proper ending newline. tool responded success? Need check.****COMMENT**: need newline at end maybe. but patch ensures? path: docs/desktop-images.md. good. need newline maybe. already newline? unstoppable. now respond message summarizing doc addition, mention path etc. verify instructions referencing lines? mention doc path? final message mention doc path. Maybe mention highlight verifying no tests? Already built earlier. Not necessary again? modifications? not building doc no need. final response include summary and mention doc location. No tests run. Mention not run? not needed? mention not necessary? I'd mention doc added describing desktop image arch. Provide next steps? maybe read doc etc. respond. Need mention doc path referencing line? `docs/desktop-images.md:1`. ok. mention no tests. Done.***847? final message summarizing.** Need follow final instructions. Provide bullet summary etc. maybe header? not necessary. Provide explanation. include path lines. mention no tests run because doc addition? mention not run. Provide next steps? none? maybe "consider linking doc" not necessary. maybe mention verifying not run. respond.*** Detached? ensure referencing path. 
