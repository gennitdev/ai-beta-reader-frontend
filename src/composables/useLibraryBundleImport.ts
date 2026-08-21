import { computed, ref, shallowRef } from 'vue'
import type { ImageAsset } from '@/lib/database'
import { previewBundleDirectoryImport, previewBundleZipImport, type PreviewedBundleImport } from '@/lib/libraryBundle/importPreview'
import { resolveImportConflict, type ImportConflictResolution } from '@/lib/libraryBundle/plan'
import { applyImportPlanToModel, canonicalModelToDatabaseImport } from '@/lib/libraryBundle/apply'
import { sha256Hex } from '@/lib/libraryBundle/semanticHash'

interface LibraryBundleImportDeps {
  exportDatabase: () => Promise<Uint8Array>
  importDatabaseBackup: (data: Uint8Array) => Promise<void>
  getImageBlob: (asset: ImageAsset) => Promise<Blob>
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
  const plan = computed(() => preview.value?.plan ?? null)

  async function previewFile(file: File): Promise<void> {
    importError.value = ''
    importMessage.value = ''
    preview.value = null
    importFileName.value = file.name
    isPreviewing.value = true
    try {
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

  return {
    preview, plan, importFileName, importError, importMessage, isPreviewing, isApplying,
    previewFile, previewDirectory, resolveConflict, applyChanges,
  }
}
