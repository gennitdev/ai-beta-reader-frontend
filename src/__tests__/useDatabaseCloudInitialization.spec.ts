import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  init: vi.fn(async () => {}),
  platform: 'web',
  isWebSdkReady: vi.fn(() => false),
  ensureWebSdkReady: vi.fn(async () => {}),
  GoogleDriveProvider: vi.fn(),
  CloudSync: vi.fn(function (this: Record<string, unknown>) {
    this.isWebSdkReady = mocks.isWebSdkReady
    this.ensureWebSdkReady = mocks.ensureWebSdkReady
  }),
}))

vi.mock('@/lib/database', () => ({ db: { init: mocks.init } }))
vi.mock('@/lib/cloudSync', () => ({
  CloudSync: mocks.CloudSync,
  GoogleDriveProvider: mocks.GoogleDriveProvider,
}))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => mocks.platform },
}))

describe('useDatabase cloud initialization', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID_WEB', 'web-client-id')
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
    mocks.platform = 'web'
    mocks.isWebSdkReady.mockReturnValue(false)
    mocks.ensureWebSdkReady.mockResolvedValue(undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('preloads the web SDK and publishes readiness when loading succeeds', async () => {
    mocks.isWebSdkReady.mockReturnValueOnce(false).mockReturnValue(true)
    const { initializeDatabase, useDatabase } = await import('@/composables/useDatabase')

    await initializeDatabase()
    await vi.waitFor(() => expect(useDatabase().cloudSyncReady.value).toBe(true))

    expect(mocks.GoogleDriveProvider).toHaveBeenCalledWith('web-client-id')
    expect(mocks.ensureWebSdkReady).toHaveBeenCalledOnce()
  })

  it('keeps cloud sync unavailable and logs a warning when SDK preload fails', async () => {
    const preloadFailure = new Error('GIS blocked')
    mocks.ensureWebSdkReady.mockRejectedValueOnce(preloadFailure)
    const { initializeDatabase, useDatabase } = await import('@/composables/useDatabase')

    await initializeDatabase()
    await vi.waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        '[useDatabase] Failed to preload GIS SDK:',
        preloadFailure,
      )
    })

    expect(useDatabase().cloudSyncReady.value).toBe(false)
  })

  it('initializes native Android sync without a web client id', async () => {
    mocks.platform = 'android'
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID_WEB', '')
    const { initializeDatabase, useDatabase } = await import('@/composables/useDatabase')

    await initializeDatabase()

    expect(mocks.GoogleDriveProvider).toHaveBeenCalledWith('')
    expect(useDatabase().hasCloudSync()).toBe(true)
  })
})
