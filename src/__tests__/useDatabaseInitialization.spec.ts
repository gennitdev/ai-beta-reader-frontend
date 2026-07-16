import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  init: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/lib/database', () => ({
  db: {
    init: mocks.init,
  },
}))

vi.mock('@/lib/cloudSync', () => ({
  CloudSync: vi.fn(),
  GoogleDriveProvider: vi.fn(),
}))

import { initializeDatabase } from '@/composables/useDatabase'

describe('initializeDatabase', () => {
  beforeEach(() => {
    mocks.init.mockReset()
  })

  it('shares one in-flight initialization between concurrent callers', async () => {
    let finishInitialization: (() => void) | undefined
    mocks.init.mockImplementation(
      () => new Promise<void>((resolve) => {
        finishInitialization = resolve
      }),
    )

    const first = initializeDatabase()
    const second = initializeDatabase()

    expect(mocks.init).toHaveBeenCalledTimes(1)

    finishInitialization?.()
    await Promise.all([first, second])
    await initializeDatabase()

    expect(mocks.init).toHaveBeenCalledTimes(1)
  })
})
