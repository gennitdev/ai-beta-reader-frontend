import { sha256Hex } from '../semanticHash'

export const DRIVE_GENERATION_RETENTION_COUNT = 3
export const DRIVE_BACKUP_APP_PROPERTY = 'betaBotLibraryBackup'

export interface DriveBackupGenerationMetadata {
  createdAt: string
  appVersion: string
  bundleFormatVersion: number
  encryptedByteLength: number
  ciphertextSha256: string
}

export interface DriveBackupGeneration extends DriveBackupGenerationMetadata {
  id: string
  name: string
}

export interface UploadDriveGenerationRequest {
  name: string
  encryptedData: string
  metadata: DriveBackupGenerationMetadata
}

export interface DriveGenerationStore {
  uploadGeneration(request: UploadDriveGenerationRequest): Promise<DriveBackupGeneration>
  listGenerations(): Promise<DriveBackupGeneration[]>
  downloadGeneration(id: string): Promise<string>
  deleteGeneration(id: string): Promise<void>
}

export async function encryptedGenerationIntegrity(encryptedData: string) {
  const bytes = new TextEncoder().encode(encryptedData)
  return { encryptedByteLength: bytes.byteLength, ciphertextSha256: await sha256Hex(bytes) }
}

function assertUploadedGeneration(
  uploaded: DriveBackupGeneration,
  expected: DriveBackupGenerationMetadata,
): void {
  if (
    !uploaded.id
    || uploaded.createdAt !== expected.createdAt
    || uploaded.appVersion !== expected.appVersion
    || uploaded.bundleFormatVersion !== expected.bundleFormatVersion
    || uploaded.encryptedByteLength !== expected.encryptedByteLength
    || uploaded.ciphertextSha256 !== expected.ciphertextSha256
  ) {
    throw new Error('Google Drive did not record the uploaded backup generation metadata correctly.')
  }
}

/** Upload and verify a new generation before best-effort retirement of older ones. */
export async function createDriveBackupGeneration(
  store: DriveGenerationStore,
  encryptedData: string,
  options: { createdAt: string; appVersion: string; bundleFormatVersion: number; retentionCount?: number },
): Promise<DriveBackupGeneration> {
  const integrity = await encryptedGenerationIntegrity(encryptedData)
  const metadata: DriveBackupGenerationMetadata = {
    createdAt: options.createdAt,
    appVersion: options.appVersion,
    bundleFormatVersion: options.bundleFormatVersion,
    ...integrity,
  }
  const portableTimestamp = options.createdAt.replace(/[:.]/g, '-')
  const uploaded = await store.uploadGeneration({
    name: `ai-beta-reader-library-${portableTimestamp}.enc`,
    encryptedData,
    metadata,
  })
  assertUploadedGeneration(uploaded, metadata)

  const retentionCount = options.retentionCount ?? DRIVE_GENERATION_RETENTION_COUNT
  try {
    const generations = (await store.listGenerations())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    await Promise.allSettled(
      generations.slice(retentionCount).map((generation) => store.deleteGeneration(generation.id)),
    )
  } catch {
    // The new generation is already durable and verified. A later backup can
    // retry retention without turning this successful backup into a failure.
  }
  return uploaded
}
