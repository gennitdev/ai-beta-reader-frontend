import { ref, watch, type Ref } from 'vue'

export type ReadingFontSize = 'small' | 'medium' | 'large'
export type ReadingFontFamily =
  | 'system'
  | 'atkinson'
  | 'serif'
  | 'literata'
  | 'source-serif'
  | 'lora'
  | 'opendyslexic'

const SIZE_STORAGE_KEY = 'reading_font_size'
const FAMILY_STORAGE_KEY = 'reading_font_family'
const VALID_SIZES: ReadingFontSize[] = ['small', 'medium', 'large']
const VALID_FAMILIES: ReadingFontFamily[] = [
  'system',
  'atkinson',
  'serif',
  'literata',
  'source-serif',
  'lora',
  'opendyslexic',
]

function readStoredSize(): ReadingFontSize {
  if (typeof localStorage === 'undefined') return 'medium'
  const stored = localStorage.getItem(SIZE_STORAGE_KEY)
  return stored && VALID_SIZES.includes(stored as ReadingFontSize)
    ? (stored as ReadingFontSize)
    : 'medium'
}

function readStoredFamily(): ReadingFontFamily {
  if (typeof localStorage === 'undefined') return 'system'
  const stored = localStorage.getItem(FAMILY_STORAGE_KEY)
  return stored && VALID_FAMILIES.includes(stored as ReadingFontFamily)
    ? (stored as ReadingFontFamily)
    : 'system'
}

/**
 * Reading typography preferences for long-form markdown (chapter + wiki pages).
 * Persisted to localStorage so the choices follow the reader across pages.
 */
export function useReadingFontSize(): {
  fontSize: Ref<ReadingFontSize>
  fontFamily: Ref<ReadingFontFamily>
} {
  const fontSize = ref<ReadingFontSize>(readStoredSize())
  const fontFamily = ref<ReadingFontFamily>(readStoredFamily())

  watch(fontSize, (value) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SIZE_STORAGE_KEY, value)
    }
  })

  watch(fontFamily, (value) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FAMILY_STORAGE_KEY, value)
    }
  })

  return { fontSize, fontFamily }
}
