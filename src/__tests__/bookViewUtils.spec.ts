import { describe, expect, it } from 'vitest'
import {
  formatWordCount,
  wordCountForChapters,
  getTypeIcon,
  getTypeColor,
  getSummaryPreview,
} from '@/utils/bookView'
import type { BookChapter } from '@/types/bookView'

const chapter = (over: Partial<BookChapter>): BookChapter => ({
  id: 'c', book_id: 'b', title: 'T', text: '', word_count: 0, part_id: null,
  created_at: '2026-01-01', ...over,
} as BookChapter)

describe('bookView utils', () => {
  describe('formatWordCount', () => {
    it('shows raw counts under 1000', () => {
      expect(formatWordCount(0)).toBe('0')
      expect(formatWordCount(999)).toBe('999')
    })
    it('abbreviates thousands to one decimal', () => {
      expect(formatWordCount(1000)).toBe('1.0k')
      expect(formatWordCount(1500)).toBe('1.5k')
      expect(formatWordCount(12345)).toBe('12.3k')
    })
  })

  describe('wordCountForChapters', () => {
    it('sums word counts, treating missing counts as zero', () => {
      expect(wordCountForChapters([])).toBe(0)
      expect(
        wordCountForChapters([
          chapter({ word_count: 100 }),
          chapter({ word_count: 250 }),
          chapter({ word_count: undefined as unknown as number }),
        ]),
      ).toBe(350)
    })
  })

  describe('getTypeColor', () => {
    it('maps known types and falls back to gray', () => {
      expect(getTypeColor('character')).toBe('text-gold-600')
      expect(getTypeColor('location')).toBe('text-green-600')
      expect(getTypeColor('concept')).toBe('text-purple-600')
      expect(getTypeColor('other')).toBe('text-gray-600')
      expect(getTypeColor('unknown')).toBe('text-gray-600')
    })
  })

  describe('getTypeIcon', () => {
    it('returns a component for each type and a shared default fallback', () => {
      expect(getTypeIcon('character')).toBeTruthy()
      expect(getTypeIcon('character')).not.toBe(getTypeIcon('location'))
      expect(getTypeIcon('location')).not.toBe(getTypeIcon('concept'))
      // Unknown and 'other' both fall back to the same default icon.
      expect(getTypeIcon('unknown')).toBe(getTypeIcon('other'))
    })
  })

  describe('getSummaryPreview', () => {
    it('returns empty string for falsy input', () => {
      expect(getSummaryPreview('')).toBe('')
    })
    it('returns the summary unchanged when within the limit', () => {
      expect(getSummaryPreview('short summary')).toBe('short summary')
    })
    it('truncates at a sentence boundary when one is available late enough', () => {
      // The '.' must land past 60% of the limit to be used as the cut point.
      const text = 'a'.repeat(65) + '. ' + 'b'.repeat(50)
      expect(getSummaryPreview(text, 100)).toBe('a'.repeat(65) + '.')
    })
    it('truncates at a word boundary with an ellipsis when no good sentence break exists', () => {
      const text = 'alpha beta gamma delta epsilon ' + 'word '.repeat(40)
      const preview = getSummaryPreview(text, 20)
      expect(preview.endsWith('...')).toBe(true)
      expect(preview.length).toBeLessThanOrEqual(23)
    })
  })
})
