import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * Google Identity Services SDK surface used by the cloud-sync provider.
 */
export interface GoogleTokenClient {
  requestAccessToken(options: { prompt: string }): void;
}

export interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

export interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
}

export interface GoogleOauth2Namespace {
  initTokenClient?: (config: GoogleTokenClientConfig) => GoogleTokenClient;
  default?: {
    initTokenClient?: (config: GoogleTokenClientConfig) => GoogleTokenClient;
  };
  _default?: {
    initTokenClient?: (config: GoogleTokenClientConfig) => GoogleTokenClient;
  };
}

export interface CloudSyncWindow extends Window {
  google?: {
    accounts?: {
      oauth2?: GoogleOauth2Namespace;
    };
  };
  CloudSyncDebug?: string[];
}

export function getCloudSyncWindow(): CloudSyncWindow | null {
  return typeof window === 'undefined' ? null : window as CloudSyncWindow;
}

type DebugFn = (message: string, extra?: unknown) => void;

/**
 * Loads the Google Identity Services (GIS) script and tracks whether the web
 * SDK is ready. Extracted from the cloud-sync provider so the ~200 lines of
 * DOM/script-loading concerns live apart from OAuth token lifecycle and Drive
 * REST. Handles three environments: plain web, Electron (external script), and
 * native (HTTPS falls back to a fetched-and-injected script for non-HTTPS
 * origins).
 */
export class GisLoader {
  private gisLoadingPromise: Promise<void> | null = null;
  private ready: boolean;

  constructor(private readonly debug: DebugFn) {
    // On native mobile we authenticate via native OAuth and never need the GIS
    // web SDK, so treat it as already "ready". Electron and the web browser do
    // need it, so they start not-ready.
    this.ready = Capacitor.isNativePlatform() && Capacitor.getPlatform() !== 'electron';
  }

  /** Whether the GIS web SDK is loaded (or unnecessary on this platform). */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Ensure Google Identity Services is available. Handles web and native
   * environments.
   */
  ensureLoaded(): Promise<void> {
    this.debug('Ensuring GIS loaded');

    if (typeof window === 'undefined') {
      return Promise.reject(new Error('Window is undefined'));
    }

    if (getCloudSyncWindow()?.google?.accounts?.oauth2) {
      this.debug('GIS already present');
      this.ready = true;
      return Promise.resolve();
    }

    if (this.gisLoadingPromise) {
      this.debug('Reusing existing GIS promise');
      return this.gisLoadingPromise;
    }

    const isHostedHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const isElectron = Capacitor.getPlatform() === 'electron';
    this.debug(`ensureGoogleIdentityServicesLoaded native=${Capacitor.isNativePlatform()} electron=${isElectron} hostedHttps=${isHostedHttps} scriptPresent=${Boolean(document.querySelector('script[data-google-identity]'))}`);

    // On Electron, always use loadForWeb since it can load external scripts
    if (isElectron) {
      this.gisLoadingPromise = this.loadForWeb().then(() => this.debug('GIS loaded via web script (Electron)'));
    } else if (Capacitor.isNativePlatform()) {
      if (isHostedHttps) {
        this.gisLoadingPromise = this.loadForWeb()
          .then(() => this.debug('GIS loaded via web script'))
          .catch(async (err) => {
            console.warn('[CloudSync] Web GIS load failed on native platform, falling back to native loader.', err);
            this.debug(`Web GIS load failed on native platform: ${String(err)}`);
            await this.loadForNative();
            this.debug('GIS loaded via native fetch fallback');
          });
      } else {
        this.gisLoadingPromise = this.loadForNative();
        this.debug('Using native GIS loader (non-HTTPS origin)');
      }
    } else {
      this.gisLoadingPromise = this.loadForWeb().then(() => this.debug('GIS loaded via web script'));
    }

    this.gisLoadingPromise = this.gisLoadingPromise.then(() => {
      this.ready = true;
    });

    return this.gisLoadingPromise;
  }

  async loadForNative(): Promise<void> {
    try {
      this.debug('loadGisForNative: fetching script');
      const response = await CapacitorHttp.get({
        url: 'https://accounts.google.com/gsi/client',
        responseType: 'text',
      });

      const scriptSource = typeof response.data === 'string' ? response.data : null;

      if (!scriptSource) {
        throw new Error('Empty Google Identity Services payload');
      }

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.dataset.googleIdentity = 'true';
      script.text = scriptSource;

      script.onload = () => {
        this.debug('loadGisForNative: script onload');
        const oauth2 = getCloudSyncWindow()?.google?.accounts?.oauth2;
        if (oauth2 && oauth2._default && !oauth2.default) {
          oauth2.default = oauth2._default;
        }
      };

      document.head.appendChild(script);
      this.debug('loadGisForNative: script appended, waiting for readiness');

      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          console.error('[CloudSync] loadGisForNative: timeout waiting for GIS readiness');
          this.debug('loadGisForNative: timeout waiting for readiness');
          reject(new Error('Google Identity Services failed to initialize'));
        }, 5000);

        const wrappedResolve = () => {
          clearTimeout(timeoutId);
          this.debug('loadGisForNative: GIS ready');
          resolve();
        };

        const wrappedReject = (error: Error) => {
          clearTimeout(timeoutId);
          this.debug(`loadGisForNative error: ${String(error)}`);
          reject(error);
        };

        script.addEventListener('error', () => wrappedReject(new Error('Failed to load Google Identity Services')));

        const checkLoop = () => {
          const oauth2 = getCloudSyncWindow()?.google?.accounts?.oauth2;
          if (oauth2 && (oauth2.initTokenClient || oauth2.default?.initTokenClient)) {
            if (!oauth2.initTokenClient && oauth2.default?.initTokenClient) {
              oauth2.initTokenClient = oauth2.default.initTokenClient.bind(oauth2.default);
            }
            wrappedResolve();
            return;
          }
          setTimeout(checkLoop, 50);
        };

        checkLoop();
      });
    } catch (error) {
      this.gisLoadingPromise = null;
      console.error('[CloudSync] loadGisForNative failed', error);
      this.debug(`loadGisForNative failed: ${String(error)}`);
      throw error instanceof Error ? error : new Error('Failed to load Google Identity Services');
    }
  }

  loadForWeb(): Promise<void> {
    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity]');

      if (existingScript) {
        if (getCloudSyncWindow()?.google?.accounts?.oauth2) {
          this.debug('loadGisForWeb: existing GIS present');
          resolve();
          return;
        }

        existingScript.addEventListener('load', () => {
          this.debug('loadGisForWeb: existing script load event');
          resolve();
        }, { once: true });
        existingScript.addEventListener('error', () => {
          this.gisLoadingPromise = null;
          reject(new Error('Failed to load Google Identity Services'));
        }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = 'true';
      script.onload = () => {
        this.debug('loadGisForWeb: script load event');
        resolve();
      };
      script.onerror = () => {
        console.error('[CloudSync] Failed to load Google Identity Services script via <script> element.');
        this.gisLoadingPromise = null;
        reject(new Error('Failed to load Google Identity Services'));
      };

      document.head.appendChild(script);
    });
  }
}
