import type { BookPart } from '@/lib/database'
import type { Chapter } from '@/types/organize'

export function parseIdArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed
      : []
  } catch {
    return []
  }
}

export function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function reconcilePartOrder(
  storedValue: string | null | undefined,
  parts: readonly BookPart[],
): { order: string[]; changed: boolean } {
  const storedOrder = parseIdArray(storedValue)
  const partIds = new Set(parts.map((part) => part.id))
  const seen = new Set<string>()
  const order = storedOrder.filter((id) => {
    if (!partIds.has(id) || seen.has(id)) return false
    seen.add(id)
    return true
  })

  const missing = parts
    .filter((part) => !seen.has(part.id))
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    .map((part) => part.id)

  order.push(...missing)
  return { order, changed: !arraysEqual(order, storedOrder) }
}

export function applyChapterOrder(items: readonly Chapter[], orderIds: readonly string[]): Chapter[] {
  if (orderIds.length === 0) return items.map((chapter, position) => ({ ...chapter, position }))

  const chapterMap = new Map(items.map((chapter) => [chapter.id, chapter]))
  const ordered: Chapter[] = []
  for (const id of orderIds) {
    const chapter = chapterMap.get(id)
    if (!chapter) continue
    ordered.push(chapter)
    chapterMap.delete(id)
  }
  ordered.push(...chapterMap.values())

  return ordered.map((chapter, position) => ({ ...chapter, position }))
}

export function buildChapterOrder(
  partUpdates: Readonly<Record<string, readonly string[]>>,
  partOrder: readonly string[],
): string[] {
  const chapterOrder = [...(partUpdates.null ?? [])]
  const visited = new Set<string>()

  for (const partId of partOrder) {
    visited.add(partId)
    chapterOrder.push(...(partUpdates[partId] ?? []))
  }

  for (const [partId, chapterIds] of Object.entries(partUpdates)) {
    if (partId !== 'null' && !visited.has(partId)) chapterOrder.push(...chapterIds)
  }

  return chapterOrder
}

export function moveListItem<T>(items: T[], index: number, offset: -1 | 1): boolean {
  const targetIndex = index + offset
  if (index < 0 || index >= items.length || targetIndex < 0 || targetIndex >= items.length) {
    return false
  }

  ;[items[index], items[targetIndex]] = [items[targetIndex], items[index]]
  return true
}
