/// <reference lib="webworker" />

import {
  previewBundleZipImport,
  previewPreparedBundleDirectoryImport,
} from '@/lib/libraryBundle/importPreview'
import {
  classifyLibraryBundlePreviewError,
  type LibraryBundlePreviewWorkerRequest,
  type LibraryBundlePreviewWorkerResponse,
} from '@/lib/libraryBundle/previewWorkerProtocol'

function previewTransferables(preview: Awaited<ReturnType<typeof previewBundleZipImport>>): Transferable[] {
  const buffers = new Set<ArrayBuffer>()
  for (const model of [preview.localModel, preview.incomingModel]) {
    for (const asset of model.assets) {
      if (asset.bytes?.buffer instanceof ArrayBuffer) buffers.add(asset.bytes.buffer)
    }
  }
  return [...buffers]
}

export async function handleLibraryBundlePreviewRequest(
  request: LibraryBundlePreviewWorkerRequest,
): Promise<LibraryBundlePreviewWorkerResponse> {
  try {
    const preview = request.type === 'preview-library-bundle'
      ? await previewBundleZipImport(request.zipBytes, request.databaseBackup, {
        intent: request.intent,
        retainLocalAssetBytes: false,
      })
      : await previewPreparedBundleDirectoryImport(request.files, request.databaseBackup, {
        intent: request.intent,
        retainLocalAssetBytes: false,
      })
    return {
      type: 'preview-complete',
      preview,
    }
  } catch (error) {
    return { type: 'preview-failed', ...classifyLibraryBundlePreviewError(error) }
  }
}

const workerScope = self as DedicatedWorkerGlobalScope
workerScope.onmessage = async ({ data }: MessageEvent<LibraryBundlePreviewWorkerRequest>) => {
  if (data.type !== 'preview-library-bundle' && data.type !== 'preview-library-bundle-directory') return
  const response = await handleLibraryBundlePreviewRequest(data)
  workerScope.postMessage(
    response,
    response.type === 'preview-complete' ? previewTransferables(response.preview) : [],
  )
}
