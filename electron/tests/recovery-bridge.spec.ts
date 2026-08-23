import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerRecoveryBridge } from '../src/recovery-bridge'
import { getIpcHandler, ipcMain, resetElectronMock } from './mocks/electron'

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(), readFile: vi.fn(), readdir: vi.fn(), rename: vi.fn(), rm: vi.fn(), writeFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => fsMocks)

const metadata = {
  id: 'recovery-1', bundleId: 'bundle:1', createdAt: '2026-08-20T00:00:00.000Z',
  appVersion: '1.0.0', sourceOperation: 'replace-library' as const, databaseGeneration: 'a'.repeat(64),
  byteLength: 3, sha256: 'b'.repeat(64),
}

describe('Electron recovery bridge', () => {
  beforeEach(() => {
    resetElectronMock()
    for (const mock of Object.values(fsMocks)) mock.mockReset()
    fsMocks.mkdir.mockResolvedValue(undefined)
    fsMocks.rename.mockResolvedValue(undefined)
    fsMocks.rm.mockResolvedValue(undefined)
    fsMocks.writeFile.mockResolvedValue(undefined)
    registerRecoveryBridge()
  })

  it('registers the complete IPC surface and atomically writes bundle files', async () => {
    expect(ipcMain.handle.mock.calls.map(([channel]) => channel)).toEqual([
      'desktop-recovery:write', 'desktop-recovery:read', 'desktop-recovery:list', 'desktop-recovery:delete',
    ])
    await getIpcHandler('desktop-recovery:write')(null, { metadata, bytes: new Uint8Array([1, 2, 3]) })
    expect(fsMocks.mkdir).toHaveBeenCalledWith(path.join('/tmp/beta-bot-user-data', 'recovery'), { recursive: true })
    expect(fsMocks.writeFile).toHaveBeenCalledTimes(2)
    expect(fsMocks.rename).toHaveBeenCalledTimes(2)
    expect(fsMocks.rm).toHaveBeenCalledTimes(2)
  })

  it('reads valid bundles and treats only missing files as absent', async () => {
    fsMocks.readFile.mockResolvedValueOnce(JSON.stringify(metadata)).mockResolvedValueOnce(Buffer.from([1, 2, 3]))
    await expect(getIpcHandler('desktop-recovery:read')(null, metadata.id)).resolves.toEqual({ metadata, bytes: new Uint8Array([1, 2, 3]) })
    fsMocks.readFile.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    await expect(getIpcHandler('desktop-recovery:read')(null, metadata.id)).resolves.toBeNull()
    fsMocks.readFile.mockRejectedValueOnce(new Error('denied'))
    await expect(getIpcHandler('desktop-recovery:read')(null, metadata.id)).rejects.toThrow('denied')
  })

  it('lists metadata sidecars, handles an absent directory, and deletes both files', async () => {
    fsMocks.readdir.mockResolvedValueOnce(['recovery-1.json', 'recovery-1.zip'])
    fsMocks.readFile.mockResolvedValueOnce(JSON.stringify(metadata))
    await expect(getIpcHandler('desktop-recovery:list')()).resolves.toEqual([metadata])
    fsMocks.readdir.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    await expect(getIpcHandler('desktop-recovery:list')()).resolves.toEqual([])
    await getIpcHandler('desktop-recovery:delete')(null, metadata.id)
    expect(fsMocks.rm).toHaveBeenCalledWith(path.join('/tmp/beta-bot-user-data', 'recovery', 'recovery-1.zip'), { force: true })
    expect(fsMocks.rm).toHaveBeenCalledWith(path.join('/tmp/beta-bot-user-data', 'recovery', 'recovery-1.json'), { force: true })
  })

  it('rejects unsafe IDs, malformed metadata, invalid bytes, and inconsistent lengths', async () => {
    await expect(getIpcHandler('desktop-recovery:read')(null, '../escape')).rejects.toThrow('Invalid recovery')
    const malformedMetadata = [
      null,
      { ...metadata, id: '' },
      { ...metadata, bundleId: '' },
      { ...metadata, createdAt: 'yesterday' },
      { ...metadata, appVersion: 1 },
      { ...metadata, sourceOperation: 'merge-library' },
      { ...metadata, databaseGeneration: 'short' },
      { ...metadata, byteLength: -1 },
      { ...metadata, sha256: 'short' },
    ]
    for (const invalid of malformedMetadata) {
      await expect(getIpcHandler('desktop-recovery:write')(null, { metadata: invalid, bytes: new Uint8Array() })).rejects.toThrow()
    }
    await expect(getIpcHandler('desktop-recovery:write')(null, { metadata, bytes: 'not-bytes' })).rejects.toThrow('bytes')
    await expect(getIpcHandler('desktop-recovery:write')(null, { metadata, bytes: new Uint8Array([1, 2]) })).rejects.toThrow('byte length')
    fsMocks.readFile.mockResolvedValueOnce(JSON.stringify({ ...metadata, id: 'recovery-2' })).mockResolvedValueOnce(Buffer.from([1, 2, 3]))
    await expect(getIpcHandler('desktop-recovery:read')(null, metadata.id)).rejects.toThrow('filename')
    fsMocks.readdir.mockResolvedValueOnce(['wrong-name.json'])
    fsMocks.readFile.mockResolvedValueOnce(JSON.stringify(metadata))
    await expect(getIpcHandler('desktop-recovery:list')()).rejects.toThrow('filename')
  })

  it('cleans temporary files when a write fails and propagates non-missing list errors', async () => {
    fsMocks.writeFile.mockRejectedValueOnce(new Error('disk full'))
    await expect(getIpcHandler('desktop-recovery:write')(null, { metadata, bytes: new Uint8Array([1, 2, 3]) })).rejects.toThrow('disk full')
    expect(fsMocks.rm).toHaveBeenCalledTimes(2)
    fsMocks.readdir.mockRejectedValueOnce(new Error('denied'))
    await expect(getIpcHandler('desktop-recovery:list')()).rejects.toThrow('denied')
  })
})
