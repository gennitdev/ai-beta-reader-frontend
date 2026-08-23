import type { CanonicalLibraryModel } from './model'
import type { ValidatedLibraryBundle } from './validate'
import { hasBundleErrors } from './diagnostics'
import { canonicalEntityKey, collectCanonicalModelEntities, type CanonicalModelEntity } from './entities'
import { semanticHash } from './semanticHash'

export type ImportOperationKind = 'create' | 'update' | 'delete' | 'keep_local' | 'unchanged' | 'conflict'
export type ImportConflictResolution = 'keep_local' | 'use_incoming'

export interface ImportPlanOperation {
  readonly key: string
  readonly entityType: string
  readonly entityId: string
  readonly bookId?: string
  readonly bookTitle?: string
  readonly title?: string
  readonly path?: string
  readonly kind: ImportOperationKind
  readonly conflictReason?: 'different_edits' | 'delete_vs_edit' | 'edit_vs_delete' | 'duplicate_new_id'
  readonly resolution?: ImportConflictResolution
  readonly baseHash?: string
  readonly localHash?: string
  readonly incomingHash?: string
  readonly localValue?: unknown
  readonly incomingValue?: unknown
  readonly changedFields: readonly string[]
}

export interface ImportPlanCounts {
  readonly create: number
  readonly update: number
  readonly delete: number
  readonly keep_local: number
  readonly unchanged: number
  readonly conflict: number
}

export interface ImportPlanEntityReference {
  readonly entityType: string
  readonly entityId: string
  readonly bookId?: string
  readonly title?: string
  readonly path?: string
  readonly message?: string
}

export interface ImportPlanWikiReviewReference extends ImportPlanEntityReference {
  readonly wikiPageId: string
  readonly wikiPageTitle: string
  readonly chapterId: string
  readonly chapterTitle: string
}

export interface ImportPlanAliasSummary {
  readonly alias: string
  readonly pages: readonly ImportPlanEntityReference[]
}

export interface ImportPlanPreviewSummary {
  readonly images: {
    readonly includedCount: number
    readonly includedBytes: number
    readonly omittedCount: number
    readonly omittedBytes: number
  }
  readonly wikiReview: {
    readonly currentCount: number
    readonly stale: readonly ImportPlanWikiReviewReference[]
    readonly missing: readonly ImportPlanWikiReviewReference[]
  }
  readonly ambiguousAliases: readonly ImportPlanAliasSummary[]
  readonly warnings: {
    readonly unknownProfiles: readonly ImportPlanEntityReference[]
    readonly ignoredFiles: readonly ImportPlanEntityReference[]
  }
}

export interface LibraryImportPlan {
  readonly planVersion: 1
  readonly bundleId: string
  readonly databaseGeneration: string
  readonly bookIds: readonly string[]
  readonly operations: readonly ImportPlanOperation[]
  readonly counts: ImportPlanCounts
  readonly countsByEntityType: Readonly<Record<string, ImportPlanCounts>>
  readonly unresolvedConflicts: number
  readonly canApply: boolean
  readonly replaceEligible: boolean
  readonly diagnostics: ValidatedLibraryBundle['diagnostics']
  readonly previewSummary: ImportPlanPreviewSummary
}

function emptyPreviewSummary(): ImportPlanPreviewSummary {
  return {
    images: { includedCount: 0, includedBytes: 0, omittedCount: 0, omittedBytes: 0 },
    wikiReview: { currentCount: 0, stale: [], missing: [] },
    ambiguousAliases: [],
    warnings: { unknownProfiles: [], ignoredFiles: [] },
  }
}

