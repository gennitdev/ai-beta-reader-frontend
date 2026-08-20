import { beforeAll, describe, expect, it, vi } from 'vitest'

import { app, emitAppEvent, emitIpcMain, getIpcHandler, getLastMenu } from './mocks/electron'

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
    appMenuTemplate: undefined as unknown,
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

    constructor(_config: unknown, _trayMenu: unknown, appMenu: unknown) {
      startupMocks.appMenuTemplate = appMenu
    }
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
    getIpcHandler('find-in-page')({}, '', true, false)
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

  it('opens the isolated renderer find interface from the application menu', () => {
    const appMenu = startupMocks.appMenuTemplate as Array<{
      submenu?: Array<{ label?: string; click?: (...args: unknown[]) => void }>
    }>
    const findItem = appMenu[1].submenu?.find((item) => item.label === 'Find')

    findItem?.click?.({}, startupMocks.mainWindow)
    findItem?.click?.({}, null)

    expect(startupMocks.mainWindow.webContents.executeJavaScript).toHaveBeenCalledOnce()
    expect(startupMocks.mainWindow.webContents.executeJavaScript.mock.calls[0][0]).toContain(
      'electron-find-bar-host',
    )
  })

  it('offers copy only when the context menu has selected text', () => {
    const contextMenu = startupMocks.webContentsListeners.get('context-menu')

    contextMenu?.({} as never, { selectionText: 'selected' } as never)
    const copyMenu = getLastMenu()
    expect(copyMenu?.items).toHaveLength(1)
    expect(copyMenu?.items[0]).toMatchObject({ label: 'Copy', role: 'copy' })
    expect(copyMenu?.popup).toHaveBeenCalledOnce()

    contextMenu?.({} as never, { selectionText: '' } as never)
    expect(getLastMenu()?.items).toHaveLength(0)
    expect(getLastMenu()?.popup).not.toHaveBeenCalled()
  })

  it('applies the platform window-close convention', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux' })

    try {
      emitAppEvent('window-all-closed')
      expect(app.quit).toHaveBeenCalledOnce()
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
  })

  it('reinitializes the app when activation finds a destroyed window', async () => {
    startupMocks.mainWindow.isDestroyed.mockReturnValueOnce(true)

    await emitAppEvent('activate')

    expect(startupMocks.init).toHaveBeenCalledTimes(2)
  })
})
