// @vitest-environment jsdom
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book, BookPart, Chapter, ImageAsset } from '@/lib/database'

const zipState = vi.hoisted(() => ({
  files: new Map<string, unknown>(),
  generateAsync: vi.fn(async () => new Blob(['zip'])),
}))

const bundleState = vi.hoisted(() => ({
  create: vi.fn(async () => ({ zipBytes: new Uint8Array([80, 75, 3, 4]) })),
  createText: vi.fn(async () => ({ zipBytes: new Uint8Array([80, 75, 3, 4]), files: new Map() })),
  createSelection: vi.fn(async () => ({ zipBytes: new Uint8Array([80, 75, 3, 4]) })),
}))

const directoryState = vi.hoisted(() => ({
  write: vi.fn(async () => ({ writtenFiles: 2, deletedFiles: 1, scaffoldedFiles: 2 })),
}))

vi.mock('@/lib/libraryBundle/export', () => ({
  createFullLibraryBundleExport: bundleState.create,
  createTextOnlyLibraryBundleExport: bundleState.createText,
  createSelectedBooksBundleExport: bundleState.createSelection,
}))

vi.mock('@/lib/libraryBundle/adapters/directory', () => ({
  writeBundleDirectory: directoryState.write,
}))

vi.mock('jszip', () => {
  class FakeFolder {
    constructor(private readonly prefix = '') {}

    file(name: string, content: unknown) {
      zipState.files.set(`${this.prefix}${name}`, content)
      return this
    }

    folder(name: string) {
      return new FakeFolder(`${this.prefix}${name}/`)
    }
  }

  return {
    default: class FakeZip extends FakeFolder {
      generateAsync = zipState.generateAsync
    },
  }
})

import { useDataExport } from '@/composables/useDataExport'

const book: Book = {
  id: 'book-1',
  title: 'Book / One',
  chapter_order: '["chapter-2","chapter-1"]',
  part_order: '["part-1"]',
  created_at: '2026-01-01T00:00:00.000Z',
}

const chapters: Chapter[] = [
  {
    id: 'chapter-1', book_id: 'book-1', part_id: 'part-1', title: 'Opening',
    text: 'Opening text', word_count: 2, created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'chapter-2', book_id: 'book-1', part_id: null, title: 'Loose / Ends',
    text: 'Loose ends', word_count: 2, created_at: '2026-01-02T00:00:00.000Z',
  },
]

const parts: BookPart[] = [{
  id: 'part-1', book_id: 'book-1', name: 'Part One', chapter_order: '["chapter-1"]',
  cover_image_id: null, created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}]

const image = (overrides: Partial<ImageAsset> = {}): ImageAsset => ({
  id: 'image-1', book_id: 'book-1', chapter_id: null, asset_type: 'cover',
  file_name: 'cover.jpeg', file_path: 'web/cover.jpeg', mime_type: 'image/jpeg',
  image_data: null, notes: 'Image note', created_at: '', updated_at: '', ...overrides,
})

function createDeps() {
  return {
    books: ref([book]),
    chapters: ref(chapters),
    loadBooks: vi.fn(async () => {}),
    loadChapters: vi.fn(async () => {}),
    getParts: vi.fn(async () => parts),
    getNotes: vi.fn(async (chapterId: string) => chapterId === 'chapter-1'
      ? { id: 'note-1', chapter_id: chapterId, notes: 'Chapter note', created_at: '', updated_at: '' }
      : null),
    canStoreImages: ref(true),
    fetchBookCover: vi.fn(async () => image()),
    fetchPartCover: vi.fn(async () => image({ id: 'part-cover', asset_type: 'part_cover' })),
    fetchChapterImages: vi.fn(async () => [
      image({ id: 'chapter-image', chapter_id: 'chapter-1', asset_type: 'chapter', file_name: '' }),
    ]),
    getImageBlob: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })),
    exportDatabase: vi.fn(async () => new TextEncoder().encode('{"version":6,"books":[],"chapters":[]}')),
  }
}

async function finishExport(state: ReturnType<typeof useDataExport>) {
  await flushPromises()
  await vi.waitFor(() => expect(state.isExporting.value).toBe(false))
}