function createPreviewSummary(bundle: ValidatedLibraryBundle): ImportPlanPreviewSummary {
  if (!bundle.model) return emptyPreviewSummary()
  const model = bundle.model
  const sources = new Map(bundle.entitySources.map((source) => [canonicalEntityKey(source.entityType, source.id), source.path]))
  const entities = new Map(collectCanonicalModelEntities(model)
    .map((entity) => [canonicalEntityKey(entity.entityType, entity.id), entity]))
  const chapters = new Map(model.chapters.map((chapter) => [chapter.id, chapter]))
  const pages = new Map(model.wiki_pages.map((page) => [page.id, page]))
  const staleIds = new Set(bundle.diagnostics
    .filter((diagnostic) => diagnostic.code === 'review_state.stale')
    .map((diagnostic) => diagnostic.entityId))
  const reviewIds = new Set(model.wiki_review_state.map((state) => `${state.wiki_page_id}:${state.chapter_id}`))

  const wikiReference = (wikiPageId: string, chapterId: string, message?: string): ImportPlanWikiReviewReference => {
    const page = pages.get(wikiPageId)
    const chapter = chapters.get(chapterId)
    return {
      entityType: 'wiki_review_state', entityId: `${wikiPageId}:${chapterId}`, bookId: page?.book_id ?? chapter?.book_id,
      title: `${page?.page_name ?? wikiPageId} · ${chapter?.title ?? chapterId}`,
      path: sources.get(canonicalEntityKey('wiki_review_state', `${wikiPageId}:${chapterId}`))
        ?? sources.get(canonicalEntityKey('chapter', chapterId)),
      message,
      wikiPageId, wikiPageTitle: page?.page_name ?? wikiPageId,
      chapterId, chapterTitle: chapter?.title ?? 'Untitled chapter',
    }
  }
  const stale = model.wiki_review_state
    .filter((state) => staleIds.has(`${state.wiki_page_id}:${state.chapter_id}`))
    .map((state) => wikiReference(state.wiki_page_id, state.chapter_id, 'Chapter content changed after this review.'))
  const missing = model.chapters.flatMap((chapter) => chapter.wiki_mentions
    .filter((mention) => !reviewIds.has(`${mention.wiki_page_id}:${chapter.id}`))
    .map((mention) => wikiReference(mention.wiki_page_id, chapter.id, 'This explicit wiki mention has no review record.')))

  const aliases = new Map<string, { alias: string; pageIds: Set<string> }>()
  for (const page of model.wiki_pages) for (const alias of page.aliases) {
    const key = alias.normalize('NFC').toLocaleLowerCase('en-US')
    const entry = aliases.get(key) ?? { alias, pageIds: new Set<string>() }
    entry.pageIds.add(page.id)
    aliases.set(key, entry)
  }
  const ambiguousAliases = [...aliases.values()]
    .filter((entry) => entry.pageIds.size > 1)
    .sort((left, right) => left.alias.localeCompare(right.alias))
    .map((entry) => ({
      alias: entry.alias,
      pages: [...entry.pageIds].sort().map((id) => {
        const page = pages.get(id)!
        return {
          entityType: 'wiki_page', entityId: id, bookId: page.book_id, title: page.page_name,
          path: sources.get(canonicalEntityKey('wiki_page', id)),
        }
      }),
    }))

  const warningReference = (code: string): ImportPlanEntityReference[] => bundle.diagnostics
    .filter((diagnostic) => diagnostic.code === code)
    .map((diagnostic) => {
      const entityType = diagnostic.entityType ?? (code === 'file.unknown' ? 'file' : 'unknown')
      const entityId = diagnostic.entityId ?? diagnostic.path ?? code
      const entity = entities.get(canonicalEntityKey(entityType, entityId))
      return {
        entityType, entityId, bookId: entity?.bookId, title: entity?.title,
        path: diagnostic.path ?? sources.get(canonicalEntityKey(entityType, entityId)),
        message: diagnostic.message,
      }
    })

  return {
    images: model.assets.reduce((summary, asset) => {
      if (asset.bytes) {
        summary.includedCount++
        summary.includedBytes += asset.bytes.byteLength
      } else {
        summary.omittedCount++
        summary.omittedBytes += asset.byte_length
      }
      return summary
    }, { includedCount: 0, includedBytes: 0, omittedCount: 0, omittedBytes: 0 }),
    wikiReview: {
      currentCount: model.wiki_review_state.length - stale.length,
      stale,
      missing,
    },
    ambiguousAliases,
    warnings: {
      unknownProfiles: warningReference('review.unknown_profile'),
      ignoredFiles: warningReference('file.unknown'),
    },
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

function immutableClone(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) {
    return value.byteLength ? `[${value.byteLength} binary bytes]` : '[0 binary bytes]'
  }
  if (Array.isArray(value)) return value.map(immutableClone)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, immutableClone(child)]))
  }
  return value
}

