// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'

const storageMocks = vi.hoisted(() => ({
  databaseSnapshot: undefined as Uint8Array | ArrayBuffer | undefined,
  read: vi.fn(async (storeName: string, key: IDBValidKey) => {
    if (storeName === 'database' && key === 'sqliteDb') return storageMocks.databaseSnapshot
    return undefined
  }),
  write: vi.fn(async () => undefined),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'web'),
    isNativePlatform: vi.fn(() => false),
  },
}))
vi.mock('sql.js', async () => {
  const actual = await vi.importActual<typeof import('sql.js')>('sql.js')
  return {
    default: vi.fn(() => actual.default()),
  }
})
vi.mock('@/lib/indexedDbStorage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/indexedDbStorage')>('@/lib/indexedDbStorage')
  return {
    ...actual,
    readIndexedDbValue: storageMocks.read,
    writeIndexedDbValue: storageMocks.write,
  }
})

import { AppDatabase } from '@/lib/database'

describe('AppDatabase initialization failure safety', () => {
  beforeEach(() => {
    localStorage.clear()
    storageMocks.databaseSnapshot = undefined
    storageMocks.read.mockClear()
    storageMocks.write.mockReset()
    storageMocks.write.mockResolvedValue(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('rejects a corrupt IndexedDB snapshot instead of replacing it with an empty database', async () => {
    storageMocks.databaseSnapshot = new Uint8Array([1, 2, 3, 4])

    await expect(new AppDatabase().init()).rejects.toThrow(
      'The database stored in IndexedDB could not be opened. No empty replacement was created.',
    )

    expect(storageMocks.write).not.toHaveBeenCalled()
  })

  it('does not create a replacement database when IndexedDB cannot be read', async () => {
    storageMocks.read.mockRejectedValueOnce(new Error('IndexedDB is blocked'))

    await expect(new AppDatabase().init()).rejects.toThrow('IndexedDB is blocked')

    expect(storageMocks.write).not.toHaveBeenCalled()
  })

  it('rejects malformed legacy storage without deleting the recovery copy', async () => {
    localStorage.setItem('sqliteDb', '[0, 999]')

    await expect(new AppDatabase().init()).rejects.toThrow(
      'The legacy local database could not be read. It was left unchanged so it can be recovered.',
    )

    expect(localStorage.getItem('sqliteDb')).toBe('[0, 999]')
    expect(storageMocks.write).not.toHaveBeenCalled()
  })

  it('retains the legacy copy when the verified IndexedDB migration write fails', async () => {
    const SQL = await initSqlJs()
    const legacyBytes = new SQL.Database().export()
    localStorage.setItem('sqliteDb', JSON.stringify(Array.from(legacyBytes)))
    storageMocks.write.mockRejectedValueOnce(new Error('quota exceeded'))

    await expect(new AppDatabase().init()).rejects.toThrow(
      'The legacy database opened successfully but could not be copied safely to IndexedDB.',
    )

    expect(localStorage.getItem('sqliteDb')).not.toBeNull()
    expect(localStorage.getItem('sqliteDbMigratedToIndexedDB')).toBeNull()
  })

  it('retains the legacy copy when the migrated snapshot reads back corrupt', async () => {
    const SQL = await initSqlJs()
    const legacyBytes = new SQL.Database().export()
    localStorage.setItem('sqliteDb', JSON.stringify(Array.from(legacyBytes)))
    storageMocks.read
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3, 4]))

    await expect(new AppDatabase().init()).rejects.toThrow(
      'The legacy database opened successfully but could not be copied safely to IndexedDB.',
    )

    expect(storageMocks.write).toHaveBeenCalledOnce()
    expect(localStorage.getItem('sqliteDb')).not.toBeNull()
    expect(localStorage.getItem('sqliteDbMigratedToIndexedDB')).toBeNull()
  })
})
