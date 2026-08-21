import { app, ipcMain } from 'electron';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface RecoveryMetadata {
  id: string;
  bundleId: string;
  createdAt: string;
  appVersion: string;
  sourceOperation: 'replace-library';
  databaseGeneration: string;
  byteLength: number;
  sha256: string;
}

interface RecoveryWritePayload {
  metadata: RecoveryMetadata;
  bytesBase64: string;
}

function recoveryRoot(): string {
  return path.join(app.getPath('userData'), 'recovery');
}

function assertId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new Error('Invalid recovery bundle ID.');
}

function assertMetadata(value: unknown): asserts value is RecoveryMetadata {
  if (!value || typeof value !== 'object') throw new Error('Invalid recovery metadata.');
  const metadata = value as Partial<RecoveryMetadata>;
  assertId(metadata.id);
  if (typeof metadata.bundleId !== 'string' || !metadata.bundleId) throw new Error('Invalid recovery bundle ID metadata.');
  if (typeof metadata.createdAt !== 'string' || Number.isNaN(Date.parse(metadata.createdAt))) throw new Error('Invalid recovery timestamp.');
  if (typeof metadata.appVersion !== 'string' || metadata.sourceOperation !== 'replace-library') throw new Error('Invalid recovery source metadata.');
  if (typeof metadata.databaseGeneration !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.databaseGeneration)) throw new Error('Invalid recovery database generation.');
  if (!Number.isSafeInteger(metadata.byteLength) || Number(metadata.byteLength) < 0) throw new Error('Invalid recovery byte length.');
  if (typeof metadata.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.sha256)) throw new Error('Invalid recovery checksum.');
}

function pathsFor(id: string) {
  assertId(id);
  return {
    zip: path.join(recoveryRoot(), `${id}.zip`),
    metadata: path.join(recoveryRoot(), `${id}.json`),
  };
}

async function writeRecovery(payload: RecoveryWritePayload): Promise<void> {
  assertMetadata(payload?.metadata);
  if (
    typeof payload.bytesBase64 !== 'string'
    || payload.bytesBase64.length % 4 !== 0
    || !/^[a-zA-Z0-9+/]*={0,2}$/.test(payload.bytesBase64)
  ) throw new Error('Invalid recovery bundle encoding.');
  const bytes = Buffer.from(payload.bytesBase64, 'base64');
  if (bytes.toString('base64') !== payload.bytesBase64) throw new Error('Invalid recovery bundle encoding.');
  if (bytes.byteLength !== payload.metadata.byteLength) throw new Error('Recovery byte length does not match metadata.');
  await mkdir(recoveryRoot(), { recursive: true });
  const target = pathsFor(payload.metadata.id);
  const nonce = `${process.pid}-${Date.now()}`;
  const zipTemp = `${target.zip}.${nonce}.tmp`;
  const metadataTemp = `${target.metadata}.${nonce}.tmp`;
  try {
    await writeFile(zipTemp, bytes, { mode: 0o600 });
    await writeFile(metadataTemp, JSON.stringify(payload.metadata), { mode: 0o600 });
    await rename(zipTemp, target.zip);
    await rename(metadataTemp, target.metadata);
  } finally {
    await Promise.all([rm(zipTemp, { force: true }), rm(metadataTemp, { force: true })]);
  }
}

async function readRecovery(id: string): Promise<{ metadata: RecoveryMetadata; bytesBase64: string } | null> {
  const target = pathsFor(id);
  try {
    const [metadataJson, bytes] = await Promise.all([readFile(target.metadata, 'utf8'), readFile(target.zip)]);
    const metadata: unknown = JSON.parse(metadataJson);
    assertMetadata(metadata);
    if (metadata.id !== id) throw new Error('Recovery metadata ID does not match its filename.');
    return { metadata, bytesBase64: bytes.toString('base64') };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function listRecoveries(): Promise<RecoveryMetadata[]> {
  try {
    const names = await readdir(recoveryRoot());
    const values = await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
      const metadata: unknown = JSON.parse(await readFile(path.join(recoveryRoot(), name), 'utf8'));
      assertMetadata(metadata);
      if (`${metadata.id}.json` !== name) throw new Error('Recovery metadata ID does not match its filename.');
      return metadata;
    }));
    return values;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function deleteRecovery(id: string): Promise<void> {
  const target = pathsFor(id);
  await Promise.all([rm(target.zip, { force: true }), rm(target.metadata, { force: true })]);
}

export function registerRecoveryBridge(): void {
  ipcMain.handle('desktop-recovery:write', (_event, payload: RecoveryWritePayload) => writeRecovery(payload));
  ipcMain.handle('desktop-recovery:read', (_event, id: string) => readRecovery(id));
  ipcMain.handle('desktop-recovery:list', () => listRecoveries());
  ipcMain.handle('desktop-recovery:delete', (_event, id: string) => deleteRecovery(id));
}
