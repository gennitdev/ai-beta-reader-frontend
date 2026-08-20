import { beforeAll, describe, expect, it, vi } from 'vitest'

const developmentMocks = vi.hoisted(() => ({
  deepLinks: vi.fn(),
  init: vi.fn(async () => undefined),
  reloadWatcher: vi.fn(),
  setupCsp: vi.fn(),
  window: {
    isDestroyed: vi.fn(() => false),
    webContents: { on: vi.fn() },
  },
}))

vi.mock('@capacitor-community/electron', () => ({
  getCapacitorElectronConfig: vi.fn(() => ({
    electron: {
      customUrlScheme: 'beta-reader',
      deepLinkingEnabled: true,
    },
  })),
  setupElectronDeepLinking: developmentMocks.deepLinks,
}))
vi.mock('electron-is-dev', () => ({ default: true }))
vi.mock('electron-unhandled', () => ({ default: vi.fn() }))
vi.mock('electron-updater', () => ({ autoUpdater: { checkForUpdatesAndNotify: vi.fn() } }))
vi.mock('../src/image-bridge', () => ({ registerDesktopImageBridge: vi.fn() }))
vi.mock('../src/oauth-loopback', () => ({ registerOAuthLoopbackHandlers: vi.fn() }))
vi.mock('../src/secure-storage-bridge', () => ({ registerSecureStorageBridge: vi.fn() }))
vi.mock('../src/setup', () => ({
  ElectronCapacitorApp: class {
    init = developmentMocks.init
    getMainWindow = () => developmentMocks.window
    getCustomURLScheme = () => 'beta-reader'
  },
  setupContentSecurityPolicy: developmentMocks.setupCsp,
  setupReloadWatcher: developmentMocks.reloadWatcher,
}))

describe('Electron development startup', () => {
  beforeAll(async () => {
    await import('../src/index')
    await vi.waitFor(() => expect(developmentMocks.init).toHaveBeenCalledOnce())
  })

  it('registers deep linking with the default protocol', () => {
    expect(developmentMocks.deepLinks).toHaveBeenCalledWith(expect.anything(), {
      customProtocol: 'mycapacitorapp',
    })
  })

  it('enables the renderer reload watcher', () => {
    expect(developmentMocks.reloadWatcher).toHaveBeenCalledWith(expect.anything())
  })
})
