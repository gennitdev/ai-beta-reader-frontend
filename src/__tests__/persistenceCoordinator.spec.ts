import { describe, expect, it, vi } from 'vitest'
import {
  decodeLegacyDatabaseSnapshot,
  PersistenceCoordinator,
} from '@/lib/persistenceCoordinator'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

describe('PersistenceCoordinator', () => {
  it('serializes writes and coalesces mutations to the latest snapshot', async () => {
    let revision = 1
    const firstWrite = deferred<void>()
    const snapshots: number[] = []
    const writeSnapshot = vi.fn(async (snapshot: Uint8Array) => {
      snapshots.push(snapshot[0])
      if (snapshots.length === 1) await firstWrite.promise
    })
    const coordinator = new PersistenceCoordinator({
      exportSnapshot: () => new Uint8Array([revision]),
      writeSnapshot,
    })

    coordinator.request()
    revision = 2
    coordinator.request()
    revision = 3
    coordinator.request()

    expect(snapshots).toEqual([1])
    expect(coordinator.hasPendingChanges()).toBe(true)

    firstWrite.resolve()
    await coordinator.flush()

    expect(snapshots).toEqual([1, 3])
    expect(writeSnapshot).toHaveBeenCalledTimes(2)
    expect(coordinator.hasPendingChanges()).toBe(false)
  })

  it('keeps changes pending after a failed write and retries on flush', async () => {
    let shouldFail = true
    const onBackgroundError = vi.fn()
    const writeSnapshot = vi.fn(async () => {
      if (shouldFail) throw new Error('quota exceeded')
    })
    const coordinator = new PersistenceCoordinator({
      exportSnapshot: () => new Uint8Array([42]),
      writeSnapshot,
      onBackgroundError,
    })

    coordinator.request()
    await vi.waitFor(() => expect(onBackgroundError).toHaveBeenCalledOnce())
    expect(coordinator.hasPendingChanges()).toBe(true)

    shouldFail = false
    await coordinator.flush()

    expect(writeSnapshot).toHaveBeenCalledTimes(2)
    expect(coordinator.hasPendingChanges()).toBe(false)
  })

  it('resolves flush immediately when no changes are pending', async () => {
    const writeSnapshot = vi.fn(async () => undefined)
    const coordinator = new PersistenceCoordinator({
      exportSnapshot: () => new Uint8Array([1]),
      writeSnapshot,
    })

    await coordinator.flush()

    expect(writeSnapshot).not.toHaveBeenCalled()
  })
})

describe('decodeLegacyDatabaseSnapshot', () => {
  it('decodes the legacy JSON byte-array format', () => {
    expect(decodeLegacyDatabaseSnapshot('[0,1,127,255]')).toEqual(
      new Uint8Array([0, 1, 127, 255]),
    )
  })

  it('decodes the legacy base64 format', () => {
    expect(decodeLegacyDatabaseSnapshot('AAH//g==')).toEqual(
      new Uint8Array([0, 1, 255, 254]),
    )
  })

  it('rejects invalid JSON byte values', () => {
    expect(() => decodeLegacyDatabaseSnapshot('[0,256]')).toThrow(
      'Legacy database JSON must contain byte values.',
    )
  })
})
