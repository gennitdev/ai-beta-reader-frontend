import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { getExposedApi, ipcRenderer } from './mocks/electron'

vi.mock('../src/rt/electron-plugins.js', async () => {
  const { EventEmitter } = await import('node:events')

  class TestPlugin extends EventEmitter {
    async echo(value: string) {
      return value
    }
  }

  return {
    default: {
      test: { default: { TestPlugin } },
    },
  }
})

type CapacitorPlatform = {
  name: string
  plugins: Record<string, Record<string, (...args: never[]) => unknown>>
}

describe('Electron Capacitor runtime', () => {
  beforeAll(async () => {
    await import('../src/rt/electron-rt')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    ipcRenderer.invoke.mockResolvedValue(undefined)
  })

  it('exposes the generated plugins as the Electron custom platform', async () => {
    const platform = getExposedApi<CapacitorPlatform>('CapacitorCustomPlatform')

    await platform.plugins.TestPlugin.echo('hello')

    expect(platform.name).toBe('electron')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('TestPlugin-echo', 'hello')
  })

  it('uses unpredictable fixed-length IDs for runtime event listeners', () => {
    const platform = getExposedApi<CapacitorPlatform>('CapacitorCustomPlatform')

    const listenerId = platform.plugins.TestPlugin.addListener('changed', vi.fn())

    expect(listenerId).toMatch(/^[a-f0-9]{10}$/)
    expect(ipcRenderer.send).toHaveBeenCalledWith('event-add-TestPlugin', 'changed')
  })
})
