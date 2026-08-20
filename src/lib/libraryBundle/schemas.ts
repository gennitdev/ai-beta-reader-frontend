import { z } from 'zod'

export const LIBRARY_BUNDLE_FORMAT_VERSION = 1 as const

const idSchema = z.string().min(1)
const timestampSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  'Expected an ISO 8601 UTC timestamp with millisecond precision',
)
const nullableIdSchema = idSchema.nullable()
const stringListSchema = z.array(z.string())

export const chapterWikiMentionSchema = z.strictObject({
  id: idSchema,
  wiki_page_id: idSchema,
  source: z.enum(['ai_summary', 'manual']).nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema.nullable(),
})

export const bundleBookSchema = z.strictObject({
  id: idSchema,
  title: z.string(),
  chapter_order: z.array(idSchema),
  part_order: z.array(idSchema),
  cover_image_id: nullableIdSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const bundlePartSchema = z.strictObject({
  id: idSchema,
  book_id: idSchema,
  name: z.string(),
  cover_image_id: nullableIdSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const bundleChapterSchema = z.strictObject({
  id: idSchema,
  book_id: idSchema,
  part_id: nullableIdSchema,
  title: z.string().nullable(),
  body: z.string(),
  cover_image_id: nullableIdSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  wiki_mentions: z.array(chapterWikiMentionSchema),
})

export const bundleChapterNoteSchema = z.strictObject({
  id: idSchema,
  chapter_id: idSchema,
  body: z.string(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

const summaryProvenanceSchema = {
  generated_by: z.enum(['ai', 'user']).nullable(),
  model: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
}

export const bundleChapterSummarySchema = z.strictObject({
  id: idSchema,
  chapter_id: idSchema,
  body: z.string().nullable(),
  pov: z.string().nullable(),
  characters: stringListSchema,
  beats: stringListSchema,
  spoilers_ok: z.boolean().nullable(),
  ...summaryProvenanceSchema,
})

export const bundlePartSummarySchema = z.strictObject({
  id: idSchema,
  part_id: idSchema,
  body: z.string().nullable(),
  characters: stringListSchema,
  beats: stringListSchema,
  ...summaryProvenanceSchema,
})

export const bundleReviewSchema = z.strictObject({
  id: idSchema,
  chapter_id: idSchema,
  body: z.string(),
  prompt_used: z.string().nullable(),
  profile_ref: idSchema.nullable(),
  profile_name: z.string().nullable(),
  tone_key: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const bundleWikiPageSchema = z.strictObject({
  id: idSchema,
  book_id: idSchema,
  page_name: z.string(),
  page_type: z.enum(['character', 'location', 'concept', 'other']),
  body: z.string(),
  summary: z.string(),
  aliases: stringListSchema,
  tags: stringListSchema,
  is_major: z.boolean(),
  created_by_ai: z.boolean(),
  is_pinned: z.boolean(),
  cover_image_id: nullableIdSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const bundleBookCharacterSchema = z.strictObject({
  id: idSchema,
  book_id: idSchema,
  character_name: z.string(),
  wiki_page_id: nullableIdSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const bundleProfileSchema = z.strictObject({
  id: idSchema,
  profile_kind: z.enum(['custom', 'ai', 'system']),
  legacy_id: z.number().int().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  tone_key: z.string().nullable(),
  system_prompt: z.string().nullable(),
  is_default: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const bundleAssetSchema = z.strictObject({
  id: idSchema,
  book_id: idSchema,
  chapter_id: nullableIdSchema,
  asset_type: z.enum(['cover', 'chapter', 'part_cover']),
  file_name: z.string().min(1),
  mime_type: z.string().nullable(),
  notes: z.string(),
  wiki_page_ids: z.array(idSchema),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byte_length: z.number().int().nonnegative(),
  bytes: z.instanceof(Uint8Array).nullable(),
})

export const bundleChapterRevisionSchema = z.strictObject({
  id: idSchema,
  chapter_id: idSchema,
  book_id: idSchema,
  title: z.string().nullable(),
  text: z.string(),
  word_count: z.number().int().nonnegative(),
  words_added: z.number().int().nonnegative(),
  words_removed: z.number().int().nonnegative(),
  revision_kind: z.enum(['save', 'baseline']),
  created_at: timestampSchema,
  discarded_at: timestampSchema.nullable(),
})

export const bundleChapterActivitySchema = z.strictObject({
  id: idSchema,
  book_id: idSchema,
  chapter_id: idSchema,
  chapter_title: z.string().nullable(),
  activity_type: z.enum(['save', 'delete']),
  words_added: z.number().int().nonnegative(),
  words_removed: z.number().int().nonnegative(),
  word_count_deleted: z.number().int().nonnegative(),
  revision_discarded: z.boolean(),
  created_at: timestampSchema,
})

export const bundleWikiUpdateSchema = z.strictObject({
  id: idSchema,
  wiki_page_id: idSchema,
  chapter_id: nullableIdSchema,
  update_type: z.string().nullable(),
  change_summary: z.string().nullable(),
  contradiction_notes: z.string().nullable(),
  created_at: timestampSchema,
})

export const bundleWikiReviewStateSchema = z.strictObject({
  wiki_page_id: idSchema,
  chapter_id: idSchema,
  chapter_content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewed_at: timestampSchema,
  reviewed_by: z.string().min(1),
})

export const canonicalLibraryModelSchema = z.strictObject({
  format_version: z.literal(LIBRARY_BUNDLE_FORMAT_VERSION),
  bundle_kind: z.enum(['library', 'selection']),
  content_mode: z.enum(['full', 'text-only']),
  book_ids: z.array(idSchema),
  includes: z.strictObject({
    image_bytes: z.boolean(),
    history: z.boolean(),
    audit_records: z.boolean(),
  }),
  books: z.array(bundleBookSchema),
  parts: z.array(bundlePartSchema),
  chapters: z.array(bundleChapterSchema),
  chapter_notes: z.array(bundleChapterNoteSchema),
  chapter_summaries: z.array(bundleChapterSummarySchema),
  part_summaries: z.array(bundlePartSummarySchema),
  reviews: z.array(bundleReviewSchema),
  wiki_pages: z.array(bundleWikiPageSchema),
  book_characters: z.array(bundleBookCharacterSchema),
  profiles: z.array(bundleProfileSchema),
  assets: z.array(bundleAssetSchema),
  chapter_revisions: z.array(bundleChapterRevisionSchema),
  chapter_activity: z.array(bundleChapterActivitySchema),
  wiki_updates: z.array(bundleWikiUpdateSchema),
  wiki_review_state: z.array(bundleWikiReviewStateSchema),
})
