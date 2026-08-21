import type { BundleDiagnostic } from './diagnostics'
import { bundleError } from './diagnostics'

export interface BundleReadLimits {
  maxFiles: number
  maxTotalBytes: number
  maxNonImageBytes: number
  maxPathBytes: number
  maxCompressionRatio: number
}

export const DEFAULT_BUNDLE_READ_LIMITS: Readonly<BundleReadLimits> = Object.freeze({
  maxFiles: 50_000,
  maxTotalBytes: 1024 * 1024 * 1024,
  maxNonImageBytes: 100 * 1024 * 1024,
  maxPathBytes: 1024,
  maxCompressionRatio: 200,
})

export interface BundleEntryMetadata {
  path: string
  uncompressedBytes: number
  compressedBytes?: number
  isDirectory?: boolean
  isSymlink?: boolean
}

const imageExtension = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i

export function normalizedPortablePath(path: string): string | null {
  if (!path || path.includes('\0') || path.includes('\\') || path.startsWith('/')) return null
  if (/^[a-zA-Z]:/.test(path)) return null
  const segments = path.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null
  return segments.join('/').normalize('NFC')
}

export function validateEntryMetadata(
  entries: readonly BundleEntryMetadata[],
  limits: BundleReadLimits = DEFAULT_BUNDLE_READ_LIMITS,
): BundleDiagnostic[] {
  const diagnostics: BundleDiagnostic[] = []
  const files = entries.filter((entry) => !entry.isDirectory)
  if (files.length > limits.maxFiles) {
    diagnostics.push(bundleError('limit.file_count', `Bundle has ${files.length} files; the limit is ${limits.maxFiles}.`))
  }

  let totalBytes = 0
  const normalizedPaths = new Map<string, string>()
  for (const entry of files) {
    const path = normalizedPortablePath(entry.path)
    if (!path) {
      diagnostics.push(bundleError('path.unsafe', 'Path must be relative and may not contain empty, dot, parent, backslash, drive, or NUL segments.', { path: entry.path }))
      continue
    }
    if (entry.isSymlink) diagnostics.push(bundleError('path.symlink', 'Symbolic links are not allowed.', { path }))
    const pathBytes = new TextEncoder().encode(path).byteLength
    if (pathBytes > limits.maxPathBytes) {
      diagnostics.push(bundleError('limit.path_length', `Path is ${pathBytes} bytes; the limit is ${limits.maxPathBytes}.`, { path }))
    }
    const collisionKey = path.normalize('NFC').toLocaleLowerCase('en-US')
    const prior = normalizedPaths.get(collisionKey)
    if (prior) diagnostics.push(bundleError('path.collision', `Path collides with ${prior} after Unicode and case normalization.`, { path }))
    else normalizedPaths.set(collisionKey, path)

    totalBytes += entry.uncompressedBytes
    if (!imageExtension.test(path) && entry.uncompressedBytes > limits.maxNonImageBytes) {
      diagnostics.push(bundleError('limit.file_size', `Non-image file is ${entry.uncompressedBytes} bytes; the limit is ${limits.maxNonImageBytes}.`, { path }))
    }
    if (entry.compressedBytes !== undefined) {
      const ratio = entry.compressedBytes === 0
        ? (entry.uncompressedBytes === 0 ? 1 : Number.POSITIVE_INFINITY)
        : entry.uncompressedBytes / entry.compressedBytes
      if (ratio > limits.maxCompressionRatio) {
        diagnostics.push(bundleError('limit.compression_ratio', `Compression ratio ${ratio.toFixed(1)}:1 exceeds the ${limits.maxCompressionRatio}:1 limit.`, { path }))
      }
    }
  }
  if (totalBytes > limits.maxTotalBytes) {
    diagnostics.push(bundleError('limit.total_size', `Bundle expands to ${totalBytes} bytes; the limit is ${limits.maxTotalBytes}.`))
  }
  return diagnostics
}
