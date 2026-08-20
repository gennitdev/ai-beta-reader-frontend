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

function secureDir(): string {
  return path.join(app.getPath('userData'), 'secure');
}

function securePath(key: string): string {
  assertAllowedSecureStorageKey(key);
  return path.join(secureDir(), `${key}.bin`);
}

async function handleGet(key: string): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }
  try {
    const encrypted = await readFile(securePath(key));
    return safeStorage.decryptString(encrypted);
  } catch {
    // Missing file or undecryptable payload — treat as "no value".
    return null;
  }
}

async function handleSet(key: string, value: string): Promise<void> {
  assertAllowedSecureStorageKey(key);
  assertSecureStorageValue(value);
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption is not available on this system.');
  }
  await mkdir(secureDir(), { recursive: true });
  const encrypted = safeStorage.encryptString(value);
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
