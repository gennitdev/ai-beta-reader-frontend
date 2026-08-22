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
    expect(safeStorage.decryptStringAsync).toHaveBeenCalledWith(Buffer.from('encrypted:secret-value'))
    expect(safeStorage.decryptString).not.toHaveBeenCalled()
  })

  it('treats unavailable encryption and unreadable payloads as missing values', async () => {
    fsMocks.readFile.mockResolvedValue(Buffer.from('encrypted:secret-value'))
    safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false)
    await expect(getIpcHandler('secure-storage:get')(null, 'googleOAuthTokens')).resolves.toBeNull()
    expect(safeStorage.decryptStringAsync).not.toHaveBeenCalled()

    safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(true)
    fsMocks.readFile.mockRejectedValueOnce(new Error('missing'))
    await expect(getIpcHandler('secure-storage:get')(null, 'googleOAuthTokens')).resolves.toBeNull()

    fsMocks.readFile.mockResolvedValueOnce(Buffer.from('obsolete-payload'))
    safeStorage.decryptStringAsync.mockRejectedValueOnce(new Error('could not decrypt'))
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
    expect(safeStorage.encryptStringAsync).toHaveBeenCalledWith('secret-value')
    expect(safeStorage.encryptString).not.toHaveBeenCalled()
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      path.join(secureDirectory, 'openai_api_key.bin'),
      Buffer.from('encrypted:secret-value'),
      { mode: 0o600 },
    )
  })

  it('rejects writes when OS encryption is unavailable', async () => {
    safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false)

    await expect(getIpcHandler('secure-storage:set')(
      null,
      'googleOAuthTokens',
      'secret-value',
    )).rejects.toThrow('OS-level encryption is not available')
    expect(fsMocks.mkdir).not.toHaveBeenCalled()
    expect(fsMocks.writeFile).not.toHaveBeenCalled()
  })

  it('times out instead of hanging when the OS credential store does not respond', async () => {
    vi.useFakeTimers()
    safeStorage.isAsyncEncryptionAvailable.mockReturnValue(new Promise(() => {}))

    try {
      const write = getIpcHandler('secure-storage:set')(
        null,
        'googleOAuthTokens',
        'secret-value',
      ) as Promise<void>
      const rejection = expect(write).rejects.toThrow(
        'Timed out waiting for OS secure storage',
      )

      await vi.advanceTimersByTimeAsync(30_000)
      await rejection
      expect(fsMocks.mkdir).not.toHaveBeenCalled()
      expect(fsMocks.writeFile).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('times out instead of hanging when asynchronous encryption does not respond', async () => {
    vi.useFakeTimers()
    safeStorage.encryptStringAsync.mockReturnValue(new Promise(() => {}))

    try {
      const write = getIpcHandler('secure-storage:set')(
        null,
        'googleOAuthTokens',
        'secret-value',
      ) as Promise<void>
      const rejection = expect(write).rejects.toThrow(
        'Timed out waiting for OS secure storage',
      )

      await vi.advanceTimersByTimeAsync(30_000)
      await rejection
      expect(fsMocks.mkdir).toHaveBeenCalled()
      expect(fsMocks.writeFile).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('times out instead of hanging when asynchronous decryption does not respond', async () => {
    vi.useFakeTimers()
    fsMocks.readFile.mockResolvedValue(Buffer.from('encrypted:secret-value'))
    safeStorage.decryptStringAsync.mockReturnValue(new Promise(() => {}))

    try {
      const read = getIpcHandler('secure-storage:get')(
        null,
        'googleOAuthTokens',
      ) as Promise<string | null>
      const rejection = expect(read).rejects.toThrow(
        'Timed out waiting for OS secure storage',
      )

      await vi.advanceTimersByTimeAsync(30_000)
      await rejection
    } finally {
      vi.useRealTimers()
    }
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
