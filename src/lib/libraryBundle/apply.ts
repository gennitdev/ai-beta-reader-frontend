import { DATABASE_EXPORT_VERSION, type DatabaseImportData } from '@/lib/databaseImportExport'
import type { CanonicalLibraryModel } from './model'
import type { LibraryImportPlan } from './plan'
import { assertImportPlanCurrent } from './plan'
import { canonicalLibraryModelSchema } from './schemas'
import { collectCanonicalModelEntities, canonicalEntityKey } from './entities'
import { IMAGE_CONTENT_HASH_ALGORITHM } from '@/lib/imageContentHash'

type ModelArrayKey = Exclude<keyof CanonicalLibraryModel,
  'format_version' | 'bundle_kind' | 'content_mode' | 'book_ids' | 'includes'>

const entityArrays: Record<string, ModelArrayKey> = {
  book: 'books', part: 'parts', chapter: 'chapters', chapter_note: 'chapter_notes',
  chapter_summary: 'chapter_summaries', part_summary: 'part_summaries', review: 'reviews',
  wiki_page: 'wiki_pages', book_character: 'book_characters', profile: 'profiles', asset: 'assets',
  chapter_revision: 'chapter_revisions', chapter_activity: 'chapter_activity', wiki_update: 'wiki_updates',
  wiki_review_state: 'wiki_review_state',
}

function valueId(entityType: string, value: unknown): string {
  const row = value as { id?: string; wiki_page_id?: string; chapter_id?: string }
  return entityType === 'wiki_review_state' ? `${row.wiki_page_id}:${row.chapter_id}` : String(row.id)
}

