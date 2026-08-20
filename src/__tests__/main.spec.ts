// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ native: false }))
const initialTheme = vi.hoisted(() => vi.fn(() => 'light' as 'light' | 'dark'))
const theme = vi.hoisted(() => ({ value: 'light' as 'light' | 'dark' }))
const createApp = vi.hoisted(() => vi.fn())
const watch = vi.hoisted(() => vi.fn())
const use = vi.hoisted(() => vi.fn())
const mount = vi.hoisted(() => vi.fn())
const setBackgroundColor = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const setStyle = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const setOverlaysWebView = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const router = vi.hoisted(() => ({ install: vi.fn() }))

vi.mock('vue', () => ({ createApp, watch }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => runtime.native },
}))
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setBackgroundColor, setStyle, setOverlaysWebView },
  Style: { Light: 'LIGHT', Dark: 'DARK' },
}))
vi.mock('@/composables/useTheme', () => ({
  initializeTheme: initialTheme,
  useTheme: () => ({ theme }),
}))
vi.mock('@/App.vue', () => ({ default: { name: 'AppStub' } }))
vi.mock('@/router', () => ({ default: router }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  runtime.native = false
  theme.value = 'light'
  initialTheme.mockReturnValue('light')
  createApp.mockReturnValue({ use, mount })
})

describe('application startup', () => {
  it('initializes the theme and mounts the app with the router on the web', async () => {
    await import('@/main')

    expect(initialTheme).toHaveBeenCalledOnce()
    expect(createApp).toHaveBeenCalledWith({ name: 'AppStub' })
    expect(use).toHaveBeenCalledWith(router)
    expect(mount).toHaveBeenCalledWith('#app')
    expect(watch).toHaveBeenCalledWith(theme, expect.any(Function))
    expect(setOverlaysWebView).not.toHaveBeenCalled()
    expect(setBackgroundColor).not.toHaveBeenCalled()

    const syncTheme = watch.mock.calls[0][1] as (value: 'light' | 'dark') => void
    syncTheme('dark')
    expect(setBackgroundColor).not.toHaveBeenCalled()
  })

  it('configures the native status bar and follows later theme changes', async () => {
    runtime.native = true
    initialTheme.mockReturnValue('dark')

    await import('@/main')

    expect(setOverlaysWebView).toHaveBeenCalledWith({ overlay: false })
    expect(setBackgroundColor).toHaveBeenCalledWith({ color: '#00132f' })
    expect(setStyle).toHaveBeenCalledWith({ style: 'LIGHT' })

    const syncTheme = watch.mock.calls[0][1] as (value: 'light' | 'dark') => void
    syncTheme('light')

    expect(setBackgroundColor).toHaveBeenLastCalledWith({ color: '#f9fafb' })
    expect(setStyle).toHaveBeenLastCalledWith({ style: 'DARK' })
  })

  it('keeps mounting when native status-bar operations are unsupported', async () => {
    runtime.native = true
    setOverlaysWebView.mockRejectedValueOnce(new Error('overlay unsupported'))
    setBackgroundColor.mockRejectedValueOnce(new Error('background unsupported'))
    setStyle.mockRejectedValueOnce(new Error('style unsupported'))

    await expect(import('@/main')).resolves.toBeDefined()
    await Promise.resolve()

    expect(mount).toHaveBeenCalledWith('#app')
  })
})
