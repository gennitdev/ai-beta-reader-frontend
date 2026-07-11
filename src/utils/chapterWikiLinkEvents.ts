export const CHAPTER_WIKI_LINKS_CHANGED_EVENT = 'chapter-wiki-links-changed'

export interface ChapterWikiLinksChangedDetail {
  chapterIds: string[]
  wikiPageIds: string[]
}

export function dispatchChapterWikiLinksChanged(detail: ChapterWikiLinksChangedDetail) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent<ChapterWikiLinksChangedDetail>(CHAPTER_WIKI_LINKS_CHANGED_EVENT, {
      detail: {
        chapterIds: Array.from(new Set(detail.chapterIds)),
        wikiPageIds: Array.from(new Set(detail.wikiPageIds)),
      },
    }),
  )
}
