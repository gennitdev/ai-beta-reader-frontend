import type { WebContents } from 'electron';

export function isAllowedAppUrl(candidate: string, customScheme: string): boolean {
  try {
    return new URL(candidate).protocol === `${customScheme}:`;
  } catch {
    return false;
  }
}

export function installWindowNavigationPolicy(webContents: WebContents, customScheme: string): void {
  webContents.setWindowOpenHandler(({ url }) => ({
    action: isAllowedAppUrl(url, customScheme) ? 'allow' : 'deny',
  }));

  webContents.on('will-navigate', (event, newUrl) => {
    if (!isAllowedAppUrl(newUrl, customScheme)) {
      event.preventDefault();
    }
  });
}
