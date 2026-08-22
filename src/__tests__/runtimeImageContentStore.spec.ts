// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ name: 'web', native: false }))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => platform.name,
    isNativePlatform: () => platform.native,
  },
}))

import {
  CapacitorImageContentStore,
  ElectronImageContentStore,
  IndexedDbImageContentStore,
} from '@/lib/imageContentStore'
import {
  createRuntimeImageContentStore,
  getImageStorageRuntime,
} from '@/lib/runtimeImageContentStore'

beforeEach(() => {
  platform.name = 'web'
  platform.native = false
  delete window.desktopImages
})

describe('runtime image content store', () => {
  it('creates IndexedDB storage for the browser runtime', () => {
    expect(getImageStorageRuntime()).toBe('browser')
    expect(createRuntimeImageContentStore()).toBeInstanceOf(IndexedDbImageContentStore)
  })

  it('creates app-private filesystem storage for Android', () => {
    platform.name = 'android'
    platform.native = true

    expect(getImageStorageRuntime()).toBe('android')
    expect(createRuntimeImageContentStore()).toBeInstanceOf(CapacitorImageContentStore)
  })

  it('leaves unsupported native platforms disabled', () => {
    platform.name = 'ios'
    platform.native = true

    expect(getImageStorageRuntime()).toBe('unsupported')
    expect(createRuntimeImageContentStore()).toBeNull()
  })

  it('requires the Electron preload bridge before creating its store', () => {
    platform.name = 'electron'
    expect(getImageStorageRuntime()).toBe('electron')
    expect(createRuntimeImageContentStore()).toBeNull()

    window.desktopImages = {} as typeof window.desktopImages
    expect(createRuntimeImageContentStore()).toBeInstanceOf(ElectronImageContentStore)
  })

  it('prefers an injected desktop bridge over a misleading platform value', () => {
    platform.name = 'android'
    platform.native = true
    window.desktopImages = {} as typeof window.desktopImages

    expect(getImageStorageRuntime()).toBe('electron')
    expect(createRuntimeImageContentStore()).toBeInstanceOf(ElectronImageContentStore)
  })
})
