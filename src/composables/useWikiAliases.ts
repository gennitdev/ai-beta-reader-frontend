import { ref, type Ref } from 'vue'
import { normalizeWikiAliases } from '@/lib/wikiAliases'
import type { WikiPage } from '@/types/wikiPageView'

interface UseWikiAliasesDeps {
  wikiPage: Ref<WikiPage | null>
  wikiPageId: Ref<string>
  updateWikiPage: (pageId: string, updates: { aliases?: string[] }) => Promise<void>
}

/**
 * Alternate-name (alias) editing for a wiki page: the edit buffer, add/remove
 * with normalization + uniqueness validation, and persistence.
 */
export function useWikiAliases(deps: UseWikiAliasesDeps) {
  const { wikiPage, wikiPageId, updateWikiPage } = deps

  const isEditingAliases = ref(false)
  const editedAliases = ref<string[]>([])
  const newAlias = ref('')
  const savingAliases = ref(false)
  const aliasError = ref('')

  /** Re-seed the editor from the current page (called after (re)loading a page). */
  const resetAliasEditor = () => {
    editedAliases.value = wikiPage.value ? [...wikiPage.value.aliases] : []
    newAlias.value = ''
    aliasError.value = ''
    isEditingAliases.value = false
  }

  const startEditingAliases = () => {
    if (!wikiPage.value) return
    editedAliases.value = [...wikiPage.value.aliases]
    newAlias.value = ''
    aliasError.value = ''
    isEditingAliases.value = true
  }

  const cancelEditAliases = () => {
    if (!wikiPage.value) return
    editedAliases.value = [...wikiPage.value.aliases]
    newAlias.value = ''
    aliasError.value = ''
    isEditingAliases.value = false
  }

  const addAlias = () => {
    if (!wikiPage.value) return
    const alias = newAlias.value.trim()
    if (!alias) return

    const nextAliases = normalizeWikiAliases(
      [...editedAliases.value, alias],
      wikiPage.value.page_name,
    )
    if (nextAliases.length === editedAliases.value.length) {
      aliasError.value = 'Alternate names must be unique and different from the page name.'
      return
    }

    editedAliases.value = nextAliases
    newAlias.value = ''
    aliasError.value = ''
  }

  const removeAlias = (aliasToRemove: string) => {
    editedAliases.value = editedAliases.value.filter((alias) => alias !== aliasToRemove)
    aliasError.value = ''
  }

  const saveAliases = async () => {
    if (!wikiPage.value) return

    const aliases = normalizeWikiAliases(editedAliases.value, wikiPage.value.page_name)
    savingAliases.value = true
    aliasError.value = ''
    try {
      await updateWikiPage(wikiPageId.value, { aliases })
      wikiPage.value.aliases = aliases
      wikiPage.value.updated_at = new Date().toISOString()
      editedAliases.value = [...aliases]
      newAlias.value = ''
      isEditingAliases.value = false
    } catch (error) {
      console.error('Failed to save wiki page alternate names:', error)
      aliasError.value = error instanceof Error
        ? error.message
        : 'Failed to save alternate names.'
    } finally {
      savingAliases.value = false
    }
  }

  return {
    isEditingAliases,
    editedAliases,
    newAlias,
    savingAliases,
    aliasError,
    resetAliasEditor,
    startEditingAliases,
    cancelEditAliases,
    addAlias,
    removeAlias,
    saveAliases,
  }
}
