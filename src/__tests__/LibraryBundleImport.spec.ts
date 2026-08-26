// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LibraryBundleImport from '@/components/LibraryBundleImport.vue'
import type { LibraryImportPlan } from '@/lib/libraryBundle/plan'
import type { RecoveryBundleMetadata } from '@/lib/recovery/model'

const recovery: RecoveryBundleMetadata = {
  id: 'recovery-1', bundleId: 'bundle:recovery', createdAt: '2026-08-20T15:00:00.000Z',
  appVersion: '1.0.0', sourceOperation: 'replace-library', databaseGeneration: 'a'.repeat(64),
  byteLength: 100, sha256: 'b'.repeat(64),
}

const phase4Props = {
  isPreparingReplace: false, isReplacing: false, recoveries: [recovery],
  preparedRecovery: null, replaceRemovalCounts: { books: 1, chapters: 2, wikiPages: 3 },
}

const plan: LibraryImportPlan = {
  planVersion: 1, bundleId: 'bundle:test', databaseGeneration: 'g', bookIds: ['book-1'],
  counts: { create: 1, update: 0, delete: 0, keep_local: 0, unchanged: 1, conflict: 1 },
  countsByEntityType: { chapter: { create: 0, update: 0, delete: 0, keep_local: 0, unchanged: 0, conflict: 1 } },
  unresolvedConflicts: 1, canApply: false, replaceEligible: true,
  diagnostics: [
    { severity: 'warning', code: 'warning', message: 'Check this', path: 'book.yaml' },
    { severity: 'warning', code: 'review.unknown_profile', message: 'Review references unknown profile profile:missing.', entityType: 'review', entityId: 'review-1' },
    { severity: 'warning', code: 'file.unknown', message: 'Unknown file is ignored during database import.', path: 'draft.tmp' },
  ],
  previewSummary: {
    images: { includedCount: 2, includedBytes: 1536, omittedCount: 1, omittedBytes: 2048 },
    wikiReview: {
      currentCount: 3,
      stale: [{
        entityType: 'wiki_review_state', entityId: 'wiki-1:chapter-1', bookId: 'book-1',
        wikiPageId: 'wiki-1', wikiPageTitle: 'Alice', chapterId: 'chapter-1', chapterTitle: 'Opening',
        path: '_beta-bot/review-state.jsonl',
      }],
      missing: [{
        entityType: 'wiki_review_state', entityId: 'wiki-2:chapter-1', bookId: 'book-1',
        wikiPageId: 'wiki-2', wikiPageTitle: 'Alison', chapterId: 'chapter-1', chapterTitle: 'Opening',
        path: 'books/book-1/chapters/chapter-1/chapter.md',
      }],
    },
    ambiguousAliases: [{
      alias: 'Al',
      pages: [
        { entityType: 'wiki_page', entityId: 'wiki-1', title: 'Alice', path: 'books/book-1/wiki/alice.md' },
        { entityType: 'wiki_page', entityId: 'wiki-2', title: 'Alison', path: 'books/book-1/wiki/alison.md' },
      ],
    }],
    warnings: {
      unknownProfiles: [{ entityType: 'review', entityId: 'review-1', path: 'books/book-1/chapters/chapter-1/reviews/review-1.md', message: 'Review references unknown profile profile:missing.' }],
      ignoredFiles: [{ entityType: 'file', entityId: 'draft.tmp', path: 'draft.tmp', message: 'Unknown file is ignored during database import.' }],
    },
  },
  operations: [{
    key: 'chapter\0one', entityType: 'chapter', entityId: 'one', bookId: 'book-1', bookTitle: 'A Book', title: 'Opening', path: 'chapter.md',
    kind: 'conflict', conflictReason: 'different_edits', changedFields: ['body'],
  }],
}

