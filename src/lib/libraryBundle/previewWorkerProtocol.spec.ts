import { describe, expect, it } from 'vitest'
import { classifyLibraryBundlePreviewError } from './previewWorkerProtocol'

describe('classifyLibraryBundlePreviewError', () => {
  it('identifies legacy snapshots that require a main-thread asset reader', () => {
    expect(classifyLibraryBundlePreviewError(new Error('Image image-1 is missing required bytes.'))).toEqual({
      message: 'Image image-1 is missing required bytes.',
      code: 'local-asset-bytes-required',
    })
  })

  it('keeps ordinary validation failures in the worker', () => {
    expect(classifyLibraryBundlePreviewError(new Error('Bundle manifest is invalid.'))).toEqual({
      message: 'Bundle manifest is invalid.',
      code: 'preview-failed',
    })
  })
})
