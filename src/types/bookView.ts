import type { BookPart } from '@/lib/database'

export interface BookChapter {
  id: string
  title: string | null
  word_count: number
  has_summary: boolean
  summary: string | null
  position: number
  position_in_part: number | null
  part_id: string | null
  part_name: string | null
}

export interface BookOrganizedPart extends BookPart {
  chapters: BookChapter[]
  wordCount: number
}

export interface BookChaptersByPart {
  parts: BookOrganizedPart[]
  uncategorized: BookChapter[]
  uncategorizedWordCount: number
}

export type WikiPageType = 'character' | 'location' | 'concept' | 'other'

export interface BookWikiPage {
  id: string
  page_name: string
  page_type: WikiPageType
  summary: string | null
  aliases: string[]
  tags: string[]
  is_major: boolean
  created_by_ai: boolean
  created_at: string
  updated_at: string
  content_length: number
}
