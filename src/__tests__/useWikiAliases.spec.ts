import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useWikiAliases } from '@/composables/useWikiAliases'
import type { WikiPage } from '@/types/wikiPageView'

function makeWikiPage(overrides: Partial<WikiPage> = {}): WikiPage {
  return {
    id: 'wiki-1',
    book_id: 'book-1',
    page_name: 'Alice',
    page_type: 'character',
    content: '',
    summary: null,
    aliases: ['Ally'],
    tags: [],
    is_major: false,
    is_pinned: false,
    created_by_ai: false,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  }
}

function setup(overrides: { wikiPage?: WikiPage | null; wikiPageId?: string } = {}) {
  const wikiPage = ref<WikiPage | null>(
    overrides.wikiPage === undefined ? makeWikiPage() : overrides.wikiPage,
  )
  const wikiPageId = ref(overrides.wikiPageId ?? 'wiki-1')
  const deps = {
    wikiPage,
    wikiPageId,
    updateWikiPage: vi.fn(async () => {}),
  }
  return { wikiPage, wikiPageId, deps, aliases: useWikiAliases(deps) }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('useWikiAliases', () => {
  it('resets the editor from the current page', () => {
    const { aliases } = setup()
    aliases.isEditingAliases.value = true
    aliases.newAlias.value = 'junk'
    aliases.aliasError.value = 'stale'

    aliases.resetAliasEditor()

    expect(aliases.editedAliases.value).toEqual(['Ally'])
    expect(aliases.newAlias.value).toBe('')
    expect(aliases.aliasError.value).toBe('')
    expect(aliases.isEditingAliases.value).toBe(false)
  })

  it('resets to an empty buffer when there is no page', () => {
    const { aliases } = setup({ wikiPage: null })
    aliases.resetAliasEditor()
    expect(aliases.editedAliases.value).toEqual([])
  })

  it('startEditingAliases opens the editor, and is a no-op with no page', () => {
    const withPage = setup()
    withPage.aliases.startEditingAliases()
    expect(withPage.aliases.isEditingAliases.value).toBe(true)
    expect(withPage.aliases.editedAliases.value).toEqual(['Ally'])

    const noPage = setup({ wikiPage: null })
    noPage.aliases.startEditingAliases()
    expect(noPage.aliases.isEditingAliases.value).toBe(false)
  })

  it('adds a trimmed alias and clears the input', () => {
    const { aliases } = setup()
    aliases.startEditingAliases()
    aliases.newAlias.value = '  Wonder  '
    aliases.addAlias()

    expect(aliases.editedAliases.value).toEqual(['Ally', 'Wonder'])
    expect(aliases.newAlias.value).toBe('')
    expect(aliases.aliasError.value).toBe('')
  })

  it('rejects an alias duplicating an existing one or the page name', () => {
    const { aliases } = setup()
    aliases.startEditingAliases()

    aliases.newAlias.value = 'ally'
    aliases.addAlias()
    expect(aliases.editedAliases.value).toEqual(['Ally'])
    expect(aliases.aliasError.value).toContain('unique')

    aliases.newAlias.value = 'Alice'
    aliases.addAlias()
    expect(aliases.editedAliases.value).toEqual(['Ally'])
  })

  it('removes an alias and clears any error', () => {
    const { aliases } = setup()
    aliases.startEditingAliases()
    aliases.aliasError.value = 'stale'
    aliases.removeAlias('Ally')

    expect(aliases.editedAliases.value).toEqual([])
    expect(aliases.aliasError.value).toBe('')
  })

  it('saves normalized aliases and writes them back onto the page', async () => {
    const { aliases, deps, wikiPage } = setup()
    aliases.startEditingAliases()
    aliases.editedAliases.value = ['Wonder', 'wonder', 'Alice']

    await aliases.saveAliases()

    expect(deps.updateWikiPage).toHaveBeenCalledWith('wiki-1', { aliases: ['Wonder'] })
    expect(wikiPage.value?.aliases).toEqual(['Wonder'])
    expect(aliases.editedAliases.value).toEqual(['Wonder'])
    expect(aliases.isEditingAliases.value).toBe(false)
    expect(aliases.savingAliases.value).toBe(false)
  })

  it('surfaces the error message when saving fails', async () => {
    const { aliases, deps } = setup()
    aliases.startEditingAliases()
    deps.updateWikiPage.mockRejectedValueOnce(new Error('name already used'))

    await aliases.saveAliases()

    expect(aliases.aliasError.value).toBe('name already used')
    expect(aliases.isEditingAliases.value).toBe(true)
    expect(aliases.savingAliases.value).toBe(false)
  })

  it('does nothing on save when there is no page', async () => {
    const { aliases, deps } = setup({ wikiPage: null })
    await aliases.saveAliases()
    expect(deps.updateWikiPage).not.toHaveBeenCalled()
  })
})
