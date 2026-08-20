import { EventEmitter } from 'node:events'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createCapacitorContextApi,
  type RendererIpc,
} from '../src/rt/capacitor-context-api'

class ExamplePlugin extends EventEmitter {
  get metadata() {
    return 'not callable'
  }

  async read(value: string) {
    return value
  }
}

class SecondaryPlugin {
  async ping() {
    return 'pong'
  }
}

const createIpc = () => ({
  invoke: vi.fn(async () => undefined),
  send: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
})

describe('Capacitor renderer context API', () => {
  let ipc: ReturnType<typeof createIpc>
  let nextId: number

  beforeEach(() => {
    ipc = createIpc()
    nextId = 0
  })

  const createApi = () => createCapacitorContextApi(
    {
      example: { default: { ExamplePlugin, version: '1.0.0' } },
      secondary: { SecondaryPlugin, manifestVersion: 1 },
    },
    ipc as RendererIpc,
    () => `listener-${++nextId}`
  )

  it('exposes plugin methods through namespaced IPC without exposing accessors', async () => {
    const api = createApi()

    await api.ExamplePlugin.read('chapter-1')
    await api.SecondaryPlugin.ping()

    expect(ipc.invoke).toHaveBeenCalledWith('ExamplePlugin-read', 'chapter-1')
    expect(ipc.invoke).toHaveBeenCalledWith('SecondaryPlugin-ping')
    expect(api.ExamplePlugin).not.toHaveProperty('metadata')
    expect(api).not.toHaveProperty('version')
    expect(api).not.toHaveProperty('manifestVersion')
  })

  it('deduplicates upstream event subscriptions and forwards renderer events', () => {
    const api = createApi()
    const firstCallback = vi.fn()
    const secondCallback = vi.fn()

    const firstId = api.ExamplePlugin.addListener('changed', firstCallback)
    const secondId = api.ExamplePlugin.addListener('changed', secondCallback)
    const firstHandler = ipc.addListener.mock.calls[0][1]
    firstHandler({}, { chapterId: 'chapter-1' })

    expect(firstId).toBe('listener-1')
    expect(secondId).toBe('listener-2')
    expect(ipc.send).toHaveBeenCalledTimes(1)
    expect(ipc.send).toHaveBeenCalledWith('event-add-ExamplePlugin', 'changed')
    expect(firstCallback).toHaveBeenCalledWith({ chapterId: 'chapter-1' })
  })

  it('removes the upstream subscription only after its final listener', () => {
    const api = createApi()
    const firstId = api.ExamplePlugin.addListener('changed', vi.fn())
    const secondId = api.ExamplePlugin.addListener('changed', vi.fn())

    api.ExamplePlugin.removeListener(firstId)
    expect(ipc.send).not.toHaveBeenCalledWith('event-remove-ExamplePlugin-changed')

    api.ExamplePlugin.removeListener(secondId)
    expect(ipc.removeListener).toHaveBeenCalledTimes(2)
    expect(ipc.send).toHaveBeenCalledWith('event-remove-ExamplePlugin-changed')
  })

  it('rejects unknown listener IDs', () => {
    const api = createApi()

    expect(() => api.ExamplePlugin.removeListener('missing')).toThrow('Invalid id')
  })

  it('removes matching listener groups without duplicate upstream messages', () => {
    const api = createApi()
    api.ExamplePlugin.addListener('changed', vi.fn())
    api.ExamplePlugin.addListener('changed', vi.fn())
    api.ExamplePlugin.addListener('saved', vi.fn())

    api.ExamplePlugin.removeAllListeners('changed')

    expect(ipc.removeListener).toHaveBeenCalledTimes(2)
    expect(ipc.send).toHaveBeenCalledTimes(3)
    expect(ipc.send).toHaveBeenLastCalledWith('event-remove-ExamplePlugin-changed')

    api.ExamplePlugin.removeAllListeners()
    expect(ipc.send).toHaveBeenLastCalledWith('event-remove-ExamplePlugin-saved')
  })
})
