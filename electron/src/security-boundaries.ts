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

export function decodeImageBytes(value: unknown, mimeType: unknown): { mimeType: string; buffer: Buffer } {
  if (!isSupportedImageMimeType(mimeType)) throw new Error('Invalid or unsupported image MIME type');
  if (!(value instanceof Uint8Array)) throw new Error('Invalid image byte payload');
  if (value.byteLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds the maximum supported size');
  return {
    mimeType,
    buffer: Buffer.from(value.buffer, value.byteOffset, value.byteLength),
  };
}

export function isSupportedImageMimeType(value: unknown): value is string {
  return typeof value === 'string' && SUPPORTED_IMAGE_MIME_TYPES.has(value);
}
