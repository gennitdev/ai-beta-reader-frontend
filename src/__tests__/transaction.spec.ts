import { describe, expect, it, vi } from 'vitest'
import type { AppDatabaseConnection, DatabaseContext } from '@/lib/db/connection'
import { runInTransaction } from '@/lib/db/transaction'

function context(connection: Partial<AppDatabaseConnection>, isNative = true): DatabaseContext {
  return {
    connection: connection as AppDatabaseConnection,
    isNative,
    requestPersistence: vi.fn(),
    flushPersistence: vi.fn(async () => undefined),
    setImporting: vi.fn(),
  }
}

describe('runInTransaction', () => {
  it('uses the native transaction API and suppresses intermediate persistence', async () => {
    const connection = {
      beginTransaction: vi.fn(async () => undefined),
      commitTransaction: vi.fn(async () => undefined),
      rollbackTransaction: vi.fn(async () => undefined),
    }
    const ctx = context(connection)

    await expect(runInTransaction(ctx, async (txCtx) => {
      txCtx.requestPersistence()
      await txCtx.flushPersistence()
      return 'done'
    })).resolves.toBe('done')

    expect(connection.beginTransaction).toHaveBeenCalledOnce()
    expect(connection.commitTransaction).toHaveBeenCalledOnce()
    expect(connection.rollbackTransaction).not.toHaveBeenCalled()
    expect(ctx.requestPersistence).not.toHaveBeenCalled()
    expect(ctx.flushPersistence).not.toHaveBeenCalled()
  })

  it('rolls back a failed native operation and preserves its error', async () => {
    const failure = new Error('mutation failed')
    const connection = {
      beginTransaction: vi.fn(async () => undefined),
      commitTransaction: vi.fn(async () => undefined),
      rollbackTransaction: vi.fn(async () => undefined),
    }

    await expect(runInTransaction(context(connection), async () => {
      throw failure
    })).rejects.toBe(failure)
    expect(connection.rollbackTransaction).toHaveBeenCalledOnce()
    expect(connection.commitTransaction).not.toHaveBeenCalled()
  })

  it('falls back to transaction SQL when native helpers are unavailable', async () => {
    const connection = { execute: vi.fn(async () => undefined) }

    await runInTransaction(context(connection), async () => undefined)

    expect(connection.execute).toHaveBeenNthCalledWith(1, 'BEGIN TRANSACTION')
    expect(connection.execute).toHaveBeenNthCalledWith(2, 'COMMIT')
  })

  it('reports both the operation and rollback errors', async () => {
    const operationError = new Error('mutation failed')
    const rollbackError = new Error('rollback failed')
    const connection = {
      beginTransaction: vi.fn(async () => undefined),
      rollbackTransaction: vi.fn(async () => { throw rollbackError }),
    }

    const error = await runInTransaction(context(connection), async () => {
      throw operationError
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([operationError, rollbackError])
  })
})