describe('LibraryBundleImport', () => {
  it('renders preview counts, diagnostics, conflicts, and keeps Replace disabled', async () => {
    const wrapper = mount(LibraryBundleImport, { props: {
      plan, fileName: 'library.zip', error: '', message: '', isPreviewing: false, isApplying: false,
      ...phase4Props,
    } })
    expect(wrapper.text()).toContain('library.zip')
    expect(wrapper.text()).toContain('Check this')
    expect(wrapper.text()).toContain('Changed: body')
    expect(wrapper.text()).toContain('1.5 KB included across 2 image(s)')
    expect(wrapper.text()).toContain('2 KB omitted across 1 image(s)')
    expect(wrapper.text()).toContain('3 current · 1 stale · 1 missing')
    expect(wrapper.text()).toContain('Stale: Alice for Opening')
    expect(wrapper.text()).toContain('Missing: Alison for Opening')
    expect(wrapper.text()).toContain('“Al” is shared by Alice, Alison')
    expect(wrapper.text()).toContain('Unknown review profile: review-1')
    expect(wrapper.text()).toContain('Ignored file: draft.tmp')
    expect(wrapper.get('[aria-label="Planned entity changes"]').text()).toContain('A Book')
    expect(wrapper.get('[aria-label="Planned entity changes"]').text()).toContain('chapter')
    expect(wrapper.get('button[title*="recovery"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('button:nth-of-type(1)').trigger('click')
    expect(wrapper.emitted('resolve')).toBeTruthy()
  })

  it('renders explicit empty states for every decision-support summary', () => {
    const wrapper = mount(LibraryBundleImport, { props: {
      plan: {
        ...plan,
        previewSummary: {
          images: { includedCount: 0, includedBytes: 0, omittedCount: 0, omittedBytes: 0 },
          wikiReview: { currentCount: 0, stale: [], missing: [] },
          ambiguousAliases: [], warnings: { unknownProfiles: [], ignoredFiles: [] },
        },
      },
      fileName: 'empty.zip', error: '', message: '', isPreviewing: false, isApplying: false,
      ...phase4Props,
    } })
    expect(wrapper.text()).toContain('0 bytes included across 0 image(s)')
    expect(wrapper.text()).toContain('0 bytes omitted across 0 image(s)')
    expect(wrapper.text()).toContain('0 current · 0 stale · 0 missing')
    expect(wrapper.text()).toContain('No stale or missing wiki review state.')
    expect(wrapper.text()).toContain('No ambiguous aliases.')
    expect(wrapper.text()).toContain('No unknown profiles or ignored files.')
  })

  it('shows the bundle export time and bounds large ignored-file lists', () => {
    const ignoredFiles = Array.from({ length: 25 }, (_, index) => ({
      entityType: 'file', entityId: `ignored-${index}`, path: `ignored-${index}.tmp`,
      message: 'Unknown file is ignored during database import.',
    }))
    const wrapper = mount(LibraryBundleImport, { props: {
      plan: {
        ...plan,
        previewSummary: {
          ...plan.previewSummary,
          warnings: { ...plan.previewSummary.warnings, ignoredFiles },
        },
      },
      exportedAt: '2026-08-20T15:00:00.000Z',
      fileName: 'large.zip', error: '', message: '', isPreviewing: false, isApplying: false,
      ...phase4Props,
    } })

    expect(wrapper.text()).toContain('Bundle exported')
    expect(wrapper.text()).toContain('ignored-19.tmp')
    expect(wrapper.text()).not.toContain('ignored-20.tmp')
    expect(wrapper.text()).toContain('5 additional ignored file(s) are not shown.')
  })

  it('keeps both write actions disabled when the plan has a fatal diagnostic', () => {
    const wrapper = mount(LibraryBundleImport, { props: {
      plan: {
        ...plan, canApply: false, replaceEligible: false,
        diagnostics: [{ severity: 'error', code: 'schema.invalid', message: 'Invalid bundle', path: 'beta-bot.yaml' }],
      },
      fileName: 'fatal.zip', error: '', message: '', isPreviewing: false, isApplying: false,
      ...phase4Props,
    } })
    const apply = wrapper.findAll('button').find((button) => button.text() === 'Apply changes')!
    const replace = wrapper.findAll('button').find((button) => button.text() === 'Prepare Replace library')!
    expect(apply.attributes('disabled')).toBeDefined()
    expect(replace.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Invalid bundle')
  })

  it('emits selected files and apply actions and displays status messages', async () => {
    const wrapper = mount(LibraryBundleImport, { props: {
      plan: { ...plan, unresolvedConflicts: 0, canApply: true }, fileName: '',
      error: 'Bad ZIP', message: 'Done', isPreviewing: false, isApplying: false,
      ...phase4Props,
    } })
    const file = new File(['x'], 'bundle.zip', { type: 'application/zip' })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    expect(wrapper.emitted('select')?.[0]).toEqual([file])
    const folderInput = wrapper.findAll('input[type="file"]')[1]
    Object.defineProperty(folderInput.element, 'files', { value: [file] })
    await folderInput.trigger('change')
    expect(wrapper.emitted('selectDirectory')?.[0]).toEqual([[file]])
    const apply = wrapper.findAll('button').find((button) => button.text() === 'Apply changes')!
    await apply.trigger('click')
    expect(wrapper.emitted('apply')).toBeTruthy()
    expect(wrapper.text()).toContain('Bad ZIP')
    expect(wrapper.text()).toContain('Done')
  })

  it('enables confirmation only after recovery preparation and exposes recovery actions', async () => {
    const wrapper = mount(LibraryBundleImport, { props: {
      plan: { ...plan, unresolvedConflicts: 0, canApply: true }, fileName: 'incoming.zip',
      error: '', message: '', isPreviewing: false, isApplying: false,
      ...phase4Props, preparedRecovery: recovery,
    } })
    const confirm = wrapper.findAll('button').find((button) => button.text() === 'Confirm Replace library')!
    expect(confirm.exists()).toBe(true)
    await confirm.trigger('click')
    expect(wrapper.emitted('replace')).toBeTruthy()
    const restore = wrapper.findAll('button').find((button) => button.text() === 'Restore…')!
    await restore.trigger('click')
    expect(wrapper.emitted('previewRecovery')?.[0]).toEqual([recovery.id])
    const download = wrapper.findAll('button').find((button) => button.text() === 'Download')!
    await download.trigger('click')
    expect(wrapper.emitted('downloadRecovery')?.[0]).toEqual([recovery.id])
  })
})
