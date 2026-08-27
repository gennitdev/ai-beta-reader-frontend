import type { BundleInventory } from './inventory'
import type { CanonicalLibraryModel } from './model'

export interface WikiDeletionCascade {
  wikiPageId: string
  wikiUpdates: number
  wikiReviewStates: number
  chapterMentions: number
  assetTags: number
  bookCharacters: number
}

export interface NormalizedDeletedWikiReferences {
  model: CanonicalLibraryModel
  cascades: readonly WikiDeletionCascade[]
}

/**
 * Match the app's wiki-page deletion behavior for an externally edited bundle.
 *
 * An inventoried page missing from the incoming model is an intentional
 * deletion. App-owned audit/review relationships and embedded references that
 * still point at it are removed in the incoming model so Apply changes can
 * preview and commit the complete deletion without asking users to edit
 * generated JSONL files.
 */
export function normalizeDeletedWikiReferences(
  input: CanonicalLibraryModel,
  inventory: BundleInventory,
): NormalizedDeletedWikiReferences {
  const incomingPageIds = new Set(input.wiki_pages.map((page) => page.id))
  const deletedPageIds = new Set(inventory.entities
    .filter((entry) => entry.entity_type === 'wiki_page' && !incomingPageIds.has(entry.id))
    .map((entry) => entry.id))
  if (deletedPageIds.size === 0) return { model: input, cascades: [] }

  const model = structuredClone(input)
  const cascades = [...deletedPageIds].sort().map<WikiDeletionCascade>((wikiPageId) => {
    const wikiUpdates = model.wiki_updates.filter((value) => value.wiki_page_id === wikiPageId).length
    const wikiReviewStates = model.wiki_review_state.filter((value) => value.wiki_page_id === wikiPageId).length
    let chapterMentions = 0
    let assetTags = 0
    let bookCharacters = 0

    model.wiki_updates = model.wiki_updates.filter((value) => value.wiki_page_id !== wikiPageId)
    model.wiki_review_state = model.wiki_review_state.filter((value) => value.wiki_page_id !== wikiPageId)
    model.chapters = model.chapters.map((chapter) => {
      const mentions = chapter.wiki_mentions.filter((mention) => mention.wiki_page_id !== wikiPageId)
      chapterMentions += chapter.wiki_mentions.length - mentions.length
      return mentions.length === chapter.wiki_mentions.length ? chapter : { ...chapter, wiki_mentions: mentions }
    })
    model.assets = model.assets.map((asset) => {
      const wikiPageIds = asset.wiki_page_ids.filter((id) => id !== wikiPageId)
      assetTags += asset.wiki_page_ids.length - wikiPageIds.length
      return wikiPageIds.length === asset.wiki_page_ids.length ? asset : { ...asset, wiki_page_ids: wikiPageIds }
    })
    model.book_characters = model.book_characters.map((character) => {
      if (character.wiki_page_id !== wikiPageId) return character
      bookCharacters++
      return { ...character, wiki_page_id: null }
    })

    return { wikiPageId, wikiUpdates, wikiReviewStates, chapterMentions, assetTags, bookCharacters }
  })

  return { model, cascades }
}
