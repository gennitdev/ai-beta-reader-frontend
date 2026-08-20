import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  init: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/lib/database', () => ({ db: { init: mocks.init } }))
vi.mock('@/lib/cloudSync', () => ({
  CloudSync: vi.fn(),
  GoogleDriveProvider: vi.fn(),
}))

describe('database initialization recovery', () => {
  beforeEach(() => {
    mocks.init.mockReset()
  })

  it('allows a clean retry after initialization rejects', async () => {
    mocks.init
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValueOnce(undefined)
    const { initializeDatabase } = await import('@/composables/useDatabase')

    await expect(initializeDatabase()).rejects.toThrow('IndexedDB unavailable')
    await expect(initializeDatabase()).resolves.toBeUndefined()

    expect(mocks.init).toHaveBeenCalledTimes(2)
  })
})
