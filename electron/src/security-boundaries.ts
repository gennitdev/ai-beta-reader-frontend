import path from 'node:path';

export const ALLOWED_SECURE_STORAGE_KEYS = new Set([
  'googleOAuthTokens',
  'openai_api_key',
]);

export const MAX_SECURE_STORAGE_VALUE_BYTES = 64 * 1024;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
]);

export function resolveContainedPath(root: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error('Invalid relative path');
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);

  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Path escapes its permitted directory');
  }

  return resolved;
}

export function assertAllowedSecureStorageKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || !ALLOWED_SECURE_STORAGE_KEYS.has(key)) {
    throw new Error('Secure storage key is not permitted');
  }
}

export function assertSecureStorageValue(value: unknown): asserts value is string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_SECURE_STORAGE_VALUE_BYTES) {
    throw new Error('Secure storage value is invalid or too large');
  }
}

export function decodeImageDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const matches = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!matches || !SUPPORTED_IMAGE_MIME_TYPES.has(matches[1])) {
    throw new Error('Invalid or unsupported image data URL');
  }

  const maximumBase64Length = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
  if (matches[2].length > maximumBase64Length) {
    throw new Error('Image exceeds the maximum supported size');
  }

  const buffer = Buffer.from(matches[2], 'base64');
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the maximum supported size');
  }

  return { mimeType: matches[1], buffer };
}

export function isSupportedImageMimeType(value: unknown): value is string {
  return typeof value === 'string' && SUPPORTED_IMAGE_MIME_TYPES.has(value);
}
