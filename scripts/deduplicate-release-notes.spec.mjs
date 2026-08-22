import { describe, expect, it } from 'vitest'

import { deduplicateReleaseNotes } from './deduplicate-release-notes.mjs'

const commit = (title, sha) => `* ${title} ([${sha.slice(0, 7)}](https://github.com/example/repo/commit/${sha}))`

describe('deduplicateReleaseNotes', () => {
  const firstSha = '1111111111111111111111111111111111111111'
  const secondSha = '2222222222222222222222222222222222222222'

  it('keeps the first occurrence of an exact entry in a category', () => {
    const markdown = [
      '## 1.0.0',
      '',
      '### Features',
      '',
      commit('add theme switching', firstSha),
      commit('add theme switching', secondSha),
    ].join('\n')

    expect(deduplicateReleaseNotes(markdown)).toEqual({
      markdown: [
        '## 1.0.0',
        '',
        '### Features',
        '',
        commit('add theme switching', firstSha),
      ].join('\n'),
      removed: 1,
    })
  })

  it('retains similar entries and entries in different categories or releases', () => {
    const markdown = [
      '## 2.0.0',
      '### Features',
      commit('add theme switching', firstSha),
      commit('improve theme switching', secondSha),
      '### Bug Fixes',
      commit('add theme switching', secondSha),
      '## 1.0.0',
      '### Features',
      commit('add theme switching', secondSha),
    ].join('\n')

    expect(deduplicateReleaseNotes(markdown)).toEqual({ markdown, removed: 0 })
  })

  it('does not alter ordinary markdown bullets', () => {
    const markdown = [
      '## 1.0.0',
      '### Features',
      '* add theme switching (#10)',
      '* add theme switching (#10)',
    ].join('\n')

    expect(deduplicateReleaseNotes(markdown)).toEqual({ markdown, removed: 0 })
  })

  it('is idempotent and preserves CRLF line endings', () => {
    const markdown = [
      '## 1.0.0',
      '### Features',
      commit('add theme switching', firstSha),
      commit('add theme switching', secondSha),
      '',
    ].join('\r\n')
    const firstPass = deduplicateReleaseNotes(markdown)

    expect(firstPass.removed).toBe(1)
    expect(firstPass.markdown).toContain('\r\n')
    expect(deduplicateReleaseNotes(firstPass.markdown)).toEqual({
      markdown: firstPass.markdown,
      removed: 0,
    })
  })
})
