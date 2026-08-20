import { vi } from 'vitest'

type IpcHandler = (...args: unknown[]) => unknown

const handlers = new Map<string, IpcHandler>()

export const ipcMain = {
  handle: vi.fn((channel: string, handler: IpcHandler) => {
    handlers.set(channel, handler)
  }),
}

export const app = {
  getPath: vi.fn(() => '/tmp/beta-bot-user-data'),
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

export const resetElectronMock = () => {
  handlers.clear()
  vi.clearAllMocks()
  app.getPath.mockReturnValue('/tmp/beta-bot-user-data')
  safeStorage.isEncryptionAvailable.mockReturnValue(true)
  shell.openExternal.mockResolvedValue(undefined)
}
