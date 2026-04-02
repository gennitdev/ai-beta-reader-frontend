import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import { getCapacitorElectronConfig, setupElectronDeepLinking } from '@capacitor-community/electron';
import type { MenuItemConstructorOptions } from 'electron';
import { app, MenuItem, ipcMain } from 'electron';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';
import { autoUpdater } from 'electron-updater';

import { ElectronCapacitorApp, setupContentSecurityPolicy, setupReloadWatcher } from './setup';
import { registerDesktopImageBridge } from './image-bridge';
import { registerOAuthLoopbackHandlers } from './oauth-loopback';

// Increase memory limit for renderer process (needed for large backups with images)
// 8GB should handle backups with many large images
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');

// Graceful handling of unhandled errors.
unhandled();

// Define our menu templates (these are optional)
const trayMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [new MenuItem({ label: 'Quit App', role: 'quit' })];

// Custom Edit menu with Find functionality
const editMenuTemplate: MenuItemConstructorOptions = {
  label: 'Edit',
  submenu: [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'pasteAndMatchStyle' },
    { role: 'delete' },
    { role: 'selectAll' },
    { type: 'separator' },
    {
      label: 'Find',
      accelerator: 'CmdOrCtrl+F',
      click: (_menuItem, browserWindow) => {
        if (browserWindow) {
          browserWindow.webContents.executeJavaScript(`
            (function() {
              // Check if find bar already exists
              let findBar = document.getElementById('electron-find-bar');
              if (findBar) {
                findBar.style.display = findBar.style.display === 'none' ? 'flex' : 'none';
                if (findBar.style.display === 'flex') {
                  findBar.querySelector('input').focus();
                  findBar.querySelector('input').select();
                }
                return;
              }

              // Create find bar
              findBar = document.createElement('div');
              findBar.id = 'electron-find-bar';
              findBar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:40px;background:#1f2937;border-bottom:1px solid #374151;display:flex;align-items:center;padding:0 12px;gap:8px;z-index:99999;font-family:system-ui,-apple-system,sans-serif;';

              const input = document.createElement('input');
              input.type = 'text';
              input.placeholder = 'Find in page (Enter to search)';
              input.style.cssText = 'flex:1;max-width:300px;padding:6px 10px;border:1px solid #4b5563;border-radius:4px;background:#111827;color:#f3f4f6;font-size:14px;outline:none;';

              const countLabel = document.createElement('span');
              countLabel.style.cssText = 'color:#9ca3af;font-size:13px;min-width:60px;';
              countLabel.textContent = '';

              const prevBtn = document.createElement('button');
              prevBtn.innerHTML = '&#9650;';
              prevBtn.title = 'Previous (Shift+Enter)';
              prevBtn.style.cssText = 'padding:4px 8px;border:1px solid #4b5563;border-radius:4px;background:#374151;color:#f3f4f6;cursor:pointer;font-size:12px;';

              const nextBtn = document.createElement('button');
              nextBtn.innerHTML = '&#9660;';
              nextBtn.title = 'Next (Enter)';
              nextBtn.style.cssText = 'padding:4px 8px;border:1px solid #4b5563;border-radius:4px;background:#374151;color:#f3f4f6;cursor:pointer;font-size:12px;';

              const closeBtn = document.createElement('button');
              closeBtn.innerHTML = '&times;';
              closeBtn.title = 'Close (Escape)';
              closeBtn.style.cssText = 'padding:4px 10px;border:none;border-radius:4px;background:transparent;color:#9ca3af;cursor:pointer;font-size:18px;margin-left:auto;';

              findBar.appendChild(input);
              findBar.appendChild(countLabel);
              findBar.appendChild(prevBtn);
              findBar.appendChild(nextBtn);
              findBar.appendChild(closeBtn);
              document.body.appendChild(findBar);

              let currentIndex = 0;
              let totalMatches = 0;
              let lastSearchedText = '';
              let focusGuardInterval = null;

              function updateCount(result) {
                if (result && result.matches > 0) {
                  totalMatches = result.matches;
                  currentIndex = result.activeMatchOrdinal;
                  countLabel.textContent = currentIndex + ' of ' + totalMatches;
                } else {
                  countLabel.textContent = input.value ? 'No results' : '';
                }
              }

              function doFind(forward) {
                if (input.value) {
                  // Determine if this is navigation (same text) or new search
                  const isNavigation = input.value === lastSearchedText;
                  lastSearchedText = input.value;

                  // Start focus guard before find operation
                  startFocusGuard();
                  window.electronFindInPage(input.value, forward, isNavigation);
                } else {
                  window.electronStopFind();
                  countLabel.textContent = '';
                  lastSearchedText = '';
                }
              }

              // Aggressively maintain focus for a short period after find operations
              function startFocusGuard() {
                stopFocusGuard();
                let attempts = 0;
                focusGuardInterval = setInterval(() => {
                  if (findBar.style.display === 'flex' && document.activeElement !== input) {
                    input.focus();
                  }
                  attempts++;
                  if (attempts > 10) {
                    stopFocusGuard();
                  }
                }, 20);
              }

              function stopFocusGuard() {
                if (focusGuardInterval) {
                  clearInterval(focusGuardInterval);
                  focusGuardInterval = null;
                }
              }

              // Listen for find results from main process
              window.addEventListener('electron-find-result', (e) => {
                updateCount(e.detail);
              });

              // Prevent events from bubbling to Vue app
              input.addEventListener('input', (e) => {
                e.stopPropagation();
                // Clear result count when typing (search happens on Enter)
                if (input.value !== lastSearchedText) {
                  countLabel.textContent = '';
                }
              });
              input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  doFind(!e.shiftKey);
                } else if (e.key === 'Escape') {
                  closeFindBar();
                }
              });
              input.addEventListener('keyup', (e) => e.stopPropagation());
              input.addEventListener('keypress', (e) => e.stopPropagation());
              input.addEventListener('focus', (e) => e.stopPropagation());
              input.addEventListener('blur', (e) => {
                e.stopPropagation();
              });

              prevBtn.addEventListener('click', () => { doFind(false); });
              nextBtn.addEventListener('click', () => { doFind(true); });

              function closeFindBar() {
                stopFocusGuard();
                findBar.style.display = 'none';
                window.electronStopFind();
                countLabel.textContent = '';
                lastSearchedText = '';
              }

              closeBtn.addEventListener('click', closeFindBar);

              document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && findBar.style.display === 'flex') {
                  closeFindBar();
                }
              });

              input.focus();
            })();
          `);
        }
      },
    },
  ],
};

const appMenuBarMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
  editMenuTemplate,
  { role: 'viewMenu' },
];

// Get Config options from capacitor.config
const capacitorFileConfig: CapacitorElectronConfig = getCapacitorElectronConfig();

// Initialize our app. You can pass menu templates into the app here.
// const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);
const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig, trayMenuTemplate, appMenuBarMenuTemplate);

// If deeplinking is enabled then we will set it up here.
if (capacitorFileConfig.electron?.deepLinkingEnabled) {
  setupElectronDeepLinking(myCapacitorApp, {
    customProtocol: capacitorFileConfig.electron.deepLinkingCustomProtocol ?? 'mycapacitorapp',
  });
}

// If we are in Dev mode, use the file watcher components.
if (electronIsDev) {
  setupReloadWatcher(myCapacitorApp);
}

// Run Application
(async () => {
  // Wait for electron app to be ready.
  await app.whenReady();
  registerDesktopImageBridge();
  registerOAuthLoopbackHandlers();

  // Register find-in-page IPC handlers
  // Track the last search text to determine if this is a new search or navigation
  let lastSearchText = '';
  ipcMain.handle('find-in-page', (_event, text: string, forward: boolean, isNavigation: boolean) => {
    const mainWindow = myCapacitorApp.getMainWindow();
    if (mainWindow && text) {
      // findNext should be true only when navigating (next/prev) with the same search text
      const findNext = isNavigation && text === lastSearchText;
      lastSearchText = text;
      mainWindow.webContents.findInPage(text, { forward, findNext });
    }
  });

  ipcMain.handle('stop-find-in-page', () => {
    const mainWindow = myCapacitorApp.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.stopFindInPage('clearSelection');
    }
  });

  // Listen for find-in-page results and send to renderer
  ipcMain.on('setup-find-result-listener', () => {
    const mainWindow = myCapacitorApp.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.on('found-in-page', (_event, result) => {
        mainWindow.webContents.send('find-in-page-result', result);
      });
    }
  });

  // Security - Set Content-Security-Policy based on whether or not we are in dev mode.
  setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
  // Initialize our app, build windows, and load content.
  await myCapacitorApp.init();
  // Check for updates if we are in a packaged app.
  autoUpdater.checkForUpdatesAndNotify();
})();

// Handle when all of our windows are close (platforms have their own expectations).
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// When the dock icon is clicked.
app.on('activate', async function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (myCapacitorApp.getMainWindow().isDestroyed()) {
    await myCapacitorApp.init();
  }
});

// Place all ipc or other electron api calls and custom functionality under this line
