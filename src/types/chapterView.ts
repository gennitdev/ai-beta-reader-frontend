// View-model types for ChapterView and its composables. These are the shapes the
// chapter authoring screen works with, distinct from the raw database rows.

export interface Chapter {
  id: string;
  book_id: string;
  title: string | null;
  text: string;
  word_count: number;
  part_id: string | null;
  summary: string | null;
  pov: string | null;
  characters: string[] | null;
  beats: string[] | null;
  spoilers_ok: boolean | null;
  notes: string | null;
}

export interface Review {
  id: string;
  review_text: string;
  prompt_used?: string | null;
  created_at: string;
  updated_at: string;
  profile_id: number | null;
  profile_name: string | null;
  tone_key: string | null;
}

export interface Character {
  id: string;
  character_name: string;
  wiki_page_id: string | null;
  has_wiki_page: boolean;
  aliases?: string[];
}

export interface CustomReviewerProfile {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}
