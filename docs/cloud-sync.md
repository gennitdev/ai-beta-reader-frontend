# Google Drive Backup and Restore

This guide describes the current Google Drive backup and restore workflow for the browser, Electron, and Android builds, including OAuth configuration and platform-specific troubleshooting.

- [Architecture Overview](#architecture-overview)
- [Environment Variables](#environment-variables)
- [Google Cloud Console Setup](#google-cloud-console-setup)
- [Android Device & Build Workflow](#android-device--build-workflow)
- [Diagnostics & Common Errors](#diagnostics--common-errors)
- [Database Import Notes](#database-import-notes)
- [Useful Commands](#useful-commands)

---

## Architecture Overview

| Platform | OAuth | Local database | Image content |
|-------|----------|---------------|------------------|
| Browser | Google Identity Services token client | `sql.js` snapshot in IndexedDB | IndexedDB Blob store |
| Electron | Desktop OAuth client with a loopback callback through the preload bridge | `sql.js` snapshot in IndexedDB | Files below the Electron app-data directory |
| Android | Authorization Code + PKCE in the system browser with an app redirect | `@capacitor-community/sqlite` | Metadata only; no local image-binary store yet |

All platforms use `src/lib/cloudSync.ts` and the codec under `src/lib/libraryBundle/`. New backups are canonical full-library ZIPs encrypted with the WC2 Web Crypto envelope. Drive stores each backup as an immutable generation and retains the three newest successful generations.

Key differences:

- Web keeps the existing GIS flow (`response_type=token`). Android requires Authorization Code + PKCE and **must** run in the system browser to satisfy Google’s “Use secure browsers” policy.
- Android needs several Capacitor plugins: `@capacitor/browser`, `@capacitor/app-launcher`, `@capacitor/preferences`, `@capacitor/status-bar`, and the secure-storage adapter.
- Electron and Android cache refreshable OAuth credentials through OS-backed secure storage. The browser retains only short-lived GIS credentials in browser-local storage.
- New backups encrypt a canonical full-library ZIP with the WC2 Web Crypto envelope. Drive keeps the three newest successful generations and records integrity metadata in `appProperties`.
- Browser and Electron backups read image bytes through the platform image store. Live browser SQLite rows do not retain base64 image content.
- Restore continues to recognize WC1, WC2, and CryptoJS-encrypted legacy JSON backups. Legacy restore support is not retired with the old writer.

---

## Environment Variables

Set the variables needed by each target in `.env.local` for local builds. Configure the web values in Vercel for Production and Preview; provide desktop/native values in the environment used to build those applications.

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_GOOGLE_CLIENT_ID` | Web OAuth client (GIS token client) | `302250506015-du7cd7e5g469dd74cs2fnq8luksiuutb.apps.googleusercontent.com` |
| `VITE_GOOGLE_CLIENT_ID_WEB` | Optional alias for the web client. Defaults to `VITE_GOOGLE_CLIENT_ID`. | same as above |
| `VITE_GOOGLE_REDIRECT_URI` | Hosted redirect used by the web flow | `https://www.beta-bot.net/oauth2redirect` |
| `VITE_GOOGLE_CLIENT_ID_DESKTOP` | Desktop OAuth client used by Electron's loopback flow | `…apps.googleusercontent.com` |
| `VITE_GOOGLE_CLIENT_SECRET_DESKTOP` | Optional secret if required by the configured desktop client | |
| `VITE_GOOGLE_CLIENT_ID_NATIVE` | **Android** OAuth client id (public, no secret) | `302250506015-hmm4hpdloehtuodde00pu2irqkpm1inp.apps.googleusercontent.com` |
| `VITE_GOOGLE_REDIRECT_URI_NATIVE` | Custom redirect scheme derived from the Android client id | `com.googleusercontent.apps.302250506015-hmm4hpdloehtuodde00pu2irqkpm1inp:/oauth2redirect` |
| `VITE_GOOGLE_CLIENT_SECRET` | Only required if you deliberately reuse a Web client on native (not recommended). Leave blank otherwise. | |

> **Tip:** After deploying to Vercel, you can confirm the values landed by downloading the compiled bundle and running `rg "com.googleusercontent.apps" dist/assets`.

---

## Google Cloud Console Setup

1. **Enable the Drive API** for the project.
2. **Create/confirm the Web OAuth Client**:
   - Authorized JavaScript origin: `https://www.beta-bot.net`
   - Authorized redirect URI: `https://www.beta-bot.net/oauth2redirect`
3. **Create/confirm the Desktop OAuth Client** for Electron and place its client ID in `VITE_GOOGLE_CLIENT_ID_DESKTOP`. Electron receives the authorization response on a loopback callback managed by its OAuth bridge.
4. **Create/confirm the Android OAuth Client**:
   - Package name: `com.betareader.app`
   - SHA‑1 certificate fingerprint: output of `./gradlew signingReport` (debug build) and, if applicable, the release keystore SHA‑1.
   - Tick **“Enable custom URI scheme”**; Google auto-derives `com.googleusercontent.apps.<client-id>:/oauth2redirect`.
5. **Digital Asset Links**:
   - `android/app/src/main/AndroidManifest.xml` already declares the HTTPS App Link and the custom scheme.
   - Ensure `https://www.beta-bot.net/.well-known/assetlinks.json` includes the Android client sha1 + package so the browser redirect is trusted.
6. **OAuth consent screen**:
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
5. On first launch the app opens Chrome for OAuth. Accept the “Allow beta bot to connect to your Google Drive” prompt; the App Link (`com.googleusercontent.apps.…:/oauth2redirect`) brings you back into the app.

Status bar tweaks (`@capacitor/status-bar`) ensure the web view sits below the system status area.

---

## Diagnostics & Common Errors

| Symptom | Root cause | Fix |
|---------|------------|-----|
| `client_secret is missing` | Native build still using the Web client | Set native env vars in Vercel + local, redeploy, confirm `CloudSync` logs show the native client id (`…1inp`) |
| `Access blocked: request invalid` with “custom URI scheme not enabled” | Android OAuth client wasn’t marked for custom schemes | Edit the OAuth client, tick “Enable custom URI scheme” |
| `Access blocked` with `redirect_uri_mismatch` | Web client missing `https://www.beta-bot.net/oauth2redirect` | Add the redirect to the Web OAuth client |
| `invalid_request` even after custom scheme | SHA‑1 fingerprint missing or mismatched | Run `./gradlew signingReport`, add SHA‑1 under Android client |
| `No backup found in cloud storage` | No versioned bundle generation or legacy `ai-beta-reader-backup.enc` exists | Perform a backup from the app or verify the legacy file still exists |
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

- Browser, Electron, and Android serialize new backups through the same canonical library model and ZIP writer. The encrypted plaintext starts with a ZIP signature and contains `beta-bot.yaml`.
- Bundle restores create and verify an external recovery ZIP before replacing the database. Legacy JSON restores continue through the compatibility importer.
- Restores always run through the same database importer (`src/lib/database.ts`):
  1. Verify recorded encrypted length and SHA-256 metadata, then decrypt the envelope.
  2. Detect a canonical ZIP signature or strictly parse legacy JSON (including an optional BOM).
  3. For a bundle, validate it and write/read/checksum a recovery ZIP outside the main database.
  4. Replace rows in one database transaction, using the live schema via `PRAGMA table_info`.
  5. Roll back from the verified recovery if database or persistence work fails.
- All platforms emit the same canonical format. A bundle containing image records requires the corresponding bytes; because Android has no image-binary store, an Android backup fails clearly if its local metadata refers to unavailable image content. If a restore fails, the prior library remains available or is restored from the verified recovery.
- Browser and Electron restores write image binaries to their active content store before importing metadata. A failed binary write aborts the restore instead of reporting incomplete success. Android imports metadata without local image binaries.

### Verifying a Backup

Use **Show Available Backups** in Settings to inspect generation time, app version, bundle format, and encrypted size. Restore rechecks ciphertext integrity and the complete canonical bundle before any database write. Decrypted ZIPs and directory exports can be checked independently with `npm run validate:bundle -- <path>`; see [Git and agent workspaces](agent-workspaces.md).

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
