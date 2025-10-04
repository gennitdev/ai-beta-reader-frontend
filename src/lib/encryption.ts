import CryptoJS from 'crypto-js';

export class Encryption {
  /**
   * Encrypt data using AES encryption with user's password
   */
  static encrypt(data: Uint8Array, password: string): string {
    // Convert Uint8Array to UTF-8 string (it's JSON, so it's text)
    const textData = new TextDecoder().decode(data);

    // Encrypt with AES
    const encrypted = CryptoJS.AES.encrypt(textData, password).toString();
    return encrypted;
  }

  /**
   * Decrypt data using AES decryption with user's password
   */
  static decrypt(encryptedData: string, password: string): Uint8Array {
    // Decrypt with AES
    const decrypted = CryptoJS.AES.decrypt(encryptedData, password);

    // Convert WordArray to UTF-8 string
    const textData = decrypted.toString(CryptoJS.enc.Utf8);

    if (!textData) {
      throw new Error('Decryption failed - wrong password or corrupted data');
    }

    // Convert back to Uint8Array
    return new TextEncoder().encode(textData);
  }

  /**
   * Generate a secure encryption key from a password using PBKDF2
   */
  static deriveKey(password: string, salt: string = 'ai-beta-reader-salt'): string {
    return CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations: 1000
    }).toString();
  }
}
