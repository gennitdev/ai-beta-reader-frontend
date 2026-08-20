/**
 * Repository for chapter/part metadata: summaries, reviews, notes and custom
 * reviewer profiles.
 *
 * Extracted from the monolithic AppDatabase class as the first step of the
 * database.ts split. Each function takes an explicit {@link DatabaseContext}
 * instead of relying on `this`, which keeps the data-access logic decoupled
 * from connection setup and independently testable. AppDatabase keeps thin
 * delegating methods so its public API is unchanged.
 */

import type { DatabaseContext, QueryRow } from './connection'
import { readQueryRowValue } from './rowUtils'
import { runInTransaction } from './transaction'
import type {
  ChapterSummary,
  PartSummary,
  ChapterReview,
  ChapterNote,
  CustomReviewerProfile,
} from '../database'

// --- Row mappers (backend-specific) -----------------------------------------

function toWebSummary(row: unknown[]): ChapterSummary {
  return {
    id: String(row[0]),
    chapter_id: String(row[1]),
    summary: typeof row[2] === 'string' ? row[2] : null,
    pov: typeof row[3] === 'string' ? row[3] : null,
    characters: typeof row[4] === 'string' ? row[4] : null,
    beats: typeof row[5] === 'string' ? row[5] : null,
    spoilers_ok: typeof row[6] === 'boolean' ? row[6] : typeof row[6] === 'number' ? Boolean(row[6]) : null,
    created_at: String(row[7]),
    updated_at: String(row[8]),
  }
}

function toNativeSummary(row: QueryRow): ChapterSummary {
  return {
    id: String(readQueryRowValue(row, 0, 'id')),
    chapter_id: String(readQueryRowValue(row, 1, 'chapter_id')),
    summary: typeof readQueryRowValue(row, 2, 'summary') === 'string' ? readQueryRowValue(row, 2, 'summary') as string : null,
    pov: typeof readQueryRowValue(row, 3, 'pov') === 'string' ? readQueryRowValue(row, 3, 'pov') as string : null,
    characters: typeof readQueryRowValue(row, 4, 'characters') === 'string' ? readQueryRowValue(row, 4, 'characters') as string : null,
    beats: typeof readQueryRowValue(row, 5, 'beats') === 'string' ? readQueryRowValue(row, 5, 'beats') as string : null,
    spoilers_ok: typeof readQueryRowValue(row, 6, 'spoilers_ok') === 'boolean'
      ? readQueryRowValue(row, 6, 'spoilers_ok') as boolean
      : typeof readQueryRowValue(row, 6, 'spoilers_ok') === 'number'
        ? Boolean(readQueryRowValue(row, 6, 'spoilers_ok'))
        : null,
    created_at: String(readQueryRowValue(row, 7, 'created_at')),
    updated_at: String(readQueryRowValue(row, 8, 'updated_at')),
  }
}

function toWebPartSummary(row: unknown[]): PartSummary {
  return {
    id: String(row[0]),
    part_id: String(row[1]),
    summary: typeof row[2] === 'string' ? row[2] : null,
    characters: typeof row[3] === 'string' ? row[3] : null,
    beats: typeof row[4] === 'string' ? row[4] : null,
    created_at: String(row[5]),
    updated_at: String(row[6]),
  }
}

function toNativePartSummary(row: QueryRow): PartSummary {
  return {
    id: String(readQueryRowValue(row, 0, 'id')),
    part_id: String(readQueryRowValue(row, 1, 'part_id')),
    summary: typeof readQueryRowValue(row, 2, 'summary') === 'string' ? readQueryRowValue(row, 2, 'summary') as string : null,
    characters: typeof readQueryRowValue(row, 3, 'characters') === 'string' ? readQueryRowValue(row, 3, 'characters') as string : null,
    beats: typeof readQueryRowValue(row, 4, 'beats') === 'string' ? readQueryRowValue(row, 4, 'beats') as string : null,
    created_at: String(readQueryRowValue(row, 5, 'created_at')),
    updated_at: String(readQueryRowValue(row, 6, 'updated_at')),
  }
}

function toWebReview(row: unknown[]): ChapterReview {
  return {
    id: String(row[0]),
    chapter_id: String(row[1]),
    review_text: String(row[2]),
    prompt_used: typeof row[3] === 'string' ? row[3] : null,
    profile_id: typeof row[4] === 'number' ? row[4] : null,
    profile_name: typeof row[5] === 'string' ? row[5] : null,
    tone_key: typeof row[6] === 'string' ? row[6] : null,
    created_at: String(row[7]),
    updated_at: String(row[8]),
  }
}

