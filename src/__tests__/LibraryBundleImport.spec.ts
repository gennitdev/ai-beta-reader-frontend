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
    expect(wrapper.text()).toContain('0 pages deleted · 3 reviews current · 1 stale · 1 link needs review')
    expect(wrapper.text()).toContain('Stale: Alice for Opening')
    expect(wrapper.text()).toContain('Needs review: Alison for Opening')
    expect(wrapper.text()).toContain('the page itself is not missing')
    expect(wrapper.text()).toContain('“Al” is shared by Alice, Alison')
    expect(wrapper.text()).toContain('Unknown review profile: review-1')
    expect(wrapper.text()).toContain('Ignored file: draft.tmp')
    expect(wrapper.get('[aria-label="Planned entity changes"]').text()).toContain('A Book')
    expect(wrapper.get('[aria-label="Planned entity changes"]').text()).toContain('chapter')
    expect(wrapper.get('button[title*="recovery"]').attributes('disabled')).toBeUndefined()
    const useIncoming = wrapper.findAll('button').find((button) => button.text() === 'Use incoming')!
    await useIncoming.trigger('click')
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
    expect(wrapper.text()).toContain('0 pages deleted · 0 reviews current · 0 stale · 0 links need review')
    expect(wrapper.text()).toContain('No wiki links need review.')
    expect(wrapper.text()).toContain('No ambiguous aliases.')
    expect(wrapper.text()).toContain('No unknown profiles or ignored files.')
  })

  it('keeps a visible, cancellable progress surface over the page while previewing', async () => {
    const wrapper = mount(LibraryBundleImport, { props: {
      plan: null, fileName: 'large-folder', error: '', message: '', isPreviewing: true,
      previewProgress: {
        label: 'Validating bundle structure…',
        detail: '796 files · 162 MB selected. No changes are being applied.',
      },
      isApplying: false, ...phase4Props,
    } })

    const progress = document.body.querySelector('[data-testid="bundle-preview-progress"]') as HTMLElement
    expect(progress).not.toBeNull()
    expect(progress.textContent).toContain('Validating bundle structure…')
    expect(progress.textContent).toContain('No changes are being applied.')
    expect(progress.textContent).toContain('Large libraries can take a few minutes.')
    ;(progress.querySelector('button') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('cancelPreview')).toBeTruthy()
    wrapper.unmount()
  })

  it('shows feedback before the browser finishes selecting a large folder', async () => {
    const wrapper = mount(LibraryBundleImport, { props: {
      plan: null, fileName: '', error: '', message: '', isPreviewing: false,
      isApplying: false, ...phase4Props,
    } })

    const folderButton = wrapper.findAll('button').find((button) => button.text() === 'Choose bundle folder')!
    await folderButton.trigger('click')
    const progress = document.body.querySelector('[data-testid="bundle-preview-progress"]') as HTMLElement
    expect(progress.textContent).toContain('Waiting for folder selection…')
    expect(progress.textContent).toContain('No changes are being applied.')
    expect(progress.textContent).toContain('Use Cancel in the browser dialog to return.')
    expect(progress.querySelector('button')).toBeNull()

    await wrapper.get('input[webkitdirectory]').trigger('cancel')
    expect(document.body.querySelector('[data-testid="bundle-preview-progress"]')).toBeNull()
    wrapper.unmount()
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

  it('bounds large review warning lists and omits keep-local operation cards', async () => {
    const missing = Array.from({ length: 25 }, (_, index) => ({
      entityType: 'wiki_review_state', entityId: `wiki-${index}:chapter-1`, bookId: 'book-1',
      wikiPageId: `wiki-${index}`, wikiPageTitle: `Wiki ${index}`, chapterId: 'chapter-1',
      chapterTitle: 'Opening', path: 'books/book-1/chapters/chapter-1/chapter.md',
    }))
    const unknownProfiles = Array.from({ length: 25 }, (_, index) => ({
      entityType: 'review', entityId: `review-${index}`, message: 'Unknown profile.',
    }))
    const wrapper = mount(LibraryBundleImport, { props: {
      plan: {
        ...plan,
        unresolvedConflicts: 0,
        canApply: true,
        counts: { create: 0, update: 0, delete: 0, keep_local: 1, unchanged: 0, conflict: 0 },
        operations: [{
          key: 'wiki_page\0wiki-1', entityType: 'wiki_page', entityId: 'wiki-1', bookId: 'book-1',
          kind: 'keep_local', changedFields: ['body'],
        }],
        previewSummary: {
          ...plan.previewSummary,
          wikiReview: { currentCount: 0, stale: [], missing },
          warnings: { ...plan.previewSummary.warnings, unknownProfiles },
        },
      },
      fileName: 'large-folder', error: '', message: '', isPreviewing: false, isApplying: false,
      ...phase4Props,
    } })

    expect(wrapper.text()).toContain('Wiki 19')
    expect(wrapper.text()).not.toContain('Wiki 20')
    expect(wrapper.text()).toContain('5 additional wiki review notice(s) are not shown.')
    expect(wrapper.text()).toContain('review-19')
    expect(wrapper.text()).not.toContain('review-20')
    expect(wrapper.text()).toContain('5 additional unknown profile warning(s) are not shown.')
    expect(wrapper.text()).toContain('No incoming changes were detected.')
    expect(wrapper.text()).toContain('1 difference(s) are classified “keep local.”')
    expect(wrapper.find('[aria-label="Planned entity changes"]').exists()).toBe(false)
    const override = wrapper.findAll('button').find((button) => button.text().includes('Review keep-local'))!
    await override.trigger('click')
    expect(wrapper.emitted('overrideInventory')).toBeTruthy()
    const apply = wrapper.findAll('button').find((button) => button.text() === 'Apply changes')!
    expect(apply.attributes('disabled')).toBeDefined()
  })

  it('caps non-conflict operation details while always showing conflicts', () => {
    const creates = Array.from({ length: 105 }, (_, index) => ({
      key: `chapter\0chapter-${index}`, entityType: 'chapter', entityId: `chapter-${index}`,
      bookId: 'book-1', bookTitle: 'A Book', title: `Chapter ${index}`,
      kind: 'create' as const, changedFields: [],
    }))
    const conflict = {
      ...plan.operations[0], key: 'chapter\0required-conflict', entityId: 'required-conflict', title: 'Required conflict',
    }
    const wrapper = mount(LibraryBundleImport, { props: {
      plan: { ...plan, operations: [...creates, conflict] },
      fileName: 'large-folder', error: '', message: '', isPreviewing: false, isApplying: false,
      ...phase4Props,
    } })

    expect(wrapper.text()).toContain('Chapter 99')
    expect(wrapper.text()).not.toContain('Chapter 100')
    expect(wrapper.text()).toContain('Required conflict')
    expect(wrapper.text()).toContain('5 additional non-conflict operation(s) are not shown.')
  })

  it('reports deleted wiki pages separately from surviving links that need review', () => {
    const deletedPage = {
      key: 'wiki_page\0deleted', entityType: 'wiki_page', entityId: 'deleted', bookId: 'book-1',
      bookTitle: 'A Book', title: 'Old Cassian Vale', kind: 'delete' as const, changedFields: [],
    }
    const wrapper = mount(LibraryBundleImport, { props: {
      plan: { ...plan, operations: [...plan.operations, deletedPage] },
      fileName: 'bundle', error: '', message: '', isPreviewing: false, isApplying: false,
      ...phase4Props,
    } })

    expect(wrapper.text()).toContain('1 page deleted')
    expect(wrapper.text()).toContain('Deleted pages are included as normal delete operations below.')
    expect(wrapper.get('[aria-label="Planned entity changes"]').text()).toContain('Old Cassian Vale')
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
      plan: {
        ...plan, unresolvedConflicts: 0, canApply: true,
        operations: plan.operations.map((operation) => ({ ...operation, resolution: 'use_incoming' as const })),
      }, fileName: '',
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
