import { describe, expect, it, vi } from 'vitest'
import {
  completeCanonicalLibraryFixture,
  completeDatabaseExportFixture,
} from '@/__tests__/fixtures/libraryBundle'
import { createCanonicalLibrarySnapshot } from '@/lib/libraryBundle/snapshot'
import { writeLibraryBundle } from '@/lib/libraryBundle/write'

describe('createCanonicalLibrarySnapshot', () => {
  it('maps every current backup table to its canonical entity without losing metadata', async () => {
    const readAssetBytes = vi.fn(async () => new Uint8Array([1, 2, 3]))
    const snapshot = await createCanonicalLibrarySnapshot(completeDatabaseExportFixture(), {
      readAssetBytes,
    })

    expect(snapshot).toEqual(completeCanonicalLibraryFixture())
    expect(readAssetBytes).toHaveBeenCalledWith(expect.objectContaining({
      id: 'image-1', file_path: 'images/cover.png', image_data: null,
    }))
  })

  it('reads legacy embedded image data when no external content reader is needed', async () => {
    const database = completeDatabaseExportFixture()
    database.image_assets[0] = {
      ...(database.image_assets[0] as Record<string, unknown>),
      image_data: 'data:image/png;base64,AQID',
    }
    const snapshot = await createCanonicalLibrarySnapshot(database)
    expect(snapshot.assets[0].bytes).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('fails a full snapshot instead of silently omitting unreadable image bytes', async () => {
    await expect(createCanonicalLibrarySnapshot(completeDatabaseExportFixture())).rejects.toThrow(
      /missing required bytes/,
    )
  })

  it('normalizes nullable legacy collection fields without inventing values', async () => {
    const database = completeDatabaseExportFixture()
    database.books[0] = {
      ...(database.books[0] as Record<string, unknown>),
      chapter_order: null,
      part_order: null,
    }
    database.chapter_summaries[0] = {
      ...(database.chapter_summaries[0] as Record<string, unknown>),
      characters: null,
      spoilers_ok: null,
    }
    database.image_assets[0] = {
      ...(database.image_assets[0] as Record<string, unknown>),
      notes: null,
      image_data: 'data:image/png;base64,AQID',
    }
    database.chapter_wiki_mentions = []
    database.image_wiki_tags = []

    const snapshot = await createCanonicalLibrarySnapshot(database)
    expect(snapshot.books[0]).toMatchObject({ chapter_order: [], part_order: [] })
    expect(snapshot.chapter_summaries[0]).toMatchObject({ characters: [], spoilers_ok: null })
    expect(snapshot.chapters[0].wiki_mentions).toEqual([])
    expect(snapshot.assets[0]).toMatchObject({ notes: '', wiki_page_ids: [] })
  })

  it('normalizes legacy character objects in chapter and part summaries', async () => {
    const database = completeDatabaseExportFixture()
    database.chapter_summaries[0] = {
      ...(database.chapter_summaries[0] as Record<string, unknown>),
      characters: JSON.stringify(['Alice', { name: 'Bob' }]),
    }
    database.part_summaries[0] = {
      ...(database.part_summaries[0] as Record<string, unknown>),
      characters: [{ name: 'Carol' }, 'Dan'],
    }

    const snapshot = await createCanonicalLibrarySnapshot(database, {
      readAssetBytes: async () => new Uint8Array([1, 2, 3]),
    })

    expect(snapshot.chapter_summaries[0].characters).toEqual(['Alice', 'Bob'])
    expect(snapshot.part_summaries[0].characters).toEqual(['Carol', 'Dan'])
  })

  it('selects one deterministic current summary per chapter and part', async () => {
    const database = completeDatabaseExportFixture()
    database.chapter_summaries.push(
      {
        ...(database.chapter_summaries[0] as Record<string, unknown>),
        id: 'summary-newer',
        summary: 'The current chapter summary.',
        created_at: '2026-08-21T12:00:00.000Z',
        updated_at: '2026-08-21T13:00:00.000Z',
      },
      {
        ...(database.chapter_summaries[0] as Record<string, unknown>),
        id: 'summary-newer-z',
        summary: 'The deterministic tie winner.',
        created_at: '2026-08-21T12:00:00.000Z',
        updated_at: '2026-08-21T13:00:00.000Z',
      },
    )
    database.part_summaries.push({
      ...(database.part_summaries[0] as Record<string, unknown>),
      id: 'part-summary-newer',
      summary: 'The current part summary.',
      updated_at: '2026-08-21T13:00:00.000Z',
    })

    const snapshot = await createCanonicalLibrarySnapshot(database, {
      readAssetBytes: async () => new Uint8Array([1, 2, 3]),
    })

    expect(snapshot.chapter_summaries).toHaveLength(1)
    expect(snapshot.chapter_summaries[0]).toMatchObject({
      id: 'summary-newer-z', body: 'The deterministic tie winner.',
    })
    expect(snapshot.part_summaries).toHaveLength(1)
    expect(snapshot.part_summaries[0]).toMatchObject({
      id: 'part-summary-newer', body: 'The current part summary.',
    })

    const bundle = await writeLibraryBundle(snapshot, {
      bundleId: 'bundle:duplicate-summary-regression',
      exportedAt: '2026-08-21T14:00:00.000Z',
      appVersion: 'test',
    })
    expect([...bundle.files.keys()].filter((path) => path.endsWith('/summary.md'))).toHaveLength(2)
  })

  it('rejects corrupt structured database fields instead of producing a lossy backup', async () => {
    const invalidJson = completeDatabaseExportFixture()
    invalidJson.books[0] = {
      ...(invalidJson.books[0] as Record<string, unknown>), part_order: '{bad json',
    }
    await expect(createCanonicalLibrarySnapshot(invalidJson, {
      readAssetBytes: async () => new Uint8Array([1, 2, 3]),
    })).rejects.toThrow(/part_order does not contain a valid JSON array/)

    const invalidEntry = completeDatabaseExportFixture()
    invalidEntry.chapter_summaries[0] = {
      ...(invalidEntry.chapter_summaries[0] as Record<string, unknown>), characters: ['Alice', 42],
    }
    await expect(createCanonicalLibrarySnapshot(invalidEntry, {
      readAssetBytes: async () => new Uint8Array([1, 2, 3]),
    })).rejects.toThrow(
      /chapter_summaries\.characters for record summary-1 must contain only strings or legacy character objects/,
    )
  })

  it('serializes both system and user-defined AI profiles with stable identities', async () => {
    const database = completeDatabaseExportFixture()
    database.ai_profiles = [
      {
        id: 2, name: 'System Editor', tone_key: 'editorial', system_prompt: 'Review.',
        is_system: true, is_default: true, created_at: '2026-08-20T15:00:00.000Z',
        stable_id: 'system:editorial', updated_at: '2026-08-20T15:00:00.000Z',
      },
      {
        id: 3, name: 'My AI', tone_key: 'gentle', system_prompt: null,
        is_system: false, is_default: false, created_at: '2026-08-20T15:00:00.000Z',
        stable_id: 'ai:gentle:3', updated_at: '2026-08-20T15:00:00.000Z',
      },
    ]
    const snapshot = await createCanonicalLibrarySnapshot(database, {
      readAssetBytes: async () => new Uint8Array([1, 2, 3]),
    })
    expect(snapshot.profiles.map((profile) => [profile.id, profile.profile_kind])).toEqual([
      ['profile:test', 'custom'], ['system:editorial', 'system'], ['ai:gentle:3', 'ai'],
    ])
  })

  it('rejects malformed embedded image data', async () => {
    const database = completeDatabaseExportFixture()
    database.image_assets[0] = {
      ...(database.image_assets[0] as Record<string, unknown>),
      image_data: 'not-a-data-url',
    }
    await expect(createCanonicalLibrarySnapshot(database)).rejects.toThrow(/invalid data URL/)
  })
})
