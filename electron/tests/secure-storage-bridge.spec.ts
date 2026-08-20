import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerSecureStorageBridge } from '../src/secure-storage-bridge'
import {
  getIpcHandler,
  ipcMain,
  resetElectronMock,
  safeStorage,
} from './mocks/electron'

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => fsMocks)

describe('Electron secure-storage bridge runtime', () => {
  beforeEach(() => {
    resetElectronMock()
    fsMocks.mkdir.mockResolvedValue(undefined)
    fsMocks.rm.mockResolvedValue(undefined)
    fsMocks.writeFile.mockResolvedValue(undefined)
    registerSecureStorageBridge()
  })

  it('registers the complete secure-storage IPC surface', () => {
    expect(ipcMain.handle.mock.calls.map(([channel]) => channel)).toEqual([
      'secure-storage:get',
      'secure-storage:set',
      'secure-storage:remove',
    ])
  })

  it('returns decrypted application secrets', async () => {
    fsMocks.readFile.mockResolvedValue(Buffer.from('encrypted:secret-value'))

    await expect(getIpcHandler('secure-storage:get')(null, 'openai_api_key')).resolves.toBe('secret-value')
    expect(fsMocks.readFile).toHaveBeenCalledWith(path.join(
      '/tmp/beta-bot-user-data',
      'secure',
      'openai_api_key.bin',
    ))
    expect(safeStorage.decryptString).toHaveBeenCalledWith(Buffer.from('encrypted:secret-value'))
  })

  it('treats unavailable encryption and unreadable payloads as missing values', async () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(false)
    await expect(getIpcHandler('secure-storage:get')(null, 'googleOAuthTokens')).resolves.toBeNull()
    expect(fsMocks.readFile).not.toHaveBeenCalled()

    safeStorage.isEncryptionAvailable.mockReturnValue(true)
    fsMocks.readFile.mockRejectedValueOnce(new Error('missing'))
    await expect(getIpcHandler('secure-storage:get')(null, 'googleOAuthTokens')).resolves.toBeNull()
  })

  it('encrypts and writes secrets with owner-only permissions', async () => {
    await expect(getIpcHandler('secure-storage:set')(
      null,
      'openai_api_key',
      'secret-value',
    )).resolves.toBeUndefined()

    const secureDirectory = path.join('/tmp/beta-bot-user-data', 'secure')
    expect(fsMocks.mkdir).toHaveBeenCalledWith(secureDirectory, { recursive: true })
    expect(safeStorage.encryptString).toHaveBeenCalledWith('secret-value')
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      path.join(secureDirectory, 'openai_api_key.bin'),
      Buffer.from('encrypted:secret-value'),
      { mode: 0o600 },
    )
  })

  it('rejects writes when OS encryption is unavailable', async () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(false)

    await expect(getIpcHandler('secure-storage:set')(
      null,
      'googleOAuthTokens',
      'secret-value',
    )).rejects.toThrow('OS-level encryption is not available')
    expect(fsMocks.mkdir).not.toHaveBeenCalled()
    expect(fsMocks.writeFile).not.toHaveBeenCalled()
  })

  it('rejects unowned keys and oversized values at the IPC boundary', async () => {
    expect(() => getIpcHandler('secure-storage:get')(null, '../../outside')).toThrow()
    await expect(getIpcHandler('secure-storage:set')(
      null,
      'openai_api_key',
      'x'.repeat(65 * 1024),
    )).rejects.toThrow(/too large/)
    expect(() => getIpcHandler('secure-storage:remove')(null, 'arbitrary-key')).toThrow()
  })

  it('removes only validated application secret files', async () => {
    await expect(getIpcHandler('secure-storage:remove')(
      null,
      'googleOAuthTokens',
    )).resolves.toBeUndefined()
    expect(fsMocks.rm).toHaveBeenCalledWith(
      path.join('/tmp/beta-bot-user-data', 'secure', 'googleOAuthTokens.bin'),
      { force: true },
    )
  })
})
