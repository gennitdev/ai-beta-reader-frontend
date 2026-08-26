import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreviewedBundleImport } from '@/lib/libraryBundle/importPreview'
import type {
  LibraryBundlePreviewWorkerRequest,
  LibraryBundlePreviewWorkerResponse,
} from '@/lib/libraryBundle/previewWorkerProtocol'

const previewZip = vi.hoisted(() => vi.fn())
const previewDirectory = vi.hoisted(() => vi.fn())

vi.mock('@/lib/libraryBundle/importPreview', () => ({
  previewBundleZipImport: previewZip,
  previewPreparedBundleDirectoryImport: previewDirectory,
}))

const postMessage = vi.fn()
let handleLibraryBundlePreviewRequest: (
  request: LibraryBundlePreviewWorkerRequest,
) => Promise<LibraryBundlePreviewWorkerResponse>
let workerScope: {
  onmessage?: (event: MessageEvent<LibraryBundlePreviewWorkerRequest>) => Promise<void>
  postMessage: typeof postMessage
}

const preview = {
  databaseGeneration: 'generation',
  localModel: { assets: [] },
  incomingModel: { assets: [] },
} as unknown as PreviewedBundleImport

describe('libraryBundlePreview worker', () => {
  beforeAll(async () => {
    workerScope = { postMessage }
    vi.stubGlobal('self', workerScope)
    ;({ handleLibraryBundlePreviewRequest } = await import('./libraryBundlePreview.worker'))
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('dispatches ZIP previews with memory-saving worker options', async () => {
    const zipBytes = new Uint8Array([1, 2])
    const databaseBackup = new Uint8Array([3, 4])
    previewZip.mockResolvedValue(preview)

    await expect(handleLibraryBundlePreviewRequest({
      type: 'preview-library-bundle', zipBytes, databaseBackup, intent: 'add-or-update-books',
    })).resolves.toEqual({ type: 'preview-complete', preview })
    expect(previewZip).toHaveBeenCalledWith(zipBytes, databaseBackup, {
      intent: 'add-or-update-books', retainLocalAssetBytes: false,
    })
  })

  it('dispatches prepared folder files without reading them on the main thread', async () => {
    const file = {} as File
    const files = [{ path: 'beta-bot.yaml', file }]
    const databaseBackup = new Uint8Array([3, 4])
    previewDirectory.mockResolvedValue(preview)

    await expect(handleLibraryBundlePreviewRequest({
      type: 'preview-library-bundle-directory', files, databaseBackup, intent: 'add-or-update-books',
    })).resolves.toEqual({ type: 'preview-complete', preview })
    expect(previewDirectory).toHaveBeenCalledWith(files, databaseBackup, {
      intent: 'add-or-update-books', retainLocalAssetBytes: false,
    })
  })

  it('returns classified failures instead of losing worker errors', async () => {
    previewZip.mockRejectedValue(new Error('Image legacy is missing required bytes.'))

    await expect(handleLibraryBundlePreviewRequest({
      type: 'preview-library-bundle',
      zipBytes: new Uint8Array(),
      databaseBackup: new Uint8Array(),
    })).resolves.toEqual({
      type: 'preview-failed',
      message: 'Image legacy is missing required bytes.',
      code: 'local-asset-bytes-required',
    })
  })

  it('posts each result buffer once and ignores unrelated messages', async () => {
    const shared = new Uint8Array([1, 2, 3])
    const incomingOnly = new Uint8Array([4, 5])
    previewZip.mockResolvedValue({
      ...preview,
      localModel: { assets: [{ bytes: shared }] },
      incomingModel: { assets: [{ bytes: shared }, { bytes: incomingOnly }, { bytes: null }] },
    })
    const request: LibraryBundlePreviewWorkerRequest = {
      type: 'preview-library-bundle',
      zipBytes: new Uint8Array(),
      databaseBackup: new Uint8Array(),
    }

    await workerScope.onmessage?.({ data: request } as MessageEvent<LibraryBundlePreviewWorkerRequest>)

    expect(postMessage).toHaveBeenCalledOnce()
    expect(postMessage.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ type: 'preview-complete' }))
    expect(postMessage.mock.calls[0]?.[1]).toEqual([shared.buffer, incomingOnly.buffer])

    await workerScope.onmessage?.({ data: { type: 'unrelated' } } as unknown as MessageEvent<LibraryBundlePreviewWorkerRequest>)
    expect(postMessage).toHaveBeenCalledOnce()
  })
})
