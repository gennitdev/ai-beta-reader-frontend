# Repository Guidelines

## Project Structure & Module Organization
This Vue 3 + TypeScript app bootstraps from `src/main.ts` and wires Vue Router. Route-level views live in `src/views/`, shared UI in `src/components/` (PascalCase `.vue` files), and shared state and feature logic live in `src/composables/`, `src/services/`, `src/lib/`, and `src/utils/`. Static assets stay under `public/` or `src/assets/`, while Vite builds output to `dist/`. Tailwind configuration lives in `tailwind.config.js` alongside global styles in `src/style.css`.

## Build, Test, and Development Commands
Install dependencies with `npm install`. `npm run dev` starts the Vite dev server at http://localhost:5173 with hot module replacement. `npm run build` runs type-checking and emits the production bundle into `dist/`; use `npm run preview` to serve the build locally. Run `npm run lint` for ESLint autofix and `npm run type-check` for standalone TypeScript verification.

## Coding Style & Naming Conventions
Use `<script setup lang="ts">` with the Composition API and keep TypeScript strictness errors at zero. Follow 2-space indentation, camelCase for functions/composables (`useDatabase`), and PascalCase for Vue components and filenames (`SearchModal.vue`). Reference modules with the `@/` alias rather than relative paths when crossing feature folders. Prefer Tailwind utilities, adding scoped styles only when needed. Avoid disabling ESLint rules unless absolutely necessary and annotate any suppression.

## Testing Guidelines
This project has an automated suite, and CI enforces it. Unit and component specs use Vitest + Vue Test Utils and live under `src/__tests__/` as `ComponentName.spec.ts` (excluded from the app build); browser scenarios are Playwright specs under `e2e/`; Electron runtime and security tests live under `electron/tests/`. Add coverage alongside behavior changes rather than relying on manual passes. Before submitting, run `npm run lint`, `npm run type-check`, `npm run type-check:electron`, and `npm run test:unit`; run `npm run test:e2e`, `npm run test:electron`, or `npm run test:fuzz` when your change touches those areas. Still exercise key user flows manually via `npm run dev` for UI work, and record the browsers or devices you covered in the PR description.

## Commit & Pull Request Guidelines
Commits follow a short imperative style (`Add show/hide toggle for chapter summary panel`). Pull request titles must follow Conventional Commits (`feat: add chapter heatmap`, `fix(bardwall): contain the town map`) because squash titles drive releases. Keep changes focused and avoid bundling unrelated tweaks. PRs should include: a crisp summary, linked issues, screenshots or screen recordings for UI changes, and a checklist of manual verifications (e.g., “Google Drive backup”, “AI summary generation”). Note any environment variable updates (`.env.local`) and confirm they remain untracked.

## Security & Configuration Tips
Secrets and environment values belong in `.env.local` with the `VITE_` prefix (e.g., `VITE_GOOGLE_CLIENT_ID`). Never commit this file or share raw tokens in logs. Review `capacitor.config.ts` before mobile builds and align Vercel deployments with `vercel.json`.
