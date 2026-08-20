import { randomBytes } from 'node:crypto';
import { contextBridge, ipcRenderer } from 'electron';

import plugins from './electron-plugins.js';
import { createCapacitorContextApi } from './capacitor-context-api';

const contextApi = createCapacitorContextApi(plugins, ipcRenderer, () => randomBytes(5).toString('hex'));

contextBridge.exposeInMainWorld('CapacitorCustomPlatform', {
  name: 'electron',
  plugins: contextApi,
});
