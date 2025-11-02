import { Preferences } from '@capacitor/preferences';

const STORAGE_KEY = 'googleOAuthTokens';

export interface StoredTokenSet {
  accessToken: string;
  refreshToken?: string | null;
  /**
   * Absolute Unix epoch (ms) when the access token expires.
   */
  expiresAt: number;
}

export async function saveTokens(tokens: StoredTokenSet): Promise<void> {
  await Preferences.set({
    key: STORAGE_KEY,
    value: JSON.stringify(tokens),
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
    return parsed;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  await Preferences.remove({ key: STORAGE_KEY });
}