function toNativeReview(row: QueryRow): ChapterReview {
  return {
    id: String(readQueryRowValue(row, 0, 'id')),
    chapter_id: String(readQueryRowValue(row, 1, 'chapter_id')),
    review_text: String(readQueryRowValue(row, 2, 'review_text') ?? ''),
    prompt_used: typeof readQueryRowValue(row, 3, 'prompt_used') === 'string' ? readQueryRowValue(row, 3, 'prompt_used') as string : null,
    profile_id: typeof readQueryRowValue(row, 4, 'profile_id') === 'number' ? readQueryRowValue(row, 4, 'profile_id') as number : null,
    profile_name: typeof readQueryRowValue(row, 5, 'profile_name') === 'string' ? readQueryRowValue(row, 5, 'profile_name') as string : null,
    tone_key: typeof readQueryRowValue(row, 6, 'tone_key') === 'string' ? readQueryRowValue(row, 6, 'tone_key') as string : null,
    created_at: String(readQueryRowValue(row, 7, 'created_at')),
    updated_at: String(readQueryRowValue(row, 8, 'updated_at')),
  }
}

function toWebNote(row: unknown[]): ChapterNote {
  return {
    id: String(row[0]),
    chapter_id: String(row[1]),
    notes: String(row[2] ?? ''),
    created_at: String(row[3]),
    updated_at: String(row[4]),
  }
}

function toNativeNote(row: QueryRow): ChapterNote {
  return {
    id: String(readQueryRowValue(row, 0, 'id')),
    chapter_id: String(readQueryRowValue(row, 1, 'chapter_id')),
    notes: String(readQueryRowValue(row, 2, 'notes') ?? ''),
    created_at: String(readQueryRowValue(row, 3, 'created_at')),
    updated_at: String(readQueryRowValue(row, 4, 'updated_at')),
  }
}

function toWebCustomProfile(row: unknown[]): CustomReviewerProfile {
  return {
    id: Number(row[0]),
    name: String(row[1]),
    description: String(row[2]),
    created_at: String(row[3]),
    updated_at: String(row[4]),
  }
}

function toNativeCustomProfile(row: QueryRow): CustomReviewerProfile {
  return {
    id: Number(readQueryRowValue(row, 0, 'id')),
    name: String(readQueryRowValue(row, 1, 'name')),
    description: String(readQueryRowValue(row, 2, 'description') ?? ''),
    created_at: String(readQueryRowValue(row, 3, 'created_at')),
    updated_at: String(readQueryRowValue(row, 4, 'updated_at')),
  }
}

// --- Chapter summaries ------------------------------------------------------

export async function saveSummary(ctx: DatabaseContext, summary: {
  chapter_id: string
  summary: string
  pov: string | null
  characters: string[]
  beats: string[]
  spoilers_ok: boolean
}): Promise<void> {
  const id = `summary-${summary.chapter_id}-${Date.now()}`
  const now = new Date().toISOString()
  const query = `INSERT OR REPLACE INTO chapter_summaries (id, chapter_id, summary, pov, characters, beats, spoilers_ok, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`

  const params = [
    id,
    summary.chapter_id,
    summary.summary,
    summary.pov,
    JSON.stringify(summary.characters),
    JSON.stringify(summary.beats),
    summary.spoilers_ok ? 1 : 0,
    now,
    now,
  ]

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
  }
}

export async function getSummary(ctx: DatabaseContext, chapterId: string): Promise<ChapterSummary | null> {
  const query = `SELECT * FROM chapter_summaries WHERE chapter_id = ? LIMIT 1`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [chapterId])
    return result.values?.[0] ? toNativeSummary(result.values[0]) : null
  } else {
    const result = ctx.connection.exec(query, [chapterId])
    if (result.length === 0 || result[0].values.length === 0) return null

    return toWebSummary(result[0].values[0])
  }
}

// --- Part summaries ---------------------------------------------------------

export async function savePartSummary(ctx: DatabaseContext, summary: {
  part_id: string
  summary: string
  characters: string[]
  beats: string[]
}): Promise<void> {
  const id = `part-summary-${summary.part_id}`
  const now = new Date().toISOString()
  const existing = await getPartSummary(ctx, summary.part_id)
  const createdAt = existing?.created_at ?? now
  const query = `INSERT OR REPLACE INTO part_summaries (id, part_id, summary, characters, beats, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`

  const params = [
    id,
    summary.part_id,
    summary.summary,
    JSON.stringify(summary.characters),
    JSON.stringify(summary.beats),
    createdAt,
    now,
  ]

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
  }
}

export async function getPartSummary(ctx: DatabaseContext, partId: string): Promise<PartSummary | null> {
  const query = `SELECT * FROM part_summaries WHERE part_id = ? LIMIT 1`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [partId])
    return result.values?.[0] ? toNativePartSummary(result.values[0]) : null
  } else {
    const result = ctx.connection.exec(query, [partId])
    if (result.length === 0 || result[0].values.length === 0) return null

    return toWebPartSummary(result[0].values[0])
  }
}

export async function deletePartSummary(ctx: DatabaseContext, partId: string): Promise<void> {
  const query = `DELETE FROM part_summaries WHERE part_id = ?`

  if (ctx.isNative) {
    await ctx.connection.run(query, [partId])
  } else {
    ctx.connection.run(query, [partId])
    ctx.requestPersistence()
  }
}

// --- Chapter reviews --------------------------------------------------------

