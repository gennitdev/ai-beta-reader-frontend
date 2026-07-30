# Electron macOS Packaging — Future Considerations

Notes on things that are **not yet configured** for distributing the Electron
desktop build on macOS. Local development and unsigned local builds work today;
the items below matter once you package the app for other people.

Config lives in [`electron/electron-builder.config.json`](../../electron/electron-builder.config.json).
Icon setup and the moth `.icns` are already done (see
[App icon](#app-icon-already-configured) below) — this doc is the remaining
to-do list.

- [App ID / bundle identifier](#app-id--bundle-identifier)
- [Code signing & notarization](#code-signing--notarization)
- [App icon (already configured)](#app-icon-already-configured)

---

## App ID / bundle identifier

`appId` in `electron-builder.config.json` is currently `com.betareader.app`,
chosen to match the Capacitor config (`capacitor.config.ts`) so every platform
shares one identity.

On macOS this becomes the app's **`CFBundleIdentifier`**. Consider before
distributing:

- If you ever **sign or notarize** through an Apple Developer account, the
  `appId` must match an App ID registered in that account. A mismatch fails
  notarization.
- Changing `appId` later changes the bundle identity. For a **packaged** app
  that also changes where macOS stores its data
  (`~/Library/Containers` / `~/Library/Application Support`), which can strand
  existing users' data — the same class of problem the `productName` rename
  caused in dev. Pick the final identifier before shipping a build and avoid
  changing it afterward.

## Code signing & notarization

**Not configured.** An unsigned `.dmg` runs fine locally, but on any other Mac,
Gatekeeper will warn (or block) it with "app can't be opened because Apple
cannot check it for malicious software," and users have to right-click → Open or
clear the quarantine attribute manually.

To distribute properly you'd need:

- An **Apple Developer Program** membership ($99/yr).
- A **Developer ID Application** certificate for signing.
- **Notarization** — electron-builder can automate this via `afterSign` with a
  notarize step and an app-specific password / API key.
- A **hardened runtime** and the appropriate entitlements.

Until then, treat macOS builds as local/internal only, and tell testers to
expect the Gatekeeper prompt.

## App icon (already configured)

For reference — this part is done:

- `electron/assets/appIcon.icns` is a multi-resolution icon (16px–1024px with
  @2x variants) generated from the 512×512 moth `appIcon.png` via `iconutil`.
- `mac.icon` in the builder config points at it, and `files: ["assets/**/*"]`
  bundles it.

To regenerate the `.icns` from an updated source PNG (≥512×512, ideally
1024×1024):

```bash
cd electron
SRC=assets/appIcon.png
ICONSET=$(mktemp -d)/AppIcon.iconset && mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$SRC" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$SRC" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o assets/appIcon.icns
```

> Note: the Dock icon for **unpackaged dev runs** is set separately at runtime
> via `app.dock.setIcon()` in `electron/src/setup.ts` — the `.icns` above only
> applies to packaged builds.
