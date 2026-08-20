import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertAllowedSecureStorageKey,
  assertSecureStorageValue,
  decodeImageDataUrl,
  MAX_IMAGE_BYTES,
  resolveContainedPath,
} from '../src/security-boundaries'

describe('Electron security boundaries', () => {
  it('resolves nested image paths inside the image library', () => {
    const root = path.resolve('/tmp/beta-bot-images')

    expect(resolveContainedPath(root, 'books/book-1/cover.png')).toBe(
      path.join(root, 'books/book-1/cover.png'),
    )
  })

  it.each([
    '../secrets.json',
    '../../outside.png',
    '/tmp/absolute.png',
  ])('rejects an escaping image path: %s', (candidate) => {
    expect(() => resolveContainedPath('/tmp/beta-bot-images', candidate)).toThrow()
  })

  it('rejects sibling paths that merely share the root prefix', () => {
    expect(() => resolveContainedPath('/tmp/images', '../images-backup/file.png')).toThrow()
  })

  it('permits only the application-owned secret keys', () => {
    expect(() => assertAllowedSecureStorageKey('googleOAuthTokens')).not.toThrow()
    expect(() => assertAllowedSecureStorageKey('openai_api_key')).not.toThrow()
    expect(() => assertAllowedSecureStorageKey('../../arbitrary')).toThrow()
  })

  it('limits secure-storage payload sizes', () => {
    expect(() => assertSecureStorageValue('small secret')).not.toThrow()
    expect(() => assertSecureStorageValue('x'.repeat(65 * 1024))).toThrow()
  })

  it('decodes supported raster image data URLs', () => {
    const decoded = decodeImageDataUrl('data:image/png;base64,aGVsbG8=')

    expect(decoded.mimeType).toBe('image/png')
    expect(decoded.buffer.toString('utf8')).toBe('hello')
  })

  it.each([
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:text/html;base64,PGgxPm5vcGU8L2gxPg==',
    'not-a-data-url',
  ])('rejects unsupported image payloads: %s', (dataUrl) => {
    expect(() => decodeImageDataUrl(dataUrl)).toThrow()
  })

  it('rejects oversized image payloads before decoding them', () => {
    const oversized = 'A'.repeat(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4)

    expect(() => decodeImageDataUrl(`data:image/png;base64,${oversized}`)).toThrow(/maximum/)
  })
})
