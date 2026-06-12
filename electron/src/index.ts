import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import { getCapacitorElectronConfig, setupElectronDeepLinking } from '@capacitor-community/electron';
import type { MenuItemConstructorOptions } from 'electron';
import { app, MenuItem, ipcMain, Menu } from 'electron';
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
              // Check if find bar host already exists
              let findBarHost = document.getElementById('electron-find-bar-host');
              if (findBarHost) {
                const shadowRoot = findBarHost.shadowRoot;
                const findBar = shadowRoot.getElementById('electron-find-bar');
                findBar.style.display = findBar.style.display === 'none' ? 'flex' : 'none';
                if (findBar.style.display === 'flex') {
                  shadowRoot.getElementById('find-input').focus();
                  shadowRoot.getElementById('find-input').select();
                }
                return;
              }

              // Create shadow DOM host to isolate find bar from page search
              findBarHost = document.createElement('div');
              findBarHost.id = 'electron-find-bar-host';
              findBarHost.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;';
              document.body.appendChild(findBarHost);

              // Attach shadow root - content inside won't be searched by findInPage
              const shadowRoot = findBarHost.attachShadow({ mode: 'open' });

              // Create find bar inside shadow DOM
              const findBar = document.createElement('div');
              findBar.id = 'electron-find-bar';
              findBar.style.cssText = 'height:40px;background:#1f2937;border-bottom:1px solid #374151;display:flex;align-items:center;padding:0 12px;gap:8px;font-family:system-ui,-apple-system,sans-serif;';

              const style = document.createElement('style');
              style.textContent = [
                '.electron-find-match { background: #fde68a; color: #111827; padding: 0 1px; border-radius: 2px; }',
                '.electron-find-match-current { background: #f97316; color: #111827; box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.35); }',
              ].join('\\n');

              const input = document.createElement('input');
              input.id = 'find-input';
              input.type = 'text';
              input.placeholder = 'Find in page (Enter to search)';
              input.style.cssText = 'flex:1;max-width:300px;padding:6px 10px;border:1px solid #4b5563;border-radius:4px;background:#111827;color:#f3f4f6;font-size:14px;outline:none;';

              const countLabel = document.createElement('span');
              countLabel.id = 'find-count';
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
              shadowRoot.appendChild(style);
              shadowRoot.appendChild(findBar);

              let activeMatchIndex = -1;
              let matchElements = [];
              let lastSearchedText = '';
              let focusGuardInterval = null;

              // Aggressively maintain focus for a short period after find operations
              function startFocusGuard() {
                stopFocusGuard();
                let attempts = 0;
                focusGuardInterval = setInterval(() => {
                  // With shadow DOM, check if the shadow host has focus and if the input inside is focused
                  const hostHasFocus = document.activeElement === findBarHost;
                  const inputHasFocus = hostHasFocus && shadowRoot.activeElement === input;
                  if (findBar.style.display === 'flex' && !inputHasFocus) {
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

              function updateCount() {
                if (matchElements.length > 0 && activeMatchIndex >= 0) {
                  countLabel.textContent = activeMatchIndex + 1 + ' of ' + matchElements.length;
                } else {
                  countLabel.textContent = input.value ? 'No results' : '';
                }
              }

              function isSearchableTextNode(node) {
                const parent = node.parentElement;
                if (!parent || findBarHost.contains(parent)) return false;
                if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(parent.tagName)) return false;
                if (parent.closest('.electron-find-match')) return false;

                const computedStyle = window.getComputedStyle(parent);
                return computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden' && computedStyle.opacity !== '0';
              }

              function clearMatches() {
                document.querySelectorAll('.electron-find-match').forEach((match) => {
                  const parent = match.parentNode;
                  if (!parent) return;
                  parent.replaceChild(document.createTextNode(match.textContent || ''), match);
                  parent.normalize();
                });
                matchElements = [];
                activeMatchIndex = -1;
              }

              function highlightMatches(searchText) {
                clearMatches();
                if (!searchText) return;

                const textNodes = [];
                const walker = document.createTreeWalker(
                  document.body,
                  NodeFilter.SHOW_TEXT,
                  {
                    acceptNode(node) {
                      if (!node.nodeValue || !isSearchableTextNode(node)) {
                        return NodeFilter.FILTER_REJECT;
                      }
                      return NodeFilter.FILTER_ACCEPT;
                    },
                  }
                );

                while (walker.nextNode()) {
                  textNodes.push(walker.currentNode);
                }

                const needle = searchText.toLocaleLowerCase();
                if (!needle) return;

                textNodes.forEach((node) => {
                  const haystack = node.nodeValue.toLocaleLowerCase();
                  let start = 0;
                  let nextMatch = haystack.indexOf(needle, start);
                  if (nextMatch === -1) return;

                  const fragment = document.createDocumentFragment();
                  let lastIndex = 0;

                  while (nextMatch !== -1) {
                    if (nextMatch > lastIndex) {
                      fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex, nextMatch)));
                    }

                    const mark = document.createElement('mark');
                    mark.className = 'electron-find-match';
                    mark.textContent = node.nodeValue.slice(nextMatch, nextMatch + searchText.length);
                    fragment.appendChild(mark);
                    matchElements.push(mark);

                    lastIndex = nextMatch + searchText.length;
                    start = Math.max(lastIndex, nextMatch + 1);
                    nextMatch = haystack.indexOf(needle, start);
                  }

                  if (lastIndex < node.nodeValue.length) {
                    fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex)));
                  }

                  node.parentNode.replaceChild(fragment, node);
                });
              }

              function setActiveMatch(index) {
                matchElements.forEach((match) => {
                  match.classList.remove('electron-find-match-current');
                });

                if (!matchElements.length) {
                  activeMatchIndex = -1;
                  updateCount();
                  return;
                }

                activeMatchIndex = (index + matchElements.length) % matchElements.length;
                const activeMatch = matchElements[activeMatchIndex];
                activeMatch.classList.add('electron-find-match-current');
                activeMatch.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                updateCount();
              }

              function doFind(forward) {
                const searchText = input.value;
                startFocusGuard();

                if (!searchText) {
                  clearMatches();
                  countLabel.textContent = '';
                  lastSearchedText = '';
                  return;
                }

                if (searchText !== lastSearchedText) {
                  lastSearchedText = searchText;
                  highlightMatches(searchText);
                  setActiveMatch(forward ? 0 : matchElements.length - 1);
                  return;
                }

                if (!matchElements.length) {
                  updateCount();
                  return;
                }

                setActiveMatch(activeMatchIndex + (forward ? 1 : -1));
              }

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
                clearMatches();
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
  ipcMain.handle('find-in-page', (_event, text: string, forward: boolean, findNext: boolean) => {
    const mainWindow = myCapacitorApp.getMainWindow();
    if (mainWindow && text) {
      // findNext: true = navigate to next/prev match, false = start fresh search
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

  // Set up context menu with Copy option when text is selected
  const mainWindow = myCapacitorApp.getMainWindow();
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();

    if (params.selectionText) {
      menu.append(new MenuItem({
        label: 'Copy',
        role: 'copy',
      }));
    }

    if (menu.items.length > 0) {
      menu.popup();
    }
  });

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
