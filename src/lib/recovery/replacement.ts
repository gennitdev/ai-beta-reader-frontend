import type { CanonicalLibraryModel } from '@/lib/libraryBundle/model'
import type { LibraryImportPlan } from '@/lib/libraryBundle/plan'
import { assertImportPlanGeneration } from '@/lib/libraryBundle/plan'
import { writeLibraryBundle } from '@/lib/libraryBundle/write'
import { createBundleZip, readBundleZip } from '@/lib/libraryBundle/adapters/zip'
import { readLibraryBundle } from '@/lib/libraryBundle/read'
import { validateLibraryBundle } from '@/lib/libraryBundle/validate'
import { canonicalModelToDatabaseImport } from '@/lib/libraryBundle/apply'
import type { RecoveryBundleMetadata, RecoveryStore } from './model'
import { createVerifiedRecovery, readVerifiedRecovery } from './service'

export interface PrepareReplacementOptions {
  recoveryId: string
  recoveryBundleId: string
  createdAt: string
  appVersion: string
}

function databaseBytes(model: CanonicalLibraryModel): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(model)))
}

export async function prepareLibraryReplacement(
  store: RecoveryStore,
  plan: LibraryImportPlan,
  localModel: CanonicalLibraryModel,
  currentDatabaseGeneration: string,
  options: PrepareReplacementOptions,
): Promise<RecoveryBundleMetadata> {
  assertImportPlanGeneration(plan, currentDatabaseGeneration)
  if (!plan.replaceEligible) throw new Error('This bundle is not eligible to replace the library.')
  const written = await writeLibraryBundle(localModel, {
    bundleId: options.recoveryBundleId,
    exportedAt: options.createdAt,
    appVersion: options.appVersion,
  })
  const zipBytes = await createBundleZip(written.files)
  return createVerifiedRecovery(store, zipBytes, {
    id: options.recoveryId,
    bundleId: options.recoveryBundleId,
    createdAt: options.createdAt,
    appVersion: options.appVersion,
    sourceOperation: 'replace-library',
    databaseGeneration: currentDatabaseGeneration,
  })
}

async function recoveryModel(store: RecoveryStore, recovery: RecoveryBundleMetadata): Promise<CanonicalLibraryModel> {
  const stored = await readVerifiedRecovery(store, recovery.id)
  if (stored.metadata.databaseGeneration !== recovery.databaseGeneration) {
    throw new Error('Prepared recovery metadata no longer matches this replacement.')
  }
  const transport = await readBundleZip(stored.bytes)
  if (!transport.files) throw new Error('Prepared recovery ZIP can no longer be read.')
  const validated = await validateLibraryBundle(readLibraryBundle(transport.files), transport.files)
  if (!validated.model || validated.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new Error('Prepared recovery bundle failed canonical validation.')
  }
  return validated.model
}

export async function replaceLibraryWithRecovery(
  store: RecoveryStore,
  plan: LibraryImportPlan,
  incomingModel: CanonicalLibraryModel,
  recovery: RecoveryBundleMetadata,
  currentDatabaseGeneration: string,
  importDatabaseBackup: (bytes: Uint8Array) => Promise<void>,
): Promise<void> {
  assertImportPlanGeneration(plan, currentDatabaseGeneration)
  if (!plan.replaceEligible) throw new Error('This bundle is not eligible to replace the library.')
  if (recovery.databaseGeneration !== currentDatabaseGeneration) {
    throw new Error('The prepared recovery does not match the current library generation.')
  }
  const rollbackModel = await recoveryModel(store, recovery)
  try {
    await importDatabaseBackup(databaseBytes(incomingModel))
  } catch (replaceError) {
    try {
      await importDatabaseBackup(databaseBytes(rollbackModel))
    } catch (rollbackError) {
      throw new AggregateError(
        [replaceError, rollbackError],
        `Library replacement failed and automatic rollback also failed. Verified recovery ${recovery.id} is still available.`,
      )
    }
    throw new Error(
      `Library replacement failed; the prior library was restored from verified recovery ${recovery.id}.`,
      { cause: replaceError },
    )
  }
}
