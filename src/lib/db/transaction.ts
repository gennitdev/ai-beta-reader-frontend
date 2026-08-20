import type { DatabaseContext } from './connection'

async function executeTransactionStatement(ctx: DatabaseContext, sql: string): Promise<void> {
  if (ctx.isNative) await ctx.connection.execute(sql)
  else ctx.connection.run(sql)
}

/** Run related mutations atomically without persisting an intermediate state. */
export async function runInTransaction<T>(
  ctx: DatabaseContext,
  operation: (transactionContext: DatabaseContext) => Promise<T>,
): Promise<T> {
  let transactionStarted = false
  const transactionContext: DatabaseContext = {
    ...ctx,
    requestPersistence: () => undefined,
    flushPersistence: async () => undefined,
  }

  try {
    if (ctx.isNative && ctx.connection.beginTransaction) await ctx.connection.beginTransaction()
    else await executeTransactionStatement(ctx, 'BEGIN TRANSACTION')
    transactionStarted = true

    const result = await operation(transactionContext)

    if (ctx.isNative && ctx.connection.commitTransaction) await ctx.connection.commitTransaction()
    else await executeTransactionStatement(ctx, 'COMMIT')
    transactionStarted = false
    return result
  } catch (error) {
    if (transactionStarted) {
      try {
        if (ctx.isNative && ctx.connection.rollbackTransaction) await ctx.connection.rollbackTransaction()
        else await executeTransactionStatement(ctx, 'ROLLBACK')
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Database operation and rollback both failed')
      }
    }
    throw error
  }
}
