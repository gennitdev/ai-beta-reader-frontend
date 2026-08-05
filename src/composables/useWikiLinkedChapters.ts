import { computed, ref, type Ref } from 'vue'
import type { WikiPageChapterLink } from '@/lib/database'
import { type AutocompleteOption } from '@/components/links/AutocompleteMultiSelect.vue'
import { parseIdArray } from '@/utils/wikiPageView'
import type { WikiPage } from '@/types/wikiPageView'

interface ChapterLike {
  id: string
  title?: string | null
}

interface UseWikiLinkedChaptersDeps {
  wikiPage: Ref<WikiPage | null>
  wikiPageId: Ref<string>
  getChapters: () => ChapterLike[]
  getCurrentBook: () => { chapter_order?: string | null } | null
  getWikiPageChapterLinks: (wikiPageId: string) => Promise<WikiPageChapterLink[]>
  setWikiPageChapterLinks: (
    wikiPageId: string,
    chapterIds: string[],
    source: 'manual',
  ) => Promise<void>
}

/**
 * The chapters manually linked to a wiki page: loading, the edit buffer, saving,
 * and the ordered autocomplete options derived from the book's chapter order.
 */
export function useWikiLinkedChapters(deps: UseWikiLinkedChaptersDeps) {
  const {
    wikiPage,
    wikiPageId,
    getChapters,
    getCurrentBook,
    getWikiPageChapterLinks,
    setWikiPageChapterLinks,
  } = deps

  const linkedChapters = ref<WikiPageChapterLink[]>([])
  const loadingLinkedChapters = ref(false)
  const isEditingLinkedChapters = ref(false)
  const selectedLinkedChapterIds = ref<string[]>([])
  const savingLinkedChapters = ref(false)

  const chapterOptions = computed<AutocompleteOption[]>(() => {
    const chapters = getChapters()
    const chapterOrder = parseIdArray(getCurrentBook()?.chapter_order)
    const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]))
    const orderedIds = [
      ...chapterOrder.filter((id) => chapterMap.has(id)),
      ...chapters
        .map((chapter) => chapter.id)
        .filter((id) => !chapterOrder.includes(id)),
    ]

    return orderedIds.reduce<AutocompleteOption[]>((options, id, index) => {
      const chapter = chapterMap.get(id)
      if (!chapter) return options
      options.push({
        id: chapter.id,
        label: chapter.title || `Chapter ${index + 1}`,
        detail: `Ch ${index + 1}`,
      })
      return options
    }, [])
  })

  const loadLinkedChapters = async () => {
    if (!wikiPageId.value) {
      linkedChapters.value = []
      selectedLinkedChapterIds.value = []
      return
    }

    loadingLinkedChapters.value = true
    try {
      const links = await getWikiPageChapterLinks(wikiPageId.value)
      linkedChapters.value = links
      selectedLinkedChapterIds.value = links.map((link) => link.chapter_id)
    } catch (error) {
      console.error('Failed to load linked chapters:', error)
      linkedChapters.value = []
      selectedLinkedChapterIds.value = []
    } finally {
      loadingLinkedChapters.value = false
    }
  }

  const startEditingLinkedChapters = () => {
    selectedLinkedChapterIds.value = linkedChapters.value.map((link) => link.chapter_id)
    isEditingLinkedChapters.value = true
  }

  const cancelEditingLinkedChapters = () => {
    selectedLinkedChapterIds.value = linkedChapters.value.map((link) => link.chapter_id)
    isEditingLinkedChapters.value = false
  }

  const saveLinkedChapters = async () => {
    if (!wikiPage.value) return

    savingLinkedChapters.value = true
    try {
      await setWikiPageChapterLinks(wikiPage.value.id, selectedLinkedChapterIds.value, 'manual')
      await loadLinkedChapters()
      isEditingLinkedChapters.value = false
    } catch (error) {
      console.error('Failed to save linked chapters:', error)
      alert('Failed to save linked chapters')
    } finally {
      savingLinkedChapters.value = false
    }
  }

  return {
    linkedChapters,
    loadingLinkedChapters,
    isEditingLinkedChapters,
    selectedLinkedChapterIds,
    savingLinkedChapters,
    chapterOptions,
    loadLinkedChapters,
    startEditingLinkedChapters,
    cancelEditingLinkedChapters,
    saveLinkedChapters,
  }
}
