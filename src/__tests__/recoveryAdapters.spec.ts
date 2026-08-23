// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopRecoveryStore } from '@/lib/recovery/adapters/desktop'
import { NativeRecoveryStore } from '@/lib/recovery/adapters/native'
import type { RecoveryBundleMetadata, StoredRecoveryBundle } from '@/lib/recovery/model'
import type { DesktopRecoveryBridge } from '@/shims/desktop-recovery'

const filesystem = vi.hoisted(() => ({
  mkdir: vi.fn(), writeFile: vi.fn(), readFile: vi.fn(), readdir: vi.fn(), deleteFile: vi.fn(),
}))

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' }, Encoding: { UTF8: 'utf8' }, Filesystem: filesystem,
}))

const metadata: RecoveryBundleMetadata = {
  id: 'recovery-1', bundleId: 'bundle:1', createdAt: '2026-08-20T00:00:00.000Z',
  appVersion: '1.0.0', sourceOperation: 'replace-library', databaseGeneration: 'a'.repeat(64),
  byteLength: 3, sha256: 'b'.repeat(64),
}
const bundle: StoredRecoveryBundle = { metadata, bytes: new Uint8Array([1, 2, 3]) }

describe('recovery runtime adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    filesystem.mkdir.mockResolvedValue(undefined)
    filesystem.writeFile.mockResolvedValue(undefined)
    filesystem.deleteFile.mockResolvedValue(undefined)
  })

  it('round-trips through the desktop preload bridge', async () => {
    const bridge: DesktopRecoveryBridge = {
      write: vi.fn(async () => undefined),
      read: vi.fn(async () => ({ metadata, bytes: new Uint8Array([1, 2, 3]) })),
      list: vi.fn(async () => [metadata]),
      delete: vi.fn(async () => undefined),
    }
    const store = new DesktopRecoveryStore(bridge)
    await store.write(bundle)
    expect(bridge.write).toHaveBeenCalledWith({ metadata, bytes: new Uint8Array([1, 2, 3]) })
    expect(await store.read(metadata.id)).toEqual(bundle)
    expect(await store.list()).toEqual([metadata])
    await store.delete(metadata.id)
    expect(bridge.delete).toHaveBeenCalledWith(metadata.id)
    bridge.read = vi.fn(async () => null)
    expect(await store.read(metadata.id)).toBeNull()
    bridge.read = vi.fn(async () => ({ metadata: { ...metadata, id: 'recovery-other' }, bytes: new Uint8Array([1, 2, 3]) }))
    await expect(store.read(metadata.id)).rejects.toThrow('requested ID')
    await expect(store.read('../escape')).rejects.toThrow('Invalid recovery')
  })

  it('writes, reads, lists, and deletes native recovery files', async () => {
    filesystem.readFile
      .mockResolvedValueOnce({ data: JSON.stringify(metadata) })
      .mockResolvedValueOnce({ data: 'AQID' })
      .mockResolvedValueOnce({ data: JSON.stringify(metadata) })
    filesystem.readdir.mockResolvedValue({ files: [{ name: 'recovery-1.json' }, { name: 'ignore.zip' }] })
    const store = new NativeRecoveryStore()
    await store.write(bundle)
    expect(filesystem.writeFile).toHaveBeenCalledTimes(2)
    expect(await store.read(metadata.id)).toEqual(bundle)
    expect(await store.list()).toEqual([metadata])
    await store.delete(metadata.id)
    expect(filesystem.deleteFile).toHaveBeenCalledTimes(2)
  })

  it('handles existing directories and missing native files but propagates other failures', async () => {
    filesystem.mkdir.mockRejectedValueOnce(new Error('already exists'))
    filesystem.readdir.mockResolvedValue({ files: [] })
    const store = new NativeRecoveryStore()
    await expect(store.list()).resolves.toEqual([])
    filesystem.readFile.mockRejectedValueOnce(new Error('not found'))
    await expect(store.read(metadata.id)).resolves.toBeNull()
    filesystem.readFile
      .mockResolvedValueOnce({ data: JSON.stringify({ ...metadata, id: 'recovery-other' }) })
      .mockResolvedValueOnce({ data: 'AQID' })
    await expect(store.read(metadata.id)).rejects.toThrow('requested ID')
    filesystem.mkdir.mockRejectedValueOnce(new Error('permission denied'))
    await expect(store.list()).rejects.toThrow('permission denied')
    filesystem.deleteFile.mockRejectedValueOnce(new Error('not found'))
    await expect(store.delete(metadata.id)).resolves.toBeUndefined()
  })
})
