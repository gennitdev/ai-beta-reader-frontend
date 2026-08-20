import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  app as electronApp,
  BrowserWindow,
  emitHeadersReceived,
  getLastTray,
  nativeImage,
  resetElectronMock,
} from './mocks/electron'

const capacitorMocks = vi.hoisted(() => ({
  emit: vi.fn(),
  setupPlugins: vi.fn(),
  splashInstances: [] as Array<{
    init: ReturnType<typeof vi.fn>
    getSplashWindow: () => {
      hide: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
      isDestroyed: ReturnType<typeof vi.fn>
    }
  }>,
  splashOptions: [] as unknown[],
  splashWindow: {
    hide: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
  },
}))
const serveMock = vi.hoisted(() => vi.fn(async () => undefined))
const manageWindowMock = vi.hoisted(() => vi.fn())
const watcherMocks = vi.hoisted(() => ({
  handlers: [] as Array<Map<string, (...args: unknown[]) => void>>,
  watch: vi.fn(() => {
    const handlers = new Map<string, (...args: unknown[]) => void>()
    watcherMocks.handlers.push(handlers)
    return {
      on(event: string, handler: (...args: unknown[]) => void) {
        handlers.set(event, handler)
        return this
      },
    }
  }),
}))

vi.mock('@capacitor-community/electron', () => ({
  CapElectronEventEmitter: { emit: capacitorMocks.emit },
  CapacitorSplashScreen: class {
    init = vi.fn((loader: (app: unknown) => Promise<void>, app: unknown) => loader(app))
    getSplashWindow = () => capacitorMocks.splashWindow

    constructor(options: unknown) {
      capacitorMocks.splashOptions.push(options)
      capacitorMocks.splashInstances.push(this)
    }
  },
  setupCapacitorElectronPlugins: capacitorMocks.setupPlugins,
}))
vi.mock('chokidar', () => ({ default: { watch: watcherMocks.watch } }))
vi.mock('electron-is-dev', () => ({ default: false }))
vi.mock('electron-serve', () => ({ default: vi.fn(() => serveMock) }))
vi.mock('electron-window-state', () => ({
  default: vi.fn(() => ({ x: 10, y: 20, width: 1000, height: 800, manage: manageWindowMock })),
}))

import {
  buildContentSecurityPolicy,
  ElectronCapacitorApp,
  scheduleRendererReady,
  setupContentSecurityPolicy,
  setupReloadWatcher,
} from '../src/setup'

