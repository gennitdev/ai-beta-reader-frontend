import { beforeAll, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import type { AppDatabaseConnection, DatabaseContext } from '@/lib/db/connection'
import { finalizeLegacyImageMigration } from '@/lib/db/imageRepository'

let SQL: SqlJsStatic

beforeAll(async () => {
  SQL = await initSqlJs()
})

function createDatabase(): Database {
  const database = new SQL.Database()
  database.run(`
    CREATE TABLE image_assets (
      id TEXT PRIMARY KEY,
      image_data TEXT,
      content_hash TEXT,
      content_hash_algorithm TEXT,
      content_byte_length INTEGER
    );
    INSERT INTO image_assets (id, image_data) VALUES
      ('one', 'data:image/png;base64,AQID'),
      ('two', 'data:image/png;base64,BAUG');
  `)
  return database
}

function context(connection: AppDatabaseConnection) {
  const requestPersistence = vi.fn()
  const flushPersistence = vi.fn(async () => undefined)
  const ctx: DatabaseContext = {
    connection,
    isNative: false,
    requestPersistence,
    flushPersistence,
    setImporting: vi.fn(),
  }
  return { ctx, flushPersistence, requestPersistence }
}

const oneIntegrity = {
  content_hash: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
  content_hash_algorithm: 'sha256-v1' as const,
  content_byte_length: 3,
}

const twoIntegrity = {
  content_hash: '787c798e39a5bc1910355bae6d0cd87a36b2e10fd0202a83e3bb6b005da83472',
  content_hash_algorithm: 'sha256-v1' as const,
  content_byte_length: 3,
}

describe('finalizeLegacyImageMigration', () => {
  it('atomically records verified hashes and clears legacy bytes', async () => {
    const database = createDatabase()
    const { ctx, flushPersistence, requestPersistence } = context(
      database as unknown as AppDatabaseConnection,
    )

    await finalizeLegacyImageMigration(ctx, [
      { id: 'one', integrity: oneIntegrity },
      { id: 'two', integrity: twoIntegrity },
    ])

    const result = database.exec(`
      SELECT id, image_data, content_hash, content_hash_algorithm, content_byte_length
      FROM image_assets ORDER BY id
    `)[0].values
    expect(result).toEqual([
      ['one', null, oneIntegrity.content_hash, 'sha256-v1', 3],
      ['two', null, twoIntegrity.content_hash, 'sha256-v1', 3],
    ])
    expect(requestPersistence).toHaveBeenCalledOnce()
    expect(flushPersistence).toHaveBeenCalledOnce()
  })

  it('rolls back the whole batch when any metadata update fails', async () => {
    const database = createDatabase()
    const connection = {
      run: vi.fn((sql: string, params?: unknown[]) => {
        if (sql.includes('UPDATE image_assets') && params?.[3] === 'two') {
          throw new Error('simulated write failure')
        }
        database.run(sql, params)
      }),
      exec: database.exec.bind(database),
    } as unknown as AppDatabaseConnection
    const { ctx, flushPersistence, requestPersistence } = context(connection)

    await expect(finalizeLegacyImageMigration(ctx, [
      { id: 'one', integrity: oneIntegrity },
      { id: 'two', integrity: twoIntegrity },
    ])).rejects.toThrow('simulated write failure')

    expect(database.exec(
      'SELECT id, image_data, content_hash FROM image_assets ORDER BY id',
    )[0].values).toEqual([
      ['one', 'data:image/png;base64,AQID', null],
      ['two', 'data:image/png;base64,BAUG', null],
    ])
    expect(requestPersistence).not.toHaveBeenCalled()
    expect(flushPersistence).not.toHaveBeenCalled()
  })

  it('does not request persistence for an empty batch', async () => {
    const database = createDatabase()
    const { ctx, flushPersistence, requestPersistence } = context(
      database as unknown as AppDatabaseConnection,
    )

    await finalizeLegacyImageMigration(ctx, [])

    expect(requestPersistence).not.toHaveBeenCalled()
    expect(flushPersistence).not.toHaveBeenCalled()
  })
})
