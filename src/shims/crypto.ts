export const randomBytes = (length: number) => {
  const buffer = new Uint8Array(length)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buffer)
  }
  return buffer
}

export default {
  randomBytes,
}
