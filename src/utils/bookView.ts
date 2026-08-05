// Pure display helpers for BookView and its child components.

import { UserIcon, MapPinIcon, LightBulbIcon, BookOpenIcon } from '@heroicons/vue/24/outline'
import type { FunctionalComponent } from 'vue'
import type { BookChapter } from '@/types/bookView'

/** Compact word-count display: 999 -> "999", 1500 -> "1.5k". */
export function formatWordCount(count: number): string {
  if (count < 1000) return count.toString()
  return (count / 1000).toFixed(1) + 'k'
}

/** Sum the word counts across a list of chapters. */
export function wordCountForChapters(chapterList: BookChapter[]): number {
  return chapterList.reduce((total, chapter) => total + (chapter.word_count || 0), 0)
}

/** Heroicon component for a wiki page type. */
export function getTypeIcon(type: string): FunctionalComponent {
  switch (type) {
    case 'character': return UserIcon
    case 'location': return MapPinIcon
    case 'concept': return LightBulbIcon
    default: return BookOpenIcon
  }
}

/** Tailwind text-colour class for a wiki page type. */
export function getTypeColor(type: string): string {
  switch (type) {
    case 'character': return 'text-gold-600'
    case 'location': return 'text-green-600'
    case 'concept': return 'text-purple-600'
    default: return 'text-gray-600'
  }
}

/** Truncate a summary at a sentence or word boundary within `maxLength`. */
export function getSummaryPreview(summary: string, maxLength: number = 100): string {
  if (!summary) return ''
  if (summary.length <= maxLength) return summary

  // Find the last complete sentence within the limit
  const truncated = summary.substring(0, maxLength)
  const lastSentence = truncated.lastIndexOf('.')

  if (lastSentence > 0 && lastSentence > maxLength * 0.6) {
    return truncated.substring(0, lastSentence + 1)
  }

  // If no good sentence break, just truncate at word boundary
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...'
}
