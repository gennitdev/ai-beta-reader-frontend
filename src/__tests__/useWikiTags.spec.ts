import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useWikiTags } from '@/composables/useWikiTags'
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
    tags: ['hero'],
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
  return { wikiPage, wikiPageId, deps, tags: useWikiTags(deps) }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('alert', vi.fn())
})

describe('useWikiTags', () => {
  it('resets the editor from the current page', () => {
    const { tags } = setup()
    tags.isEditingTags.value = true
    tags.newTag.value = 'junk'

    tags.resetTagEditor()

    expect(tags.editedTags.value).toEqual(['hero'])
    expect(tags.newTag.value).toBe('')
    expect(tags.isEditingTags.value).toBe(false)
  })

  it('resets to an empty buffer when there is no page', () => {
    const { tags } = setup({ wikiPage: null })
    tags.resetTagEditor()
    expect(tags.editedTags.value).toEqual([])
  })

  it('startEditingTags opens the editor, and is a no-op with no page', () => {
    const withPage = setup()
    withPage.tags.startEditingTags()
    expect(withPage.tags.isEditingTags.value).toBe(true)
    expect(withPage.tags.editedTags.value).toEqual(['hero'])

    const noPage = setup({ wikiPage: null })
    noPage.tags.startEditingTags()
    expect(noPage.tags.isEditingTags.value).toBe(false)
  })

  it('adds a trimmed tag and de-duplicates case-insensitively', () => {
    const { tags } = setup()
    tags.startEditingTags()

    tags.newTag.value = '  Villain  '
    tags.addTag()
    expect(tags.editedTags.value).toEqual(['hero', 'Villain'])
    expect(tags.newTag.value).toBe('')

    tags.newTag.value = 'HERO'
    tags.addTag()
    expect(tags.editedTags.value).toEqual(['hero', 'Villain'])
  })

  it('removes a tag', () => {
    const { tags } = setup()
    tags.startEditingTags()
    tags.removeTag('hero')
    expect(tags.editedTags.value).toEqual([])
  })

  it('saves tags as a JSON string and writes them back onto the page', async () => {
    const { tags, deps, wikiPage } = setup()
    tags.startEditingTags()
    tags.editedTags.value = ['Villain', 'villain', 'Mentor']

    await tags.saveTags()

    expect(deps.updateWikiPage).toHaveBeenCalledWith('wiki-1', {
      tags: JSON.stringify(['Villain', 'Mentor']),
    })
    expect(wikiPage.value?.tags).toEqual(['Villain', 'Mentor'])
    expect(tags.editedTags.value).toEqual(['Villain', 'Mentor'])
    expect(tags.isEditingTags.value).toBe(false)
    expect(tags.savingTags.value).toBe(false)
  })

  it('alerts and stays in edit mode when saving fails', async () => {
    const { tags, deps } = setup()
    tags.startEditingTags()
    deps.updateWikiPage.mockRejectedValueOnce(new Error('offline'))

    await tags.saveTags()

    expect(alert).toHaveBeenCalledWith('Failed to save tags')
    expect(tags.isEditingTags.value).toBe(true)
    expect(tags.savingTags.value).toBe(false)
  })

  it('does nothing on save when there is no page', async () => {
    const { tags, deps } = setup({ wikiPage: null })
    await tags.saveTags()
    expect(deps.updateWikiPage).not.toHaveBeenCalled()
  })
})
