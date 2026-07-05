import { describe, expect, it } from 'vitest'
import {
  normalizeDatabaseImportData,
  normalizeImageAssetImportRows,
} from '@/lib/databaseImportExport'

describe('database import/export helpers', () => {
  it('normalizes Capacitor exports including pinned wiki fields and image wiki tags', () => {
    const normalized = normalizeDatabaseImportData({
      export: {
        tables: [
          {
            name: 'wiki_pages',
            schema: [
              { column: 'id' },
              { column: 'book_id' },
              { column: 'page_name' },
              { column: 'is_pinned' },
              { column: 'cover_image_id' },
            ],
            values: [['wiki-1', 'book-1', 'Alice', 1, 'img-1']],
          },
          {
            name: 'image_wiki_tags',
            schema: [
              { column: 'image_id' },
              { column: 'wiki_page_id' },
              { column: 'created_at' },
            ],
            values: [['img-1', 'wiki-1', '2026-01-01T00:00:00.000Z']],
          },
          {
            name: 'chapter_notes',
            schema: [
              { column: 'id' },
              { column: 'chapter_id' },
              { column: 'notes' },
            ],
            values: [['note-1', 'chapter-1', 'Important continuity note']],
          },
        ],
      },
    })

    expect(normalized.wiki_pages).toEqual([
      {
        id: 'wiki-1',
        book_id: 'book-1',
        page_name: 'Alice',
        is_pinned: 1,
        cover_image_id: 'img-1',
      },
    ])
    expect(normalized.image_wiki_tags).toEqual([
      {
        image_id: 'img-1',
        wiki_page_id: 'wiki-1',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ])
    expect(normalized.chapter_notes).toEqual([
      {
        id: 'note-1',
        chapter_id: 'chapter-1',
        notes: 'Important continuity note',
      },
    ])
  })

  it('normalizes legacy image asset rows and preserves enriched image data', () => {
    const rows = normalizeImageAssetImportRows([
      [
        'img-1',
        'book-1',
        'chapter-1',
        'chapter',
        'scene.png',
        '/images/scene.png',
        'image/png',
        '2026-01-01T00:00:00.000Z',
        '2026-01-02T00:00:00.000Z',
        'data:image/png;base64,abc123',
      ],
      {
        id: 'img-2',
        book_id: 'book-1',
        chapter_id: null,
        asset_type: 'cover',
        file_name: 'cover.png',
        file_path: '/images/cover.png',
        mime_type: 'image/png',
        image_data: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
    ])

    expect(rows).toEqual([
      {
        id: 'img-1',
        book_id: 'book-1',
        chapter_id: 'chapter-1',
        asset_type: 'chapter',
        file_name: 'scene.png',
        file_path: '/images/scene.png',
        mime_type: 'image/png',
        image_data: 'data:image/png;base64,abc123',
        notes: '',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'img-2',
        book_id: 'book-1',
        chapter_id: null,
        asset_type: 'cover',
        file_name: 'cover.png',
        file_path: '/images/cover.png',
        mime_type: 'image/png',
        image_data: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        notes: '',
      },
    ])
  })
})
