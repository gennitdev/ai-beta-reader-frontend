import { semanticHash } from './semanticHash'
import { z } from 'zod'

export const BUNDLE_INVENTORY_VERSION = 1 as const

export const bundleInventoryEntitySchema = z.strictObject({
  entity_type: z.string().min(1),
  id: z.string().min(1),
  path: z.string().min(1),
  semantic_sha256: z.string().regex(/^[a-f0-9]{64}$/),
})

export const bundleInventorySchema = z.strictObject({
  inventory_version: z.literal(BUNDLE_INVENTORY_VERSION),
  bundle_id: z.string().min(1),
  entities: z.array(bundleInventoryEntitySchema),
})

export type BundleInventoryEntity = z.infer<typeof bundleInventoryEntitySchema>
export type BundleInventory = z.infer<typeof bundleInventorySchema>

export interface InventorySourceEntity {
  entityType: string
  id: string
  path: string
  value: unknown
}

export async function createBundleInventory(
  bundleId: string,
  sources: readonly InventorySourceEntity[],
): Promise<BundleInventory> {
  const ordered = [...sources].sort((left, right) => {
    return left.entityType.localeCompare(right.entityType)
      || left.id.localeCompare(right.id)
      || left.path.localeCompare(right.path)
  })

  const entities = await Promise.all(ordered.map(async (source) => ({
    entity_type: source.entityType,
    id: source.id,
    path: source.path,
    semantic_sha256: await semanticHash(source.value),
  })))

  return {
    inventory_version: BUNDLE_INVENTORY_VERSION,
    bundle_id: bundleId,
    entities,
  }
}
