import { describe, expect, it } from 'vitest'
import {
  MAX_BROWSER_IMAGE_BYTES,
  validateBrowserImage,
  validateBrowserImageContents,
} from '@/composables/useImageLibrary'

function imageFile(
  name: string,
  options: { size?: number; type?: string } = {},
): File {
  const size = options.size ?? 3
  return new File([new Uint8Array(size)], name, {
    type: options.type ?? 'image/png',
  })
}

describe('validateBrowserImage', () => {
  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])(
    'accepts supported %s files',
    (type) => {
      expect(() => validateBrowserImage(imageFile('image', { type }))).not.toThrow()
    },
  )

  it('rejects empty files', () => {
    expect(() => validateBrowserImage(imageFile('empty.png', { size: 0 })))
      .toThrow('empty and cannot be added')
  })

  it('rejects unsupported image types', () => {
    expect(() => validateBrowserImage(imageFile('vector.svg', { type: 'image/svg+xml' })))
      .toThrow('not a supported PNG, JPEG, GIF, or WebP image')
  })

  it('rejects files larger than the configured limit', () => {
    expect(() => validateBrowserImage(imageFile('large.png', {
      size: MAX_BROWSER_IMAGE_BYTES + 1,
    }))).toThrow('exceeds the 20 MB image limit')
  })
})

describe('validateBrowserImageContents', () => {
  it('accepts files that the browser can decode', async () => {
    const decode = async () => undefined
    await expect(validateBrowserImageContents(imageFile('valid.png'), decode)).resolves.toBeUndefined()
  })

  it('reports the selected filename when decoding fails', async () => {
    const decode = async () => { throw new Error('decode failed') }
    await expect(validateBrowserImageContents(imageFile('corrupt.png'), decode))
      .rejects.toThrow('corrupt.png could not be read as an image')
  })
})
