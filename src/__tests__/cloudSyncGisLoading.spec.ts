// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  native: false,
  platform: 'web',
  get: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mocks.native,
    getPlatform: () => mocks.platform,
  },
  CapacitorHttp: { get: mocks.get, post: vi.fn() },
}))

import { GoogleDriveProvider } from '@/lib/cloudSync'

type PrivateProvider = {
  ensureGoogleIdentityServicesLoaded: () => Promise<void>
  loadGisForNative: () => Promise<void>
}

function privateProvider(provider: GoogleDriveProvider): PrivateProvider {
  return provider as unknown as PrivateProvider
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.native = false
  mocks.platform = 'web'
  delete (window as Window & { google?: unknown }).google
  document.querySelectorAll('script[data-google-identity]').forEach((script) => script.remove())
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  delete (window as Window & { google?: unknown }).google
  document.querySelectorAll('script[data-google-identity]').forEach((script) => script.remove())
  vi.restoreAllMocks()
})

describe('GoogleDriveProvider GIS loading', () => {
  it('loads a new web script and marks the SDK ready', async () => {
    const append = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event('load')))
      return node
    })
    const provider = new GoogleDriveProvider('web-client')

    await provider.ensureWebSdkReady()

    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      src: 'https://accounts.google.com/gsi/client',
    }))
    expect(provider.isWebSdkReady()).toBe(true)
  })

  it('reuses an in-flight existing script load for concurrent callers', async () => {
    const script = document.createElement('script')
    script.dataset.googleIdentity = 'true'
    document.head.appendChild(script)
    const provider = new GoogleDriveProvider('web-client')

    const first = provider.ensureWebSdkReady()
    const second = provider.ensureWebSdkReady()
    script.dispatchEvent(new Event('load'))

    await Promise.all([first, second])
    expect(provider.isWebSdkReady()).toBe(true)
  })

  it('resolves immediately when the GIS namespace already exists', async () => {
    ;(window as Window & { google?: unknown }).google = { accounts: { oauth2: {} } }
    const provider = new GoogleDriveProvider('web-client')

    await provider.ensureWebSdkReady()

    expect(provider.isWebSdkReady()).toBe(true)
  })

  it('resets a failed web load so a later retry can succeed', async () => {
    const append = vi.spyOn(document.head, 'appendChild')
      .mockImplementationOnce((node) => {
        queueMicrotask(() => (node as HTMLScriptElement).onerror?.(new Event('error')))
        return node
      })
      .mockImplementationOnce((node) => {
        queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event('load')))
        return node
      })
    const provider = new GoogleDriveProvider('web-client')

    await expect(provider.ensureWebSdkReady()).rejects.toThrow('Failed to load Google Identity Services')
    document.querySelectorAll('script[data-google-identity]').forEach((script) => script.remove())
    await expect(provider.ensureWebSdkReady()).resolves.toBeUndefined()

    expect(append).toHaveBeenCalledTimes(2)
    expect(provider.isWebSdkReady()).toBe(true)
  })

  it('rejects authentication when a loaded namespace lacks the token client', async () => {
    ;(window as Window & { google?: unknown }).google = { accounts: { oauth2: {} } }

    await expect(new GoogleDriveProvider('web-client').authenticate())
      .rejects.toThrow('Google Identity Services is unavailable')
  })

  it('installs a natively fetched GIS script and repairs its default namespace', async () => {
    mocks.native = true
    mocks.platform = 'ios'
    mocks.get.mockResolvedValue({ data: 'globalThis.google = {}' })
    const initTokenClient = vi.fn()
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      const script = node as HTMLScriptElement
      ;(window as Window & { google?: unknown }).google = {
        accounts: { oauth2: { _default: { initTokenClient } } },
      }
      script.onload?.(new Event('load'))
      return node
    })

    await privateProvider(new GoogleDriveProvider('web-client')).loadGisForNative()

    const oauth2 = (window as Window & {
      google?: { accounts?: { oauth2?: { initTokenClient?: unknown } } }
    }).google?.accounts?.oauth2
    expect(oauth2?.initTokenClient).toBeTypeOf('function')
    expect(mocks.get).toHaveBeenCalledWith({
      url: 'https://accounts.google.com/gsi/client', responseType: 'text',
    })
  })

  it.each([
    [{ data: null }, 'Empty Google Identity Services payload'],
    [{ data: {} }, 'Empty Google Identity Services payload'],
  ])('rejects invalid native GIS payloads', async (response, message) => {
    mocks.native = true
    mocks.platform = 'ios'
    mocks.get.mockResolvedValue(response)

    await expect(privateProvider(new GoogleDriveProvider('web-client')).loadGisForNative())
      .rejects.toThrow(message)
  })
})
