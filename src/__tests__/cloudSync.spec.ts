// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CryptoJS from 'crypto-js'
import type { CloudProvider } from '@/lib/cloudSync'
import { Encryption } from '@/lib/encryption'
import { IndexedDbImageContentStore } from '@/lib/imageContentStore'

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
const EXPORT = {
  version: 5,
  books: [{ id: 'b1', title: 'My Book' }],
  chapters: [],
  wiki_pages: [{
    id: 'wiki-1',
    book_id: 'b1',
    page_name: 'Alice Liddell',
    aliases: '["Alice","Ally"]',
  }],
  image_assets: [],
}

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

async function wc1Backup(plaintext: string, password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, baseKey,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  )
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, encoder.encode(plaintext),
  ))
  const combined = new Uint8Array(28 + ciphertext.byteLength)
  combined.set(salt)
  combined.set(iv, 16)
  combined.set(ciphertext, 28)
  let binary = ''
  combined.forEach((byte) => { binary += String.fromCharCode(byte) })
  return `WC1:${btoa(binary)}`
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
  delete (window as Window & { google?: unknown }).google
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CloudSync backup + restore', () => {
  it('round-trips the database through encrypt/compress and back', async () => {
    const provider = fakeProvider()
    const cs = new CloudSync(provider)

    await cs.backupLegacyJson('pw')
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
    await cs.backupLegacyJson('pw')
    expect(provider.authenticate).toHaveBeenCalled()
  })

  it('stops before exporting when authentication fails', async () => {
    const provider = fakeProvider({
      isAuthenticated: vi.fn(() => false),
      authenticate: vi.fn(async () => { throw new Error('sign-in cancelled') }),
    })

    await expect(new CloudSync(provider).backupLegacyJson('pw')).rejects.toThrow('sign-in cancelled')

    expect(dbMock.exportDatabase).not.toHaveBeenCalled()
    expect(provider.upload).not.toHaveBeenCalled()
  })

  it('wraps upload failures with a helpful message', async () => {
    const provider = fakeProvider({
      upload: vi.fn(async () => {
        throw new Error('network down')
      }),
    })
    const cs = new CloudSync(provider)
    await expect(cs.backupLegacyJson('pw')).rejects.toThrow(/Failed to upload backup: network down/)
  })

  it('throws when there is no backup to restore', async () => {
    const provider = fakeProvider({ download: vi.fn(async () => null) })
    const cs = new CloudSync(provider)
    await expect(cs.restore('pw')).rejects.toThrow(/No backup found/)
  })

  it('throws an incorrect-password error when decryption fails', async () => {
    const provider = fakeProvider()
    const cs = new CloudSync(provider)
    await cs.backupLegacyJson('right-password')
    await expect(cs.restore('wrong-password')).rejects.toThrow(/Incorrect password/)
  })

  it('rejects a corrupt compressed payload before importing it', async () => {
    const encrypted = await Encryption.encrypt(new Uint8Array([1, 2, 3, 4]), 'pw')
    const provider = fakeProvider({ download: vi.fn(async () => `GZ1:${encrypted}`) })

    await expect(new CloudSync(provider).restore('pw')).rejects.toThrow(
      'Failed to decompress backup. The file may be corrupted',
    )

    expect(dbMock.importDatabase).not.toHaveBeenCalled()
  })

  it('rejects decrypted content that is not a backup before importing it', async () => {
    const encrypted = await Encryption.encrypt(new TextEncoder().encode('not-json'), 'pw')
    const provider = fakeProvider({ download: vi.fn(async () => encrypted) })

    await expect(new CloudSync(provider).restore('pw')).rejects.toThrow()

    expect(dbMock.importDatabase).not.toHaveBeenCalled()
  })

  it.each([
    ['WC1', (text: string) => wc1Backup(text, 'pw')],
    ['CryptoJS', async (text: string) => CryptoJS.AES.encrypt(text, 'pw').toString()],
  ])('restores %s legacy JSON with an optional UTF-8 BOM', async (_format, encrypt) => {
    const plaintext = `\uFEFF${JSON.stringify(EXPORT)}`
    const provider = fakeProvider({ download: vi.fn(async () => encrypt(plaintext)) })
    await expect(new CloudSync(provider).restore('pw')).resolves.toBe(true)
    const imported = JSON.parse(new TextDecoder().decode(dbMock.importDatabase.mock.calls[0][0]))
    expect(imported).toEqual(EXPORT)
  })

  it('rolls back earlier image writes when a later image cannot be restored', async () => {
    const original = new Uint8Array([9, 8, 7])
    const blobs = new Map<string, Blob>([
      ['existing', new Blob([original], { type: 'image/png' })],
    ])
    vi.spyOn(IndexedDbImageContentStore.prototype, 'read').mockImplementation(
      async (asset) => blobs.get(asset.id) ?? null,
    )
    vi.spyOn(IndexedDbImageContentStore.prototype, 'write').mockImplementation(
      async (asset, blob) => {
        if (asset.id === 'new') throw new Error('disk full')
        blobs.set(asset.id, blob)
      },
    )
    vi.spyOn(IndexedDbImageContentStore.prototype, 'delete').mockImplementation(
      async (asset) => { blobs.delete(asset.id) },
    )

    const payload = {
      ...EXPORT,
      image_assets: [
        {
          id: 'existing', book_id: 'b1', chapter_id: null, asset_type: 'cover',
          file_name: 'existing.png', file_path: 'web/existing.png', mime_type: 'image/png',
          image_data: 'data:image/png;base64,AQID', notes: '', created_at: '', updated_at: '',
        },
        {
          id: 'new', book_id: 'b1', chapter_id: null, asset_type: 'cover',
          file_name: 'new.png', file_path: 'web/new.png', mime_type: 'image/png',
          image_data: 'data:image/png;base64,BAUG', notes: '', created_at: '', updated_at: '',
        },
      ],
    }
    const encrypted = await Encryption.encrypt(
      new TextEncoder().encode(JSON.stringify(payload)),
      'pw',
    )
    const provider = fakeProvider({ download: vi.fn(async () => encrypted) })

    await expect(new CloudSync(provider).restore('pw')).rejects.toThrow(
      'Failed to restore image new.png (new): disk full',
    )

    expect(new Uint8Array(await blobs.get('existing')!.arrayBuffer())).toEqual(original)
    expect(blobs.has('new')).toBe(false)
    expect(dbMock.importDatabase).not.toHaveBeenCalled()
  })

  it('rolls back staged image content when the database import fails', async () => {
    const blobs = new Map<string, Blob>([
      ['existing', new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' })],
    ])
    vi.spyOn(IndexedDbImageContentStore.prototype, 'read').mockImplementation(
      async (asset) => blobs.get(asset.id) ?? null,
    )
    vi.spyOn(IndexedDbImageContentStore.prototype, 'write').mockImplementation(
      async (asset, blob) => { blobs.set(asset.id, blob) },
    )
    vi.spyOn(IndexedDbImageContentStore.prototype, 'delete').mockImplementation(
      async (asset) => { blobs.delete(asset.id) },
    )

    const payload = {
      ...EXPORT,
      image_assets: [
        {
          id: 'existing', book_id: 'b1', chapter_id: null, asset_type: 'cover',
          file_name: 'existing.png', file_path: 'web/existing.png', mime_type: 'image/png',
          image_data: 'data:image/png;base64,AQID', notes: '', created_at: '', updated_at: '',
        },
        {
          id: 'new', book_id: 'b1', chapter_id: null, asset_type: 'cover',
          file_name: 'new.png', file_path: 'web/new.png', mime_type: 'image/png',
          image_data: 'data:image/png;base64,BAUG', notes: '', created_at: '', updated_at: '',
        },
      ],
    }
    const encrypted = await Encryption.encrypt(
      new TextEncoder().encode(JSON.stringify(payload)),
      'pw',
    )
    const provider = fakeProvider({ download: vi.fn(async () => encrypted) })
    dbMock.importDatabase.mockRejectedValueOnce(new Error('database import failed'))

    await expect(new CloudSync(provider).restore('pw')).rejects.toThrow('database import failed')

    expect(new Uint8Array(await blobs.get('existing')!.arrayBuffer())).toEqual(
      new Uint8Array([9, 8, 7]),
    )
    expect(blobs.has('new')).toBe(false)
  })

  it('preserves the database error when best-effort image rollback also fails', async () => {
    const originalBlob = new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' })
    let storedBlob = originalBlob
    let writeCount = 0
    vi.spyOn(IndexedDbImageContentStore.prototype, 'read').mockImplementation(
      async () => storedBlob,
    )
    vi.spyOn(IndexedDbImageContentStore.prototype, 'write').mockImplementation(
      async (_asset, blob) => {
        writeCount += 1
        if (writeCount === 2) throw new Error('rollback storage unavailable')
        storedBlob = blob
      },
    )

    const payload = {
      ...EXPORT,
      image_assets: [{
        id: 'existing', book_id: 'b1', chapter_id: null, asset_type: 'cover',
        file_name: 'existing.png', file_path: 'web/existing.png', mime_type: 'image/png',
        image_data: 'data:image/png;base64,AQID', notes: '', created_at: '', updated_at: '',
      }],
    }
    const encrypted = await Encryption.encrypt(
      new TextEncoder().encode(JSON.stringify(payload)),
      'pw',
    )
    dbMock.importDatabase.mockRejectedValueOnce(new Error('database import failed'))

    await expect(new CloudSync(fakeProvider({
      download: vi.fn(async () => encrypted),
    })).restore('pw')).rejects.toThrow('database import failed')

    expect(console.error).toHaveBeenCalledWith(
      '[CloudSync] Failed to roll back image content after restore failure:',
      expect.objectContaining({ message: expect.stringContaining('rollback storage unavailable') }),
    )
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

  it('rejects authentication when the client ID is missing', async () => {
    await expect(new GoogleDriveProvider('').authenticate()).rejects.toThrow(
      'Google Drive client ID is not configured',
    )
  })

  it('loads the existing GIS namespace and authenticates with a consent prompt', async () => {
    let tokenCallback: ((response: { access_token?: string; error?: string }) => void) | undefined
    const requestAccessToken = vi.fn()
    const initTokenClient = vi.fn((config: {
      callback: (response: { access_token?: string; error?: string }) => void
    }) => {
      tokenCallback = config.callback
      return { requestAccessToken }
    })
    ;(window as Window & { google?: unknown }).google = {
      accounts: { oauth2: { initTokenClient } },
    }
    const provider = new GoogleDriveProvider('web-client')

    const authentication = provider.authenticate()
    await vi.waitFor(() => expect(requestAccessToken).toHaveBeenCalledWith({ prompt: 'consent' }))
    tokenCallback?.({ access_token: 'gis-access-token' })
    await authentication

    expect(initTokenClient).toHaveBeenCalledWith(expect.objectContaining({
      client_id: 'web-client',
      scope: 'https://www.googleapis.com/auth/drive.file',
    }))
    expect(provider.isAuthenticated()).toBe(true)
    expect(provider.isWebSdkReady()).toBe(true)
  })

  it.each([
    [{ error: 'access_denied' }, 'access_denied'],
    [{}, 'did not include an access token'],
  ])('rejects invalid GIS token callbacks', async (response, message) => {
    let tokenCallback: ((value: { access_token?: string; error?: string }) => void) | undefined
    ;(window as Window & { google?: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            callback: (value: { access_token?: string; error?: string }) => void
          }) => {
            tokenCallback = config.callback
            return { requestAccessToken: vi.fn() }
          },
        },
      },
    }
    const authentication = new GoogleDriveProvider('web-client').authenticate()
    await vi.waitFor(() => expect(tokenCallback).toBeTypeOf('function'))
    tokenCallback?.(response)

    await expect(authentication).rejects.toThrow(message)
  })

  it('updates an existing Drive file using an authenticated multipart request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: 'drive-file-1' }] }) })
      .mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GoogleDriveProvider('web-client')
    ;(provider as unknown as { accessToken: string }).accessToken = 'token-123'

    await provider.upload('backup.enc', 'encrypted-data')

    expect(fetchMock.mock.calls[0][0]).toContain("q=name='backup.enc'")
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://www.googleapis.com/upload/drive/v3/files/drive-file-1?uploadType=multipart',
    )
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({
      method: 'PATCH',
      headers: { Authorization: 'Bearer token-123' },
      body: expect.any(FormData),
    }))
  })

  it('creates a Drive file, returns missing downloads, and fetches existing content', async () => {
    const provider = new GoogleDriveProvider('web-client')
    ;(provider as unknown as { accessToken: string }).accessToken = 'token-123'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: 'drive-file-2' }] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => 'encrypted-backup' })
    vi.stubGlobal('fetch', fetchMock)

    await provider.upload('backup.enc', 'data')
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    )
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'POST' }))
    await expect(provider.download('missing.enc')).resolves.toBeNull()
    await expect(provider.download('backup.enc')).resolves.toBe('encrypted-backup')
    expect(fetchMock.mock.calls[4][0]).toBe(
      'https://www.googleapis.com/drive/v3/files/drive-file-2?alt=media',
    )
  })

  it('surfaces Drive search, upload, and download failures', async () => {
    const provider = new GoogleDriveProvider('web-client')
    ;(provider as unknown as { accessToken: string }).accessToken = 'token-123'

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Forbidden' }))
    await expect(provider.download('backup.enc')).rejects.toThrow('Search failed: Forbidden')

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }) })
      .mockResolvedValueOnce({
        ok: false, status: 413, statusText: 'Too Large', text: async () => 'quota',
      }))
    await expect(provider.upload('backup.enc', 'data')).rejects.toThrow('Upload failed: 413 Too Large')

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: 'drive-file-3' }] }) })
      .mockResolvedValueOnce({ ok: false, statusText: 'Unavailable' }))
    await expect(provider.download('backup.enc')).rejects.toThrow('Download failed: Unavailable')
  })

  it('creates, lists, downloads, and deletes immutable backup generations', async () => {
    const provider = new GoogleDriveProvider('web-client')
    ;(provider as unknown as { accessToken: string }).accessToken = 'token-123'
    const metadata = {
      createdAt: '2026-08-20T00:00:00.000Z', appVersion: '2.0.0', bundleFormatVersion: 1,
      encryptedByteLength: 4, ciphertextSha256: 'a'.repeat(64),
    }
    const resource = {
      id: 'generation-1', name: 'generation.enc', createdTime: metadata.createdAt, size: '4',
      appProperties: {
        betaBotLibraryBackup: 'true', createdAt: metadata.createdAt, appVersion: metadata.appVersion,
        bundleFormatVersion: '1', encryptedByteLength: '4', ciphertextSha256: metadata.ciphertextSha256,
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => resource })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [resource] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => 'data' })
      .mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await expect(provider.uploadGeneration({
      name: resource.name, encryptedData: 'data', metadata,
    })).resolves.toEqual({ id: resource.id, name: resource.name, ...metadata })
    await expect(provider.listGenerations()).resolves.toEqual([{ id: resource.id, name: resource.name, ...metadata }])
    await expect(provider.downloadGeneration(resource.id)).resolves.toBe('data')
    await expect(provider.deleteGeneration(resource.id)).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toContain('uploadType=multipart')
    expect(fetchMock.mock.calls[1][0]).toContain('appProperties')
    expect(fetchMock.mock.calls[3][1]).toEqual(expect.objectContaining({ method: 'DELETE' }))
  })

  it('rejects generation metadata that does not match the uploaded ciphertext size', async () => {
    const provider = new GoogleDriveProvider('web-client')
    ;(provider as unknown as { accessToken: string }).accessToken = 'token-123'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'generation-1', name: 'generation.enc', size: '99',
        appProperties: {
          betaBotLibraryBackup: 'true', createdAt: '2026-08-20T00:00:00.000Z', appVersion: '2',
          bundleFormatVersion: '1', encryptedByteLength: '4', ciphertextSha256: 'a'.repeat(64),
        },
      }),
    }))
    await expect(provider.uploadGeneration({
      name: 'generation.enc', encryptedData: 'data',
      metadata: {
        createdAt: '2026-08-20T00:00:00.000Z', appVersion: '2', bundleFormatVersion: 1,
        encryptedByteLength: 4, ciphertextSha256: 'a'.repeat(64),
      },
    })).rejects.toThrow('invalid backup generation metadata')
  })
})
