import type { PreviewedBundleImport } from './importPreview'
import type { LibraryBundlePreviewStage } from './importPreview'
import type { LibraryImportIntent } from './plan'
import type { SelectedDirectoryBundleFile } from './adapters/directory'

export interface LibraryBundleZipPreviewWorkerRequest {
  type: 'preview-library-bundle'
  zipBytes: Uint8Array
  databaseBackup: Uint8Array
  intent?: LibraryImportIntent
}

export interface LibraryBundleDirectoryPreviewWorkerRequest {
  type: 'preview-library-bundle-directory'
  files: readonly SelectedDirectoryBundleFile[]
  databaseBackup: Uint8Array
  intent?: LibraryImportIntent
}

export type LibraryBundlePreviewWorkerRequest = LibraryBundleZipPreviewWorkerRequest
  | LibraryBundleDirectoryPreviewWorkerRequest

export type LibraryBundlePreviewWorkerErrorCode = 'local-asset-bytes-required' | 'preview-failed'

export type LibraryBundlePreviewWorkerResponse = {
  type: 'preview-progress'
  stage: LibraryBundlePreviewStage
} | {
  type: 'preview-complete'
  preview: PreviewedBundleImport
} | {
  type: 'preview-failed'
  message: string
  code: LibraryBundlePreviewWorkerErrorCode
}

export function classifyLibraryBundlePreviewError(error: unknown): {
  message: string
  code: LibraryBundlePreviewWorkerErrorCode
} {
  const message = error instanceof Error ? error.message : 'Could not preview this bundle.'
  return {
    message,
    code: message.includes('missing required bytes') ? 'local-asset-bytes-required' : 'preview-failed',
  }
}
