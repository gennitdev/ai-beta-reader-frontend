import type { CanonicalLibraryModel } from './model'

export interface CanonicalModelEntity {
  entityType: string
  id: string
  value: unknown
  bookId?: string
  title?: string
}

export function canonicalEntityKey(entityType: string, id: string): string {
  return `${entityType}\0${id}`
}

/** Flatten every portable entity into the identity domain used by inventory and planning. */
export function collectCanonicalModelEntities(model: CanonicalLibraryModel): CanonicalModelEntity[] {
  const chapters = new Map(model.chapters.map((chapter) => [chapter.id, chapter]))
  const parts = new Map(model.parts.map((part) => [part.id, part]))
  const wikiPages = new Map(model.wiki_pages.map((page) => [page.id, page]))
  const rows: CanonicalModelEntity[] = []
  const add = (entityType: string, id: string, value: unknown, bookId?: string, title?: string) => {
    rows.push({ entityType, id, value, bookId, title })
  }

  model.books.forEach((value) => add('book', value.id, value, value.id, value.title))
  model.parts.forEach((value) => add('part', value.id, value, value.book_id, value.name))
  model.chapters.forEach((value) => add('chapter', value.id, value, value.book_id, value.title ?? 'Untitled chapter'))
  model.chapter_notes.forEach((value) => add('chapter_note', value.id, value, chapters.get(value.chapter_id)?.book_id))
  model.chapter_summaries.forEach((value) => add('chapter_summary', value.id, value, chapters.get(value.chapter_id)?.book_id))
  model.part_summaries.forEach((value) => add('part_summary', value.id, value, parts.get(value.part_id)?.book_id))
  model.reviews.forEach((value) => add('review', value.id, value, chapters.get(value.chapter_id)?.book_id))
  model.wiki_pages.forEach((value) => add('wiki_page', value.id, value, value.book_id, value.page_name))
  model.book_characters.forEach((value) => add('book_character', value.id, value, value.book_id, value.character_name))
  model.profiles.forEach((value) => add('profile', value.id, value, undefined, value.name))
  model.assets.forEach((value) => add('asset', value.id, value, value.book_id, value.file_name))
  model.chapter_revisions.forEach((value) => add('chapter_revision', value.id, value, value.book_id))
  model.chapter_activity.forEach((value) => add('chapter_activity', value.id, value, value.book_id))
  model.wiki_updates.forEach((value) => add('wiki_update', value.id, value, wikiPages.get(value.wiki_page_id)?.book_id))
  model.wiki_review_state.forEach((value) => add(
    'wiki_review_state', `${value.wiki_page_id}:${value.chapter_id}`, value,
    wikiPages.get(value.wiki_page_id)?.book_id,
  ))
  return rows
}
