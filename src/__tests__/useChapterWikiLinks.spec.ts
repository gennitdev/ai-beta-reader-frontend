import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useChapterWikiLinks } from '@/composables/useChapterWikiLinks'
import type { ChapterWikiLink } from '@/lib/database'
import type { Chapter } from '@/types/chapterView'

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1',
    book_id: 'book-1',
    title: 'Chapter One',
    text: '',
    word_count: 0,
    part_id: null,
    summary: null,
    pov: null,
    characters: null,
    beats: null,
    spoilers_ok: null,
    notes: null,
    ...overrides,
  }
}

function link(wikiPageId: string): ChapterWikiLink {
  return {
    wiki_page_id: wikiPageId,
    page_name: `Page ${wikiPageId}`,
    page_type: 'character',
    link_source: 'manual',
    created_at: '2026-01-01',
    updated_at: null,
  }
}

function setup(overrides: {
  chapter?: Chapter | null
  chapterId?: string
  bookWikiPages?: { id: string; page_name: string; page_type?: string | null }[]
} = {}) {
  const chapter = ref<Chapter | null>(
    overrides.chapter === undefined ? makeChapter() : overrides.chapter,
  )
  const chapterId = ref(overrides.chapterId ?? 'ch-1')
  const bookWikiPages = ref(overrides.bookWikiPages ?? [])
  const deps = {
    chapter,
    chapterId,
    bookWikiPages,
    getChapterWikiLinks: vi.fn(async () => [link('w1'), link('w2')]),
    setChapterWikiLinks: vi.fn(async () => {}),
    reloadCharacters: vi.fn(async () => {}),
  }
  return { chapter, chapterId, bookWikiPages, deps, links: useChapterWikiLinks(deps) }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('alert', vi.fn())
})

describe('useChapterWikiLinks', () => {
  it('derives autocomplete options from the book wiki pages', () => {
    const { links } = setup({
      bookWikiPages: [
        { id: 'w1', page_name: 'Alice', page_type: 'character' },
        { id: 'w2', page_name: 'Castle', page_type: null },
      ],
    })
    expect(links.linkedWikiPageOptions.value).toEqual([
      { id: 'w1', label: 'Alice', detail: 'character' },
      { id: 'w2', label: 'Castle', detail: undefined },
    ])
  })

  it('loads linked wiki pages and seeds the selection buffer', async () => {
    const { links, deps } = setup()
    await links.loadLinkedWikiPages()

    expect(deps.getChapterWikiLinks).toHaveBeenCalledWith('ch-1')
    expect(links.linkedWikiPages.value).toHaveLength(2)
    expect(links.selectedLinkedWikiPageIds.value).toEqual(['w1', 'w2'])
    expect(links.loadingLinkedWikiPages.value).toBe(false)
  })

  it('clears state and skips the fetch when there is no chapter id', async () => {
    const { links, deps } = setup({ chapterId: '' })
    await links.loadLinkedWikiPages()

    expect(deps.getChapterWikiLinks).not.toHaveBeenCalled()
    expect(links.linkedWikiPages.value).toEqual([])
    expect(links.selectedLinkedWikiPageIds.value).toEqual([])
  })

  it('clears state when loading fails', async () => {
    const { links, deps } = setup()
    deps.getChapterWikiLinks.mockRejectedValueOnce(new Error('boom'))
    await links.loadLinkedWikiPages()

    expect(links.linkedWikiPages.value).toEqual([])
    expect(links.selectedLinkedWikiPageIds.value).toEqual([])
    expect(links.loadingLinkedWikiPages.value).toBe(false)
  })

  it('start/cancel editing resets the buffer from the loaded links', async () => {
    const { links } = setup()
    await links.loadLinkedWikiPages()
    links.selectedLinkedWikiPageIds.value = ['stale']

    links.startEditingLinkedWikiPages()
    expect(links.isEditingLinkedWikiPages.value).toBe(true)
    expect(links.selectedLinkedWikiPageIds.value).toEqual(['w1', 'w2'])

    links.selectedLinkedWikiPageIds.value = ['stale']
    links.cancelEditingLinkedWikiPages()
    expect(links.isEditingLinkedWikiPages.value).toBe(false)
    expect(links.selectedLinkedWikiPageIds.value).toEqual(['w1', 'w2'])
  })

  it('saves the selection, reloads, refreshes characters, and exits edit mode', async () => {
    const { links, deps } = setup()
    links.selectedLinkedWikiPageIds.value = ['w3']
    links.isEditingLinkedWikiPages.value = true

    await links.saveLinkedWikiPages()

    expect(deps.setChapterWikiLinks).toHaveBeenCalledWith('ch-1', ['w3'], 'manual')
    expect(deps.getChapterWikiLinks).toHaveBeenCalled()
    expect(deps.reloadCharacters).toHaveBeenCalled()
    expect(links.isEditingLinkedWikiPages.value).toBe(false)
    expect(links.savingLinkedWikiPages.value).toBe(false)
  })

  it('does nothing on save when no chapter is loaded', async () => {
    const { links, deps } = setup({ chapter: null })
    await links.saveLinkedWikiPages()
    expect(deps.setChapterWikiLinks).not.toHaveBeenCalled()
  })

  it('alerts and stays in edit mode when saving fails', async () => {
    const { links, deps } = setup()
    links.isEditingLinkedWikiPages.value = true
    deps.setChapterWikiLinks.mockRejectedValueOnce(new Error('offline'))

    await links.saveLinkedWikiPages()

    expect(alert).toHaveBeenCalledWith('Failed to save linked wiki pages')
    expect(links.isEditingLinkedWikiPages.value).toBe(true)
    expect(links.savingLinkedWikiPages.value).toBe(false)
  })

  it('reloads and resets edit state when the chapter id changes', async () => {
    const { chapterId, deps } = setup()
    chapterId.value = 'ch-2'
    await flushPromises()
    expect(deps.getChapterWikiLinks).toHaveBeenCalledWith('ch-2')
  })
})
