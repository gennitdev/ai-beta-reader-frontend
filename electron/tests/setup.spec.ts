import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emitHeadersReceived, resetElectronMock } from './mocks/electron'

const capacitorMocks = vi.hoisted(() => ({
  emit: vi.fn(),
  setupPlugins: vi.fn(),
}))
const serveMock = vi.hoisted(() => vi.fn(async () => undefined))
const manageWindowMock = vi.hoisted(() => vi.fn())

vi.mock('@capacitor-community/electron', () => ({
  CapElectronEventEmitter: { emit: capacitorMocks.emit },
  CapacitorSplashScreen: class {},
  setupCapacitorElectronPlugins: capacitorMocks.setupPlugins,
}))
vi.mock('chokidar', () => ({ default: { watch: vi.fn() } }))
vi.mock('electron-is-dev', () => ({ default: false }))
vi.mock('electron-serve', () => ({ default: vi.fn(() => serveMock) }))
vi.mock('electron-window-state', () => ({
  default: vi.fn(() => ({ x: 10, y: 20, width: 1000, height: 800, manage: manageWindowMock })),
}))

import { ElectronCapacitorApp, setupContentSecurityPolicy } from '../src/setup'

describe('Electron application setup', () => {
  beforeEach(() => {
    resetElectronMock()
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
  })
})