export async function saveReview(ctx: DatabaseContext, review: {
  chapter_id: string
  review_text: string
  prompt_used: string | null
  profile_id: number | null
  profile_name: string | null
  tone_key: string | null
}): Promise<void> {
  const id = `review-${review.chapter_id}-${Date.now()}`
  const now = new Date().toISOString()
  const query = `INSERT INTO chapter_reviews (id, chapter_id, review_text, prompt_used, profile_id, profile_name, tone_key, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`

  const params = [
    id,
    review.chapter_id,
    review.review_text,
    review.prompt_used,
    review.profile_id,
    review.profile_name,
    review.tone_key,
    now,
    now,
  ]

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
  }
}

export async function getReviews(ctx: DatabaseContext, chapterId: string): Promise<ChapterReview[]> {
  const query = `SELECT * FROM chapter_reviews WHERE chapter_id = ? ORDER BY created_at DESC`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [chapterId])
    return (result.values || []).map((row) => toNativeReview(row))
  } else {
    const result = ctx.connection.exec(query, [chapterId])
    if (result.length === 0) return []

    return result[0].values.map((row: unknown[]) => toWebReview(row))
  }
}

export async function deleteReview(ctx: DatabaseContext, reviewId: string): Promise<void> {
  const query = `DELETE FROM chapter_reviews WHERE id = ?`

  if (ctx.isNative) {
    await ctx.connection.run(query, [reviewId])
  } else {
    ctx.connection.run(query, [reviewId])
    ctx.requestPersistence()
  }
}

// --- Chapter notes ----------------------------------------------------------

export async function saveNotes(ctx: DatabaseContext, chapterId: string, notes: string): Promise<void> {
  const id = `notes-${chapterId}`
  const now = new Date().toISOString()

  // Check if notes already exist for this chapter
  const existing = await getNotes(ctx, chapterId)
  const createdAt = existing?.created_at ?? now

  const query = `INSERT OR REPLACE INTO chapter_notes (id, chapter_id, notes, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?)`

  const params = [id, chapterId, notes, createdAt, now]

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
  }
}

export async function getNotes(ctx: DatabaseContext, chapterId: string): Promise<ChapterNote | null> {
  const query = `SELECT * FROM chapter_notes WHERE chapter_id = ? LIMIT 1`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [chapterId])
    return result.values?.[0] ? toNativeNote(result.values[0]) : null
  } else {
    const result = ctx.connection.exec(query, [chapterId])
    if (result.length === 0 || result[0].values.length === 0) return null

    return toWebNote(result[0].values[0])
  }
}

export async function deleteNotes(ctx: DatabaseContext, chapterId: string): Promise<void> {
  const query = `DELETE FROM chapter_notes WHERE chapter_id = ?`

  if (ctx.isNative) {
    await ctx.connection.run(query, [chapterId])
  } else {
    ctx.connection.run(query, [chapterId])
    ctx.requestPersistence()
  }
}

// --- Custom reviewer profiles ----------------------------------------------

export async function getCustomProfiles(ctx: DatabaseContext): Promise<CustomReviewerProfile[]> {
  const query = `SELECT * FROM custom_reviewer_profiles ORDER BY created_at DESC`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query)
    return (result.values || []).map((row) => toNativeCustomProfile(row))
  } else {
    const result = ctx.connection.exec(query)
    if (result.length === 0) return []

    return result[0].values.map((row: unknown[]) => toWebCustomProfile(row))
  }
}

export async function createCustomProfile(ctx: DatabaseContext, profile: {
  name: string
  description: string
}): Promise<number> {
  const id = Date.now()
  const now = new Date().toISOString()
  const query = `INSERT INTO custom_reviewer_profiles (id, name, description, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?)`

  const params = [id, profile.name, profile.description, now, now]

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
  }

  return id
}

export async function updateCustomProfile(ctx: DatabaseContext, profileId: number, updates: {
  name?: string
  description?: string
}): Promise<void> {
  const now = new Date().toISOString()
  const sets: string[] = []
  const params: unknown[] = []

  if (updates.name !== undefined) {
    sets.push('name = ?')
    params.push(updates.name)
  }
  if (updates.description !== undefined) {
    sets.push('description = ?')
    params.push(updates.description)
  }

  sets.push('updated_at = ?')
  params.push(now)
  params.push(profileId)

  const query = `UPDATE custom_reviewer_profiles SET ${sets.join(', ')} WHERE id = ?`

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
  }
}

export async function deleteCustomProfile(ctx: DatabaseContext, profileId: number): Promise<void> {
  // First delete any reviews using this profile
  const deleteReviewsQuery = `DELETE FROM chapter_reviews WHERE profile_id = ?`
  const deleteProfileQuery = `DELETE FROM custom_reviewer_profiles WHERE id = ?`

  await runInTransaction(ctx, async (txCtx) => {
    if (txCtx.isNative) {
      await txCtx.connection.run(deleteReviewsQuery, [profileId])
      await txCtx.connection.run(deleteProfileQuery, [profileId])
    } else {
      txCtx.connection.run(deleteReviewsQuery, [profileId])
      txCtx.connection.run(deleteProfileQuery, [profileId])
    }
  })
  if (!ctx.isNative) ctx.requestPersistence()
}
