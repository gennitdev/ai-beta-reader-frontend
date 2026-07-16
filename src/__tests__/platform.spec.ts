import { afterEach, describe, expect, it, vi } from 'vitest'
import { isNativeMobileRuntime, isDesktopAppRuntime } from '@/utils/platform'

const { getPlatform } = vi.hoisted(() => ({ getPlatform: vi.fn<() => string>() }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  getPlatform.mockReset()
})

describe('isNativeMobileRuntime', () => {
  it('is true on ios and android', () => {
    getPlatform.mockReturnValue('ios')
    expect(isNativeMobileRuntime()).toBe(true)
    getPlatform.mockReturnValue('android')
    expect(isNativeMobileRuntime()).toBe(true)
  })

  it('is false on web', () => {
    getPlatform.mockReturnValue('web')
    expect(isNativeMobileRuntime()).toBe(false)
  })

  it('is false when Capacitor throws', () => {
    getPlatform.mockImplementation(() => {
      throw new Error('not available')
    })
    expect(isNativeMobileRuntime()).toBe(false)
  })
})

describe('isDesktopAppRuntime', () => {
  it('is false when window is undefined', () => {
    getPlatform.mockReturnValue('web')
    expect(isDesktopAppRuntime()).toBe(false)
  })

  it('is true when window.desktopImages is present', () => {
    vi.stubGlobal('window', { desktopImages: {} })
    expect(isDesktopAppRuntime()).toBe(true)
  })

  it('is true on the electron platform', () => {
    vi.stubGlobal('window', {})
    getPlatform.mockReturnValue('electron')
    expect(isDesktopAppRuntime()).toBe(true)
  })

  it('is false on a plain web window', () => {
    vi.stubGlobal('window', {})
    getPlatform.mockReturnValue('web')
    expect(isDesktopAppRuntime()).toBe(false)
  })

  it('is false when Capacitor throws with a window present', () => {
    vi.stubGlobal('window', {})
    getPlatform.mockImplementation(() => {
      throw new Error('not available')
    })
    expect(isDesktopAppRuntime()).toBe(false)
  })
})
