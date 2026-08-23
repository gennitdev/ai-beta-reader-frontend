import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const h = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: h.push }) }))

import { useChapterCharacters } from '@/composables/useChapterCharacters'
import type { WikiPage } from '@/lib/database'
import type { Chapter } from '@/types/chapterView'

function chapter(over: Partial<Chapter> = {}): Chapter {
  return {
    id: 'chapter-1', book_id: 'book-1', title: 'One', text: '', word_count: 0,
    part_id: null, summary: null, pov: null, characters: null, beats: null,
    spoilers_ok: null, notes: null, ...over,
  }
}

function wikiPage(over: Partial<WikiPage> = {}): WikiPage {
  return {
    id: 'w1', book_id: 'book-1', page_name: 'Mara', page_type: 'character',
    aliases: '["The Ranger"]', created_at: '2026-01-01', updated_at: '2026-01-02',
    ...over,
  } as WikiPage
}

function setup(chapterValue: Chapter | null = chapter({ characters: ['Mara'] }), pages: WikiPage[] = [wikiPage()]) {
  const chapterRef = ref<Chapter | null>(chapterValue)
  const deps = {
    chapter: chapterRef,
    bookId: ref('book-1'),
    chapterId: ref('chapter-1'),
    routePrefix: ref('/app'),
    getWikiPages: vi.fn(async () => pages),
  }
  return { chapterRef, deps, chars: useChapterCharacters(deps) }
}

beforeEach(() => {
  h.push.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('useChapterCharacters', () => {
  it('resolves character names to their wiki pages with parsed aliases', async () => {
    const { chars, deps } = setup()

    await chars.loadCharacters()

    expect(deps.getWikiPages).toHaveBeenCalledWith('book-1')
    expect(chars.characters.value).toEqual([
      {
        id: 'w1',
        character_name: 'Mara',
        wiki_page_id: 'w1',
        has_wiki_page: true,
        aliases: ['The Ranger'],
      },
    ])
  })

  it('marks characters without a matching wiki page as unlinked', async () => {
    const { chars } = setup(chapter({ characters: ['Ghost'] }))

    await chars.loadCharacters()

    expect(chars.characters.value).toEqual([
      {
        id: 'char-Ghost',
        character_name: 'Ghost',
        wiki_page_id: null,
        has_wiki_page: false,
        aliases: [],
      },
    ])
  })

  it('clears characters when the chapter has none', async () => {
    const { chars, deps } = setup(chapter({ characters: null }))
    await chars.loadCharacters()
    expect(chars.characters.value).toEqual([])
    expect(deps.getWikiPages).not.toHaveBeenCalled()
  })

  it('falls back to bare names without wiki info when wiki lookup throws', async () => {
    const { chars, deps } = setup(chapter({ characters: ['Mara', 'Ghost'] }))
    deps.getWikiPages.mockRejectedValueOnce(new Error('db down'))

    await chars.loadCharacters()

    expect(chars.characters.value).toEqual([
      { id: 'char-Mara', character_name: 'Mara', wiki_page_id: null, has_wiki_page: false },
      { id: 'char-Ghost', character_name: 'Ghost', wiki_page_id: null, has_wiki_page: false },
    ])
  })

  it('getCharacterWikiInfo finds a loaded character by name', async () => {
    const { chars } = setup()
    await chars.loadCharacters()

    expect(chars.getCharacterWikiInfo('Mara')?.wiki_page_id).toBe('w1')
    expect(chars.getCharacterWikiInfo('Unknown')).toBeUndefined()
  })

  it('navigates to the wiki page with a fromChapterId query when one is linked', async () => {
    const { chars } = setup()
    await chars.loadCharacters()

    chars.navigateToWiki('Mara')

    expect(h.push).toHaveBeenCalledWith({
      path: '/app/book-1/wiki/w1',
      query: { fromChapterId: 'chapter-1' },
    })
  })

  it('does not navigate for a character without a wiki page', async () => {
    const { chars } = setup(chapter({ characters: ['Ghost'] }))
    await chars.loadCharacters()

    chars.navigateToWiki('Ghost')

    expect(h.push).not.toHaveBeenCalled()
  })
})