function changedFields(local: unknown, incoming: unknown): string[] {
  if (!local || !incoming || typeof local !== 'object' || typeof incoming !== 'object') return []
  const left = local as Record<string, unknown>
  const right = incoming as Record<string, unknown>
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => key !== 'updated_at' && JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .sort()
}

function classify(
  baseHash: string | undefined,
  localHash: string | undefined,
  incomingHash: string | undefined,
): Pick<ImportPlanOperation, 'kind' | 'conflictReason'> {
  if (!baseHash) {
    if (!localHash && incomingHash) return { kind: 'create' }
    if (localHash && !incomingHash) return { kind: 'keep_local' }
    if (localHash === incomingHash) return { kind: 'unchanged' }
    return { kind: 'conflict', conflictReason: 'duplicate_new_id' }
  }
  if (!localHash && !incomingHash) return { kind: 'unchanged' }
  if (!localHash) return incomingHash === baseHash
    ? { kind: 'keep_local' }
    : { kind: 'conflict', conflictReason: 'edit_vs_delete' }
  if (!incomingHash) return localHash === baseHash
    ? { kind: 'delete' }
    : { kind: 'conflict', conflictReason: 'delete_vs_edit' }
  if (localHash === incomingHash) return { kind: 'unchanged' }
  if (localHash === baseHash) return { kind: 'update' }
  if (incomingHash === baseHash) return { kind: 'keep_local' }
  return { kind: 'conflict', conflictReason: 'different_edits' }
}

function calculateCounts(operations: readonly ImportPlanOperation[]): ImportPlanCounts {
  const counts: Record<ImportOperationKind, number> = { create: 0, update: 0, delete: 0, keep_local: 0, unchanged: 0, conflict: 0 }
  operations.forEach((operation) => { counts[operation.kind]++ })
  return counts
}

function finishPlan(plan: Omit<LibraryImportPlan, 'counts' | 'countsByEntityType' | 'unresolvedConflicts' | 'canApply'>): LibraryImportPlan {
  const counts = calculateCounts(plan.operations)
  const countsByEntityType = Object.fromEntries(
    [...new Set(plan.operations.map((operation) => operation.entityType))].sort()
      .map((entityType) => [entityType, calculateCounts(plan.operations.filter((operation) => operation.entityType === entityType))]),
  )
  const unresolvedConflicts = plan.operations.filter((operation) => operation.kind === 'conflict' && !operation.resolution).length
  return deepFreeze(immutableClone({
    ...plan,
    counts,
    countsByEntityType,
    unresolvedConflicts,
    canApply: !hasBundleErrors(plan.diagnostics) && unresolvedConflicts === 0,
  }) as LibraryImportPlan)
}

