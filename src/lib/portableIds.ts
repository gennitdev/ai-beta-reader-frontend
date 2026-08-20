/** Create a collision-resistant, namespaced identity that does not rely on database-local keys. */
export function createPortableId(namespace: string): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${namespace}:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Create a portable identity for a user-defined reviewer profile. */
export function createPortableProfileId(): string {
  return createPortableId('profile')
}
