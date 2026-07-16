import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReadingFontSize } from '@/composables/useReadingFontSize'

const STORAGE_KEY = 'reading_font_size'

function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
}

let localStorageMock: ReturnType<typeof createLocalStorageMock>

beforeEach(() => {
  localStorageMock = createLocalStorageMock()
  vi.stubGlobal('localStorage', localStorageMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useReadingFontSize', () => {
  it('defaults to medium when nothing is stored', () => {
    const { fontSize } = useReadingFontSize()
    expect(fontSize.value).toBe('medium')
  })

  it('reads a valid stored size', () => {
    localStorageMock.setItem(STORAGE_KEY, 'large')
    const { fontSize } = useReadingFontSize()
    expect(fontSize.value).toBe('large')
  })

  it('falls back to medium for an invalid stored value', () => {
    localStorageMock.setItem(STORAGE_KEY, 'gigantic')
    const { fontSize } = useReadingFontSize()
    expect(fontSize.value).toBe('medium')
  })

  it('persists changes back to localStorage', async () => {
    const { fontSize } = useReadingFontSize()
    fontSize.value = 'small'
    await nextTick()
    expect(localStorageMock.getItem(STORAGE_KEY)).toBe('small')
  })
})
