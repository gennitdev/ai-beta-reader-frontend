// Pure helpers for WikiPageView: parsing stored array fields, tag normalization,
// date formatting, and page-type icon/colour lookups.

import {
  UserIcon,
  MapPinIcon,
  LightBulbIcon,
  BookOpenIcon,
} from '@heroicons/vue/24/outline'
import type { FunctionalComponent } from 'vue'

/** Parse a stored value (array or JSON string) into trimmed, non-empty strings. */
export function parseStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry): entry is string => entry.length > 0)
  }
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter((entry): entry is string => entry.length > 0)
      : []
  } catch {
    return []
  }
}

/** Trim, drop empties, and de-duplicate tags case-insensitively (first spelling wins). */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const tag of tags) {
    const trimmed = tag.trim()
    if (!trimmed) continue
    const key = trimmed.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(trimmed)
  }

  return normalized
}

/** Parse a JSON string of ids into a string array, tolerating malformed input. */
export function parseIdArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string')
    }
  } catch {
    // Ignore parse errors and fall back to empty array.
  }
  return []
}

/** Format an ISO date string for display in history/metadata. */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
