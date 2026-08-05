import { ref, type Ref } from 'vue'
import { normalizeTags } from '@/utils/wikiPageView'
import type { WikiPage } from '@/types/wikiPageView'

interface UseWikiTagsDeps {
  wikiPage: Ref<WikiPage | null>
  wikiPageId: Ref<string>
  updateWikiPage: (pageId: string, updates: { tags?: string }) => Promise<void>
}

/**
 * Tag editing for a wiki page: the edit buffer, add/remove with case-insensitive
 * de-duplication, and persistence (tags are stored as a JSON string).
 */
export function useWikiTags(deps: UseWikiTagsDeps) {
  const { wikiPage, wikiPageId, updateWikiPage } = deps

  const isEditingTags = ref(false)
  const editedTags = ref<string[]>([])
  const newTag = ref('')
  const savingTags = ref(false)

  /** Re-seed the editor from the current page (called after (re)loading a page). */
  const resetTagEditor = () => {
    editedTags.value = wikiPage.value ? [...wikiPage.value.tags] : []
    newTag.value = ''
    isEditingTags.value = false
  }

  const startEditingTags = () => {
    if (!wikiPage.value) return
    editedTags.value = [...wikiPage.value.tags]
    newTag.value = ''
    isEditingTags.value = true
  }

  const cancelEditTags = () => {
    if (!wikiPage.value) return
    editedTags.value = [...wikiPage.value.tags]
    newTag.value = ''
    isEditingTags.value = false
  }

  const addTag = () => {
    const nextTag = newTag.value.trim()
    if (!nextTag) return
    editedTags.value = normalizeTags([...editedTags.value, nextTag])
    newTag.value = ''
  }

  const removeTag = (tagToRemove: string) => {
    editedTags.value = editedTags.value.filter((tag) => tag !== tagToRemove)
  }

  const saveTags = async () => {
    if (!wikiPage.value) return

    const normalizedTags = normalizeTags(editedTags.value)
    savingTags.value = true
    try {
      await updateWikiPage(wikiPageId.value, {
        tags: JSON.stringify(normalizedTags),
      })

      wikiPage.value.tags = normalizedTags
      wikiPage.value.updated_at = new Date().toISOString()
      editedTags.value = [...normalizedTags]
      newTag.value = ''
      isEditingTags.value = false
    } catch (error) {
      console.error('Failed to save wiki page tags:', error)
      alert('Failed to save tags')
    } finally {
      savingTags.value = false
    }
  }

  return {
    isEditingTags,
    editedTags,
    newTag,
    savingTags,
    resetTagEditor,
    startEditingTags,
    cancelEditTags,
    addTag,
    removeTag,
    saveTags,
  }
}
