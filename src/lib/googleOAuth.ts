import { App } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CODE_VERIFIER_LENGTH = 64;
const AUTH_TIMEOUT_MS = 2 * 60 * 1000; // Give users two minutes to finish consent
const PKCE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export interface GoogleOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

interface OAuthConfig {
  clientId: string;
  redirectUri: string;
  scope: string;
  prompt?: string;
}

/**
 * Runs an OAuth authorization code + PKCE flow against Google's endpoints using native Capacitor plugins.
 * Returns the token response payload.
 */
export async function performNativeGoogleOAuth(config: OAuthConfig): Promise<GoogleOAuthTokens> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  const authUrl = buildAuthUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scope: config.scope,
    codeChallenge,
    state,
    prompt: config.prompt ?? 'consent',
  });

  const authorizationCode = await launchAuthBrowser(authUrl, config.redirectUri, state);
  return await exchangeAuthCodeForTokens({
    authorizationCode,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    codeVerifier,
  });
}

function ensureCrypto(): Crypto {
  const cryptoImpl = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (!cryptoImpl || !cryptoImpl.subtle) {
    throw new Error('Web Crypto API is unavailable; PKCE cannot be generated.');
  }
  return cryptoImpl;
}

function generateCodeVerifier(): string {
  const cryptoImpl = ensureCrypto();
  const random = new Uint8Array(CODE_VERIFIER_LENGTH);
  cryptoImpl.getRandomValues(random);

  let verifier = '';
  for (let i = 0; i < random.length; i++) {
    verifier += PKCE_CHARSET[random[i] % PKCE_CHARSET.length];
  }
  return verifier;
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const cryptoImpl = ensureCrypto();
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await cryptoImpl.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function generateState(): string {
  return base64UrlEncode(ensureRandomBytes(16));
}

function ensureRandomBytes(length: number): Uint8Array {
  const cryptoImpl = ensureCrypto();
  const random = new Uint8Array(length);
  cryptoImpl.getRandomValues(random);
  return random;
}

function base64UrlEncode(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let base64: string;

  if (typeof globalThis.btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = globalThis.btoa(binary);
  } else if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(bytes).toString('base64');
  } else {
    throw new Error('No base64 encoder available in this environment.');
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildAuthUrl(args: {
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  state: string;
  prompt: string;
}): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: 'code',
    scope: args.scope,
    access_type: 'offline',
    include_granted_scopes: 'true',
    code_challenge: args.codeChallenge,
    code_challenge_method: 'S256',
    state: args.state,
    prompt: args.prompt,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function launchAuthBrowser(authUrl: string, redirectUri: string, expectedState: string): Promise<string> {
  let urlListener: PluginListenerHandle | undefined;
  let browserListener: PluginListenerHandle | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const platform = Capacitor.getPlatform();
  const useBrowserPlugin = platform !== 'android';

  const cleanup = async () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    if (browserListener) {
      await browserListener.remove();
      browserListener = undefined;
    }
    if (urlListener) {
      await urlListener.remove();
      urlListener = undefined;
    }
  };

  return await new Promise<string>(async (resolve, reject) => {
    let fulfilled = false;

    const resolveOnce = async (code: string) => {
      if (fulfilled) {
        return;
      }
      fulfilled = true;
      await cleanup();
      if (useBrowserPlugin) {
        try {
          await Browser.close();
        } catch {
          // Ignore close failures; browser may already be dismissed.
        }
      }
      resolve(code);
    };

    const rejectOnce = async (error: Error) => {
      if (fulfilled) {
        return;
      }
      fulfilled = true;
      await cleanup();
      if (useBrowserPlugin) {
        try {
          await Browser.close();
        } catch {
          // Ignore close failures; browser may already be dismissed.
        }
      }
      reject(error);
    };

    try {
      urlListener = await App.addListener('appUrlOpen', async (event) => {
        try {
          const incomingUrl = event.url;
          if (!incomingUrl) {
            return;
          }

          if (!incomingUrl.startsWith(redirectUri)) {
            return;
          }

          const url = new URL(incomingUrl);
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');

          if (error) {
            await rejectOnce(new Error(`Authorization error: ${error}`));
            return;
          }

          if (!code) {
            await rejectOnce(new Error('Authorization response missing code parameter.'));
            return;
          }

          if (state !== expectedState) {
            await rejectOnce(new Error('Authorization state parameter mismatch.'));
            return;
          }

          await resolveOnce(code);
        } catch (listenerError) {
          await rejectOnce(listenerError instanceof Error ? listenerError : new Error(String(listenerError)));
        }
      });

      if (useBrowserPlugin) {
        browserListener = await Browser.addListener('browserFinished', async () => {
          await rejectOnce(new Error('User cancelled sign-in.'));
        });
      }

      timeoutId = setTimeout(async () => {
        await rejectOnce(new Error('Timed out while waiting for authorization response.'));
      }, AUTH_TIMEOUT_MS);

      if (useBrowserPlugin) {
        await Browser.open({ url: authUrl, windowName: '_blank' });
      } else {
        const result = await AppLauncher.openUrl({ url: authUrl });
        if (!result.completed) {
          await rejectOnce(new Error('Failed to open system browser for authentication.'));
          return;
        }
      }
    } catch (error) {
      await rejectOnce(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function exchangeAuthCodeForTokens(args: {
  authorizationCode: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<GoogleOAuthTokens> {
  const params = new URLSearchParams({
    client_id: args.clientId,
    code: args.authorizationCode,
    code_verifier: args.codeVerifier,
    redirect_uri: args.redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await CapacitorHttp.post({
    url: GOOGLE_TOKEN_URL,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: params.toString(),
  });

  if (response.status < 200 || response.status >= 300) {
    const details =
      typeof response.data === 'string'
        ? response.data
        : response.data
          ? JSON.stringify(response.data)
          : 'No response body';
    throw new Error(`Token exchange failed with status ${response.status}: ${details}`);
  }

  if (!response.data?.access_token) {
    throw new Error('Token exchange response missing access_token.');
  }

  return response.data as GoogleOAuthTokens;
}
