import { z } from 'zod'

export const RECOVERY_RETENTION_COUNT = 3

export type RecoverySourceOperation = 'replace-library'

export interface RecoveryBundleMetadata {
  id: string
  bundleId: string
  createdAt: string
  appVersion: string
  sourceOperation: RecoverySourceOperation
  databaseGeneration: string
  byteLength: number
  sha256: string
}

export interface StoredRecoveryBundle {
  metadata: RecoveryBundleMetadata
  bytes: Uint8Array
}

export interface RecoveryStore {
  write(bundle: StoredRecoveryBundle): Promise<void>
  read(id: string): Promise<StoredRecoveryBundle | null>
  list(): Promise<RecoveryBundleMetadata[]>
  delete(id: string): Promise<void>
}

const recoveryIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/)

export const recoveryBundleMetadataSchema = z.strictObject({
  id: recoveryIdSchema,
  bundleId: z.string().min(1),
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
  appVersion: z.string().min(1),
  sourceOperation: z.literal('replace-library'),
  databaseGeneration: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().nonnegative().safe(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export function parseRecoveryMetadata(value: unknown): RecoveryBundleMetadata {
  return recoveryBundleMetadataSchema.parse(value)
}

export function assertRecoveryId(id: string): void {
  if (!recoveryIdSchema.safeParse(id).success) throw new Error('Invalid recovery bundle ID.')
}
