import { z } from 'zod'
import { LIBRARY_BUNDLE_FORMAT_VERSION } from './schemas'

const isoTimestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

export const bundleManifestKnownKeys = new Set([
  'format', 'format_version', 'bundle_id', 'bundle_kind', 'content_mode', 'exported_at',
  'app_version', 'book_ids', 'includes', 'hash_algorithm',
])

export const bundleManifestSchema = z.object({
  format: z.literal('beta-bot-library'),
  format_version: z.literal(LIBRARY_BUNDLE_FORMAT_VERSION),
  bundle_id: z.string().min(1),
  bundle_kind: z.enum(['library', 'selection']),
  content_mode: z.enum(['full', 'text-only']),
  exported_at: isoTimestamp,
  app_version: z.string().min(1),
  book_ids: z.array(z.string().min(1)),
  includes: z.strictObject({
    image_bytes: z.boolean(),
    history: z.boolean(),
    audit_records: z.boolean(),
  }),
  hash_algorithm: z.literal('sha256'),
})

export type BundleManifest = z.infer<typeof bundleManifestSchema>

export function isReplaceStructurallyEligible(manifest: BundleManifest): boolean {
  return manifest.bundle_kind === 'library'
    && manifest.content_mode === 'full'
    && manifest.includes.image_bytes
    && manifest.includes.history
    && manifest.includes.audit_records
}
