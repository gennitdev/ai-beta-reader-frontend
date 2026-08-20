import { describe, expect, it, vi } from 'vitest'

import { installWindowNavigationPolicy, isAllowedAppUrl } from '../src/window-security'

describe('Electron window navigation policy', () => {
  it('only accepts URLs whose protocol exactly matches the application scheme', () => {
    expect(isAllowedAppUrl('capacitor-electron://localhost/books/1', 'capacitor-electron')).toBe(true)
    expect(isAllowedAppUrl('CAPACITOR-ELECTRON://localhost/books/1', 'capacitor-electron')).toBe(true)

    expect(isAllowedAppUrl('https://example.com/?next=capacitor-electron://localhost', 'capacitor-electron')).toBe(false)
    expect(isAllowedAppUrl('capacitor-electron.example://localhost', 'capacitor-electron')).toBe(false)
    expect(isAllowedAppUrl('not a URL', 'capacitor-electron')).toBe(false)
  })

  it('blocks external popups and permits application popups', () => {
    let openHandler: ((details: { url: string }) => { action: string }) | undefined
    const webContents = {
      setWindowOpenHandler: vi.fn((handler) => {
        openHandler = handler
      }),
      on: vi.fn(),
    }

    installWindowNavigationPolicy(webContents as never, 'beta-reader')

    expect(openHandler?.({ url: 'beta-reader://localhost/settings' })).toEqual({ action: 'allow' })
    expect(openHandler?.({ url: 'https://malicious.example/beta-reader://localhost' })).toEqual({ action: 'deny' })
  })

  it('validates the requested navigation destination', () => {
    let navigationHandler: ((event: { preventDefault: () => void }, url: string) => void) | undefined
    const webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn((event, handler) => {
        if (event === 'will-navigate') navigationHandler = handler
      }),
    }
    const externalEvent = { preventDefault: vi.fn() }
    const internalEvent = { preventDefault: vi.fn() }

    installWindowNavigationPolicy(webContents as never, 'beta-reader')
    navigationHandler?.(externalEvent, 'https://malicious.example/')
    navigationHandler?.(internalEvent, 'beta-reader://localhost/chapters')

    expect(externalEvent.preventDefault).toHaveBeenCalledOnce()
    expect(internalEvent.preventDefault).not.toHaveBeenCalled()
  })
})