beforeEach(() => {
  vi.clearAllMocks()
  zipState.files.clear()
  zipState.generateAsync.mockResolvedValue(new Blob(['zip']))
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:export') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('useDataExport', () => {
  it('exports structured books, parts, uncategorized chapters, notes, and images', async () => {
    const deps = createDeps()
    const state = useDataExport(deps)
    state.exportFormat.value = 'zip'

    state.handleExport()
    await finishExport(state)

    expect(zipState.files.get('Book___One/book-info.txt')).toContain('Title: Book / One')
    expect(zipState.files.has('Book___One/cover.jpeg')).toBe(true)
    expect(zipState.files.get('Book___One/cover.notes.md')).toBe('Image note')
    expect(zipState.files.has('Book___One/chapters/1 - Part_One/cover.jpeg')).toBe(true)
    expect(zipState.files.get('Book___One/chapters/1 - Part_One/1 - Opening/notes.md')).toBe('Chapter note')
    expect(zipState.files.has('Book___One/chapters/1 - Part_One/1 - Opening/images/image-01.png')).toBe(true)
    expect(zipState.files.get('Book___One/chapters/uncategorized/readme.txt')).toContain('without a part')
    expect(zipState.files.has('Book___One/chapters/uncategorized/1 - Loose___Ends/content.md')).toBe(true)
    expect(zipState.generateAsync).toHaveBeenCalledWith({ type: 'blob' })
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export')
    expect(state.exportProgress.value).toBe('Export completed!')
    expect(state.exportError.value).toBe('')
  })

  it('continues an export when optional image reads fail', async () => {
    const deps = createDeps()
    deps.fetchBookCover.mockRejectedValue(new Error('cover unavailable'))
    deps.fetchPartCover.mockRejectedValue(new Error('part cover unavailable'))
    deps.fetchChapterImages.mockResolvedValue([
      image({ id: 'broken-image', chapter_id: 'chapter-1', asset_type: 'chapter' }),
    ])
    deps.getImageBlob.mockRejectedValue(new Error('blob unavailable'))
    const state = useDataExport(deps)
    state.exportFormat.value = 'zip'

    state.handleExport()
    await finishExport(state)

    expect(console.warn).toHaveBeenCalledTimes(4)
    expect(console.warn).toHaveBeenCalledWith('Failed to export book cover:', expect.any(Error))
    expect(console.warn).toHaveBeenCalledWith('Failed to export part cover:', expect.any(Error))
    expect(zipState.files.has('Book___One/chapters/1 - Part_One/1 - Opening/content.md')).toBe(true)
    expect(state.exportError.value).toBe('')
  })

  it('exports Markdown by part, includes notes, and prevents concurrent exports', async () => {
    const deps = createDeps()
    let releaseBooks!: () => void
    deps.loadBooks.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseBooks = resolve }))
    const state = useDataExport(deps)
    state.exportFormat.value = 'markdown'
    state.markdownGranularity.value = 'part'

    state.handleExport()
    state.handleExport()
    expect(deps.loadBooks).toHaveBeenCalledOnce()
    releaseBooks()
    await finishExport(state)

    expect(zipState.files.get('Book___One/1 - Part_One.md')).toContain('Chapter note')
    expect(zipState.files.get('Book___One/Uncategorized.md')).toContain('Loose ends')
    expect(deps.getNotes).toHaveBeenCalledTimes(2)
    expect(state.exportProgress.value).toBe('Export completed!')
  })

  it('exports a canonical full library backup by default', async () => {
    const deps = createDeps()
    const state = useDataExport(deps)

    expect(state.exportFormat.value).toBe('bundle')
    state.handleExport()
    await finishExport(state)

    expect(deps.exportDatabase).toHaveBeenCalledOnce()
    expect(bundleState.create).toHaveBeenCalledOnce()
    const [backup, options] = bundleState.create.mock.calls[0]
    expect(ArrayBuffer.isView(backup)).toBe(true)
    expect(options).toEqual(expect.objectContaining({
      appVersion: expect.any(String), readAssetBytes: expect.any(Function),
    }))
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(state.exportProgress.value).toBe('Full library backup exported!')
  })

  it('surfaces full-backup integrity failures without downloading a partial archive', async () => {
    const deps = createDeps()
    bundleState.create.mockRejectedValueOnce(new Error('Image image-1 is missing required bytes.'))
    const state = useDataExport(deps)

    state.handleExport()
    await finishExport(state)

    expect(state.exportError.value).toBe('Export failed: Image image-1 is missing required bytes.')
    expect(state.exportProgress.value).toBe('')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('requires a valid selection and exports the exact selected book IDs', async () => {
    const deps = createDeps()
    const state = useDataExport(deps)
    state.bundleScope.value = 'selection'
    state.handleExport()
    await finishExport(state)
    expect(state.exportError.value).toBe('Select at least one book to export.')
    expect(bundleState.createSelection).not.toHaveBeenCalled()

    state.selectedBookIds.value = ['book-1']
    state.handleExport()
    await finishExport(state)
    const [backup, bookIds, options] = bundleState.createSelection.mock.calls[0]
    expect(ArrayBuffer.isView(backup)).toBe(true)
    expect(bookIds).toEqual(['book-1'])
    expect(options).toEqual(expect.objectContaining({
      appVersion: expect.any(String), readAssetBytes: expect.any(Function),
    }))
    expect(state.exportProgress.value).toBe('Selected books exported!')

    state.selectedBookIds.value = ['stale-book']
    state.handleExport()
    await finishExport(state)
    expect(state.exportError.value).toContain('no longer available')
    expect(bundleState.createSelection).toHaveBeenCalledOnce()
  })

  it('exports a canonical Git workspace through a user-selected directory', async () => {
    const deps = createDeps()
    const directory = { kind: 'directory' as const }
    const chooseBundleDirectory = vi.fn(async () => directory)
    bundleState.create.mockResolvedValueOnce({
      zipBytes: new Uint8Array([80, 75, 3, 4]),
      files: new Map([['beta-bot.yaml', new TextEncoder().encode('format: beta-bot-library')]]),
    })
    const state = useDataExport({ ...deps, chooseBundleDirectory } as Parameters<typeof useDataExport>[0])

    expect(state.canExportBundleDirectory.value).toBe(true)
    await state.exportFullLibraryDirectory()

    expect(chooseBundleDirectory).toHaveBeenCalledOnce()
    expect(directoryState.write).toHaveBeenCalledWith(
      directory,
      expect.any(Map),
      expect.any(Map),
    )
    expect(state.exportProgress.value).toContain('2 managed files written, 1 obsolete files removed')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('exports all or selected books as an editable text workspace ZIP or directory', async () => {
    const deps = createDeps()
    const directory = { kind: 'directory' as const }
    const chooseBundleDirectory = vi.fn(async () => directory)
    const state = useDataExport({ ...deps, chooseBundleDirectory } as Parameters<typeof useDataExport>[0])

    state.exportFormat.value = 'text-workspace'
    state.handleExport()
    await finishExport(state)
    expect(bundleState.createText).toHaveBeenCalledOnce()
    expect(bundleState.createText.mock.calls[0][2]).toBeUndefined()
    expect(state.exportProgress.value).toBe('Text-only workspace exported!')

    state.bundleScope.value = 'selection'
    state.selectedBookIds.value = ['book-1']
    await state.exportTextOnlyWorkspaceDirectory()
    expect(bundleState.createText).toHaveBeenCalledTimes(2)
    expect(bundleState.createText.mock.calls[1][2]).toEqual(['book-1'])
    expect(directoryState.write).toHaveBeenCalledWith(directory, expect.any(Map), expect.any(Map))
    expect(state.exportProgress.value).toContain('Text-only workspace updated')
  })

  it('reports load and archive-generation failures and resets busy state', async () => {
    const loadDeps = createDeps()
    loadDeps.loadBooks.mockRejectedValue(new Error('database unavailable'))
    const loadState = useDataExport(loadDeps)
    loadState.exportFormat.value = 'zip'
    loadState.handleExport()
    await finishExport(loadState)
    expect(loadState.exportError.value).toBe('Export failed: database unavailable')
    expect(loadState.exportProgress.value).toBe('')

    const zipDeps = createDeps()
    zipState.generateAsync.mockRejectedValueOnce('zip worker failed')
    const zipStateResult = useDataExport(zipDeps)
    zipStateResult.exportFormat.value = 'markdown'
    zipStateResult.includeNotes.value = false
    zipStateResult.handleExport()
    await finishExport(zipStateResult)
    expect(zipStateResult.exportError.value).toBe('Export failed: Unknown error')
    expect(zipDeps.getNotes).not.toHaveBeenCalled()
  })
})
