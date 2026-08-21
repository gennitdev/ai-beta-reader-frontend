import { sha256Hex } from '@/lib/libraryBundle/semanticHash'
import {
  RECOVERY_RETENTION_COUNT,
  type RecoveryBundleMetadata,
  type RecoverySourceOperation,
  type RecoveryStore,
  type StoredRecoveryBundle,
  parseRecoveryMetadata,
} from './model'

export interface CreateVerifiedRecoveryOptions {
  id: string
  bundleId: string
  createdAt: string
  appVersion: string
  sourceOperation: RecoverySourceOperation
  databaseGeneration: string
  retentionCount?: number
}

export async function verifyStoredRecovery(bundle: StoredRecoveryBundle): Promise<void> {
  parseRecoveryMetadata(bundle.metadata)
  if (bundle.bytes.byteLength !== bundle.metadata.byteLength) {
    throw new Error(`Recovery ${bundle.metadata.id} failed byte-length verification.`)
  }
  if (await sha256Hex(bundle.bytes) !== bundle.metadata.sha256) {
    throw new Error(`Recovery ${bundle.metadata.id} failed SHA-256 verification.`)
  }
}

export async function readVerifiedRecovery(
  store: RecoveryStore,
  id: string,
): Promise<StoredRecoveryBundle> {
  const bundle = await store.read(id)
  if (!bundle) throw new Error(`Recovery ${id} was not found.`)
  await verifyStoredRecovery(bundle)
  return bundle
}

/** Write, read back, verify, and only then clean up older verified recoveries. */
export async function createVerifiedRecovery(
  store: RecoveryStore,
  bytes: Uint8Array,
  options: CreateVerifiedRecoveryOptions,
): Promise<RecoveryBundleMetadata> {
  const metadata: RecoveryBundleMetadata = {
    id: options.id,
    bundleId: options.bundleId,
    createdAt: options.createdAt,
    appVersion: options.appVersion,
    sourceOperation: options.sourceOperation,
    databaseGeneration: options.databaseGeneration,
    byteLength: bytes.byteLength,
    sha256: await sha256Hex(bytes),
  }
  await store.write({ metadata, bytes })
  try {
    await readVerifiedRecovery(store, metadata.id)
  } catch (error) {
    await store.delete(metadata.id).catch(() => undefined)
    throw error
  }

  const retentionCount = options.retentionCount ?? RECOVERY_RETENTION_COUNT
  const recoveries = (await store.list())
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
  await Promise.allSettled(recoveries.slice(retentionCount).map((stale) => store.delete(stale.id)))
  return metadata
}
