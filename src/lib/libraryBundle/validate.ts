import type { ReadonlyBundleFileMap } from './fileMap'
import type { ReadLibraryBundleResult } from './read'
import { bundleError, bundleWarning, hasBundleErrors, type BundleDiagnostic } from './diagnostics'
import { canonicalEntityKey, collectCanonicalModelEntities } from './entities'
import { chapterContentHash, sha256Hex } from './semanticHash'
import { isReplaceStructurallyEligible } from './manifest'
import { isBuiltInReviewProfileId } from '@/lib/reviewerProfileIdentity'

export interface ValidatedLibraryBundle extends ReadLibraryBundleResult {
  diagnostics: readonly BundleDiagnostic[]
  replaceEligible: boolean
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  values.forEach((value) => seen.has(value) ? duplicates.add(value) : seen.add(value))
  return [...duplicates]
}

function reference(
  diagnostics: BundleDiagnostic[], exists: boolean, code: string, message: string,
  entityType: string, entityId: string,
): void {
  if (!exists) diagnostics.push(bundleError(code, message, { entityType, entityId }))
}

function isAggregateEntityPath(path: string): boolean {
  return path === '_beta-bot/history/chapter-revisions.jsonl'
    || path === '_beta-bot/history/chapter-activity.jsonl'
    || path === '_beta-bot/history/wiki-updates.jsonl'
    || path === '_beta-bot/review-state.jsonl'
    || /^books\/[^/]+\/characters\.yaml$/.test(path)
}

