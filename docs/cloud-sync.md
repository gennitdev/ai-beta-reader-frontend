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
| Android | Google Play services `AuthorizationClient` through a Capacitor bridge | `@capacitor-community/sqlite` | App-private files keyed by platform-neutral image ID |

All platforms use `src/lib/cloudSync.ts` and the codec under `src/lib/libraryBundle/`. New backups are canonical full-library ZIPs encrypted with the WC2 Web Crypto envelope. Drive stores each backup as an immutable generation and retains the three newest successful generations.

Key differences:

- Web keeps the existing GIS flow (`response_type=token`). Android requests a short-lived token from Google Play services and never handles an OAuth redirect URI.
- Android's native bridge requests only `https://www.googleapis.com/auth/drive.file`. It clears and reacquires expired tokens through `AuthorizationClient`; it does not receive or store a refresh token.
- Electron caches refreshable OAuth credentials through OS-backed secure storage. Browser GIS and Android authorization use short-lived access tokens.
- New backups encrypt a canonical full-library ZIP with the WC2 Web Crypto envelope. Drive keeps the three newest successful generations and records integrity metadata in `appProperties`.
- Every platform reads backup image bytes through its platform image store. Browser and Android SQLite rows do not retain base64 image content after migration.
- Restore continues to recognize WC1, WC2, and CryptoJS-encrypted legacy JSON backups. Legacy restore support is not retired with the old writer.

---

## Environment Variables

Set the variables needed by each target in `.env.local` for local builds. Configure the web values in Vercel for Production and Preview; provide desktop/native values in the environment used to build those applications.

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_GOOGLE_CLIENT_ID` | Web OAuth client (GIS token client) | `302250506015-du7cd7e5g469dd74cs2fnq8luksiuutb.apps.googleusercontent.com` |
| `VITE_GOOGLE_CLIENT_ID_WEB` | Optional alias for the web client. Defaults to `VITE_GOOGLE_CLIENT_ID`. | same as above |
| `VITE_GOOGLE_CLIENT_ID_DESKTOP` | Desktop OAuth client used by Electron's loopback flow | `…apps.googleusercontent.com` |
| `VITE_GOOGLE_CLIENT_SECRET_DESKTOP` | Optional secret if required by the configured desktop client | |

Android authorization has no Vite environment variables. Google Play services resolves the Android OAuth client from the installed package name and the signing-certificate SHA-1.

---

## Google Cloud Console Setup

1. **Enable the Drive API** for the project.
2. **Create/confirm the Web OAuth Client**:
   - Authorized JavaScript origin: `https://www.beta-bot.net`
3. **Create/confirm the Desktop OAuth Client** for Electron and place its client ID in `VITE_GOOGLE_CLIENT_ID_DESKTOP`. Electron receives the authorization response on a loopback callback managed by its OAuth bridge.
4. **Create/confirm the production Android OAuth Client**:
   - Package name: `com.betareader.app`
   - SHA‑1 certificate fingerprint: the Google Play **app-signing certificate** shown at Play Console → Setup → App integrity.
   - Do not use the upload-key SHA‑1 for the Play-installed production build. Play re-signs distributed artifacts with the app-signing key.
5. **Create a separate Android OAuth client entry for local debug installs**, using package `com.betareader.app` and the debug SHA‑1 from `./gradlew signingReport`.
6. **Remove obsolete redirect configuration**:
   - Android does not need a custom URI scheme or an HTTPS App Link for authorization.
   - The app manifest intentionally contains neither OAuth intent filter. Digital Asset Links configuration for `/oauth2redirect` can be removed if no other application feature uses it.
7. **OAuth consent screen**:
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
   pnpm install              # if dependencies changed
   pnpm build
   pnpm exec cap sync android
   pnpm exec cap run android --target <serial>   # or open in Android Studio
   ```
5. For local verification, accept the native Google authorization prompt. For production verification, upload a release bundle and install it from a Play internal-testing track so the app-signing certificate—not the upload certificate—is exercised.
6. Verify backup, backup listing, and restore on a physical device. Cancel the account/consent UI once and retry to confirm the recoverable error path. Leave the app idle long enough for a token to expire (or use a test build with a shortened expiry) and confirm the next operation reacquires authorization without changing backup data.

Status bar tweaks (`@capacitor/status-bar`) ensure the web view sits below the system status area.

---

## Diagnostics & Common Errors

| Symptom | Root cause | Fix |
|---------|------------|-----|
| Android authorization is denied or unavailable | Package/signing certificate is not registered, or Google Play services is unavailable | Match `com.betareader.app` and the installed build's signing SHA‑1 in the Android OAuth client; update Google Play services |
| Local debug build authorizes but internal-test build does not | Only the debug or upload certificate is registered | Add the Play app-signing certificate SHA‑1 from Play Console |
| Internal-test build authorizes but local debug does not | Only the Play app-signing certificate is registered | Add a separate Android OAuth client entry using the debug SHA‑1 from `./gradlew signingReport` |
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

# Observe native authorization and token renewal
adb logcat | grep "authenticateNative"
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
- All platforms emit the same canonical format. A bundle containing image records requires the corresponding bytes. If a restore fails, the prior library remains available or is restored from the verified recovery.
- Browser, Electron, and Android restores write image binaries to their active content store before importing metadata. A failed binary write aborts the restore and rolls back staged content instead of reporting incomplete success.

### Verifying a Backup

Use **Show Available Backups** on the **Library Data** page to inspect generation time, app version, bundle format, and encrypted size. Restore rechecks ciphertext integrity and the complete canonical bundle before any database write. Decrypted ZIPs and directory exports can be checked independently with `pnpm validate:bundle <path>`; see [Git and agent workspaces](agent-workspaces.md).

---

## Useful Commands

```bash
# Local development
pnpm dev

# Production build
pnpm build

# Type safety
pnpm type-check

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
2. Android OAuth client has package `com.betareader.app` and the installed build's signing SHA‑1.
3. For Play internal testing, confirm that SHA‑1 is the Play app-signing certificate, not the upload key.
4. `pnpm build` → `pnpm exec cap sync android` → deploy to device.
5. Trigger **Restore** in-app, approve Google consent, watch `adb logcat | grep CloudSync`.
6. Success message: `✅ Database restored successfully!`
