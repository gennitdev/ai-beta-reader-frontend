import type { PreviewedBundleImport } from './importPreview'
import type { LibraryImportIntent } from './plan'
import type {
  LibraryBundlePreviewWorkerErrorCode,
  LibraryBundlePreviewWorkerRequest,
  LibraryBundlePreviewWorkerResponse,
} from './previewWorkerProtocol'

interface PreviewWorkerLike {
  onmessage: ((event: MessageEvent<LibraryBundlePreviewWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage: (message: LibraryBundlePreviewWorkerRequest, transfer: Transferable[]) => void
  terminate: () => void
}

export interface PreviewBundleInWorkerOptions {
  intent?: LibraryImportIntent
  signal?: AbortSignal
  workerFactory?: () => PreviewWorkerLike
}

export class LibraryBundlePreviewWorkerUnavailableError extends Error {
  constructor(message = 'Background bundle preview is unavailable.') {
    super(message)
    this.name = 'LibraryBundlePreviewWorkerUnavailableError'
  }
}

export class LibraryBundlePreviewWorkerError extends Error {
  constructor(
    message: string,
    readonly code: LibraryBundlePreviewWorkerErrorCode,
  ) {
    super(message)
    this.name = 'LibraryBundlePreviewWorkerError'
  }
}

function createPreviewWorker(): PreviewWorkerLike {
  if (typeof Worker === 'undefined') throw new LibraryBundlePreviewWorkerUnavailableError()
  return new Worker(
    new URL('../../workers/libraryBundlePreview.worker.ts', import.meta.url),
    { type: 'module', name: 'library-bundle-preview' },
  )
}

function abortError(): Error {
  return new DOMException('Bundle preview was cancelled.', 'AbortError')
}

export function previewBundleZipInWorker(
  zipBytes: Uint8Array,
  databaseBackup: Uint8Array,
  options: PreviewBundleInWorkerOptions = {},
): Promise<PreviewedBundleImport> {
  if (options.signal?.aborted) return Promise.reject(abortError())

  let worker: PreviewWorkerLike
  try {
    worker = (options.workerFactory ?? createPreviewWorker)()
  } catch (error) {
    return Promise.reject(error instanceof LibraryBundlePreviewWorkerUnavailableError
      ? error
      : new LibraryBundlePreviewWorkerUnavailableError(error instanceof Error ? error.message : undefined))
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', handleAbort)
      worker.terminate()
      callback()
    }
    const handleAbort = () => finish(() => reject(abortError()))

    worker.onmessage = ({ data }) => {
      if (data.type === 'preview-complete') {
        finish(() => resolve(data.preview))
      } else {
        finish(() => reject(new LibraryBundlePreviewWorkerError(data.message, data.code)))
      }
    }
    worker.onerror = (event) => {
      event.preventDefault?.()
      finish(() => reject(new LibraryBundlePreviewWorkerUnavailableError(event.message)))
    }
    options.signal?.addEventListener('abort', handleAbort, { once: true })

    try {
      worker.postMessage({
        type: 'preview-library-bundle',
        zipBytes,
        databaseBackup,
        intent: options.intent,
      }, [zipBytes.buffer, databaseBackup.buffer])
    } catch (error) {
      finish(() => reject(new LibraryBundlePreviewWorkerUnavailableError(
        error instanceof Error ? error.message : undefined,
      )))
    }
  })
}
