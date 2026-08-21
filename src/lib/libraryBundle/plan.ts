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
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

function immutableClone(value: unknown): unknown {
  if (value instanceof Uint8Array) return value.length ? [...value] : []
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
      diagnostics: bundle.diagnostics,
    })
  }
  const incomingEntities = collectCanonicalModelEntities(bundle.model)
  const localEntities = collectCanonicalModelEntities(localModel)
  const incoming = new Map(incomingEntities.map((entity) => [canonicalEntityKey(entity.entityType, entity.id), entity]))
  const local = new Map(localEntities.map((entity) => [canonicalEntityKey(entity.entityType, entity.id), entity]))
  const base = new Map(bundle.inventory.entities.map((entity) => [canonicalEntityKey(entity.entity_type, entity.id), entity]))
  const paths = new Map(bundle.entitySources.map((source) => [canonicalEntityKey(source.entityType, source.id), source.path]))
  const scope = new Set(bundle.manifest.book_ids)
  const candidateKeys = new Set([...base.keys(), ...incoming.keys()])
  for (const [key, entity] of local) {
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
    diagnostics: bundle.diagnostics,
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
  if (plan.databaseGeneration !== databaseGeneration) {
    throw new Error('The library changed after this preview was created. Refresh the preview before applying changes.')
  }
  if (!plan.canApply) throw new Error('The import plan has validation errors or unresolved conflicts.')
}
