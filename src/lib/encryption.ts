import CryptoJS from 'crypto-js';

// Constants for Web Crypto encryption
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;
const WEB_CRYPTO_PREFIX = 'WC1:'; // Prefix to identify Web Crypto format

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
    salt: Uint8Array
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
        iterations: PBKDF2_ITERATIONS,
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

    // Derive key from password
    const key = await Encryption.deriveKeyFromPassword(password, salt);

    // Encrypt the data
    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );

    // Combine salt + iv + ciphertext into a single buffer
    const combined = new Uint8Array(
      salt.length + iv.length + ciphertext.byteLength
    );
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

    // Return as base64 with prefix to identify format
    // Use chunked encoding to avoid memory issues with large arrays
    return WEB_CRYPTO_PREFIX + uint8ArrayToBase64(combined);
  }

  /**
   * Decrypt data using AES-GCM with Web Crypto API (async, non-blocking)
   * Also supports legacy CryptoJS format for backward compatibility
   */
  static async decrypt(encryptedData: string, password: string): Promise<Uint8Array> {
    // Check if this is the new Web Crypto format
    if (encryptedData.startsWith(WEB_CRYPTO_PREFIX)) {
      return Encryption.decryptWebCrypto(encryptedData, password);
    }

    // Fall back to legacy CryptoJS decryption for old backups
    return Encryption.decryptLegacy(encryptedData, password);
  }

  /**
   * Decrypt using Web Crypto API
   */
  private static async decryptWebCrypto(
    encryptedData: string,
    password: string
  ): Promise<Uint8Array> {
    // Remove prefix and decode base64 using chunked approach
    const base64Data = encryptedData.slice(WEB_CRYPTO_PREFIX.length);
    const combined = base64ToUint8Array(base64Data);

    // Extract salt, iv, and ciphertext
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

    // Derive key from password
    const key = await Encryption.deriveKeyFromPassword(password, salt);

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
