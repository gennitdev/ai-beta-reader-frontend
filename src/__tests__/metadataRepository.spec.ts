import { describe, expect, it, vi } from 'vitest'
import type { AppDatabaseConnection, DatabaseContext } from '@/lib/db/connection'
import * as metadataRepo from '@/lib/db/metadataRepository'

/**
 * These tests exercise the metadata repository in isolation — no AppDatabase,
 * no real SQLite — which is the point of the split: data-access logic can be
 * verified against a fake connection. They drive the synchronous web/desktop
 * path (isNative: false).
 */

interface ExecResult {
  columns: string[]
  values: unknown[][]
}

/** Build a DatabaseContext backed by a scripted fake connection. */
function makeContext(execResults: ExecResult[][] = []) {
  const runCalls: Array<{ sql: string; params?: unknown[] }> = []
  const execCalls: Array<{ sql: string; params?: unknown[] }> = []
  const requestPersistence = vi.fn()
  const flushPersistence = vi.fn(async () => undefined)
  let execIndex = 0

  const connection: AppDatabaseConnection = {
    open: async () => {},
    close: () => {},
    execute: async () => undefined,
    run: (sql: string, params?: unknown[]) => {
      runCalls.push({ sql, params })
    },
    query: async () => ({ values: [] }),
    exec: (sql: string, params?: unknown[]) => {
      execCalls.push({ sql, params })
      return execResults[execIndex++] ?? []
    },
    export: () => new Uint8Array(),
    exportToJson: async () => undefined,
    prepare: () => {
      throw new Error('not used in these tests')
    },
  }

  const ctx: DatabaseContext = {
    connection,
    isNative: false,
    requestPersistence,
    flushPersistence,
    setImporting: vi.fn(),
  }

  return { ctx, runCalls, execCalls, requestPersistence, flushPersistence }
}

describe('metadataRepository (web path)', () => {
  it('saveSummary inserts and requests persistence', async () => {
    const { ctx, runCalls, requestPersistence } = makeContext()

    await metadataRepo.saveSummary(ctx, {
      chapter_id: 'ch-1',
      summary: 'A tense confrontation.',
      pov: 'Mara',
      characters: ['Mara', 'Bram'],
      beats: ['beat-1', 'beat-2'],
      spoilers_ok: true,
    })

    expect(runCalls).toHaveLength(1)
    expect(runCalls[0].sql).toContain('INSERT OR REPLACE INTO chapter_summaries')
    // characters/beats are JSON-encoded; spoilers_ok maps to 1
    expect(runCalls[0].params).toEqual(
      expect.arrayContaining([
        'ch-1',
        'A tense confrontation.',
        'Mara',
        JSON.stringify(['Mara', 'Bram']),
        JSON.stringify(['beat-1', 'beat-2']),
        1,
      ]),
    )
    expect(requestPersistence).toHaveBeenCalledOnce()
  })

  it('getSummary maps a positional row to a ChapterSummary', async () => {
    const row = ['sum-1', 'ch-1', 'the summary', 'Mara', '["Mara"]', '["beat"]', 1, 'created', 'updated']
    const { ctx } = makeContext([[{ columns: [], values: [row] }]])

    const summary = await metadataRepo.getSummary(ctx, 'ch-1')

    expect(summary).toEqual({
      id: 'sum-1',
      chapter_id: 'ch-1',
      summary: 'the summary',
      pov: 'Mara',
      characters: '["Mara"]',
      beats: '["beat"]',
      spoilers_ok: true,
      created_at: 'created',
      updated_at: 'updated',
      generated_by: null,
      model: null,
    })
  })

  it('getSummary returns null when no rows match', async () => {
    const { ctx } = makeContext([[]])
    expect(await metadataRepo.getSummary(ctx, 'missing')).toBeNull()
  })

  it('createCustomProfile returns the generated numeric id', async () => {
    const { ctx, runCalls, requestPersistence } = makeContext()

    const id = await metadataRepo.createCustomProfile(ctx, {
      name: 'Kindly Editor',
      description: 'Gentle but honest.',
    })

    expect(typeof id).toBe('number')
    expect(runCalls[0].sql).toContain('INSERT INTO custom_reviewer_profiles')
    expect(requestPersistence).toHaveBeenCalledOnce()
  })

  it('deleteCustomProfile also removes reviews that reference the profile', async () => {
    const { ctx, runCalls, requestPersistence, flushPersistence } = makeContext()

    await metadataRepo.deleteCustomProfile(ctx, 42)

    expect(runCalls.map((c) => c.sql)).toEqual([
      'BEGIN TRANSACTION',
      expect.stringContaining('DELETE FROM chapter_reviews WHERE profile_id = ?'),
      expect.stringContaining('DELETE FROM custom_reviewer_profiles WHERE id = ?'),
      'COMMIT',
    ])
    expect(runCalls[1].params).toEqual([42])
    expect(runCalls[2].params).toEqual([42])
    // Web path persists once after the mutation batch.
    expect(requestPersistence).toHaveBeenCalledOnce()
    expect(flushPersistence).toHaveBeenCalledOnce()
  })

  it('does not report profile deletion as durable when snapshot persistence fails', async () => {
    const { ctx, flushPersistence } = makeContext()
    const persistenceError = new Error('IndexedDB unavailable')
    flushPersistence.mockRejectedValueOnce(persistenceError)

    await expect(metadataRepo.deleteCustomProfile(ctx, 42)).rejects.toBe(persistenceError)
  })

  it('updateCustomProfile only sets provided fields', async () => {
    const { ctx, runCalls } = makeContext()

    await metadataRepo.updateCustomProfile(ctx, 7, { name: 'Renamed' })

    expect(runCalls[0].sql).toContain('name = ?')
    expect(runCalls[0].sql).not.toContain('description = ?')
    // params: name, updated_at, id
    expect(runCalls[0].params?.[0]).toBe('Renamed')
    expect(runCalls[0].params?.[runCalls[0].params.length - 1]).toBe(7)
  })
})
