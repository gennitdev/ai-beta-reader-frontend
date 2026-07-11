import { ref, watch, type Ref } from 'vue'

export type ReadingFontSize = 'small' | 'medium' | 'large'

const STORAGE_KEY = 'reading_font_size'
const VALID_SIZES: ReadingFontSize[] = ['small', 'medium', 'large']

function readStoredSize(): ReadingFontSize {
  if (typeof localStorage === 'undefined') return 'medium'
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored && VALID_SIZES.includes(stored as ReadingFontSize)
    ? (stored as ReadingFontSize)
    : 'medium'
}

/**
 * Reading font-size preference for long-form markdown (chapter + wiki pages).
 * Persisted to localStorage under a shared key so the choice follows the reader
 * across pages.
 */
export function useReadingFontSize(): { fontSize: Ref<ReadingFontSize> } {
  const fontSize = ref<ReadingFontSize>(readStoredSize())

  watch(fontSize, (value) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value)
    }
  })

  return { fontSize }
}
