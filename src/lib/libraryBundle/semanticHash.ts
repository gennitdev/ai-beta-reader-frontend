const textEncoder = new TextEncoder()

function canonicalize(value: unknown, omitSemanticMetadata: boolean): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry, omitSemanticMetadata))
  if (value instanceof Uint8Array) return [...value]
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !omitSemanticMetadata || key !== 'updated_at' && key !== 'bytes')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry, omitSemanticMetadata)]),
    )
  }
  return value
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, false))
}

export async function sha256Hex(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function semanticHash(value: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(canonicalize(value, true)))
}

export async function chapterContentHash(chapter: { title: string | null; body: string }) {
  return semanticHash({ title: chapter.title, body: chapter.body })
}
