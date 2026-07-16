import { describe, expect, it } from 'vitest'
import {
  assertWikiIdentityAvailable,
  normalizeWikiAliases,
  normalizeWikiEntityName,
  parseWikiAliases,
  resolveWikiPageByName,
} from '@/lib/wikiAliases'

const pages = [
  {
    id: 'liz',
    page_name: 'Elizabeth Bennet',
    page_type: 'character',
    aliases: JSON.stringify(['Liz', 'Miss Bennet']),
  },
  {
    id: 'longbourn',
    page_name: 'Longbourn',
    page_type: 'location',
    aliases: ['The Bennet Estate'],
  },
]

describe('wiki alias normalization', () => {
  it('normalizes Unicode, whitespace, and case for comparison', () => {
    expect(normalizeWikiEntityName('  MISS\u00a0Bennet  ')).toBe('miss bennet')
  })

  it('parses stored JSON aliases and ignores invalid values', () => {
    expect(parseWikiAliases('["Liz", 42, "Beth"]')).toEqual(['Liz', 'Beth'])
    expect(parseWikiAliases('not-json')).toEqual([])
  })

  it('trims and deduplicates aliases while excluding the canonical name', () => {
    expect(normalizeWikiAliases(
      [' Liz ', 'liz', ' Elizabeth   Bennet ', 'Beth'],
      'Elizabeth Bennet',
    )).toEqual(['Liz', 'Beth'])
  })
})

describe('resolveWikiPageByName', () => {
  it('resolves canonical names and aliases case-insensitively', () => {
    expect(resolveWikiPageByName(pages, 'ELIZABETH BENNET')?.id).toBe('liz')
    expect(resolveWikiPageByName(pages, ' miss bennet ')?.id).toBe('liz')
  })

  it('can restrict resolution to the generated entity type', () => {
    expect(resolveWikiPageByName(pages, 'The Bennet Estate', 'location')?.id).toBe('longbourn')
    expect(resolveWikiPageByName(pages, 'The Bennet Estate', 'character')).toBeNull()
  })
})

describe('assertWikiIdentityAvailable', () => {
  it('rejects aliases already owned by another page', () => {
    expect(() => assertWikiIdentityAvailable(pages, {
      pageId: 'new-page',
      pageName: 'Beth Lucas',
      aliases: ['Liz'],
    })).toThrow(/Elizabeth Bennet/)
  })

  it('allows a page to retain its own names', () => {
    expect(() => assertWikiIdentityAvailable(pages, {
      pageId: 'liz',
      pageName: 'Elizabeth Bennet',
      aliases: ['Liz', 'Beth'],
    })).not.toThrow()
  })
})
