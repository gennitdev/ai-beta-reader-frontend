import { semanticHash } from './semanticHash'

export const BUNDLE_INVENTORY_VERSION = 1 as const

export interface BundleInventoryEntity {
  entity_type: string
  id: string
  path: string
  semantic_sha256: string
}

export interface BundleInventory {
  inventory_version: typeof BUNDLE_INVENTORY_VERSION
  bundle_id: string
  entities: BundleInventoryEntity[]
}

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
