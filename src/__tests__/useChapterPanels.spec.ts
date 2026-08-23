// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useChapterPanels } from '@/composables/useChapterPanels'
import type { Chapter } from '@/types/chapterView'

const STORAGE_KEY = 'chapter_summary_update_wiki_enabled'

function chapter(over: Partial<Chapter> = {}): Chapter {
  return {
    id: 'chapter-1', book_id: 'book-1', title: 'One', text: '', word_count: 0,
    part_id: null, summary: null, pov: null, characters: null, beats: null,
    spoilers_ok: null, notes: null, ...over,
  }
}

function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  }
}

let localStorageMock: ReturnType<typeof createLocalStorageMock>

// Mount the composable inside a real component so onMounted/watch run.
function withPanels(chapterValue: Chapter | null = chapter()) {
  const chapterRef = ref<Chapter | null>(chapterValue)
  let panels!: ReturnType<typeof useChapterPanels>
  const wrapper = mount({
    setup() {
      panels = useChapterPanels({ chapter: chapterRef })
      return () => null
    },
  })
  return { chapterRef, panels, unmount: () => wrapper.unmount() }
}

beforeEach(() => {
  localStorageMock = createLocalStorageMock()
  vi.stubGlobal('localStorage', localStorageMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useChapterPanels', () => {
  it('exposes collapsed panels and default preferences', () => {
    const { panels } = withPanels()
    expect(panels.showSummaryPanel.value).toBe(false)
    expect(panels.showNotesPanel.value).toBe(false)
    expect(panels.showFullChapterText.value).toBe(false)
    expect(panels.isEditingSummary.value).toBe(false)
    expect(panels.updateWikiOnSummary.value).toBe(true)
  })

  it('starts editing the summary only when the chapter has summary text', () => {
    const { panels } = withPanels(chapter({ summary: 'A recap.' }))
    panels.startEditingSummary()
    expect(panels.isEditingSummary.value).toBe(true)
    expect(panels.editedSummary.value).toBe('A recap.')
  })

  it('does not start editing when the chapter summary is empty', () => {
    const { panels } = withPanels(chapter({ summary: null }))
    panels.startEditingSummary()
    expect(panels.isEditingSummary.value).toBe(false)
    expect(panels.editedSummary.value).toBe('')
  })

  it('cancels summary editing and clears the buffer', () => {
    const { panels } = withPanels(chapter({ summary: 'A recap.' }))
    panels.startEditingSummary()
    panels.cancelEditingSummary()
    expect(panels.isEditingSummary.value).toBe(false)
    expect(panels.editedSummary.value).toBe('')
  })

  it('seeds the notes buffer from the chapter, defaulting to empty', () => {
    const { panels } = withPanels(chapter({ notes: 'watch pacing' }))
    panels.startEditingNotes()
    expect(panels.isEditingNotes.value).toBe(true)
    expect(panels.editedNotes.value).toBe('watch pacing')
  })

  it('cancelling notes restores the chapter notes into the buffer', () => {
    const { panels } = withPanels(chapter({ notes: 'watch pacing' }))
    panels.startEditingNotes()
    panels.editedNotes.value = 'unsaved scribble'
    panels.cancelEditingNotes()
    expect(panels.isEditingNotes.value).toBe(false)
    expect(panels.editedNotes.value).toBe('watch pacing')
  })

  it('hydrates the wiki-update preference from localStorage on mount', () => {
    localStorageMock.setItem(STORAGE_KEY, 'false')
    const { panels } = withPanels()
    expect(panels.updateWikiOnSummary.value).toBe(false)
  })

  it('persists the wiki-update preference when it changes', async () => {
    const { panels } = withPanels()
    panels.updateWikiOnSummary.value = false
    await nextTick()
    expect(localStorageMock.getItem(STORAGE_KEY)).toBe('false')
  })
})
