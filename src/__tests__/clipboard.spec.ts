// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyToClipboard, copyToClipboardWithResult } from '@/utils/clipboard'

const { isNativePlatform, clipboardWrite, clipboardRead, isNativeMobileRuntime } = vi.hoisted(
  () => ({
    isNativePlatform: vi.fn<() => boolean>(),
    clipboardWrite: vi.fn(async () => {}),
    clipboardRead: vi.fn(async () => ({ value: '' })),
    isNativeMobileRuntime: vi.fn<() => boolean>(),
  }),
)

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))
vi.mock('@capacitor/clipboard', () => ({
  Clipboard: { write: clipboardWrite, read: clipboardRead },
}))
vi.mock('@/utils/platform', () => ({ isNativeMobileRuntime }))

beforeEach(() => {
  // resetAllMocks clears both calls AND implementations, so a mockRejectedValue
  // set in one test cannot leak into the next; re-establish the happy-path defaults.
  vi.resetAllMocks()
  isNativePlatform.mockReturnValue(false)
  isNativeMobileRuntime.mockReturnValue(false)
  clipboardWrite.mockResolvedValue(undefined)
  clipboardRead.mockResolvedValue({ value: '' })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  // execCommand is set via defineProperty (not stubGlobal); remove the instance
  // override so it cannot leak between tests.
  delete (document as unknown as { execCommand?: unknown }).execCommand
})

describe('copyToClipboardWithResult — native platform', () => {
  beforeEach(() => isNativePlatform.mockReturnValue(true))

  it('writes natively and reports verified when the read-back matches (mobile)', async () => {
    isNativeMobileRuntime.mockReturnValue(true)
    clipboardRead.mockResolvedValue({ value: 'hello' })

    const result = await copyToClipboardWithResult('hello')

    expect(clipboardWrite).toHaveBeenCalledWith({ string: 'hello' })
    expect(result).toEqual({ success: true, verified: true, likelyTruncated: false })
  })

  it('flags likelyTruncated when the read-back differs', async () => {
    isNativeMobileRuntime.mockReturnValue(true)
    clipboardRead.mockResolvedValue({ value: 'hel' })

    const result = await copyToClipboardWithResult('hello')
    expect(result).toEqual({ success: true, verified: true, likelyTruncated: true })
  })

  it('returns unverified success on non-mobile native (e.g. electron)', async () => {
    isNativeMobileRuntime.mockReturnValue(false)
    const result = await copyToClipboardWithResult('hello')
    expect(result).toEqual({ success: true, verified: false, likelyTruncated: false })
    expect(clipboardRead).not.toHaveBeenCalled()
  })

  it('returns unverified success when the mobile read-back throws', async () => {
    isNativeMobileRuntime.mockReturnValue(true)
    clipboardRead.mockRejectedValue(new Error('read failed'))

    const result = await copyToClipboardWithResult('hello')
    expect(result).toEqual({ success: true, verified: false, likelyTruncated: false })
  })

  it('falls through to the web path when native write throws', async () => {
    clipboardWrite.mockRejectedValue(new Error('native write failed'))
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('ClipboardItem', undefined)

    const result = await copyToClipboardWithResult('hello')
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(result.success).toBe(true)
  })
})

describe('copyToClipboardWithResult — web fallbacks', () => {
  it('uses the ClipboardItem API when available', async () => {
    const write = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal('ClipboardItem', class {
      constructor(public items: unknown) {}
    })

    const result = await copyToClipboardWithResult('hello')
    expect(write).toHaveBeenCalled()
    expect(result).toEqual({ success: true, verified: false, likelyTruncated: false })
  })

  it('falls back to writeText when ClipboardItem write fails', async () => {
    const write = vi.fn(async () => {
      throw new Error('no ClipboardItem')
    })
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { write, writeText } })
    vi.stubGlobal('ClipboardItem', class {
      constructor(public items: unknown) {}
    })

    const result = await copyToClipboardWithResult('hello')
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(result.success).toBe(true)
  })

  it('uses the execCommand fallback when no clipboard API works', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined, userAgent: 'test' })
    vi.stubGlobal('ClipboardItem', undefined)
    const execCommand = vi.fn(() => true)
    // jsdom does not implement execCommand; provide it.
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })

    const result = await copyToClipboardWithResult('hello')
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(result.success).toBe(true)
  })

  it('falls back to execCommand when writeText throws', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('writeText blocked')
    })
    vi.stubGlobal('navigator', { clipboard: { writeText }, userAgent: 'test' })
    vi.stubGlobal('ClipboardItem', undefined)
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })

    const result = await copyToClipboardWithResult('hello')
    expect(writeText).toHaveBeenCalled()
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(result.success).toBe(true)
  })

  it('returns failure when execCommand itself throws', async () => {
    vi.stubGlobal('navigator', { clipboard: undefined, userAgent: 'test' })
    vi.stubGlobal('ClipboardItem', undefined)
    const execCommand = vi.fn(() => {
      throw new Error('execCommand unavailable')
    })
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })

    const result = await copyToClipboardWithResult('hello')
    expect(result.success).toBe(false)
  })

  it('handles the iOS selection path and a failing execCommand', async () => {
    vi.stubGlobal('navigator', {
      clipboard: undefined,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    })
    vi.stubGlobal('ClipboardItem', undefined)
    const execCommand = vi.fn(() => false)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })

    const result = await copyToClipboardWithResult('hello')
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(result.success).toBe(false)
  })
})

describe('copyToClipboard', () => {
  it('returns the success boolean from the detailed result', async () => {
    isNativePlatform.mockReturnValue(true)
    expect(await copyToClipboard('hello')).toBe(true)
  })
})
