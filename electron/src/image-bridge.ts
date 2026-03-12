import { app, dialog, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const IMAGE_FILTER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];

const MIME_LOOKUP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

type AssetType = 'chapter' | 'cover';

interface CopyOptions {
  bookId: string;
  chapterId?: string | null;
  assetType: AssetType;
}

interface StoredImageMetadata {
  id: string;
  fileName: string;
  relativePath: string;
  mimeType: string | null;
}

function imagesRoot() {
  return path.join(app.getPath('userData'), 'images');
}

async function ensureDirectory(dir: string) {
  await mkdir(dir, { recursive: true });
}

function sanitizeSegment(segment?: string | null, fallback = 'default'): string {
  if (!segment) return fallback;
  return segment.replace(/[^a-zA-Z0-9-_]/g, '_') || fallback;
}

function getMimeType(ext: string): string | null {
  return MIME_LOOKUP[ext.toLowerCase()] ?? null;
}

async function copyIntoLibrary(sourcePath: string, options: CopyOptions): Promise<StoredImageMetadata> {
  const baseDir = imagesRoot();
  const extension = path.extname(sourcePath).toLowerCase();
  const normalizedExtension = MIME_LOOKUP[extension] ? extension : '.png';
  const id = randomUUID();
  const fileName = `${id}${normalizedExtension}`;

  const folderSegments =
    options.assetType === 'chapter'
      ? ['books', sanitizeSegment(options.bookId), 'chapters', sanitizeSegment(options.chapterId, 'general')]
      : ['books', sanitizeSegment(options.bookId), 'covers'];

  const targetDir = path.join(baseDir, ...folderSegments);
  await ensureDirectory(targetDir);

  const destination = path.join(targetDir, fileName);
  await copyFile(sourcePath, destination);

  return {
    id,
    fileName,
    relativePath: path.relative(baseDir, destination),
    mimeType: getMimeType(normalizedExtension),
  };
}

function resolveRelativePath(relativePath: string) {
  const baseDir = imagesRoot();
  const resolved = path.resolve(baseDir, relativePath);
  if (!resolved.startsWith(baseDir)) {
    throw new Error('Invalid image path');
  }
  return resolved;
}

export function registerDesktopImageBridge() {
  ipcMain.handle('desktop-images:pick-chapter', async (_event, payload: { bookId: string; chapterId: string }) => {
    if (!payload?.bookId || !payload?.chapterId) {
      throw new Error('Missing identifiers for chapter images');
    }
    const result = await dialog.showOpenDialog({
      title: 'Select chapter illustrations',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: IMAGE_FILTER_EXTENSIONS }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, images: [] };
    }
    const images: StoredImageMetadata[] = [];
    for (const filePath of result.filePaths) {
      images.push(
        await copyIntoLibrary(filePath, {
          bookId: payload.bookId,
          chapterId: payload.chapterId,
          assetType: 'chapter',
        })
      );
    }
    return { canceled: false, images };
  });

  ipcMain.handle('desktop-images:pick-cover', async (_event, payload: { bookId: string }) => {
    if (!payload?.bookId) {
      throw new Error('Missing book identifier for cover selection');
    }
    const result = await dialog.showOpenDialog({
      title: 'Select book cover',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: IMAGE_FILTER_EXTENSIONS }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }
    const image = await copyIntoLibrary(result.filePaths[0], {
      bookId: payload.bookId,
      assetType: 'cover',
    });
    return { canceled: false, image };
  });

  ipcMain.handle('desktop-images:read', async (_event, payload: { relativePath: string; mimeType?: string }) => {
    if (!payload?.relativePath) {
      throw new Error('Missing image path');
    }
    const absolutePath = resolveRelativePath(payload.relativePath);
    const buffer = await readFile(absolutePath);
    const mimeType = payload.mimeType ?? getMimeType(path.extname(absolutePath)) ?? 'application/octet-stream';
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    return { dataUrl };
  });

  ipcMain.handle('desktop-images:delete', async (_event, payload: { relativePath: string }) => {
    if (!payload?.relativePath) {
      return { success: false };
    }
    try {
      const absolutePath = resolveRelativePath(payload.relativePath);
      await rm(absolutePath, { force: true });
      return { success: true };
    } catch (error) {
      console.warn('Failed to remove image asset', error);
      return { success: false };
    }
  });

  ipcMain.handle('desktop-images:metadata', async (_event, payload: { relativePath: string }) => {
    const absolutePath = resolveRelativePath(payload.relativePath);
    const stats = await stat(absolutePath);
    return {
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
    };
  });

  // Write image data from base64 data URL to filesystem (for restore from backup)
  ipcMain.handle('desktop-images:write', async (_event, payload: { relativePath: string; dataUrl: string }) => {
    if (!payload?.relativePath || !payload?.dataUrl) {
      throw new Error('Missing image path or data');
    }

    // Parse the data URL to get the binary data
    const matches = payload.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid data URL format');
    }

    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Ensure the directory exists
    const absolutePath = path.join(imagesRoot(), payload.relativePath);
    const dir = path.dirname(absolutePath);
    await ensureDirectory(dir);

    // Write the file
    const { writeFile } = await import('node:fs/promises');
    await writeFile(absolutePath, buffer);

    return { success: true };
  });
}
