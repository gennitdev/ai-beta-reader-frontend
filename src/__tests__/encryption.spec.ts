import { describe, expect, it } from 'vitest'
import CryptoJS from 'crypto-js'
import { Encryption } from '@/lib/encryption'

const encode = (text: string) => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('Encryption (Web Crypto AES-GCM)', () => {
  it('round-trips data with the correct password', async () => {
    const encrypted = await Encryption.encrypt(encode('hello world'), 'correct horse')
    expect(encrypted.startsWith('WC1:')).toBe(true)

    const decrypted = await Encryption.decrypt(encrypted, 'correct horse')
    expect(decode(decrypted)).toBe('hello world')
  })

  it('round-trips an empty payload', async () => {
    const encrypted = await Encryption.encrypt(encode(''), 'pw')
    const decrypted = await Encryption.decrypt(encrypted, 'pw')
    expect(decode(decrypted)).toBe('')
  })

  it('produces different ciphertext each time (random salt + IV)', async () => {
    const a = await Encryption.encrypt(encode('same input'), 'pw')
    const b = await Encryption.encrypt(encode('same input'), 'pw')
    expect(a).not.toBe(b)
  })

  it('fails to decrypt with the wrong password', async () => {
    const encrypted = await Encryption.encrypt(encode('secret'), 'right')
    await expect(Encryption.decrypt(encrypted, 'wrong')).rejects.toThrow(
      /wrong password or corrupted data/,
    )
  })

  it('fails to decrypt tampered ciphertext', async () => {
    const encrypted = await Encryption.encrypt(encode('secret payload'), 'pw')
    // Flip a character deep in the base64 body (past salt/iv) to corrupt the auth tag.
    const chars = encrypted.split('')
    const idx = encrypted.length - 5
    chars[idx] = chars[idx] === 'A' ? 'B' : 'A'
    const tampered = chars.join('')

    await expect(Encryption.decrypt(tampered, 'pw')).rejects.toThrow(
      /wrong password or corrupted data/,
    )
  })
})

describe('Encryption (legacy CryptoJS fallback)', () => {
  it('decrypts legacy (non-prefixed) CryptoJS backups', async () => {
    const legacy = CryptoJS.AES.encrypt('legacy backup text', 'pw').toString()
    expect(legacy.startsWith('WC1:')).toBe(false)

    const decrypted = await Encryption.decrypt(legacy, 'pw')
    expect(decode(decrypted)).toBe('legacy backup text')
  })

  it('throws when a legacy backup is decrypted with the wrong password', async () => {
    const legacy = CryptoJS.AES.encrypt('legacy backup text', 'pw').toString()
    // A wrong password yields garbage bytes; CryptoJS may surface this either as
    // the source's own "wrong password" error or as an internal "Malformed UTF-8
    // data" throw, depending on the bytes. Either way it must reject.
    await expect(Encryption.decrypt(legacy, 'nope')).rejects.toThrow()
  })
})
