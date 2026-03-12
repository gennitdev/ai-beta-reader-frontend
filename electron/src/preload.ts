import './rt/electron-rt';
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopImages', {
  pickChapterImages: (payload: { bookId: string; chapterId: string; allowMultiple?: boolean }) =>
    ipcRenderer.invoke('desktop-images:pick-chapter', payload),
  pickBookCover: (payload: { bookId: string }) => ipcRenderer.invoke('desktop-images:pick-cover', payload),
  readImageData: (payload: { relativePath: string; mimeType?: string }) =>
    ipcRenderer.invoke('desktop-images:read', payload),
  deleteImageFile: (payload: { relativePath: string }) => ipcRenderer.invoke('desktop-images:delete', payload),
});

// OAuth loopback for Electron
contextBridge.exposeInMainWorld('electronOAuth', {
  authenticate: (config: { clientId: string; scope: string }) =>
    ipcRenderer.invoke('oauth-loopback:authenticate', config),
});