/** Apply an already-resolved plan to an in-memory local snapshot. This function is pure. */
export function applyImportPlanToModel(
  plan: LibraryImportPlan,
  local: CanonicalLibraryModel,
  incomingModel: CanonicalLibraryModel,
  currentDatabaseGeneration: string,
): CanonicalLibraryModel {
  assertImportPlanCurrent(plan, currentDatabaseGeneration)
  const incomingEntities = new Map(collectCanonicalModelEntities(incomingModel)
    .map((entity) => [canonicalEntityKey(entity.entityType, entity.id), entity.value]))
  const result = structuredClone(local)
  result.assets = result.assets.map((asset) => ({
    ...asset,
    bytes: asset.bytes ? new Uint8Array(asset.bytes) : null,
  }))
  for (const operation of plan.operations) {
    const useIncoming = operation.kind === 'create' || operation.kind === 'update'
      || operation.kind === 'conflict' && operation.resolution === 'use_incoming'
    const useDeletion = operation.kind === 'delete'
      || operation.kind === 'conflict' && operation.resolution === 'use_incoming' && operation.incomingValue === undefined
    if (!useIncoming && !useDeletion) continue
    const key = entityArrays[operation.entityType]
    if (!key) throw new Error(`Unsupported import entity type ${operation.entityType}.`)
    const values = result[key] as unknown[]
    const index = values.findIndex((value) => canonicalEntityKey(operation.entityType, valueId(operation.entityType, value)) === operation.key)
    if (useDeletion) {
      if (index >= 0) values.splice(index, 1)
    } else {
      const incomingValue = incomingEntities.get(operation.key)
      if (incomingValue === undefined) throw new Error(`Incoming value is missing for ${operation.key}.`)
      const incoming = structuredClone(incomingValue) as { bytes?: unknown }
      if (operation.entityType === 'asset' && ArrayBuffer.isView(incoming.bytes)) {
        incoming.bytes = new Uint8Array(incoming.bytes.buffer.slice(
          incoming.bytes.byteOffset,
          incoming.bytes.byteOffset + incoming.bytes.byteLength,
        ))
      }
      if (operation.entityType === 'asset' && incoming.bytes === null && index >= 0) {
        const localAsset = values[index] as { sha256?: string; byte_length?: number; bytes?: Uint8Array | null }
        const incomingAsset = incoming as { sha256?: string; byte_length?: number; bytes?: Uint8Array | null }
        if (localAsset.bytes && localAsset.sha256 === incomingAsset.sha256
          && localAsset.byte_length === incomingAsset.byte_length) {
          incomingAsset.bytes = localAsset.bytes.slice()
        }
      }
      if (index >= 0) values[index] = incoming
      else values.push(incoming)
    }
  }

  // Text-only workspaces intentionally omit history and audit records. Keep
  // those local records when their parents survive, but cascade deliberate
  // parent deletions so the merged database cannot retain dangling foreign
  // keys to chapters, books, or wiki pages removed by the import.
  const survivingBookIds = new Set(result.books.map((book) => book.id))
  const survivingChapterIds = new Set(result.chapters.map((chapter) => chapter.id))
  const survivingWikiPageIds = new Set(result.wiki_pages.map((page) => page.id))
  if (!incomingModel.includes.history) {
    result.chapter_revisions = result.chapter_revisions.filter((revision) => (
      survivingBookIds.has(revision.book_id) && survivingChapterIds.has(revision.chapter_id)
    ))
    result.chapter_activity = result.chapter_activity.filter((activity) => (
      survivingBookIds.has(activity.book_id) && survivingChapterIds.has(activity.chapter_id)
    ))
  }
  if (!incomingModel.includes.audit_records) {
    result.wiki_updates = result.wiki_updates.filter((update) => (
      survivingWikiPageIds.has(update.wiki_page_id)
      && (update.chapter_id === null || survivingChapterIds.has(update.chapter_id))
    ))
    result.wiki_review_state = result.wiki_review_state.filter((state) => (
      survivingWikiPageIds.has(state.wiki_page_id) && survivingChapterIds.has(state.chapter_id)
    ))
  }

  result.book_ids = result.books.map((book) => book.id).sort()
  return canonicalLibraryModelSchema.parse(result)
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

export interface CanonicalDatabaseImportOptions {
  embedAssetBytes?: boolean
  assetFilePath?: (asset: CanonicalLibraryModel['assets'][number]) => string | null
}

/** Convert a merged canonical model back to the named database-import contract. */
export function canonicalModelToDatabaseImport(
  model: CanonicalLibraryModel,
  options: CanonicalDatabaseImportOptions = {},
): DatabaseImportData {
  const embedAssetBytes = options.embedAssetBytes ?? true
  const customProfiles = model.profiles.filter((profile) => profile.profile_kind === 'custom')
  const aiProfiles = model.profiles.filter((profile) => profile.profile_kind !== 'custom')
  const profilesById = new Map(model.profiles.map((profile) => [profile.id, profile]))
  return {
    version: DATABASE_EXPORT_VERSION,
    books: model.books.map((value) => ({ ...value, chapter_order: JSON.stringify(value.chapter_order), part_order: JSON.stringify(value.part_order) })),
    chapters: model.chapters.map((value) => ({
      id: value.id, book_id: value.book_id, part_id: value.part_id, title: value.title,
      text: value.body, word_count: value.body.trim() ? value.body.trim().split(/\s+/).length : 0,
      cover_image_id: value.cover_image_id, created_at: value.created_at, updated_at: value.updated_at,
    })),
    chapter_revisions: model.chapter_revisions.map((value) => ({ ...value })),
    chapter_activity: model.chapter_activity.map((value) => ({ ...value })),
    book_parts: model.parts.map((value) => ({
      ...value,
      chapter_order: JSON.stringify(model.books.find((book) => book.id === value.book_id)?.chapter_order.filter((id) => model.chapters.find((chapter) => chapter.id === id)?.part_id === value.id) ?? []),
    })),
    chapter_summaries: model.chapter_summaries.map(({ body, characters, beats, ...value }) => ({ ...value, summary: body, characters: JSON.stringify(characters), beats: JSON.stringify(beats) })),
    part_summaries: model.part_summaries.map(({ body, characters, beats, ...value }) => ({ ...value, summary: body, characters: JSON.stringify(characters), beats: JSON.stringify(beats) })),
    wiki_pages: model.wiki_pages.map(({ body, aliases, tags, ...value }) => ({ ...value, content: body, aliases: JSON.stringify(aliases), tags: JSON.stringify(tags) })),
    book_characters: model.book_characters.map((value) => ({ ...value })),
    chapter_reviews: model.reviews.map(({ body, profile_ref, ...value }) => ({
      ...value, review_text: body, profile_stable_id: profile_ref,
      profile_id: profile_ref ? profilesById.get(profile_ref)?.legacy_id ?? null : null,
    })),
    custom_reviewer_profiles: customProfiles.map((value) => ({
      id: value.legacy_id, stable_id: value.id, name: value.name, description: value.description,
      created_at: value.created_at, updated_at: value.updated_at,
    })),
    ai_profiles: aiProfiles.map((value) => ({
      id: value.legacy_id, stable_id: value.id, name: value.name, tone_key: value.tone_key,
      system_prompt: value.system_prompt, is_default: value.is_default,
      is_system: value.profile_kind === 'system', created_at: value.created_at, updated_at: value.updated_at,
    })),
    wiki_updates: model.wiki_updates.map((value) => ({ ...value })),
    chapter_wiki_mentions: model.chapters.flatMap((chapter) => chapter.wiki_mentions.map((mention) => ({
      ...mention, chapter_id: chapter.id, link_source: mention.source,
    }))),
    image_assets: model.assets.map((value) => ({
      id: value.id, book_id: value.book_id, chapter_id: value.chapter_id,
      asset_type: value.asset_type, file_name: value.file_name,
      file_path: options.assetFilePath?.(value) ?? null,
      mime_type: value.mime_type, notes: value.notes, created_at: value.created_at,
      updated_at: value.updated_at,
      content_hash: value.sha256,
      content_hash_algorithm: IMAGE_CONTENT_HASH_ALGORITHM,
      content_byte_length: value.byte_length,
      image_data: embedAssetBytes && value.bytes
        ? `data:${value.mime_type ?? 'application/octet-stream'};base64,${base64(value.bytes)}`
        : null,
    })),
    image_wiki_tags: model.assets.flatMap((asset) => asset.wiki_page_ids.map((wikiPageId) => ({
      image_id: asset.id, wiki_page_id: wikiPageId, created_at: asset.created_at,
    }))),
    chapter_notes: model.chapter_notes.map(({ body, ...value }) => ({ ...value, notes: body })),
    wiki_review_state: model.wiki_review_state.map((value) => ({ ...value })),
  }
}
