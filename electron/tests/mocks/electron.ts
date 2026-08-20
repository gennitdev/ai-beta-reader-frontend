import { vi } from 'vitest'

type IpcHandler = (...args: unknown[]) => unknown
type EventHandler = (...args: unknown[]) => unknown

const handlers = new Map<string, IpcHandler>()
const ipcMainListeners = new Map<string, IpcHandler>()
const rendererListeners = new Map<string, IpcHandler>()
const exposedApis = new Map<string, unknown>()
const appListeners = new Map<string, EventHandler>()

export const ipcMain = {
  handle: vi.fn((channel: string, handler: IpcHandler) => {
    handlers.set(channel, handler)
  }),
  on: vi.fn((channel: string, listener: IpcHandler) => {
    ipcMainListeners.set(channel, listener)
  }),
}

export const ipcRenderer = {
  invoke: vi.fn(),
  send: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  on: vi.fn((channel: string, listener: IpcHandler) => {
    rendererListeners.set(channel, listener)
  }),
}

export const contextBridge = {
  exposeInMainWorld: vi.fn((name: string, api: unknown) => {
    exposedApis.set(name, api)
  }),
}

export const app = {
  getPath: vi.fn(() => '/tmp/beta-bot-user-data'),
  getAppPath: vi.fn(() => '/tmp/beta-bot-app'),
  getName: vi.fn(() => 'Beta Bot'),
  dock: { setIcon: vi.fn() },
  commandLine: { appendSwitch: vi.fn() },
  whenReady: vi.fn(() => Promise.resolve()),
  on: vi.fn((event: string, listener: EventHandler) => {
    appListeners.set(event, listener)
  }),
  quit: vi.fn(),
}

export class MenuItem {
  label?: string
  role?: string

  constructor(options: { label?: string; role?: string }) {
    Object.assign(this, options)
  }
}

export class Menu {
  static buildFromTemplate = vi.fn((template: unknown[]) => template)
  static setApplicationMenu = vi.fn()
  items: MenuItem[] = []
  append = vi.fn((item: MenuItem) => this.items.push(item))
  popup = vi.fn()
}

export class Tray {
  on = vi.fn()
  setToolTip = vi.fn()
  setContextMenu = vi.fn()
}

const createWebContents = () => ({
  setWindowOpenHandler: vi.fn(),
  on: vi.fn(),
  reload: vi.fn(),
  openDevTools: vi.fn(),
  findInPage: vi.fn(),
  stopFindInPage: vi.fn(),
  send: vi.fn(),
})

export class BrowserWindow {
  webContents = createWebContents()
  on = vi.fn()
  setBackgroundColor = vi.fn()
  isVisible = vi.fn(() => false)
  hide = vi.fn()
  show = vi.fn()
  focus = vi.fn()
  isDestroyed = vi.fn(() => false)
}

export const nativeImage = {
  createFromPath: vi.fn(() => ({ image: 'app-icon' })),
}

let headersReceivedHandler: EventHandler | undefined
export const session = {
  defaultSession: {
    webRequest: {
      onHeadersReceived: vi.fn((handler: EventHandler) => {
        headersReceivedHandler = handler
      }),
    },
  },
}

export const dialog = {
  showOpenDialog: vi.fn(),
}

export const safeStorage = {
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
  decryptString: vi.fn((value: Buffer) => value.toString().replace(/^encrypted:/, '')),
}

export const shell = {
  openExternal: vi.fn(() => Promise.resolve()),
}

export const getIpcHandler = (channel: string): IpcHandler => {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No IPC handler registered for ${channel}`)
  return handler
}

export const getExposedApi = <T>(name: string): T => {
  if (!exposedApis.has(name)) throw new Error(`No API exposed as ${name}`)
  return exposedApis.get(name) as T
}

export const emitIpcRenderer = (channel: string, ...args: unknown[]): unknown => {
  const listener = rendererListeners.get(channel)
  if (!listener) throw new Error(`No renderer listener registered for ${channel}`)
  return listener(...args)
}

export const emitIpcMain = (channel: string, ...args: unknown[]): unknown => {
  const listener = ipcMainListeners.get(channel)
  if (!listener) throw new Error(`No main-process listener registered for ${channel}`)
  return listener(...args)
}

export const emitAppEvent = (event: string, ...args: unknown[]): unknown => {
  const listener = appListeners.get(event)
  if (!listener) throw new Error(`No app listener registered for ${event}`)
  return listener(...args)
}

export const emitHeadersReceived = (...args: unknown[]): unknown => {
  if (!headersReceivedHandler) throw new Error('No headers-received handler registered')
  return headersReceivedHandler(...args)
}

export const resetElectronMock = () => {
  handlers.clear()
  ipcMainListeners.clear()
  rendererListeners.clear()
  exposedApis.clear()
  appListeners.clear()
  headersReceivedHandler = undefined
  vi.clearAllMocks()
  app.getPath.mockReturnValue('/tmp/beta-bot-user-data')
  safeStorage.isEncryptionAvailable.mockReturnValue(true)
  shell.openExternal.mockResolvedValue(undefined)
}
