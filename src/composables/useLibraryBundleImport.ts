import { computed, ref, shallowRef } from 'vue'
import packageInfo from '../../package.json'
import type { ImageAsset } from '@/lib/database'
import { previewBundleDirectoryImport, previewBundleZipImport, type PreviewedBundleImport } from '@/lib/libraryBundle/importPreview'
import { resolveImportConflict, type ImportConflictResolution } from '@/lib/libraryBundle/plan'
import { applyImportPlanToModel, canonicalModelToDatabaseImport } from '@/lib/libraryBundle/apply'
import { sha256Hex } from '@/lib/libraryBundle/semanticHash'
import { MAX_BUNDLE_ARCHIVE_BYTES } from '@/lib/libraryBundle/limits'
import { createPortableId } from '@/lib/portableIds'
import type { RecoveryBundleMetadata, RecoveryStore } from '@/lib/recovery/model'
import { createRuntimeRecoveryStore } from '@/lib/recovery/runtime'
import { prepareLibraryReplacement, replaceLibraryWithRecovery } from '@/lib/recovery/replacement'
import { readVerifiedRecovery } from '@/lib/recovery/service'

interface LibraryBundleImportDeps {
  exportDatabase: () => Promise<Uint8Array>
  importDatabaseBackup: (data: Uint8Array) => Promise<void>
  getImageBlob: (asset: ImageAsset) => Promise<Blob>
  recoveryStore?: RecoveryStore
  confirmReplace?: (message: string) => boolean
}

