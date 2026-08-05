// View-model types for WikiPageView and its composables.

export interface WikiPage {
  id: string
  book_id: string
  page_name: string
  page_type: 'character' | 'location' | 'concept' | 'other'
  content: string
  summary: string | null
  aliases: string[]
  tags: string[]
  is_major: boolean
  is_pinned: boolean
  created_by_ai: boolean
  created_at: string
  updated_at: string
}

export interface WikiUpdate {
  id: string
  update_type: string
  change_summary: string | null
  contradiction_notes: string | null
  created_at: string
  chapter_title: string | null
}

export interface Character {
  id: string
  character_name: string
  wiki_page_id: string | null
  has_wiki_page: boolean
}
