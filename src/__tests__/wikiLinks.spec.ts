import { describe, expect, it } from 'vitest'
import {
  processWikiLinks,
  extractMentionedCharacters,
  countCharacterMentions,
  isValidCharacterName,
} from '@/utils/wikiLinks'

interface Character {
  id: string
  character_name: string
  wiki_page_id: string | null
  has_wiki_page: boolean
}

function char(overrides: Partial<Character> & { character_name: string }): Character {
  return {
    id: overrides.id ?? `id-${overrides.character_name}`,
    character_name: overrides.character_name,
    wiki_page_id:
      'wiki_page_id' in overrides ? overrides.wiki_page_id! : `wiki-${overrides.character_name}`,
    has_wiki_page: overrides.has_wiki_page ?? true,
  }
}

describe('processWikiLinks', () => {
  it('links a linkable character mention', () => {
    const result = processWikiLinks('Alice went home', [char({ character_name: 'Alice' })], 'book-1')
    expect(result).toBe('[Alice](/books/book-1/wiki/wiki-Alice) went home')
  })

  it('returns content unchanged when there are no characters', () => {
    expect(processWikiLinks('Alice went home', [], 'book-1')).toBe('Alice went home')
  })

  it('returns empty content unchanged', () => {
    expect(processWikiLinks('', [char({ character_name: 'Alice' })], 'book-1')).toBe('')
  })

  it('skips characters without a wiki page', () => {
    const chars = [
      char({ character_name: 'Alice', has_wiki_page: false }),
      char({ character_name: 'Bob', wiki_page_id: null }),
    ]
    expect(processWikiLinks('Alice and Bob', chars, 'book-1')).toBe('Alice and Bob')
  })

  it('prefers the longest name and does not double-link the shorter one inside it', () => {
    const chars = [
      char({ character_name: 'Alice', wiki_page_id: 'wiki-alice' }),
      char({ character_name: 'Alice Smith', wiki_page_id: 'wiki-alice-smith' }),
    ]
    const result = processWikiLinks('Alice Smith arrived', chars, 'book-1')
    expect(result).toBe('[Alice Smith](/books/book-1/wiki/wiki-alice-smith) arrived')
  })

  it('respects word boundaries and does not match inside other words', () => {
    const result = processWikiLinks('Alice smiled', [char({ character_name: 'Al' })], 'book-1')
    expect(result).toBe('Alice smiled')
  })
})

describe('extractMentionedCharacters', () => {
  it('returns only characters that appear in the content, case-insensitively', () => {
    const chars = [char({ character_name: 'Alice' }), char({ character_name: 'Charlie' })]
    const mentioned = extractMentionedCharacters('alice waved at the crowd', chars)
    expect(mentioned.map((c) => c.character_name)).toEqual(['Alice'])
  })

  it('returns an empty array when nobody is mentioned', () => {
    expect(extractMentionedCharacters('nobody here', [char({ character_name: 'Alice' })])).toEqual([])
  })
})

describe('countCharacterMentions', () => {
  it('counts word-boundary mentions per character, case-insensitively', () => {
    const chars = [char({ character_name: 'Alice' }), char({ character_name: 'Bob' })]
    const counts = countCharacterMentions('Alice met Alice and bob', chars)
    expect(counts).toEqual({ Alice: 2, Bob: 1 })
  })
})

describe('isValidCharacterName', () => {
  it('accepts ordinary names', () => {
    expect(isValidCharacterName('Alice')).toBe(true)
    expect(isValidCharacterName('Bob Smith')).toBe(true)
  })

  it('rejects names with URL-unsafe characters', () => {
    expect(isValidCharacterName('Alice/Bob')).toBe(false)
    expect(isValidCharacterName('a<b')).toBe(false)
    expect(isValidCharacterName('a?b')).toBe(false)
  })

  it('rejects empty or whitespace-only names', () => {
    expect(isValidCharacterName('')).toBe(false)
    expect(isValidCharacterName('   ')).toBe(false)
  })
})
