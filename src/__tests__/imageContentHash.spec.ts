import { describe, expect, it } from 'vitest'
import {
  hashImageContent,
  verifyImageContent,
} from '@/lib/imageContentHash'

describe('image content hashing', () => {
  it('produces deterministic SHA-256 integrity metadata', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

    await expect(hashImageContent(blob)).resolves.toEqual({
      content_hash: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      content_hash_algorithm: 'sha256-v1',
      content_byte_length: 3,
    })
  })

  it('accepts matching bytes and rejects mismatches and unknown algorithms', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])])
    const expected = await hashImageContent(blob)

    await expect(verifyImageContent(blob, expected)).resolves.toBeUndefined()
    await expect(verifyImageContent(new Blob([new Uint8Array([1, 2, 4])]), expected))
      .rejects.toThrow(/stored bytes do not match/)
    await expect(verifyImageContent(blob, {
      ...expected,
      content_hash_algorithm: 'sha512-v1',
    })).rejects.toThrow(/unsupported integrity metadata/)
  })
})
