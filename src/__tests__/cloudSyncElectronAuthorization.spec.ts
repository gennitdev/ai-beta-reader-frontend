// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadTokens: vi.fn(),
  saveTokens: vi.fn(async () => {}),
  clearTokens: vi.fn(async () => {}),
  post: vi.fn(),
}))

vi.mock('@/lib/tokenStorage', () => ({
  loadTokens: mocks.loadTokens,
  saveTokens: mocks.saveTokens,
  clearTokens: mocks.clearTokens,
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'electron' },
  CapacitorHttp: { post: mocks.post },
}))

import { GoogleDriveProvider } from '@/lib/cloudSync'

type ElectronBridge = NonNullable<Window['electronOAuth']>

function installBridge(authenticate: ElectronBridge['authenticate']) {
  window.electronOAuth = { authenticate }
}

describe('GoogleDriveProvider Electron authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadTokens.mockResolvedValue(null)
    installBridge(vi.fn())
  })

  afterEach(() => {
    delete window.electronOAuth
  })

  it('persists tokens returned by the loopback OAuth bridge', async () => {
    const authenticate = vi.fn(async () => ({
      success: true as const,
      tokens: { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 },
    }))
    installBridge(authenticate)

    const provider = new GoogleDriveProvider('web-client')
    await provider.authenticate()

    expect(authenticate).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'web-client',
      scope: 'https://www.googleapis.com/auth/drive.file',
    }))
    expect(mocks.saveTokens).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: expect.any(Number),
    }))
    expect(provider.isAuthenticated()).toBe(true)
    expect(provider.isWebSdkReady()).toBe(true)
    await expect(provider.ensureWebSdkReady()).resolves.toBeUndefined()
  })

  it('uses an unexpired cached access token without opening OAuth', async () => {
    const authenticate = vi.fn()
    installBridge(authenticate)
    mocks.loadTokens.mockResolvedValue({
      accessToken: 'cached-access',
      refreshToken: 'cached-refresh',
      expiresAt: Date.now() + 10 * 60 * 1000,
    })

    const provider = new GoogleDriveProvider('web-client')
    await provider.authenticate()

    expect(authenticate).not.toHaveBeenCalled()
    expect(provider.isAuthenticated()).toBe(true)
  })

  it('refreshes an expired cached token and retains its refresh token', async () => {
    const authenticate = vi.fn()
    installBridge(authenticate)
    mocks.loadTokens.mockResolvedValue({
      accessToken: 'expired-access',
      refreshToken: 'cached-refresh',
      expiresAt: Date.now() - 1,
    })
    mocks.post.mockResolvedValue({
      status: 200,
      data: { access_token: 'refreshed-access', expires_in: 1800 },
    })

    const provider = new GoogleDriveProvider('web-client')
    await provider.authenticate()

    expect(mocks.post).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://oauth2.googleapis.com/token',
      data: expect.stringContaining('refresh_token=cached-refresh'),
    }))
    expect(mocks.saveTokens).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'refreshed-access',
      refreshToken: 'cached-refresh',
    }))
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('clears an expired token without a refresh token before starting OAuth', async () => {
    mocks.loadTokens.mockResolvedValue({
      accessToken: 'expired-access',
      expiresAt: Date.now() - 1,
    })
    const authenticate = vi.fn(async () => ({
      success: true as const,
      tokens: { access_token: 'new-access', expires_in: 900 },
    }))
    installBridge(authenticate)

    await new GoogleDriveProvider('web-client').authenticate()

    expect(mocks.clearTokens).toHaveBeenCalledOnce()
    expect(authenticate).toHaveBeenCalledOnce()
    expect(mocks.saveTokens).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'new-access',
      refreshToken: undefined,
    }))
  })

  it('falls back to loopback OAuth when refreshing a cached token fails', async () => {
    mocks.loadTokens.mockResolvedValue({
      accessToken: 'expired-access',
      refreshToken: 'bad-refresh',
      expiresAt: Date.now() - 1,
    })
    mocks.post.mockResolvedValue({ status: 401, data: {} })
    const authenticate = vi.fn(async () => ({
      success: true as const,
      tokens: { access_token: 'replacement-access', refresh_token: 'replacement-refresh', expires_in: 900 },
    }))
    installBridge(authenticate)

    await new GoogleDriveProvider('web-client').authenticate()

    expect(mocks.clearTokens).toHaveBeenCalledOnce()
    expect(authenticate).toHaveBeenCalledOnce()
    expect(mocks.saveTokens).toHaveBeenLastCalledWith(expect.objectContaining({
      accessToken: 'replacement-access',
    }))
  })

  it.each([
    [{ success: false as const, error: 'access denied' }, 'access denied'],
    [{ success: false as const }, 'OAuth authentication failed'],
    [{ success: true as const }, 'without returning tokens'],
  ])('rejects invalid loopback OAuth responses', async (result, message) => {
    installBridge(vi.fn(async () => result))

    await expect(new GoogleDriveProvider('web-client').authenticate()).rejects.toThrow(message)
    expect(mocks.saveTokens).not.toHaveBeenCalled()
  })

  it.each([
    [{ status: 503, data: {} }, 'status 503'],
    [{ status: 200, data: {} }, 'missing access_token'],
  ])('rejects invalid token refresh responses', async (response, message) => {
    mocks.post.mockResolvedValue(response)
    const provider = new GoogleDriveProvider('web-client')
    ;(provider as unknown as { refreshToken: string }).refreshToken = 'refresh-1'

    await expect(provider.refreshAccessToken()).rejects.toThrow(message)
  })
})
