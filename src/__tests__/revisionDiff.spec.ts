import { describe, expect, it } from 'vitest'
import { createRevisionDiff, getRevisionDiffStats } from '@/lib/revisionDiff'

describe('createRevisionDiff', () => {
  it('marks prose additions and removals while retaining unchanged text', () => {
    const diff = createRevisionDiff('The moon was pale.', 'The moon was very bright.')

    expect(diff.map((segment) => [segment.type, segment.text])).toEqual([
      ['same', 'The moon was '],
      ['removed', 'pale'],
      ['added', 'very bright'],
      ['same', '.'],
    ])
  })

  it('returns a single unchanged segment for identical text', () => {
    expect(createRevisionDiff('No changes.', 'No changes.')).toEqual([
      { type: 'same', text: 'No changes.' },
    ])
  })

  it('counts actual added and removed words in the rendered diff', () => {
    const diff = createRevisionDiff('The moon was pale.', 'The moon was very bright.')

    expect(getRevisionDiffStats(diff)).toEqual({ added: 2, removed: 1 })
  })

  it('counts moved prose as additions and deletions instead of cancelling matching vocabulary', () => {
    const diff = createRevisionDiff('one two three four', 'three four one two')

    expect(getRevisionDiffStats(diff)).toEqual({ added: 2, removed: 2 })
  })

  it('reports sweeping rewrites at their full scale', () => {
    const previous = Array.from({ length: 300 }, (_, index) => `old${index}`).join(' ')
    const next = Array.from({ length: 240 }, (_, index) => `new${index}`).join(' ')

    expect(getRevisionDiffStats(createRevisionDiff(previous, next))).toEqual({
      added: 240,
      removed: 300,
    })
  })
})
