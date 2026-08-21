// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const androidAuth = vi.hoisted(() => ({
  authorize: vi.fn(),
  clearToken: vi.fn(async () => {}),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  CapacitorHttp: {},
  registerPlugin: () => androidAuth,
}))

vi.mock('@/lib/tokenStorage', () => ({
  loadTokens: vi.fn(async () => null),
  saveTokens: vi.fn(async () => {}),
  clearTokens: vi.fn(async () => {}),
}))

vi.mock('@/lib/database', () => ({ db: {} }))

import { GoogleDriveProvider } from '@/lib/cloudSync'
import { GOOGLE_DRIVE_FILE_SCOPE } from '@/lib/nativeGoogleDriveAuthorization'

function token(accessToken: string, expiresIn = 3600) {
  return {
    accessToken,
    expiresIn,
    grantedScopes: [GOOGLE_DRIVE_FILE_SCOPE],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  androidAuth.clearToken.mockResolvedValue(undefined)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GoogleDriveProvider Android authorization', () => {
  it('authorizes through the native bridge without a web or native client ID', async () => {
    androidAuth.authorize.mockResolvedValue(token('android-access-token'))
    const provider = new GoogleDriveProvider('')

    await provider.authenticate()

    expect(androidAuth.authorize).toHaveBeenCalledOnce()
    expect(provider.isAuthenticated()).toBe(true)
  })

  it.each([
    ['cancelled', 'Google Drive authorization was cancelled. You can try again.'],
    ['denied', 'Google Drive authorization was denied. You can try again.'],
  ])('returns a recoverable error when authorization is %s', async (_case, message) => {
    androidAuth.authorize.mockRejectedValueOnce(new Error(message))
    const provider = new GoogleDriveProvider('')

    await expect(provider.authenticate()).rejects.toThrow(message)
    expect(provider.isAuthenticated()).toBe(false)

    androidAuth.authorize.mockResolvedValueOnce(token('retry-token'))
    await expect(provider.authenticate()).resolves.toBeUndefined()
    expect(provider.isAuthenticated()).toBe(true)
  })

  it('clears and silently reacquires an expired token before a Drive request', async () => {
    androidAuth.authorize
      .mockResolvedValueOnce(token('expired-token'))
      .mockResolvedValueOnce(token('replacement-token'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [] }),
    }))
    const provider = new GoogleDriveProvider('')
    await provider.authenticate()
    ;(provider as unknown as { accessTokenExpiresAt: number }).accessTokenExpiresAt = Date.now() - 1

    await expect(provider.download('backup.enc')).resolves.toBeNull()

    expect(androidAuth.clearToken).toHaveBeenCalledWith({ accessToken: 'expired-token' })
    expect(androidAuth.authorize).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("q=name='backup.enc'"),
      expect.objectContaining({
        headers: { Authorization: 'Bearer replacement-token' },
      }),
    )
  })

  it('clears an early-invalidated token and retries the Drive request once', async () => {
    androidAuth.authorize
      .mockResolvedValueOnce(token('rejected-token'))
      .mockResolvedValueOnce(token('retry-token'))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GoogleDriveProvider('')
    await provider.authenticate()

    await expect(provider.download('backup.enc')).resolves.toBeNull()

    expect(androidAuth.clearToken).toHaveBeenCalledWith({ accessToken: 'rejected-token' })
    expect(androidAuth.authorize).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({
      headers: { Authorization: 'Bearer retry-token' },
    }))
  })

  it('rejects native responses that grant anything beyond drive.file', async () => {
    androidAuth.authorize.mockResolvedValue({
      ...token('over-scoped-token'),
      grantedScopes: [GOOGLE_DRIVE_FILE_SCOPE, 'openid'],
    })

    await expect(new GoogleDriveProvider('').authenticate()).rejects.toThrow(
      'unexpected scope grant',
    )
  })

  it('rejects native responses with an invalid access-token lifetime', async () => {
    androidAuth.authorize.mockResolvedValue(token('invalid-token', 0))

    await expect(new GoogleDriveProvider('').authenticate()).rejects.toThrow(
      'invalid token lifetime',
    )
  })
})
