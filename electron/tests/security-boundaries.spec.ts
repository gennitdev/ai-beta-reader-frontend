import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertAllowedSecureStorageKey,
  assertSecureStorageValue,
  decodeImageBytes,
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

  it('accepts supported raster image bytes', () => {
    const decoded = decodeImageBytes(new Uint8Array(Buffer.from('hello')), 'image/png')

    expect(decoded.mimeType).toBe('image/png')
    expect(decoded.buffer.toString('utf8')).toBe('hello')
  })

  it('rejects unsupported image MIME types and non-binary payloads', () => {
    expect(() => decodeImageBytes(new Uint8Array([1]), 'image/svg+xml')).toThrow(/unsupported/)
    expect(() => decodeImageBytes('not-bytes', 'image/png')).toThrow(/byte payload/)
  })

  it('rejects oversized image payloads', () => {
    const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1)

    expect(() => decodeImageBytes(oversized, 'image/png')).toThrow(/maximum/)
  })
})
