import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useWikiLinkedChapters } from '@/composables/useWikiLinkedChapters'
import type { WikiPageChapterLink } from '@/lib/database'
import type { WikiPage } from '@/types/wikiPageView'

function makeWikiPage(overrides: Partial<WikiPage> = {}): WikiPage {
  return {
    id: 'wiki-1',
    book_id: 'book-1',
    page_name: 'Alice',
    page_type: 'character',
    content: '',
    summary: null,
    aliases: [],
    tags: [],
    is_major: false,
    is_pinned: false,
    created_by_ai: false,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  }
}

function chapterLink(chapterId: string): WikiPageChapterLink {
  return {
    chapter_id: chapterId,
    chapter_title: `Title ${chapterId}`,
    part_id: null,
    link_source: 'manual',
    created_at: '2026-01-01',
    updated_at: null,
  }
}

function setup(overrides: {
  wikiPage?: WikiPage | null
  wikiPageId?: string
  chapters?: { id: string; title?: string | null }[]
  chapterOrder?: string | null
} = {}) {
  const wikiPage = ref<WikiPage | null>(
    overrides.wikiPage === undefined ? makeWikiPage() : overrides.wikiPage,
  )
  const wikiPageId = ref(overrides.wikiPageId ?? 'wiki-1')
  const deps = {
    wikiPage,
    wikiPageId,
    getChapters: vi.fn(() => overrides.chapters ?? []),
    getCurrentBook: vi.fn(() => ({ chapter_order: overrides.chapterOrder ?? null })),
    getWikiPageChapterLinks: vi.fn(async () => [chapterLink('c1'), chapterLink('c2')]),
    setWikiPageChapterLinks: vi.fn(async () => {}),
  }
  return { wikiPage, wikiPageId, deps, linked: useWikiLinkedChapters(deps) }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('alert', vi.fn())
})

describe('useWikiLinkedChapters', () => {
  it('orders chapter options by the stored chapter order, appending unlisted chapters', () => {
    const { linked } = setup({
      chapters: [
        { id: 'c1', title: 'Alpha' },
        { id: 'c2', title: null },
        { id: 'c3', title: 'Gamma' },
      ],
      chapterOrder: JSON.stringify(['c3', 'c1']),
    })
    expect(linked.chapterOptions.value).toEqual([
      { id: 'c3', label: 'Gamma', detail: 'Ch 1' },
      { id: 'c1', label: 'Alpha', detail: 'Ch 2' },
      { id: 'c2', label: 'Chapter 3', detail: 'Ch 3' },
    ])
  })

  it('drops ids in the stored order that no longer exist as chapters', () => {
    const { linked } = setup({
      chapters: [{ id: 'c1', title: 'Alpha' }],
      chapterOrder: JSON.stringify(['ghost', 'c1']),
    })
    expect(linked.chapterOptions.value).toEqual([
      { id: 'c1', label: 'Alpha', detail: 'Ch 1' },
    ])
  })

  it('loads linked chapters and seeds the selection buffer', async () => {
    const { linked, deps } = setup()
    await linked.loadLinkedChapters()

    expect(deps.getWikiPageChapterLinks).toHaveBeenCalledWith('wiki-1')
    expect(linked.linkedChapters.value).toHaveLength(2)
    expect(linked.selectedLinkedChapterIds.value).toEqual(['c1', 'c2'])
    expect(linked.loadingLinkedChapters.value).toBe(false)
  })

  it('clears state and skips the fetch when there is no wiki page id', async () => {
    const { linked, deps } = setup({ wikiPageId: '' })
    await linked.loadLinkedChapters()

    expect(deps.getWikiPageChapterLinks).not.toHaveBeenCalled()
    expect(linked.linkedChapters.value).toEqual([])
    expect(linked.selectedLinkedChapterIds.value).toEqual([])
  })

  it('clears state when loading fails', async () => {
    const { linked, deps } = setup()
    deps.getWikiPageChapterLinks.mockRejectedValueOnce(new Error('boom'))
    await linked.loadLinkedChapters()

    expect(linked.linkedChapters.value).toEqual([])
    expect(linked.selectedLinkedChapterIds.value).toEqual([])
    expect(linked.loadingLinkedChapters.value).toBe(false)
  })

  it('start/cancel editing resets the buffer from the loaded links', async () => {
    const { linked } = setup()
    await linked.loadLinkedChapters()

    linked.selectedLinkedChapterIds.value = ['stale']
    linked.startEditingLinkedChapters()
    expect(linked.isEditingLinkedChapters.value).toBe(true)
    expect(linked.selectedLinkedChapterIds.value).toEqual(['c1', 'c2'])

    linked.selectedLinkedChapterIds.value = ['stale']
    linked.cancelEditingLinkedChapters()
    expect(linked.isEditingLinkedChapters.value).toBe(false)
    expect(linked.selectedLinkedChapterIds.value).toEqual(['c1', 'c2'])
  })

  it('saves the selection, reloads, and exits edit mode', async () => {
    const { linked, deps } = setup()
    linked.selectedLinkedChapterIds.value = ['c9']
    linked.isEditingLinkedChapters.value = true

    await linked.saveLinkedChapters()

    expect(deps.setWikiPageChapterLinks).toHaveBeenCalledWith('wiki-1', ['c9'], 'manual')
    expect(deps.getWikiPageChapterLinks).toHaveBeenCalled()
    expect(linked.isEditingLinkedChapters.value).toBe(false)
    expect(linked.savingLinkedChapters.value).toBe(false)
  })

  it('does nothing on save when no wiki page is loaded', async () => {
    const { linked, deps } = setup({ wikiPage: null })
    await linked.saveLinkedChapters()
    expect(deps.setWikiPageChapterLinks).not.toHaveBeenCalled()
  })

  it('alerts and stays in edit mode when saving fails', async () => {
    const { linked, deps } = setup()
    linked.isEditingLinkedChapters.value = true
    deps.setWikiPageChapterLinks.mockRejectedValueOnce(new Error('offline'))

    await linked.saveLinkedChapters()

    expect(alert).toHaveBeenCalledWith('Failed to save linked chapters')
    expect(linked.isEditingLinkedChapters.value).toBe(true)
    expect(linked.savingLinkedChapters.value).toBe(false)
  })
})
