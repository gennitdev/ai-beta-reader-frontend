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

    expect(runCalls).toHaveLength(4)
    expect(runCalls[0].sql).toBe('BEGIN TRANSACTION')
    expect(runCalls[1].sql).toContain('INSERT OR REPLACE INTO chapter_summaries')
    // characters/beats are JSON-encoded; spoilers_ok maps to 1
    expect(runCalls[1].params).toEqual(
      expect.arrayContaining([
        'ch-1',
        'A tense confrontation.',
        'Mara',
        JSON.stringify(['Mara', 'Bram']),
        JSON.stringify(['beat-1', 'beat-2']),
        1,
      ]),
    )
    expect(runCalls[2]).toEqual({
      sql: expect.stringContaining('DELETE FROM chapter_summaries'),
      params: ['ch-1', expect.stringMatching(/^summary-ch-1-/)],
    })
    expect(runCalls[3].sql).toBe('COMMIT')
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

  it('orders chapter and part summary reads by recency with a deterministic id tie-break', async () => {
    const chapterRow = ['sum-z', 'ch-1', 'current', null, '[]', '[]', 0, 'created', 'updated']
    const partRow = ['part-sum-z', 'part-1', 'current', '[]', '[]', 'created', 'updated']
    const { ctx, execCalls } = makeContext([
      [{ columns: [], values: [chapterRow] }],
      [{ columns: [], values: [partRow] }],
    ])

    await metadataRepo.getSummary(ctx, 'ch-1')
    await metadataRepo.getPartSummary(ctx, 'part-1')

    for (const call of execCalls) {
      expect(call.sql).toContain("ORDER BY COALESCE(updated_at, created_at, '') DESC")
      expect(call.sql).toContain("COALESCE(created_at, '') DESC")
      expect(call.sql).toContain('id DESC')
    }
  })

  it('updates the current chapter summary and removes stale duplicates atomically', async () => {
    const existing = [
      'summary-current', 'ch-1', 'old', 'Mara', '[]', '[]', 1,
      '2026-08-20T12:00:00.000Z', '2026-08-21T12:00:00.000Z', 'ai', 'old-model',
    ]
    const { ctx, runCalls, requestPersistence } = makeContext([
      [{ columns: [], values: [existing] }],
    ])

    await metadataRepo.saveSummary(ctx, {
      chapter_id: 'ch-1', summary: 'edited', pov: 'Mara', characters: [], beats: [],
      spoilers_ok: true,
    })

    expect(runCalls[1].params?.[0]).toBe('summary-current')
    expect(runCalls[1].params?.[7]).toBe('2026-08-20T12:00:00.000Z')
    expect(runCalls[1].params?.slice(-2)).toEqual(['ai', 'old-model'])
    expect(runCalls[2]).toEqual({
      sql: expect.stringContaining('DELETE FROM chapter_summaries'),
      params: ['ch-1', 'summary-current'],
    })
    expect(requestPersistence).toHaveBeenCalledOnce()
  })

  it('updates the current part summary and removes stale duplicates atomically', async () => {
    const existing = [
      'legacy-current', 'part-1', 'old', '[]', '[]',
      '2026-08-20T12:00:00.000Z', '2026-08-21T12:00:00.000Z', 'user', null,
    ]
    const { ctx, runCalls, requestPersistence } = makeContext([
      [{ columns: [], values: [existing] }],
    ])

    await metadataRepo.savePartSummary(ctx, {
      part_id: 'part-1', summary: 'edited', characters: [], beats: [],
    })

    expect(runCalls[1].params?.[0]).toBe('legacy-current')
    expect(runCalls[2]).toEqual({
      sql: expect.stringContaining('DELETE FROM part_summaries'),
      params: ['part-1', 'legacy-current'],
    })
    expect(requestPersistence).toHaveBeenCalledOnce()
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
