import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const STORAGE_KEY = 'googleOAuthTokens';

/**
 * On the browser build, token storage is backed by localStorage, which is
 * readable by any script running on the page. The web sign-in flow (Google
 * Identity Services) issues only a short-lived access token and never a refresh
 * token, so a long-lived refresh token must never be written there. Native and
 * desktop builds, which persist to platform-backed storage, are unaffected.
 */
function isWeb(): boolean {
  return Capacitor.getPlatform() === 'web';
}

export interface StoredTokenSet {
  accessToken: string;
  refreshToken?: string | null;
  /**
   * Absolute Unix epoch (ms) when the access token expires.
   */
  expiresAt: number;
}

export async function saveTokens(tokens: StoredTokenSet): Promise<void> {
  const toStore: StoredTokenSet = isWeb()
    ? { ...tokens, refreshToken: null }
    : tokens;
  await Preferences.set({
    key: STORAGE_KEY,
    value: JSON.stringify(toStore),
  });
}

export async function loadTokens(): Promise<StoredTokenSet | null> {
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as StoredTokenSet;
    if (!parsed.accessToken || typeof parsed.expiresAt !== 'number') {
      return null;
    }
    // Drop any refresh token that an earlier build may have persisted on web.
    if (isWeb() && parsed.refreshToken) {
      parsed.refreshToken = null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  await Preferences.remove({ key: STORAGE_KEY });
}