function triggerRecoveryDownload(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function useLibraryBundleImport(deps: LibraryBundleImportDeps) {
  // Plans contain frozen snapshots and binary values; keeping them shallow avoids
  // Vue proxying data that must remain structured-cloneable at confirmation time.
  const preview = shallowRef<PreviewedBundleImport | null>(null)
  const importFileName = ref('')
  const importError = ref('')
  const importMessage = ref('')
  const isPreviewing = ref(false)
  const isApplying = ref(false)
  const isPreparingReplace = ref(false)
  const isReplacing = ref(false)
  const recoveries = ref<RecoveryBundleMetadata[]>([])
  const preparedRecovery = ref<RecoveryBundleMetadata | null>(null)
  const plan = computed(() => preview.value?.plan ?? null)
  const recoveryStore = deps.recoveryStore ?? createRuntimeRecoveryStore()
  const replaceRemovalCounts = computed(() => {
    if (!preview.value) return { books: 0, chapters: 0, wikiPages: 0 }
    const incoming = preview.value.incomingModel
    return {
      books: preview.value.localModel.books.filter((value) => !incoming.books.some((candidate) => candidate.id === value.id)).length,
      chapters: preview.value.localModel.chapters.filter((value) => !incoming.chapters.some((candidate) => candidate.id === value.id)).length,
      wikiPages: preview.value.localModel.wiki_pages.filter((value) => !incoming.wiki_pages.some((candidate) => candidate.id === value.id)).length,
    }
  })

  async function refreshRecoveries(): Promise<void> {
    try {
      recoveries.value = (await recoveryStore.list()).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    } catch (error) {
      importError.value = error instanceof Error ? error.message : 'Could not list recovery bundles.'
    }
  }

  async function previewFile(file: File): Promise<void> {
    importError.value = ''
    importMessage.value = ''
    preview.value = null
    preparedRecovery.value = null
    importFileName.value = file.name
    isPreviewing.value = true
    try {
      if (file.size > MAX_BUNDLE_ARCHIVE_BYTES) {
        throw new Error(
          `Bundle archive is ${file.size} bytes; the browser import limit is ${MAX_BUNDLE_ARCHIVE_BYTES} bytes.`,
        )
      }
      const [zipBytes, databaseBackup] = await Promise.all([
        file.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
        deps.exportDatabase(),
      ])
      preview.value = await previewBundleZipImport(zipBytes, databaseBackup, {
        readLocalAssetBytes: async (asset) => new Uint8Array(await (await deps.getImageBlob(asset)).arrayBuffer()),
      })
    } catch (error) {
      importError.value = error instanceof Error ? error.message : 'Could not preview this bundle.'
    } finally {
      isPreviewing.value = false
    }
  }

  async function previewDirectory(files: readonly File[]): Promise<void> {
    importError.value = ''
    importMessage.value = ''
    preview.value = null
    preparedRecovery.value = null
    importFileName.value = files[0]?.webkitRelativePath.split('/')[0] || 'Selected folder'
    isPreviewing.value = true
    try {
      const databaseBackup = await deps.exportDatabase()
      preview.value = await previewBundleDirectoryImport(files, databaseBackup, {
        readLocalAssetBytes: async (asset) => new Uint8Array(await (await deps.getImageBlob(asset)).arrayBuffer()),
      })
    } catch (error) {
      importError.value = error instanceof Error ? error.message : 'Could not preview this bundle folder.'
    } finally {
      isPreviewing.value = false
    }
  }

  function resolveConflict(key: string, resolution: ImportConflictResolution): void {
    if (!preview.value) return
    preview.value = {
      ...preview.value,
      plan: resolveImportConflict(preview.value.plan, key, resolution),
    }
  }

  async function applyChanges(): Promise<void> {
    if (!preview.value) return
    importError.value = ''
    importMessage.value = ''
    isApplying.value = true
    try {
      const currentBackup = await deps.exportDatabase()
      const currentGeneration = await sha256Hex(currentBackup)
      const merged = applyImportPlanToModel(preview.value.plan, preview.value.localModel, currentGeneration)
      const databaseData = canonicalModelToDatabaseImport(merged)
      await deps.importDatabaseBackup(new TextEncoder().encode(JSON.stringify(databaseData)))
      importMessage.value = 'Bundle changes applied successfully.'
      preview.value = null
    } catch (error) {
      importError.value = error instanceof Error ? error.message : 'Import failed.'
    } finally {
      isApplying.value = false
    }
  }

  async function prepareReplace(): Promise<void> {
    if (!preview.value) return
    importError.value = ''
    importMessage.value = ''
    isPreparingReplace.value = true
    try {
      const currentBackup = await deps.exportDatabase()
      const currentGeneration = await sha256Hex(currentBackup)
      const createdAt = new Date().toISOString()
      preparedRecovery.value = await prepareLibraryReplacement(
        recoveryStore,
        preview.value.plan,
        preview.value.localModel,
        currentGeneration,
        {
          recoveryId: createPortableId('recovery').replace(/:/g, '-'),
          recoveryBundleId: createPortableId('bundle'),
          createdAt,
          appVersion: packageInfo.version,
        },
      )
      importMessage.value = 'Recovery bundle verified. Replace confirmation is now enabled.'
      await refreshRecoveries()
    } catch (error) {
      preparedRecovery.value = null
      importError.value = error instanceof Error ? error.message : 'Could not prepare a verified recovery.'
    } finally {
      isPreparingReplace.value = false
    }
  }

  async function replaceLibrary(): Promise<void> {
    if (!preview.value || !preparedRecovery.value) return
    const activePreview = preview.value
    const activeRecovery = preparedRecovery.value
    const counts = replaceRemovalCounts.value
    const confirmationMessage = `This restore will remove ${counts.books} books, ${counts.chapters} chapters, and ${counts.wikiPages} wiki pages that are not in the backup. Continue?`
    const confirmed = deps.confirmReplace
      ? deps.confirmReplace(confirmationMessage)
      : window.confirm(confirmationMessage)
    if (!confirmed) return
    importError.value = ''
    importMessage.value = ''
    isReplacing.value = true
    try {
      const currentBackup = await deps.exportDatabase()
      const currentGeneration = await sha256Hex(currentBackup)
      await replaceLibraryWithRecovery(
        recoveryStore,
        activePreview.plan,
        activePreview.incomingModel,
        activeRecovery,
        currentGeneration,
        deps.importDatabaseBackup,
      )
      importMessage.value = 'Library replaced successfully. The verified recovery remains available below.'
      if (preview.value === activePreview) {
        preview.value = null
        preparedRecovery.value = null
      }
      await refreshRecoveries()
    } catch (error) {
      importError.value = error instanceof Error ? error.message : 'Library replacement failed.'
    } finally {
      isReplacing.value = false
    }
  }

  async function previewRecovery(id: string): Promise<void> {
    importError.value = ''
    preparedRecovery.value = null
    isPreviewing.value = true
    try {
      const [stored, currentBackup] = await Promise.all([
        readVerifiedRecovery(recoveryStore, id),
        deps.exportDatabase(),
      ])
      preview.value = await previewBundleZipImport(stored.bytes, currentBackup, {
        readLocalAssetBytes: async (asset) => new Uint8Array(await (await deps.getImageBlob(asset)).arrayBuffer()),
      })
      importFileName.value = `Recovery from ${stored.metadata.createdAt}`
    } catch (error) {
      importError.value = error instanceof Error ? error.message : 'Could not preview recovery.'
    } finally {
      isPreviewing.value = false
    }
  }

  async function downloadRecovery(id: string): Promise<void> {
    try {
      const stored = await readVerifiedRecovery(recoveryStore, id)
      triggerRecoveryDownload(stored.bytes, `beta-bot-recovery-${stored.metadata.createdAt.slice(0, 10)}.zip`)
    } catch (error) {
      importError.value = error instanceof Error ? error.message : 'Could not download recovery.'
    }
  }

  return {
    preview, plan, importFileName, importError, importMessage, isPreviewing, isApplying,
    isPreparingReplace, isReplacing, recoveries, preparedRecovery, replaceRemovalCounts,
    previewFile, previewDirectory, resolveConflict, applyChanges, prepareReplace, replaceLibrary,
    refreshRecoveries, previewRecovery, downloadRecovery,
  }
}
