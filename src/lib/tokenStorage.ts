import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { getSecureValue, removeSecureValue, setSecureValue } from '@/lib/secureStorage';

const STORAGE_KEY = 'googleOAuthTokens';

export interface StoredTokenSet {
  accessToken: string;
  refreshToken?: string | null;
  /**
   * Absolute Unix epoch (ms) when the access token expires.
   */
  expiresAt: number;
}

function isElectron(): boolean {
  return Capacitor.getPlatform() === 'electron';
}

/**
 * The browser build. Token storage there is backed by localStorage, which is
 * readable by any script on the page, so a long-lived refresh token must never
 * be written to it. The web sign-in flow (Google Identity Services) issues only
 * a short-lived access token, so nothing is lost by dropping the refresh token.
 */
function isWeb(): boolean {
  return !isElectron() && !Capacitor.isNativePlatform();
}

function serialize(tokens: StoredTokenSet): string {
  return JSON.stringify(tokens);
}

function deserialize(value: string | null | undefined): StoredTokenSet | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as StoredTokenSet;
    if (!parsed.accessToken || typeof parsed.expiresAt !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// --- Secure backend (native Keychain/Keystore or Electron safeStorage) -------

async function secureGet(): Promise<string | null> {
  return getSecureValue(STORAGE_KEY);
}

async function secureSet(value: string): Promise<void> {
  await setSecureValue(STORAGE_KEY, value);
}

async function secureRemove(): Promise<void> {
  await removeSecureValue(STORAGE_KEY);
}

// --- Public API --------------------------------------------------------------

export async function saveTokens(tokens: StoredTokenSet): Promise<void> {
  if (isWeb()) {
    // Never persist a refresh token on web; see isWeb() above.
    await Preferences.set({
      key: STORAGE_KEY,
      value: serialize({ ...tokens, refreshToken: null }),
    });
    return;
  }
  await secureSet(serialize(tokens));
}

export async function loadTokens(): Promise<StoredTokenSet | null> {
  if (isWeb()) {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    const parsed = deserialize(value);
    if (parsed?.refreshToken) {
      parsed.refreshToken = null;
    }
    return parsed;
  }

  const secure = deserialize(await secureGet());
  if (secure) {
    return secure;
  }

  // One-time migration: earlier builds stored tokens in plaintext Preferences.
  // Move any such token into secure storage and delete the plaintext copy.
  const { value: legacy } = await Preferences.get({ key: STORAGE_KEY });
  const migrated = deserialize(legacy);
  if (migrated) {
    await secureSet(serialize(migrated));
    await Preferences.remove({ key: STORAGE_KEY });
    return migrated;
  }

  return null;
}

export async function clearTokens(): Promise<void> {
  if (isWeb()) {
    await Preferences.remove({ key: STORAGE_KEY });
    return;
  }
  await secureRemove();
  // Also clear any leftover plaintext copy from an earlier build.
  await Preferences.remove({ key: STORAGE_KEY });
}
