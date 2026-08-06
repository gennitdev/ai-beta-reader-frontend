import CryptoJS from 'crypto-js';

// Constants for Web Crypto encryption
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16;
const ITERATIONS_FIELD_LENGTH = 4; // uint32 big-endian, stored in the WC2 format

// PBKDF2-HMAC-SHA256 work factor for *new* backups. Raised to meet current OWASP
// guidance. The WC2 format stores the iteration count so this can be raised again
// later without breaking backups written at an earlier setting.
const PBKDF2_ITERATIONS = 600000;
// Fixed work factor of the original WC1 format (which did not store the count).
const WC1_ITERATIONS = 100000;

const WC1_PREFIX = 'WC1:'; // Legacy Web Crypto format (salt + iv + ciphertext, 100k iterations)
const WC2_PREFIX = 'WC2:'; // Web Crypto format that also stores the iteration count

/**
 * Convert Uint8Array to base64 string in chunks to avoid memory issues
 * The spread operator on large arrays causes heap overflow
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 32768; // 32KB chunks
  let binary = '';

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }

  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array in chunks to avoid memory issues
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const length = binaryString.length;
  const bytes = new Uint8Array(length);

  // Process in chunks to avoid creating too many intermediate values
  const CHUNK_SIZE = 32768;
  for (let i = 0; i < length; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, length);
    for (let j = i; j < end; j++) {
      bytes[j] = binaryString.charCodeAt(j);
    }
  }

  return bytes;
}

export class Encryption {
  /**
   * Derive an AES key from a password using PBKDF2 (Web Crypto)
   */
  private static async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array,
    iterations: number
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Import password as a key for PBKDF2
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // Derive the actual encryption key
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256',
      },
      baseKey,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data using AES-GCM with Web Crypto API (async, non-blocking)
   */
  static async encrypt(data: Uint8Array, password: string): Promise<string> {
    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const iterations = PBKDF2_ITERATIONS;

    // Derive key from password
    const key = await Encryption.deriveKeyFromPassword(password, salt, iterations);

    // Encrypt the data
    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );

    // Store the iteration count (big-endian uint32) so the work factor can be
    // raised in future without breaking backups written now.
    const iterationsField = new Uint8Array(ITERATIONS_FIELD_LENGTH);
    new DataView(iterationsField.buffer).setUint32(0, iterations, false);

    // Combine salt + iterations + iv + ciphertext into a single buffer
    const combined = new Uint8Array(
      salt.length + iterationsField.length + iv.length + ciphertext.byteLength
    );
    let offset = 0;
    combined.set(salt, offset); offset += salt.length;
    combined.set(iterationsField, offset); offset += iterationsField.length;
    combined.set(iv, offset); offset += iv.length;
    combined.set(new Uint8Array(ciphertext), offset);

    // Return as base64 with prefix to identify format
    // Use chunked encoding to avoid memory issues with large arrays
    return WC2_PREFIX + uint8ArrayToBase64(combined);
  }

  /**
   * Decrypt data using AES-GCM with Web Crypto API (async, non-blocking)
   * Also supports legacy CryptoJS format for backward compatibility
   */
  static async decrypt(encryptedData: string, password: string): Promise<Uint8Array> {
    if (encryptedData.startsWith(WC2_PREFIX)) {
      return Encryption.decryptWebCrypto(encryptedData, password, 'wc2');
    }
    if (encryptedData.startsWith(WC1_PREFIX)) {
      return Encryption.decryptWebCrypto(encryptedData, password, 'wc1');
    }

    // Fall back to legacy CryptoJS decryption for old backups
    return Encryption.decryptLegacy(encryptedData, password);
  }

  /**
   * Decrypt a Web Crypto backup. WC2 stores the iteration count in the payload;
   * WC1 predates that and always used a fixed count.
   */
  private static async decryptWebCrypto(
    encryptedData: string,
    password: string,
    format: 'wc1' | 'wc2'
  ): Promise<Uint8Array> {
    const prefix = format === 'wc2' ? WC2_PREFIX : WC1_PREFIX;
    const combined = base64ToUint8Array(encryptedData.slice(prefix.length));

    const salt = combined.slice(0, SALT_LENGTH);

    let iterations: number;
    let ivStart: number;
    if (format === 'wc2') {
      iterations = new DataView(
        combined.buffer,
        combined.byteOffset + SALT_LENGTH,
        ITERATIONS_FIELD_LENGTH
      ).getUint32(0, false);
      ivStart = SALT_LENGTH + ITERATIONS_FIELD_LENGTH;
    } else {
      iterations = WC1_ITERATIONS;
      ivStart = SALT_LENGTH;
    }

    const iv = combined.slice(ivStart, ivStart + IV_LENGTH);
    const ciphertext = combined.slice(ivStart + IV_LENGTH);

    // Derive key from password
    const key = await Encryption.deriveKeyFromPassword(password, salt, iterations);

    // Decrypt
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        ciphertext
      );
      return new Uint8Array(decrypted);
    } catch {
      throw new Error('Decryption failed - wrong password or corrupted data');
    }
  }

  /**
   * Decrypt using legacy CryptoJS (for backward compatibility with old backups)
   */
  private static decryptLegacy(
    encryptedData: string,
    password: string
  ): Uint8Array {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, password);
    const textData = decrypted.toString(CryptoJS.enc.Utf8);

    if (!textData) {
      throw new Error('Decryption failed - wrong password or corrupted data');
    }

    return new TextEncoder().encode(textData);
  }
}
