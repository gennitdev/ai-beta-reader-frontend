export const IMAGE_CONTENT_HASH_ALGORITHM = 'sha256-v1' as const

export interface ImageContentIntegrity {
  content_hash: string
  content_hash_algorithm: typeof IMAGE_CONTENT_HASH_ALGORITHM
  content_byte_length: number
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Compute a deterministic, browser-compatible fingerprint for image bytes. */
export async function hashImageContent(blob: Blob): Promise<ImageContentIntegrity> {
  const bytes = await blob.arrayBuffer()
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)

  return {
    content_hash: bytesToHex(new Uint8Array(digest)),
    content_hash_algorithm: IMAGE_CONTENT_HASH_ALGORITHM,
    content_byte_length: bytes.byteLength,
  }
}

export async function verifyImageContent(
  blob: Blob,
  expected: {
    content_hash: string
    content_hash_algorithm: string
    content_byte_length: number
  },
): Promise<void> {
  if (expected.content_hash_algorithm !== IMAGE_CONTENT_HASH_ALGORITHM) {
    throw new Error(`uses unsupported integrity metadata (${expected.content_hash_algorithm})`)
  }

  const actual = await hashImageContent(blob)
  if (
    actual.content_hash !== expected.content_hash
    || actual.content_byte_length !== expected.content_byte_length
  ) {
    throw new Error('failed its integrity check because the stored bytes do not match its metadata')
  }
}
