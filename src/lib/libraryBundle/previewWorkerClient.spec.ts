import { describe, expect, it, vi } from 'vitest'
import type { PreviewedBundleImport } from './importPreview'
import {
  LibraryBundlePreviewWorkerError,
  LibraryBundlePreviewWorkerUnavailableError,
  previewBundleZipInWorker,
} from './previewWorkerClient'
import type {
  LibraryBundlePreviewWorkerRequest,
  LibraryBundlePreviewWorkerResponse,
} from './previewWorkerProtocol'

class FakePreviewWorker {
  onmessage: ((event: MessageEvent<LibraryBundlePreviewWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage = vi.fn<(message: LibraryBundlePreviewWorkerRequest, transfer: Transferable[]) => void>()
  terminate = vi.fn()
}

const preview = { databaseGeneration: 'generation' } as PreviewedBundleImport

describe('previewBundleZipInWorker', () => {
  it('transfers large inputs and resolves the worker preview without copying them', async () => {
    const worker = new FakePreviewWorker()
    const zipBytes = new Uint8Array([1, 2, 3])
    const databaseBackup = new Uint8Array([4, 5])
    const pending = previewBundleZipInWorker(zipBytes, databaseBackup, {
      intent: 'add-or-update-books',
      workerFactory: () => worker,
    })

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ zipBytes, databaseBackup, intent: 'add-or-update-books' }),
      [zipBytes.buffer, databaseBackup.buffer],
    )
    worker.onmessage?.({ data: { type: 'preview-complete', preview } } as MessageEvent<LibraryBundlePreviewWorkerResponse>)

    await expect(pending).resolves.toBe(preview)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('preserves preview failures reported by the worker', async () => {
    const worker = new FakePreviewWorker()
    const pending = previewBundleZipInWorker(new Uint8Array([1]), new Uint8Array([2]), {
      workerFactory: () => worker,
    })
    worker.onmessage?.({
      data: { type: 'preview-failed', message: 'Image legacy missing required bytes.', code: 'local-asset-bytes-required' },
    } as MessageEvent<LibraryBundlePreviewWorkerResponse>)

    await expect(pending).rejects.toEqual(expect.objectContaining<Partial<LibraryBundlePreviewWorkerError>>({
      message: 'Image legacy missing required bytes.',
      code: 'local-asset-bytes-required',
    }))
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('terminates an in-flight worker when the preview is cancelled', async () => {
    const worker = new FakePreviewWorker()
    const controller = new AbortController()
    const pending = previewBundleZipInWorker(new Uint8Array([1]), new Uint8Array([2]), {
      signal: controller.signal,
      workerFactory: () => worker,
    })

    controller.abort()

    await expect(pending).rejects.toEqual(expect.objectContaining({ name: 'AbortError' }))
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('distinguishes worker startup failures so callers can fall back', async () => {
    await expect(previewBundleZipInWorker(new Uint8Array([1]), new Uint8Array([2]), {
      workerFactory: () => { throw new Error('worker blocked') },
    })).rejects.toBeInstanceOf(LibraryBundlePreviewWorkerUnavailableError)
  })
})
