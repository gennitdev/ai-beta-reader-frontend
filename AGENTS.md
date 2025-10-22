# Repository Guidelines

## Project Structure & Module Organization
This Vue 3 + TypeScript app bootstraps from `src/main.ts`, wiring Pinia, Vue Router, and Vue Query. Route-level views live in `src/views/`, shared UI in `src/components/` (PascalCase `.vue` files), and feature logic in `src/composables/`, `src/services/`, `src/lib/`, and `src/utils/`. Auth0 handling sits in `src/auth/`; Pinia stores belong in `src/stores/` with `useXxxStore` exports. Static assets stay under `public/` or `src/assets/`, while Vite builds output to `dist/`. Tailwind configuration lives in `tailwind.config.js` alongside global styles in `src/style.css`.

## Build, Test, and Development Commands
Install dependencies with `npm install`. `npm run dev` starts the Vite dev server at http://localhost:5173 with hot module replacement. `npm run build` runs type-checking and emits the production bundle into `dist/`; use `npm run preview` to serve the build locally. Run `npm run lint` for ESLint autofix and `npm run type-check` for standalone TypeScript verification.

## Coding Style & Naming Conventions
Use `<script setup lang="ts">` with the Composition API and keep TypeScript strictness errors at zero. Follow 2-space indentation, camelCase for functions/composables (`useDatabase`), and PascalCase for Vue components and filenames (`SearchModal.vue`). Reference modules with the `@/` alias rather than relative paths when crossing feature folders. Prefer Tailwind utilities, adding scoped styles only when needed. Avoid disabling ESLint rules unless absolutely necessary and annotate any suppression.

## Testing Guidelines
Automated tests are not yet configured, so exercise key user flows manually via `npm run dev` before submitting. Record the browsers/devices you covered in the PR description. If you add a test harness, prefer Vitest + Vue Test Utils, co-locate specs as `ComponentName.spec.ts` or place them under `src/__tests__/` (already excluded from the app build). Always run `npm run type-check` and `npm run lint` to catch regressions early.

## Commit & Pull Request Guidelines
Commits follow a short imperative style (`Add show/hide toggle for chapter summary panel`). Keep changes focused and avoid bundling unrelated tweaks. PRs should include: a crisp summary, linked issues, screenshots or screen recordings for UI changes, and a checklist of manual verifications (e.g., “Auth0 login”, “AI summary generation”). Note any environment variable updates (`.env.local`) and confirm they remain untracked.

## Security & Configuration Tips
Secrets and environment values belong in `.env.local` with the `VITE_` prefix (e.g., `VITE_AUTH0_DOMAIN`). Never commit this file or share raw tokens in logs. Review `capacitor.config.ts` before mobile builds and align Vercel deployments with `vercel.json`.
