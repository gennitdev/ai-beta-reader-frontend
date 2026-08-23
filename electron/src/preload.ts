import './rt/electron-rt';
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopImages', {
  pickChapterImages: (payload: { bookId: string; chapterId: string; allowMultiple?: boolean }) =>
    ipcRenderer.invoke('desktop-images:pick-chapter', payload),
  pickBookCover: (payload: { bookId: string }) => ipcRenderer.invoke('desktop-images:pick-cover', payload),
  readImageData: (payload: { relativePath: string; mimeType?: string }) =>
    ipcRenderer.invoke('desktop-images:read', payload),
  writeImageData: (payload: { relativePath: string; bytes: Uint8Array; mimeType: string }) =>
    ipcRenderer.invoke('desktop-images:write', payload),
  deleteImageFile: (payload: { relativePath: string }) => ipcRenderer.invoke('desktop-images:delete', payload),
});

contextBridge.exposeInMainWorld('desktopRecovery', {
  write: (payload: unknown) => ipcRenderer.invoke('desktop-recovery:write', payload),
  read: (id: string) => ipcRenderer.invoke('desktop-recovery:read', id),
  list: () => ipcRenderer.invoke('desktop-recovery:list'),
  delete: (id: string) => ipcRenderer.invoke('desktop-recovery:delete', id),
});

// OAuth loopback for Electron
contextBridge.exposeInMainWorld('electronOAuth', {
  authenticate: (config: { clientId: string; scope: string }) =>
    ipcRenderer.invoke('oauth-loopback:authenticate', config),
});

// OS-keychain-backed secure storage for small secrets (e.g. OAuth tokens)
contextBridge.exposeInMainWorld('electronSecureStorage', {
  get: (key: string) => ipcRenderer.invoke('secure-storage:get', key),
  set: (key: string, value: string) => ipcRenderer.invoke('secure-storage:set', key, value),
  remove: (key: string) => ipcRenderer.invoke('secure-storage:remove', key),
});

// Find in page functionality
contextBridge.exposeInMainWorld('electronFindInPage', (text: string, forward: boolean, findNext: boolean = false) => {
  ipcRenderer.invoke('find-in-page', text, forward, findNext);
});

contextBridge.exposeInMainWorld('electronStopFind', () => {
  ipcRenderer.invoke('stop-find-in-page');
});

// Set up find result listener
ipcRenderer.send('setup-find-result-listener');
ipcRenderer.on('find-in-page-result', (_event, result) => {
  // Dispatch a custom event that the find bar can listen to
  window.dispatchEvent(new CustomEvent('electron-find-result', { detail: result }));
});