/** Exhaustively validate a parsed bundle and verify inventory and binary integrity. */
export async function validateLibraryBundle(
  parsed: ReadLibraryBundleResult,
  files: ReadonlyBundleFileMap,
): Promise<ValidatedLibraryBundle> {
  const diagnostics = [...parsed.diagnostics]
  const { model, manifest, inventory } = parsed
  if (!model || !manifest || !inventory) return { ...parsed, diagnostics, replaceEligible: false }

  if (manifest.bundle_id !== inventory.bundle_id) {
    diagnostics.push(bundleError('inventory.bundle_id', 'Manifest and inventory bundle IDs do not match.', { path: '_beta-bot/inventory.json' }))
  }
  duplicates(manifest.book_ids).forEach((id) => diagnostics.push(bundleError('scope.duplicate_book', `Book ${id} occurs more than once in manifest scope.`, { entityType: 'book', entityId: id })))

  const entities = collectCanonicalModelEntities(model)
  const sourcesByPath = new Map<string, typeof parsed.entitySources>()
  parsed.entitySources.forEach((source) => sourcesByPath.set(source.path, [...(sourcesByPath.get(source.path) ?? []), source]))
  const scope = new Set(manifest.book_ids)
  const books = new Map(model.books.map((value) => [value.id, value]))
  const parts = new Map(model.parts.map((value) => [value.id, value]))
  const chapters = new Map(model.chapters.map((value) => [value.id, value]))
  const wikiPages = new Map(model.wiki_pages.map((value) => [value.id, value]))
  const profiles = new Set(model.profiles.map((value) => value.id))
  const assets = new Map(model.assets.map((value) => [value.id, value]))

  const keys = entities.map((entity) => canonicalEntityKey(entity.entityType, entity.id))
  duplicates(keys).forEach((key) => {
    const [entityType, entityId] = key.split('\0')
    diagnostics.push(bundleError('entity.duplicate_id', `Duplicate ${entityType} ID ${entityId}.`, { entityType, entityId }))
  })

  for (const entity of entities) {
    if (entity.bookId && !scope.has(entity.bookId)) {
      diagnostics.push(bundleError('scope.outside_bundle', `${entity.entityType} belongs to book ${entity.bookId}, which is outside manifest scope.`, { entityType: entity.entityType, entityId: entity.id }))
    }
  }
  scope.forEach((id) => reference(diagnostics, books.has(id), 'scope.missing_book', `Manifest book ${id} has no book entity.`, 'book', id))

  for (const part of model.parts) reference(diagnostics, books.has(part.book_id), 'reference.book', `Part refers to unknown book ${part.book_id}.`, 'part', part.id)
  for (const chapter of model.chapters) {
    reference(diagnostics, books.has(chapter.book_id), 'reference.book', `Chapter refers to unknown book ${chapter.book_id}.`, 'chapter', chapter.id)
    if (chapter.part_id) {
      const part = parts.get(chapter.part_id)
      reference(diagnostics, !!part, 'reference.part', `Chapter refers to unknown part ${chapter.part_id}.`, 'chapter', chapter.id)
      if (part && part.book_id !== chapter.book_id) diagnostics.push(bundleError('reference.part_book', 'Chapter and part belong to different books.', { entityType: 'chapter', entityId: chapter.id }))
    }
  }
  for (const book of model.books) {
    duplicates(book.chapter_order).forEach((id) => diagnostics.push(bundleError('order.duplicate_chapter', `Chapter ${id} occurs more than once in chapter_order.`, { entityType: 'book', entityId: book.id })))
    duplicates(book.part_order).forEach((id) => diagnostics.push(bundleError('order.duplicate_part', `Part ${id} occurs more than once in part_order.`, { entityType: 'book', entityId: book.id })))
    const ownedChapters = model.chapters.filter((chapter) => chapter.book_id === book.id).map((chapter) => chapter.id)
    const ownedParts = model.parts.filter((part) => part.book_id === book.id).map((part) => part.id)
    for (const id of book.chapter_order) reference(diagnostics, chapters.get(id)?.book_id === book.id, 'order.unknown_chapter', `chapter_order contains unknown or foreign chapter ${id}.`, 'book', book.id)
    for (const id of book.part_order) reference(diagnostics, parts.get(id)?.book_id === book.id, 'order.unknown_part', `part_order contains unknown or foreign part ${id}.`, 'book', book.id)
    for (const id of ownedChapters) reference(diagnostics, book.chapter_order.includes(id), 'order.missing_chapter', `Chapter ${id} is absent from chapter_order.`, 'book', book.id)
    for (const id of ownedParts) reference(diagnostics, book.part_order.includes(id), 'order.missing_part', `Part ${id} is absent from part_order.`, 'book', book.id)
  }

  const childReferences = [
    ['chapter_note', model.chapter_notes, 'chapter_id', chapters],
    ['chapter_summary', model.chapter_summaries, 'chapter_id', chapters],
    ['review', model.reviews, 'chapter_id', chapters],
    ['part_summary', model.part_summaries, 'part_id', parts],
    ['chapter_revision', model.chapter_revisions, 'chapter_id', chapters],
    ['chapter_activity', model.chapter_activity, 'chapter_id', chapters],
  ] as const
  for (const [entityType, values, parentField, parents] of childReferences) {
    for (const value of values) {
      const parentId = (value as unknown as Record<string, string>)[parentField]
      reference(diagnostics, parents.has(parentId), 'reference.parent', `${entityType} refers to unknown ${parentField} ${parentId}.`, entityType, value.id)
    }
  }
  duplicates(model.chapter_notes.map((value) => value.chapter_id)).forEach((id) => diagnostics.push(bundleError('cardinality.chapter_note', `Chapter ${id} has more than one note.`)))
  duplicates(model.chapter_summaries.map((value) => value.chapter_id)).forEach((id) => diagnostics.push(bundleError('cardinality.chapter_summary', `Chapter ${id} has more than one summary.`)))
  duplicates(model.part_summaries.map((value) => value.part_id)).forEach((id) => diagnostics.push(bundleError('cardinality.part_summary', `Part ${id} has more than one summary.`)))

  for (const page of model.wiki_pages) reference(diagnostics, books.has(page.book_id), 'reference.book', `Wiki page refers to unknown book ${page.book_id}.`, 'wiki_page', page.id)
  for (const character of model.book_characters) {
    reference(diagnostics, books.has(character.book_id), 'reference.book', `Character refers to unknown book ${character.book_id}.`, 'book_character', character.id)
    if (character.wiki_page_id) reference(diagnostics, wikiPages.get(character.wiki_page_id)?.book_id === character.book_id, 'reference.wiki_page', `Character refers to unknown or foreign wiki page ${character.wiki_page_id}.`, 'book_character', character.id)
  }
  for (const chapter of model.chapters) {
    chapter.wiki_mentions.forEach((mention) => reference(diagnostics, wikiPages.get(mention.wiki_page_id)?.book_id === chapter.book_id, 'reference.wiki_mention', `Mention refers to unknown or foreign wiki page ${mention.wiki_page_id}.`, 'chapter', chapter.id))
  }
  for (const update of model.wiki_updates) {
    reference(diagnostics, wikiPages.has(update.wiki_page_id), 'reference.wiki_page', `Wiki update refers to unknown page ${update.wiki_page_id}.`, 'wiki_update', update.id)
    if (update.chapter_id) reference(diagnostics, chapters.has(update.chapter_id), 'reference.chapter', `Wiki update refers to unknown chapter ${update.chapter_id}.`, 'wiki_update', update.id)
  }
  for (const state of model.wiki_review_state) {
    const id = `${state.wiki_page_id}:${state.chapter_id}`
    reference(diagnostics, wikiPages.has(state.wiki_page_id), 'reference.wiki_page', `Review state refers to unknown page ${state.wiki_page_id}.`, 'wiki_review_state', id)
    const chapter = chapters.get(state.chapter_id)
    reference(diagnostics, !!chapter, 'reference.chapter', `Review state refers to unknown chapter ${state.chapter_id}.`, 'wiki_review_state', id)
    if (chapter && await chapterContentHash(chapter) !== state.chapter_content_sha256) diagnostics.push(bundleWarning('review_state.stale', 'Wiki review state is stale because chapter content changed.', { entityType: 'wiki_review_state', entityId: id }))
  }
  for (const review of model.reviews) {
    if (review.profile_ref && !profiles.has(review.profile_ref) && !isBuiltInReviewProfileId(review.profile_ref)) {
      diagnostics.push(bundleWarning('review.unknown_profile', `Review references unknown profile ${review.profile_ref}; snapshot fields will be retained.`, { entityType: 'review', entityId: review.id }))
    }
  }

  const aliasOwners = new Map<string, string>()
  for (const page of model.wiki_pages) for (const alias of page.aliases) {
    const key = alias.normalize('NFC').toLocaleLowerCase('en-US')
    const prior = aliasOwners.get(key)
    if (prior && prior !== page.id) diagnostics.push(bundleWarning('wiki.ambiguous_alias', `Alias ${JSON.stringify(alias)} is shared by wiki pages ${prior} and ${page.id}.`, { entityType: 'wiki_page', entityId: page.id }))
    else aliasOwners.set(key, page.id)
  }

  const requireAsset = (id: string | null | undefined, ownerType: string, ownerId: string) => {
    if (id && manifest.content_mode === 'full') reference(diagnostics, assets.has(id), 'reference.asset', `Cover refers to unknown asset ${id}.`, ownerType, ownerId)
  }
  model.books.forEach((value) => requireAsset(value.cover_image_id, 'book', value.id))
  model.parts.forEach((value) => requireAsset(value.cover_image_id, 'part', value.id))
  model.chapters.forEach((value) => requireAsset(value.cover_image_id, 'chapter', value.id))
  model.wiki_pages.forEach((value) => requireAsset(value.cover_image_id, 'wiki_page', value.id))
  for (const asset of model.assets) {
    reference(diagnostics, books.has(asset.book_id), 'reference.book', `Asset refers to unknown book ${asset.book_id}.`, 'asset', asset.id)
    if (asset.chapter_id) reference(diagnostics, chapters.get(asset.chapter_id)?.book_id === asset.book_id, 'reference.chapter', `Asset refers to unknown or foreign chapter ${asset.chapter_id}.`, 'asset', asset.id)
    asset.wiki_page_ids.forEach((id) => reference(diagnostics, wikiPages.get(id)?.book_id === asset.book_id, 'reference.wiki_page', `Asset tag refers to unknown or foreign wiki page ${id}.`, 'asset', asset.id))
    if (manifest.includes.image_bytes) {
      if (!asset.bytes) diagnostics.push(bundleError('asset.missing_bytes', 'Full bundle asset is missing bytes.', { entityType: 'asset', entityId: asset.id }))
      else {
        if (asset.bytes.byteLength !== asset.byte_length) diagnostics.push(bundleError('asset.byte_length', 'Asset byte length does not match metadata.', { entityType: 'asset', entityId: asset.id }))
        if (await sha256Hex(asset.bytes) !== asset.sha256) diagnostics.push(bundleError('asset.sha256', 'Asset SHA-256 does not match metadata.', { entityType: 'asset', entityId: asset.id }))
      }
    } else if (!asset.bytes) diagnostics.push(bundleWarning('asset.bytes_omitted', 'Asset bytes are omitted as declared by the manifest.', { entityType: 'asset', entityId: asset.id }))
  }

  const inventoryKeys = inventory.entities.map((entry) => canonicalEntityKey(entry.entity_type, entry.id))
  duplicates(inventoryKeys).forEach((key) => {
    const [entityType, entityId] = key.split('\0')
    diagnostics.push(bundleError('inventory.duplicate', 'Inventory contains a duplicate entity.', { entityType, entityId, path: '_beta-bot/inventory.json' }))
  })
  for (const entry of inventory.entities) {
    const occupants = sourcesByPath.get(entry.path) ?? []
    if (!isAggregateEntityPath(entry.path)
      && occupants.length
      && !occupants.some((source) => source.entityType === entry.entity_type && source.id === entry.id)) {
      diagnostics.push(bundleError('inventory.id_substitution', 'An inventoried file contains a different entity ID or type.', { entityType: entry.entity_type, entityId: entry.id, path: entry.path }))
    }
  }

  const timestamps = entities.flatMap((entity) => {
    const value = entity.value as { created_at?: string; updated_at?: string | null }
    return value.created_at && value.updated_at && value.updated_at < value.created_at ? [entity] : []
  })
  timestamps.forEach((entity) => diagnostics.push(bundleWarning('timestamp.updated_before_created', 'updated_at is earlier than created_at.', { entityType: entity.entityType, entityId: entity.id })))

  const completeDeclaredFiles = (!manifest.includes.history || files.has('_beta-bot/history/chapter-revisions.jsonl') && files.has('_beta-bot/history/chapter-activity.jsonl'))
    && (!manifest.includes.audit_records || files.has('_beta-bot/history/wiki-updates.jsonl') && files.has('_beta-bot/review-state.jsonl'))
  if (!completeDeclaredFiles) diagnostics.push(bundleError('manifest.missing_declared_data', 'Manifest declares history or audit data whose managed files are missing.'))
  return {
    ...parsed,
    diagnostics,
    replaceEligible: isReplaceStructurallyEligible(manifest) && completeDeclaredFiles && !hasBundleErrors(diagnostics),
  }
}