/** Build an immutable three-way plan from inventory base, current local model, and parsed incoming model. */
export async function createLibraryImportPlan(
  bundle: ValidatedLibraryBundle,
  localModel: CanonicalLibraryModel,
  databaseGeneration: string,
): Promise<LibraryImportPlan> {
  if (!bundle.manifest || !bundle.inventory || !bundle.model) {
    return finishPlan({
      planVersion: 1, bundleId: bundle.manifest?.bundle_id ?? 'invalid', databaseGeneration,
      bookIds: bundle.manifest?.book_ids ?? [], operations: [], replaceEligible: false,
      diagnostics: bundle.diagnostics, previewSummary: createPreviewSummary(bundle),
    })
  }
  const incomingEntities = collectCanonicalModelEntities(bundle.model)
  const localEntities = collectCanonicalModelEntities(localModel)
  const bookTitles = new Map([
    ...localModel.books.map((book) => [book.id, book.title] as const),
    ...bundle.model.books.map((book) => [book.id, book.title] as const),
  ])
  const incoming = new Map(incomingEntities.map((entity) => [canonicalEntityKey(entity.entityType, entity.id), entity]))
  const local = new Map(localEntities.map((entity) => [canonicalEntityKey(entity.entityType, entity.id), entity]))
  const base = new Map(bundle.inventory.entities.map((entity) => [canonicalEntityKey(entity.entity_type, entity.id), entity]))
  const paths = new Map(bundle.entitySources.map((source) => [canonicalEntityKey(source.entityType, source.id), source.path]))
  const scope = new Set(bundle.manifest.book_ids)
  const candidateKeys = new Set([...base.keys(), ...incoming.keys()])
  const includesEntityType = (entityType: string) => {
    if (entityType === 'chapter_revision' || entityType === 'chapter_activity') {
      return bundle.manifest!.includes.history
    }
    if (entityType === 'wiki_update' || entityType === 'wiki_review_state') {
      return bundle.manifest!.includes.audit_records
    }
    return true
  }
  for (const [key, entity] of local) {
    if (!includesEntityType(entity.entityType)) continue
    if (entity.bookId && scope.has(entity.bookId)) candidateKeys.add(key)
    else if (entity.entityType === 'profile' && bundle.manifest.bundle_kind === 'library') candidateKeys.add(key)
  }

  const hashes = new Map<string, string>()
  const getHash = async (prefix: string, entity: CanonicalModelEntity | undefined) => {
    if (!entity) return undefined
    const key = `${prefix}:${canonicalEntityKey(entity.entityType, entity.id)}`
    let hash = hashes.get(key)
    if (!hash) {
      hash = await semanticHash(entity.value)
      hashes.set(key, hash)
    }
    return hash
  }
  const operations: ImportPlanOperation[] = []
  for (const key of [...candidateKeys].sort()) {
    const localEntity = local.get(key)
    const incomingEntity = incoming.get(key)
    const baseEntity = base.get(key)
    const [entityType, entityId] = key.split('\0')
    const localHash = await getHash('local', localEntity)
    const incomingHash = await getHash('incoming', incomingEntity)
    const classification = classify(baseEntity?.semantic_sha256, localHash, incomingHash)
    operations.push({
      key, entityType, entityId,
      bookId: incomingEntity?.bookId ?? localEntity?.bookId,
      bookTitle: bookTitles.get(incomingEntity?.bookId ?? localEntity?.bookId ?? ''),
      title: incomingEntity?.title ?? localEntity?.title,
      path: paths.get(key) ?? baseEntity?.path,
      ...classification,
      baseHash: baseEntity?.semantic_sha256, localHash, incomingHash,
      localValue: localEntity?.value, incomingValue: incomingEntity?.value,
      changedFields: changedFields(localEntity?.value, incomingEntity?.value),
    })
  }
  return finishPlan({
    planVersion: 1, bundleId: bundle.manifest.bundle_id, databaseGeneration,
    bookIds: [...bundle.manifest.book_ids], operations, replaceEligible: bundle.replaceEligible,
    diagnostics: bundle.diagnostics, previewSummary: createPreviewSummary(bundle),
  })
}

export function resolveImportConflict(
  plan: LibraryImportPlan,
  operationKey: string,
  resolution: ImportConflictResolution,
): LibraryImportPlan {
  const operation = plan.operations.find((candidate) => candidate.key === operationKey)
  if (!operation || operation.kind !== 'conflict') throw new Error(`No conflict exists for ${operationKey}.`)
  const operations = plan.operations.map((candidate) => candidate.key === operationKey
    ? { ...candidate, resolution }
    : candidate)
  return finishPlan({ ...plan, operations })
}

export function assertImportPlanCurrent(plan: LibraryImportPlan, databaseGeneration: string): void {
  assertImportPlanGeneration(plan, databaseGeneration)
  if (!plan.canApply) throw new Error('The import plan has validation errors or unresolved conflicts.')
}

export function assertImportPlanGeneration(plan: LibraryImportPlan, databaseGeneration: string): void {
  if (plan.databaseGeneration !== databaseGeneration) {
    throw new Error('The library changed after this preview was created. Refresh the preview before applying changes.')
  }
}