describe('Electron application setup', () => {
  beforeEach(() => {
    resetElectronMock()
    capacitorMocks.splashInstances.length = 0
    capacitorMocks.splashOptions.length = 0
    watcherMocks.handlers.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds a production CSP without replacing existing response headers', () => {
    setupContentSecurityPolicy('beta-reader')
    const callback = vi.fn()

    emitHeadersReceived({ responseHeaders: { 'X-Existing': ['preserved'] } }, callback)

    const responseHeaders = callback.mock.calls[0][0].responseHeaders
    expect(responseHeaders['X-Existing']).toEqual(['preserved'])
    expect(responseHeaders['Content-Security-Policy'][0]).toContain('default-src beta-reader://*')
    expect(responseHeaders['Content-Security-Policy'][0]).toContain('https://api.openai.com')
    expect(responseHeaders['Content-Security-Policy'][0]).not.toContain('devtools://*')
    expect(responseHeaders['Content-Security-Policy'][0]).not.toContain("'unsafe-eval'")
  })

  it('builds a development CSP with the required developer sources', () => {
    const policy = buildContentSecurityPolicy('beta-reader', true)

    expect(policy).toContain("devtools://*")
    expect(policy).toContain("'unsafe-eval'")
    expect(policy).toContain("'wasm-unsafe-eval'")
  })

  it('opens developer tools before signaling renderer readiness in development', async () => {
    vi.useFakeTimers()
    const mainWindow = new BrowserWindow({})

    scheduleRendererReady(mainWindow as never, true)
    await vi.advanceTimersByTimeAsync(400)

    expect(mainWindow.webContents.openDevTools).toHaveBeenCalledOnce()
    expect(capacitorMocks.emit).toHaveBeenCalledWith('CAPELECTRON_DeeplinkListenerInitialized', '')
  })

  it('creates an isolated renderer and installs navigation controls', async () => {
    const app = new ElectronCapacitorApp({
      backgroundColor: '#101827',
      electron: { customUrlScheme: 'beta-reader' },
    } as never)

    await app.init()

    const mainWindow = app.getMainWindow()
    expect(mainWindow.webContents.setWindowOpenHandler).toHaveBeenCalledOnce()
    expect(mainWindow.webContents.on).toHaveBeenCalledWith('will-navigate', expect.any(Function))
    expect(manageWindowMock).toHaveBeenCalledWith(mainWindow)
    expect(mainWindow.setBackgroundColor).toHaveBeenCalledWith('#101827')
    expect(serveMock).toHaveBeenCalledWith(mainWindow)
    expect(capacitorMocks.setupPlugins).toHaveBeenCalledOnce()

    vi.useFakeTimers()
    mainWindow.webContents.emit('dom-ready')
    await vi.advanceTimersByTimeAsync(400)
    expect(mainWindow.show).toHaveBeenCalledOnce()
    expect(capacitorMocks.emit).toHaveBeenCalledWith('CAPELECTRON_DeeplinkListenerInitialized', '')
  })

  it('manages tray, splash, custom menus, and hidden-on-launch behavior', async () => {
    vi.useFakeTimers()
    const trayMenu = [{ label: 'Custom tray' }]
    const appMenu = [{ label: 'Custom app menu' }]
    const app = new ElectronCapacitorApp({
      electron: {
        customUrlScheme: 'beta-reader',
        trayIconAndMenuEnabled: true,
        splashScreenEnabled: true,
        splashScreenImageName: 'launch.png',
        hideMainWindowOnLaunch: true,
      },
    } as never, trayMenu as never, appMenu as never)

    await app.init()
    const mainWindow = app.getMainWindow()
    const tray = getLastTray()
    const splash = capacitorMocks.splashInstances[0]

    expect(app.getCustomURLScheme()).toBe('beta-reader')
    expect(tray?.setToolTip).toHaveBeenCalledWith('Beta Bot')
    expect(tray?.setContextMenu).toHaveBeenCalledWith(trayMenu)
    expect(capacitorMocks.splashOptions[0]).toMatchObject({
      imageFilePath: expect.stringContaining('launch.png'),
      windowWidth: 400,
      windowHeight: 400,
    })
    expect(splash.init).toHaveBeenCalledOnce()

    mainWindow.isVisible
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    tray?.emit('click')
    tray?.emit('double-click')
    tray?.emit('double-click')
    tray?.emit('click')
    expect(mainWindow.show).toHaveBeenCalledTimes(2)
    expect(mainWindow.focus).toHaveBeenCalledTimes(2)
    expect(mainWindow.hide).toHaveBeenCalledTimes(2)

    mainWindow.show.mockClear()
    mainWindow.emit('closed')
    mainWindow.webContents.emit('dom-ready')
    await vi.advanceTimersByTimeAsync(400)
    expect(capacitorMocks.splashWindow.close).toHaveBeenCalledOnce()
    expect(capacitorMocks.splashWindow.hide).toHaveBeenCalledOnce()
    expect(mainWindow.show).not.toHaveBeenCalled()
  })

  it('reloads the renderer after a debounced development file change', async () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    const app = { getMainWindow: () => ({ webContents: { reload } }) }

    setupReloadWatcher(app as never)
    watcherMocks.handlers[0].get('all')?.('change', 'before-ready')
    watcherMocks.handlers[0].get('ready')?.()
    watcherMocks.handlers[0].get('all')?.('change', 'app/index.js')
    await vi.advanceTimersByTimeAsync(1500)

    expect(reload).toHaveBeenCalledOnce()
    expect(watcherMocks.watch).toHaveBeenCalledTimes(2)
  })

  it('selects the Windows icon and default custom scheme on Windows', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })

    try {
      const app = new ElectronCapacitorApp({ electron: {} } as never)
      await app.init()

      expect(app.getCustomURLScheme()).toBe('capacitor-electron')
      expect(nativeImage.createFromPath).toHaveBeenCalledWith(expect.stringContaining('appIcon.ico'))
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
  })

  it('sets the application Dock icon on macOS', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })

    try {
      const app = new ElectronCapacitorApp({ electron: {} } as never)
      await app.init()

      expect(electronApp.dock.setIcon).toHaveBeenCalledWith({ image: 'app-icon' })
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
  })
})
