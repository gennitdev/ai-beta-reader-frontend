import { describe, expect, it } from 'vitest'
import {
  findTextMatches,
  formatReplacement,
  replaceSelectedTextMatches,
  replaceTextMatch,
  type TextMatch,
} from '@/lib/findReplace'

describe('findTextMatches', () => {
  it('finds every non-overlapping match case-insensitively', () => {
    const matches = findTextMatches('Jon met JON before jon left.', 'jon', 'text')

    expect(matches.map((match) => match.matchedText)).toEqual(['Jon', 'JON', 'jon'])
    expect(matches.map((match) => [match.start, match.end])).toEqual([
      [0, 3],
      [8, 11],
      [19, 22],
    ])
    expect(matches.map((match) => match.occurrence)).toEqual([0, 1, 2])
  })

  it('treats regular expression characters as literal text', () => {
    const matches = findTextMatches('Use (old.name*) before oldXname.', '(old.name*)', 'content')

    expect(matches).toHaveLength(1)
    expect(matches[0].matchedText).toBe('(old.name*)')
  })

  it('supports case-sensitive matching when requested', () => {
    const matches = findTextMatches('Jon met jon.', 'Jon', 'text', { caseSensitive: true })

    expect(matches).toHaveLength(1)
    expect(matches[0].matchedText).toBe('Jon')
  })

  it('returns bounded context around each match', () => {
    const matches = findTextMatches('012345Jonabcdefghij', 'Jon', 'text', { contextLength: 4 })

    expect(matches[0].before).toBe('2345')
    expect(matches[0].after).toBe('abcd')
  })

  it('returns no matches for an empty search term', () => {
    expect(findTextMatches('Jon', '', 'text')).toEqual([])
  })
})

describe('formatReplacement', () => {
  it.each([
    ['jon', 'james', 'james'],
    ['Jon', 'james', 'James'],
    ['JON', 'james', 'JAMES'],
    ['J', 'james', 'James'],
  ])('preserves the case pattern of %s', (matchedText, replacement, expected) => {
    expect(formatReplacement(matchedText, replacement)).toBe(expected)
  })

  it('allows an empty replacement', () => {
    expect(formatReplacement('Jon', '')).toBe('')
  })
})

describe('replacement operations', () => {
  it('replaces one selected match without changing the others', () => {
    const text = 'Jon met Jon.'
    const matches = findTextMatches(text, 'Jon', 'text')

    expect(replaceTextMatch(text, matches[1], 'James')).toBe('Jon met James.')
  })

  it('replaces selected matches from the end so offsets remain valid', () => {
    const text = 'Jon met JON before jon left.'
    const matches = findTextMatches(text, 'jon', 'text')

    expect(replaceSelectedTextMatches(text, matches, 'alexander')).toBe(
      'Alexander met ALEXANDER before alexander left.',
    )
  })

  it('deletes selected matches with an empty replacement', () => {
    const text = 'Jon met Jon.'
    const matches = findTextMatches(text, 'Jon', 'text')

    expect(replaceSelectedTextMatches(text, [matches[0]], '')).toBe(' met Jon.')
  })

  it('returns the original text for an empty selection', () => {
    expect(replaceSelectedTextMatches('Jon', [], 'James')).toBe('Jon')
  })

  it('rejects a match when the source text changed after searching', () => {
    const match = findTextMatches('Jon arrived.', 'Jon', 'text')[0]

    expect(() => replaceTextMatch('Jane arrived.', match, 'James')).toThrow(/stale/)
  })

  it('rejects overlapping selections', () => {
    const overlappingMatches: TextMatch[] = [
      {
        id: 'text:0:0:3',
        field: 'text',
        start: 0,
        end: 3,
        matchedText: 'Jon',
        before: '',
        after: '',
        occurrence: 0,
      },
      {
        id: 'text:1:2:5',
        field: 'text',
        start: 2,
        end: 5,
        matchedText: 'nny',
        before: '',
        after: '',
        occurrence: 1,
      },
    ]

    expect(() => replaceSelectedTextMatches('Jonny', overlappingMatches, 'X')).toThrow(/overlap/)
  })
})
