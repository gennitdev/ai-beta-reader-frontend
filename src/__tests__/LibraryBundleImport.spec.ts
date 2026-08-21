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
  diagnostics: [{ severity: 'warning', code: 'warning', message: 'Check this', path: 'book.yaml' }],
  operations: [{
    key: 'chapter\0one', entityType: 'chapter', entityId: 'one', title: 'Opening', path: 'chapter.md',
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
    expect(wrapper.get('button[title*="recovery"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('button:nth-of-type(1)').trigger('click')
    expect(wrapper.emitted('resolve')).toBeTruthy()
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
