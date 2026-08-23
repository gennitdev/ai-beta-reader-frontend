// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  emitIpcRenderer,
  getExposedApi,
  ipcRenderer,
} from './mocks/electron'

vi.mock('../src/rt/electron-rt', () => ({}))

type InvokeApi = Record<string, (...args: never[]) => Promise<unknown> | void>

describe('Electron preload bridge', () => {
  beforeAll(async () => {
    await import('../src/preload')
    expect(ipcRenderer.send).toHaveBeenCalledWith('setup-find-result-listener')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    ipcRenderer.invoke.mockResolvedValue(undefined)
  })

  it.each([
    ['desktopImages', 'pickChapterImages', 'desktop-images:pick-chapter', [{ bookId: 'book', chapterId: 'chapter', allowMultiple: true }]],
    ['desktopImages', 'pickBookCover', 'desktop-images:pick-cover', [{ bookId: 'book' }]],
    ['desktopImages', 'readImageData', 'desktop-images:read', [{ relativePath: 'images/a.png', mimeType: 'image/png' }]],
    ['desktopImages', 'writeImageData', 'desktop-images:write', [{ relativePath: 'images/a.png', bytes: new Uint8Array([0]), mimeType: 'image/png' }]],
    ['desktopImages', 'deleteImageFile', 'desktop-images:delete', [{ relativePath: 'images/a.png' }]],
    ['electronOAuth', 'authenticate', 'oauth-loopback:authenticate', [{ clientId: 'client', scope: 'openid' }]],
    ['electronSecureStorage', 'get', 'secure-storage:get', ['token']],
    ['electronSecureStorage', 'set', 'secure-storage:set', ['token', 'secret']],
    ['electronSecureStorage', 'remove', 'secure-storage:remove', ['token']],
    ['desktopRecovery', 'write', 'desktop-recovery:write', [{ metadata: { id: 'recovery-1' }, bytes: new Uint8Array([1]) }]],
    ['desktopRecovery', 'read', 'desktop-recovery:read', ['recovery-1']],
    ['desktopRecovery', 'list', 'desktop-recovery:list', []],
    ['desktopRecovery', 'delete', 'desktop-recovery:delete', ['recovery-1']],
  ])('exposes %s.%s through the expected IPC channel', async (apiName, method, channel, args) => {
    const api = getExposedApi<InvokeApi>(apiName)

    await api[method](...(args as never[]))

    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channel, ...args)
  })

  it('exposes find controls and initializes its result listener', () => {
    const find = getExposedApi<(text: string, forward: boolean, findNext?: boolean) => void>('electronFindInPage')
    const stopFind = getExposedApi<() => void>('electronStopFind')

    find('needle', false)
    stopFind()

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('find-in-page', 'needle', false, false)
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('stop-find-in-page')
  })

  it('forwards find results as DOM events', () => {
    const listener = vi.fn()
    window.addEventListener('electron-find-result', listener)
    const result = { activeMatchOrdinal: 2, matches: 5 }

    emitIpcRenderer('find-in-page-result', {}, result)

    expect(listener).toHaveBeenCalledOnce()
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual(result)
  })
})
