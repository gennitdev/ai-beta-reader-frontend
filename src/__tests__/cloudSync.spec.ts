// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudProvider } from '@/lib/cloudSync'

const dbMock = vi.hoisted(() => ({
  exportDatabase: vi.fn(),
  importDatabase: vi.fn(async () => {}),
}))

vi.mock('@/lib/database', () => ({ db: dbMock }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
  CapacitorHttp: {},
}))

import { CloudSync, GoogleDriveProvider } from '@/lib/cloudSync'

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const EXPORT = { books: [{ id: 'b1', title: 'My Book' }], image_assets: [] }

function fakeProvider(overrides: Partial<CloudProvider> = {}) {
  let stored: string | null = null
  const provider: CloudProvider & { stored: () => string | null } = {
    name: 'TestDrive',
    isAuthenticated: vi.fn(() => true),
    authenticate: vi.fn(async () => {}),
    upload: vi.fn(async (_fileName: string, data: string) => {
      stored = data
    }),
    download: vi.fn(async () => stored),
    stored: () => stored,
    ...overrides,
  } as CloudProvider & { stored: () => string | null }
  return provider
}

beforeEach(() => {
  vi.clearAllMocks()
  dbMock.exportDatabase.mockResolvedValue(new TextEncoder().encode(JSON.stringify(EXPORT)))
  dbMock.importDatabase.mockResolvedValue(undefined)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CloudSync backup + restore', () => {
  it('round-trips the database through encrypt/compress and back', async () => {
    const provider = fakeProvider()
    const cs = new CloudSync(provider)

    await cs.backup('pw')
    expect(provider.upload).toHaveBeenCalledOnce()
    expect(provider.stored()?.startsWith('GZ1:')).toBe(true)

    const ok = await cs.restore('pw')
    expect(ok).toBe(true)
    expect(dbMock.importDatabase).toHaveBeenCalledOnce()
    const importedBytes = dbMock.importDatabase.mock.calls[0][0] as Uint8Array
    expect(JSON.parse(decode(importedBytes))).toEqual(EXPORT)
  })

  it('authenticates before backup when not already authenticated', async () => {
    const provider = fakeProvider({ isAuthenticated: vi.fn(() => false) })
    const cs = new CloudSync(provider)
    await cs.backup('pw')
    expect(provider.authenticate).toHaveBeenCalled()
  })

  it('wraps upload failures with a helpful message', async () => {
    const provider = fakeProvider({
      upload: vi.fn(async () => {
        throw new Error('network down')
      }),
    })
    const cs = new CloudSync(provider)
    await expect(cs.backup('pw')).rejects.toThrow(/Failed to upload backup: network down/)
  })

  it('throws when there is no backup to restore', async () => {
    const provider = fakeProvider({ download: vi.fn(async () => null) })
    const cs = new CloudSync(provider)
    await expect(cs.restore('pw')).rejects.toThrow(/No backup found/)
  })

  it('throws an incorrect-password error when decryption fails', async () => {
    const provider = fakeProvider()
    const cs = new CloudSync(provider)
    await cs.backup('right-password')
    await expect(cs.restore('wrong-password')).rejects.toThrow(/Incorrect password/)
  })
})

describe('CloudSync auto-sync and SDK readiness', () => {
  it('starts and stops an interval', () => {
    const setSpy = vi.spyOn(window, 'setInterval').mockReturnValue(42 as unknown as ReturnType<typeof setInterval>)
    const clearSpy = vi.spyOn(window, 'clearInterval').mockImplementation(() => {})
    const cs = new CloudSync(fakeProvider())

    const id = cs.startAutoSync('pw', 1000)
    expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 1000)
    expect(id).toBe(42)

    cs.stopAutoSync(id)
    expect(clearSpy).toHaveBeenCalledWith(42)
  })

  it('delegates SDK readiness to the provider, defaulting to ready', async () => {
    const withSdk = new CloudSync(
      fakeProvider({ isWebSdkReady: vi.fn(() => false), ensureWebSdkReady: vi.fn(async () => {}) }),
    )
    expect(withSdk.isWebSdkReady()).toBe(false)
    await withSdk.ensureWebSdkReady()

    const withoutSdk = new CloudSync(fakeProvider())
    expect(withoutSdk.isWebSdkReady()).toBe(true)
    await expect(withoutSdk.ensureWebSdkReady()).resolves.toBeUndefined()
  })
})

describe('GoogleDriveProvider basics', () => {
  it('constructs with explicit options and a name', () => {
    const provider = new GoogleDriveProvider('web-client', {
      nativeClientId: 'native-client',
      nativeRedirectUri: 'app:/oauth',
    })
    expect(provider.name).toBe('Google Drive')
  })

  it('reports authentication based on the access token (web platform)', () => {
    const provider = new GoogleDriveProvider('web-client')
    expect(provider.isAuthenticated()).toBe(false)

    ;(provider as unknown as { accessToken: string }).accessToken = 'token-123'
    expect(provider.isAuthenticated()).toBe(true)
  })

  it('is not web-SDK-ready until the GIS SDK has loaded', () => {
    const provider = new GoogleDriveProvider('web-client')
    expect(provider.isWebSdkReady()).toBe(false)
  })
})
