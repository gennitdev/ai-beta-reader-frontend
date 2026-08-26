/// <reference lib="webworker" />

import { previewBundleZipImport } from '@/lib/libraryBundle/importPreview'
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
    return {
      type: 'preview-complete',
      preview: await previewBundleZipImport(request.zipBytes, request.databaseBackup, {
        intent: request.intent,
        retainLocalAssetBytes: false,
      }),
    }
  } catch (error) {
    return { type: 'preview-failed', ...classifyLibraryBundlePreviewError(error) }
  }
}

const workerScope = self as DedicatedWorkerGlobalScope
workerScope.onmessage = async ({ data }: MessageEvent<LibraryBundlePreviewWorkerRequest>) => {
  if (data.type !== 'preview-library-bundle') return
  const response = await handleLibraryBundlePreviewRequest(data)
  workerScope.postMessage(
    response,
    response.type === 'preview-complete' ? previewTransferables(response.preview) : [],
  )
}
