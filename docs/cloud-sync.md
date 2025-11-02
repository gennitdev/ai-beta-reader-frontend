# Google Drive Backup & Restore (Web + Android)

This doc captures how the new Google Drive sync workflow works across the browser build and the Android (Capacitor) app, plus the pitfalls we hit while bringing it online.

- [Architecture Overview](#architecture-overview)
- [Environment Variables](#environment-variables)
- [Google Cloud Console Setup](#google-cloud-console-setup)
- [Android Device & Build Workflow](#android-device--build-workflow)
- [Diagnostics & Common Errors](#diagnostics--common-errors)
- [Database Import Notes](#database-import-notes)
- [Useful Commands](#useful-commands)

---

## Architecture Overview

| Piece | Location | Web behaviour | Native behaviour |
|-------|----------|---------------|------------------|
| PKCE OAuth helper | `src/lib/googleOAuth.ts` | Uses Google Identity Services token client | Generates PKCE verifier/challenge, launches system browser via `@capacitor/browser` (iOS) or `@capacitor/app-launcher` (Android), listens for AppLink redirect |
| Token persistence | `src/lib/tokenStorage.ts` | N/A (handled by GIS) | Saves `{accessToken, refreshToken, expiresAt}` with `@capacitor/preferences` |
| Cloud provider | `src/lib/cloudSync.ts` | Requests GIS token client (`google.accounts.oauth2.initTokenClient`) | Reuses cached tokens, refreshes via `https://oauth2.googleapis.com/token`, launches PKCE flow when needed |
| Database interface | `src/lib/database.ts` | Uses `sql.js` in the browser | Uses `@capacitor-community/sqlite`; restores now import raw JSON exports (no `importFromJson`) |

Key differences:

- Web keeps the existing GIS flow (`response_type=token`). Android requires Authorization Code + PKCE and **must** run in the system browser to satisfy Google’s “Use secure browsers” policy.
- Native needs several Capacitor plugins: `@capacitor/browser`, `@capacitor/app-launcher`, `@capacitor/preferences`, `@capacitor/status-bar`.
- OAuth tokens are cached locally on native so repeated restores/upgrades are instant.

---

## Environment Variables

Set these in `.env.local` for local builds **and** in Vercel (Production + Preview) before deploying.

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_GOOGLE_CLIENT_ID` | Web OAuth client (GIS token client) | `302250506015-du7cd7e5g469dd74cs2fnq8luksiuutb.apps.googleusercontent.com` |
| `VITE_GOOGLE_CLIENT_ID_WEB` | Optional alias for the web client. Defaults to `VITE_GOOGLE_CLIENT_ID`. | same as above |
| `VITE_GOOGLE_REDIRECT_URI` | Hosted redirect used by the web flow | `https://www.beta-bot.net/oauth2redirect` |
| `VITE_GOOGLE_CLIENT_ID_NATIVE` | **Android** OAuth client id (public, no secret) | `302250506015-hmm4hpdloehtuodde00pu2irqkpm1inp.apps.googleusercontent.com` |
| `VITE_GOOGLE_REDIRECT_URI_NATIVE` | Custom redirect scheme derived from the Android client id | `com.googleusercontent.apps.302250506015-hmm4hpdloehtuodde00pu2irqkpm1inp:/oauth2redirect` |
| `VITE_GOOGLE_CLIENT_SECRET` | Only required if you deliberately reuse a Web client on native (not recommended). Leave blank otherwise. | |
| `VITE_API_BASE_URL` | Backend API base URL (optional; falls back to `http://localhost:3001`) | `http://localhost:3001` |

> **Tip:** After deploying to Vercel, you can confirm the values landed by downloading the compiled bundle and running `rg "com.googleusercontent.apps" dist/assets`.

---

## Google Cloud Console Setup

1. **Enable the Drive API** for the project.
2. **Create/confirm the Web OAuth Client**:
   - Authorized JavaScript origin: `https://www.beta-bot.net`
   - Authorized redirect URI: `https://www.beta-bot.net/oauth2redirect`
3. **Create/confirm the Android OAuth Client**:
   - Package name: `com.betareader.app`
   - SHA‑1 certificate fingerprint: output of `./gradlew signingReport` (debug build) and, if applicable, the release keystore SHA‑1.
   - Tick **“Enable custom URI scheme”**; Google auto-derives `com.googleusercontent.apps.<client-id>:/oauth2redirect`.
4. **Digital Asset Links**:
   - `android/app/src/main/AndroidManifest.xml` already declares the HTTPS App Link and the custom scheme.
   - Ensure `https://www.beta-bot.net/.well-known/assetlinks.json` includes the Android client sha1 + package so the browser redirect is trusted.
5. **OAuth consent screen**:
   - If still in “Testing” mode, add the Google accounts you’re using on devices to the “Test Users” list.

---

## Android Device & Build Workflow

1. Enable Developer Options → USB Debugging on the phone. On Pixel: `Settings → About phone → Build number` tap 7 times.
2. Ensure the USB mode is “File transfer”.
3. Verify connectivity:
   ```bash
   adb kill-server
   adb start-server
   adb devices -l   # should show <serial> device
   ```
4. Build & deploy after any frontend change:
   ```bash
   npm install              # if dependencies changed
   npm run build
   npx cap sync android
   npx cap run android --target <serial>   # or open in Android Studio
   ```
5. On first launch the app opens Chrome for OAuth. Accept the “Allow Beta-bot to connect to your Google Drive” prompt; the App Link (`com.googleusercontent.apps.…:/oauth2redirect`) brings you back into the app.

Status bar tweaks (`@capacitor/status-bar`) ensure the web view sits below the system status area.

---

## Diagnostics & Common Errors

| Symptom | Root cause | Fix |
|---------|------------|-----|
| `client_secret is missing` | Native build still using the Web client | Set native env vars in Vercel + local, redeploy, confirm `CloudSync` logs show the native client id (`…1inp`) |
| `Access blocked: request invalid` with “custom URI scheme not enabled” | Android OAuth client wasn’t marked for custom schemes | Edit the OAuth client, tick “Enable custom URI scheme” |
| `Access blocked` with `redirect_uri_mismatch` | Web client missing `https://www.beta-bot.net/oauth2redirect` | Add the redirect to the Web OAuth client |
| `invalid_request` even after custom scheme | SHA‑1 fingerprint missing or mismatched | Run `./gradlew signingReport`, add SHA‑1 under Android client |
| `No backup found in cloud storage` | `ai-beta-reader-backup.enc` not yet uploaded | Perform a backup from the web app (or ensure Drive contains the file) |
| `Failed to decrypt - wrong password? TypeError: this.db.importFromJson is not a function` | Native attempted Capacitor’s `importFromJson` | Fixed by manual import logic in `src/lib/database.ts` |
| `Failed to decrypt... FOREIGN KEY constraint failed (code 787)` | Inserts executed while FK enforcement was on | Fix: toggle `PRAGMA foreign_keys` off while bulk importing, then back on |
| Pixel phone not visible to `adb` | Wrong USB mode / cable / trust prompt dismissed | Set USB to “File transfer”, unlock phone, replug, accept RSA prompt, confirm `Settings → System Report → USB` |

Real-time debugging commands:

```bash
# Filter app logs
adb logcat | grep CloudSync

# View errors during decrypt/import
adb logcat | grep "Failed to decrypt"

# Confirm which OAuth config is in use
adb logcat | grep "using OAuth config"
```

---

## Database Import Notes

- Browser exports run `exportDatabase()` → JSON. Native import now treats all JSON exports the same:
  1. Disable foreign keys.
  2. Clear tables in reverse dependency order.
  3. Insert parents (books) then children (parts, chapters, wiki pages, etc.).
  4. Re-enable foreign keys.
- `importData` is considered a Capacitor JSON export only if it contains `database` + `tables` keys.
- This logic lives in `src/lib/database.ts`.

---

## Useful Commands

```bash
# Local development
npm run dev

# Production build
npm run build

# Type safety
npm run type-check

# Search compiled bundle to confirm env values landed
rg "com.googleusercontent.apps" dist/assets

# Signing report for SHA-1
cd android
./gradlew signingReport

# Reset ADB in case of smart socket issues
sudo adb kill-server
sudo adb start-server
```

---

### Quick Restore Checklist (Android)

1. Device online, USB debugging enabled, `adb devices` shows `device`.
2. Vercel env vars set for both web & native client ids/redirects.
3. Android OAuth client has package name, SHA‑1, custom scheme enabled.
4. `npm run build` → `npx cap sync android` → deploy to device.
5. Trigger **Restore** in-app, approve Google consent, watch `adb logcat | grep CloudSync`.
6. Success message: `✅ Database restored successfully!`

Happy syncing! 🎉
