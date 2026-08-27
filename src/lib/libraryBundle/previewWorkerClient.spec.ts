import { describe, expect, it, vi } from 'vitest'
import type { PreviewedBundleImport } from './importPreview'
import {
  LibraryBundlePreviewWorkerError,
  LibraryBundlePreviewWorkerUnavailableError,
  previewBundleZipInWorker,
  previewBundleDirectoryInWorker,
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
  it('does not start a worker when the request was already cancelled', async () => {
    const controller = new AbortController()
    const workerFactory = vi.fn(() => new FakePreviewWorker())
    controller.abort()

    await expect(previewBundleZipInWorker(new Uint8Array([1]), new Uint8Array([2]), {
      signal: controller.signal,
      workerFactory,
    })).rejects.toEqual(expect.objectContaining({ name: 'AbortError' }))
    expect(workerFactory).not.toHaveBeenCalled()
  })

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

  it('forwards progress events without settling or terminating the worker', async () => {
    const worker = new FakePreviewWorker()
    const onProgress = vi.fn()
    const pending = previewBundleZipInWorker(new Uint8Array([1]), new Uint8Array([2]), {
      workerFactory: () => worker,
      onProgress,
    })

    worker.onmessage?.({
      data: { type: 'preview-progress', stage: 'validating' },
    } as MessageEvent<LibraryBundlePreviewWorkerResponse>)
    expect(onProgress).toHaveBeenCalledWith('validating')
    expect(worker.terminate).not.toHaveBeenCalled()

    worker.onmessage?.({ data: { type: 'preview-complete', preview } } as MessageEvent<LibraryBundlePreviewWorkerResponse>)
    await expect(pending).resolves.toBe(preview)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('sends normalized folder paths to the worker without materializing file bytes', async () => {
    const worker = new FakePreviewWorker()
    const manifest = new File(['manifest'], 'beta-bot.yaml')
    const gitObject = new File(['large'], 'one')
    Object.defineProperty(manifest, 'webkitRelativePath', { value: 'chosen/beta-bot.yaml' })
    Object.defineProperty(gitObject, 'webkitRelativePath', { value: 'chosen/.git/objects/one' })
    const databaseBackup = new Uint8Array([4, 5])
    const pending = previewBundleDirectoryInWorker([manifest, gitObject], databaseBackup, {
      intent: 'add-or-update-books',
      workerFactory: () => worker,
    })

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'preview-library-bundle-directory',
      files: [{ path: 'beta-bot.yaml', file: manifest }],
      databaseBackup,
      intent: 'add-or-update-books',
    }, [databaseBackup.buffer])
    worker.onmessage?.({ data: { type: 'preview-complete', preview } } as MessageEvent<LibraryBundlePreviewWorkerResponse>)

    await expect(pending).resolves.toBe(preview)
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

  it('distinguishes asynchronous worker failures so callers can fall back', async () => {
    const worker = new FakePreviewWorker()
    const pending = previewBundleZipInWorker(new Uint8Array([1]), new Uint8Array([2]), {
      workerFactory: () => worker,
    })
    worker.onerror?.({ message: 'worker crashed', preventDefault: vi.fn() } as unknown as ErrorEvent)

    await expect(pending).rejects.toEqual(expect.objectContaining({
      name: 'LibraryBundlePreviewWorkerUnavailableError', message: 'worker crashed',
    }))
  })

  it('terminates and reports message-transfer failures', async () => {
    const worker = new FakePreviewWorker()
    worker.postMessage.mockImplementation(() => { throw new Error('clone failed') })

    await expect(previewBundleZipInWorker(new Uint8Array([1]), new Uint8Array([2]), {
      workerFactory: () => worker,
    })).rejects.toEqual(expect.objectContaining({ message: 'clone failed' }))
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('ignores late worker events after the first response settles the request', async () => {
    const worker = new FakePreviewWorker()
    const pending = previewBundleZipInWorker(new Uint8Array([1]), new Uint8Array([2]), {
      workerFactory: () => worker,
    })

    worker.onmessage?.({ data: { type: 'preview-complete', preview } } as MessageEvent<LibraryBundlePreviewWorkerResponse>)
    worker.onerror?.({ message: 'late crash', preventDefault: vi.fn() } as unknown as ErrorEvent)

    await expect(pending).resolves.toBe(preview)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
