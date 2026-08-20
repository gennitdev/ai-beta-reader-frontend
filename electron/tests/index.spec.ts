import { beforeAll, describe, expect, it, vi } from 'vitest'

import { app, emitAppEvent, emitIpcMain, getIpcHandler } from './mocks/electron'

const startupMocks = vi.hoisted(() => {
  const webContentsListeners = new Map<string, (...args: never[]) => unknown>()
  const webContents = {
    findInPage: vi.fn(),
    stopFindInPage: vi.fn(),
    send: vi.fn(),
    executeJavaScript: vi.fn(),
    on: vi.fn((event: string, listener: (...args: never[]) => unknown) => {
      webContentsListeners.set(event, listener)
    }),
  }
  const mainWindow = {
    webContents,
    isDestroyed: vi.fn(() => false),
  }

  return {
    autoUpdate: vi.fn(),
    config: { electron: { customUrlScheme: 'beta-reader' } },
    init: vi.fn(async () => undefined),
    mainWindow,
    registerImages: vi.fn(),
    registerOAuth: vi.fn(),
    registerStorage: vi.fn(),
    setupCsp: vi.fn(),
    setupDeepLinks: vi.fn(),
    webContentsListeners,
  }
})

vi.mock('@capacitor-community/electron', () => ({
  getCapacitorElectronConfig: vi.fn(() => startupMocks.config),
  setupElectronDeepLinking: startupMocks.setupDeepLinks,
}))
vi.mock('electron-is-dev', () => ({ default: false }))
vi.mock('electron-unhandled', () => ({ default: vi.fn() }))
vi.mock('electron-updater', () => ({ autoUpdater: { checkForUpdatesAndNotify: startupMocks.autoUpdate } }))
vi.mock('../src/image-bridge', () => ({ registerDesktopImageBridge: startupMocks.registerImages }))
vi.mock('../src/oauth-loopback', () => ({ registerOAuthLoopbackHandlers: startupMocks.registerOAuth }))
vi.mock('../src/secure-storage-bridge', () => ({ registerSecureStorageBridge: startupMocks.registerStorage }))
vi.mock('../src/setup', () => ({
  ElectronCapacitorApp: class {
    init = startupMocks.init
    getMainWindow = () => startupMocks.mainWindow
    getCustomURLScheme = () => 'beta-reader'
  },
  setupContentSecurityPolicy: startupMocks.setupCsp,
  setupReloadWatcher: vi.fn(),
}))

describe('Electron main-process startup', () => {
  beforeAll(async () => {
    await import('../src/index')
    await vi.waitFor(() => expect(startupMocks.init).toHaveBeenCalledOnce())
  })

  it('installs hardened runtime settings and privileged bridges after readiness', () => {
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('js-flags', '--max-old-space-size=8192')
    expect(startupMocks.registerImages).toHaveBeenCalledOnce()
    expect(startupMocks.registerOAuth).toHaveBeenCalledOnce()
    expect(startupMocks.registerStorage).toHaveBeenCalledOnce()
    expect(startupMocks.setupCsp).toHaveBeenCalledWith('beta-reader')
    expect(startupMocks.autoUpdate).toHaveBeenCalledOnce()
  })

  it('registers find IPC handlers against the active renderer', () => {
    getIpcHandler('find-in-page')({}, 'needle', false, true)
    getIpcHandler('stop-find-in-page')()
    emitIpcMain('setup-find-result-listener')
    startupMocks.webContentsListeners.get('found-in-page')?.({} as never, { matches: 3 } as never)

    expect(startupMocks.mainWindow.webContents.findInPage).toHaveBeenCalledWith('needle', {
      forward: false,
      findNext: true,
    })
    expect(startupMocks.mainWindow.webContents.stopFindInPage).toHaveBeenCalledWith('clearSelection')
    expect(startupMocks.mainWindow.webContents.send).toHaveBeenCalledWith('find-in-page-result', { matches: 3 })
  })

  it('applies the platform window-close convention', () => {
    emitAppEvent('window-all-closed')

    if (process.platform === 'darwin') {
      expect(app.quit).not.toHaveBeenCalled()
    } else {
      expect(app.quit).toHaveBeenCalledOnce()
    }
  })
})
