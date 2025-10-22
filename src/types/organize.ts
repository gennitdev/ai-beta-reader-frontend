import type { BookPart } from '@/lib/database'

export interface Chapter {
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

export interface OrganizedPart extends BookPart {
  chapters: Chapter[]
  wordCount: number
}

export interface ChaptersByPart {
  parts: OrganizedPart[]
  uncategorized: Chapter[]
  uncategorizedWordCount: number
}
