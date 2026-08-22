import { app, ipcMain, safeStorage } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertAllowedSecureStorageKey,
  assertSecureStorageValue,
} from './security-boundaries';

/**
 * Persists small secrets (e.g. OAuth tokens) encrypted at rest using Electron's
 * `safeStorage`, which is backed by the OS keychain: macOS Keychain, Windows
 * DPAPI, and libsecret (GNOME Keyring / KWallet) on Linux.
 *
 * Values are encrypted in the main process and written to per-key files under
 * the app's userData directory, so the renderer never holds the plaintext at
 * rest and localStorage is not used.
 */

const SECURE_STORAGE_TIMEOUT_MS = 30_000;

class SecureStorageTimeoutError extends Error {
  constructor() {
    super('Timed out waiting for OS secure storage. Unlock the system credential store and try again.');
    this.name = 'SecureStorageTimeoutError';
  }
}

async function withSecureStorageTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new SecureStorageTimeoutError()), SECURE_STORAGE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function asyncEncryptionAvailable(): Promise<boolean> {
  return withSecureStorageTimeout(safeStorage.isAsyncEncryptionAvailable());
}

function secureDir(): string {
  return path.join(app.getPath('userData'), 'secure');
}

function securePath(key: string): string {
  assertAllowedSecureStorageKey(key);
  return path.join(secureDir(), `${key}.bin`);
}

async function handleGet(key: string): Promise<string | null> {
  let encrypted: Buffer;
  try {
    encrypted = await readFile(securePath(key));
  } catch {
    // Missing file or undecryptable payload — treat as "no value".
    return null;
  }
  if (!(await asyncEncryptionAvailable())) {
    return null;
  }
  try {
    const decrypted = await withSecureStorageTimeout(safeStorage.decryptStringAsync(encrypted));
    return decrypted.result;
  } catch (error) {
    if (error instanceof SecureStorageTimeoutError) throw error;
    // Preserve the existing behavior for unreadable or obsolete payloads.
    return null;
  }
}

async function handleSet(key: string, value: string): Promise<void> {
  assertAllowedSecureStorageKey(key);
  assertSecureStorageValue(value);
  if (!(await asyncEncryptionAvailable())) {
    throw new Error('OS-level encryption is not available on this system.');
  }
  await mkdir(secureDir(), { recursive: true });
  const encrypted = await withSecureStorageTimeout(safeStorage.encryptStringAsync(value));
  await writeFile(securePath(key), encrypted, { mode: 0o600 });
}

async function handleRemove(key: string): Promise<void> {
  await rm(securePath(key), { force: true });
}

export function registerSecureStorageBridge(): void {
  ipcMain.handle('secure-storage:get', (_event, key: string) => {
    assertAllowedSecureStorageKey(key);
    return handleGet(key);
  });
  ipcMain.handle('secure-storage:set', (_event, key: string, value: string) => handleSet(key, value));
  ipcMain.handle('secure-storage:remove', (_event, key: string) => {
    assertAllowedSecureStorageKey(key);
    return handleRemove(key);
  });
}
