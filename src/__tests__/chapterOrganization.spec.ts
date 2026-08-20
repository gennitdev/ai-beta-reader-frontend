import { describe, expect, it } from 'vitest'
import {
  applyChapterOrder,
  buildChapterOrder,
  moveListItem,
  parseIdArray,
  reconcilePartOrder,
} from '@/lib/chapterOrganization'
import type { BookPart } from '@/lib/database'
import type { Chapter } from '@/types/organize'

const part = (id: string, createdAt: string): BookPart => ({
  id,
  book_id: 'book-1',
  name: id,
  chapter_order: '[]',
  cover_image_id: null,
  created_at: createdAt,
  updated_at: createdAt,
})

const chapter = (id: string, position: number): Chapter => ({
  id,
  title: id,
  word_count: 0,
  has_summary: false,
  summary: null,
  position,
  position_in_part: null,
  part_id: null,
  part_name: null,
})

describe('chapter organization ordering', () => {
  it.each([undefined, null, '', 'not json', '{}', '["valid", 42]'])(
    'treats invalid saved order %j as empty',
    (value) => expect(parseIdArray(value)).toEqual([]),
  )

  it('reconciles duplicate, deleted, and newly created parts deterministically', () => {
    const result = reconcilePartOrder(
      '["part-2","deleted","part-2"]',
      [
        part('part-3', '2026-03-01T00:00:00.000Z'),
        part('part-1', '2026-01-01T00:00:00.000Z'),
        part('part-2', '2026-02-01T00:00:00.000Z'),
      ],
    )

    expect(result).toEqual({
      order: ['part-2', 'part-1', 'part-3'],
      changed: true,
    })
    expect(reconcilePartOrder('["part-2","part-1","part-3"]', [
      part('part-1', '2026-01-01T00:00:00.000Z'),
      part('part-2', '2026-02-01T00:00:00.000Z'),
      part('part-3', '2026-03-01T00:00:00.000Z'),
    ]).changed).toBe(false)
  })

  it('applies saved chapter order, ignores stale IDs, and appends new chapters', () => {
    const original = [chapter('new', 9), chapter('second', 8), chapter('first', 7)]

    expect(applyChapterOrder(original, ['first', 'deleted', 'second']).map((item) => [
      item.id,
      item.position,
    ])).toEqual([
      ['first', 0],
      ['second', 1],
      ['new', 2],
    ])
    expect(original.map((item) => item.position)).toEqual([9, 8, 7])
  })

  it('builds global order from uncategorized, ordered, and newly discovered parts', () => {
    expect(buildChapterOrder({
      null: ['uncategorized'],
      'part-2': ['two'],
      'part-1': ['one'],
      'new-part': ['new'],
    }, ['part-1', 'part-2'])).toEqual(['uncategorized', 'one', 'two', 'new'])
  })

  it('moves list items only when both indices are valid', () => {
    const items = ['one', 'two', 'three']

    expect(moveListItem(items, 1, -1)).toBe(true)
    expect(items).toEqual(['two', 'one', 'three'])
    expect(moveListItem(items, 0, -1)).toBe(false)
    expect(moveListItem(items, 2, 1)).toBe(false)
    expect(moveListItem(items, -1, 1)).toBe(false)
    expect(items).toEqual(['two', 'one', 'three'])
  })
})
