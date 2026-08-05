import { describe, expect, it } from 'vitest'
import CryptoJS from 'crypto-js'
import { Encryption } from '@/lib/encryption'

const encode = (text: string) => new TextEncoder().encode(text)
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('Encryption (Web Crypto AES-GCM)', () => {
  it('round-trips data with the correct password', async () => {
    const encrypted = await Encryption.encrypt(encode('hello world'), 'correct horse')
    expect(encrypted.startsWith('WC2:')).toBe(true)

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

describe('Encryption (WC1 backward compatibility)', () => {
  // Build a backup in the original WC1 format (salt + iv + ciphertext, fixed
  // 100k PBKDF2 iterations, no stored iteration count) to prove old backups
  // still restore after the move to the WC2 format.
  async function makeWc1Blob(plaintext: string, password: string): Promise<string> {
    const enc = new TextEncoder()
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    )
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext)))
    const combined = new Uint8Array(16 + 12 + ct.byteLength)
    combined.set(salt, 0)
    combined.set(iv, 16)
    combined.set(ct, 28)
    let binary = ''
    combined.forEach((b) => { binary += String.fromCharCode(b) })
    return 'WC1:' + btoa(binary)
  }

  it('decrypts a WC1-format backup', async () => {
    const wc1 = await makeWc1Blob('old backup words', 'pw')
    expect(wc1.startsWith('WC1:')).toBe(true)
    const decrypted = await Encryption.decrypt(wc1, 'pw')
    expect(decode(decrypted)).toBe('old backup words')
  })

  it('rejects a WC1 backup with the wrong password', async () => {
    const wc1 = await makeWc1Blob('old backup words', 'pw')
    await expect(Encryption.decrypt(wc1, 'nope')).rejects.toThrow(
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

  it('never returns the original plaintext for a legacy backup with the wrong password', async () => {
    const legacy = CryptoJS.AES.encrypt('legacy backup text', 'pw').toString()
    // A wrong password usually throws (bad padding / malformed UTF-8), but can
    // occasionally decode to non-empty garbage. The deterministic invariant is
    // that it must never yield the original plaintext.
    let recovered: string | null = null
    try {
      recovered = decode(await Encryption.decrypt(legacy, 'nope'))
    } catch {
      // Throwing is the common, acceptable outcome.
    }
    expect(recovered).not.toBe('legacy backup text')
  })
})
