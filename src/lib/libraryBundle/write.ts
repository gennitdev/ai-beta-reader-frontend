import { stringify as stringifyYaml } from 'yaml'
import type { CanonicalLibraryModel } from './model'
import { canonicalLibraryModelSchema } from './schemas'
import { createBundleInventory, type InventorySourceEntity } from './inventory'
import { encodeBundleText, type BundleFileMap } from './fileMap'
import { sha256Hex, stableJson } from './semanticHash'

export interface BundleWriteOptions {
  bundleId: string
  exportedAt: string
  appVersion: string
}

export interface WrittenLibraryBundle {
  files: BundleFileMap
  inventory: Awaited<ReturnType<typeof createBundleInventory>>
}

const YAML_OPTIONS = {
  aliasDuplicateObjects: false,
  defaultKeyType: 'PLAIN' as const,
  defaultStringType: 'QUOTE_DOUBLE' as const,
  lineWidth: 0,
}

function yaml(value: unknown): string {
  return stringifyYaml(value, YAML_OPTIONS)
}

function markdown(frontmatter: Record<string, unknown>, body: string): string {
  return `---\n${yaml(frontmatter)}---\n${body}`
}

export function bundleSlug(value: string): string {
  return value.normalize('NFKD').toLowerCase()
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled'
}

export function bundleShortId(id: string): string {
  const safe = bundleSlug(id)
  return safe.length <= 12 ? safe : safe.slice(-12)
}

function entityDirectory(name: string, id: string): string {
  return `${bundleSlug(name)}--${bundleShortId(id)}`
}

function safeAssetFileName(fileName: string): string {
  if (!fileName || fileName === '.' || fileName === '..' || /[\\/\0\r\n]/.test(fileName)) {
    throw new Error(`Asset filename is not portable: ${JSON.stringify(fileName)}`)
  }
  return fileName.normalize('NFC')
}

function reviewFileName(createdAt: string, id: string): string {
  const timestamp = createdAt.replace(/[:]/g, '-').replace(/\.000Z$/, 'Z')
  return `${timestamp}--${bundleShortId(id)}.md`
}

function sortById<T extends { id: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.id.localeCompare(right.id))
}

function sortByCreatedAtAndId<T extends { id: string; created_at: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => (
    left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
  ))
}

function addFile(files: BundleFileMap, path: string, content: string | Uint8Array): void {
  if (files.has(path)) throw new Error(`Canonical bundle path collision: ${path}`)
  files.set(path, typeof content === 'string' ? encodeBundleText(content) : content)
}

function addInventorySource(
  sources: InventorySourceEntity[],
  entityType: string,
  id: string,
  path: string,
  value: unknown,
) {
  sources.push({ entityType, id, path, value })
}

function jsonLines(values: readonly unknown[]): string {
  return values.map((value) => stableJson(value)).join('\n') + (values.length ? '\n' : '')
}

/** Render a canonical model into a deterministic, transport-independent UTF-8/binary file map. */
export async function writeLibraryBundle(
  input: CanonicalLibraryModel,
  options: BundleWriteOptions,
): Promise<WrittenLibraryBundle> {
  const model = canonicalLibraryModelSchema.parse(input)
  const files: BundleFileMap = new Map()
  const inventorySources: InventorySourceEntity[] = []
  const bookPaths = new Map<string, string>()
  const partPaths = new Map<string, string>()
  const chapterPaths = new Map<string, string>()

  for (const book of sortById(model.books)) {
    bookPaths.set(book.id, `books/${entityDirectory(book.title, book.id)}`)
  }
  for (const part of sortById(model.parts)) {
    const bookPath = bookPaths.get(part.book_id)
    if (!bookPath) throw new Error(`Part ${part.id} refers to unknown book ${part.book_id}.`)
    partPaths.set(part.id, `${bookPath}/parts/${entityDirectory(part.name, part.id)}`)
  }
  for (const chapter of sortById(model.chapters)) {
    const bookPath = bookPaths.get(chapter.book_id)
    if (!bookPath) throw new Error(`Chapter ${chapter.id} refers to unknown book ${chapter.book_id}.`)
    chapterPaths.set(
      chapter.id,
      `${bookPath}/chapters/${entityDirectory(chapter.title ?? 'Untitled', chapter.id)}`,
    )
  }

  addFile(files, 'beta-bot.yaml', yaml({
    format: 'beta-bot-library',
    format_version: model.format_version,
    bundle_id: options.bundleId,
    bundle_kind: model.bundle_kind,
    content_mode: model.content_mode,
    exported_at: options.exportedAt,
    app_version: options.appVersion,
    book_ids: [...model.book_ids].sort(),
    includes: model.includes,
    hash_algorithm: 'sha256',
  }))

  for (const book of sortById(model.books)) {
    const path = `${bookPaths.get(book.id)}/book.yaml`
    addFile(files, path, yaml(book))
    addInventorySource(inventorySources, 'book', book.id, path, book)

    const characters = sortById(model.book_characters.filter((entry) => entry.book_id === book.id))
    if (characters.length) {
      const characterPath = `${bookPaths.get(book.id)}/characters.yaml`
      addFile(files, characterPath, yaml({ characters }))
      characters.forEach((entry) => addInventorySource(
        inventorySources, 'book_character', entry.id, characterPath, entry,
      ))
    }
  }

  for (const part of sortById(model.parts)) {
    const path = `${partPaths.get(part.id)}/part.yaml`
    addFile(files, path, yaml(part))
    addInventorySource(inventorySources, 'part', part.id, path, part)
  }

  for (const chapter of sortById(model.chapters)) {
    const { body, ...frontmatter } = chapter
    const path = `${chapterPaths.get(chapter.id)}/chapter.md`
    addFile(files, path, markdown(frontmatter, body))
    addInventorySource(inventorySources, 'chapter', chapter.id, path, chapter)
  }

  for (const note of sortById(model.chapter_notes)) {
    const chapterPath = chapterPaths.get(note.chapter_id)
    if (!chapterPath) throw new Error(`Note ${note.id} refers to unknown chapter ${note.chapter_id}.`)
    const { body, ...frontmatter } = note
    const path = `${chapterPath}/notes.md`
    addFile(files, path, markdown(frontmatter, body))
    addInventorySource(inventorySources, 'chapter_note', note.id, path, note)
  }

  for (const summary of sortById(model.chapter_summaries)) {
    const chapterPath = chapterPaths.get(summary.chapter_id)
    if (!chapterPath) throw new Error(`Summary ${summary.id} refers to unknown chapter ${summary.chapter_id}.`)
    const { body, ...frontmatter } = summary
    const path = `${chapterPath}/summary.md`
    addFile(files, path, markdown(frontmatter, body ?? ''))
    addInventorySource(inventorySources, 'chapter_summary', summary.id, path, summary)
  }

  for (const summary of sortById(model.part_summaries)) {
    const partPath = partPaths.get(summary.part_id)
    if (!partPath) throw new Error(`Summary ${summary.id} refers to unknown part ${summary.part_id}.`)
    const { body, ...frontmatter } = summary
    const path = `${partPath}/summary.md`
    addFile(files, path, markdown(frontmatter, body ?? ''))
    addInventorySource(inventorySources, 'part_summary', summary.id, path, summary)
  }

  for (const review of sortByCreatedAtAndId(model.reviews)) {
    const chapterPath = chapterPaths.get(review.chapter_id)
    if (!chapterPath) throw new Error(`Review ${review.id} refers to unknown chapter ${review.chapter_id}.`)
    const { body, ...frontmatter } = review
    const path = `${chapterPath}/reviews/${reviewFileName(review.created_at, review.id)}`
    addFile(files, path, markdown(frontmatter, body))
    addInventorySource(inventorySources, 'review', review.id, path, review)
  }

  for (const page of sortById(model.wiki_pages)) {
    const bookPath = bookPaths.get(page.book_id)
    if (!bookPath) throw new Error(`Wiki page ${page.id} refers to unknown book ${page.book_id}.`)
    const { body, ...frontmatter } = page
    const path = `${bookPath}/wiki/${entityDirectory(page.page_name, page.id)}.md`
    addFile(files, path, markdown(frontmatter, body))
    addInventorySource(inventorySources, 'wiki_page', page.id, path, page)
  }

  for (const profile of sortById(model.profiles)) {
    const path = `profiles/${entityDirectory(profile.name, profile.id)}.yaml`
    addFile(files, path, yaml(profile))
    addInventorySource(inventorySources, 'profile', profile.id, path, profile)
  }

  for (const asset of sortById(model.assets)) {
    const bookPath = bookPaths.get(asset.book_id)
    if (!bookPath) throw new Error(`Asset ${asset.id} refers to unknown book ${asset.book_id}.`)
    const assetDirectory = `${bookPath}/assets/${bundleShortId(asset.id)}`
    const metadataPath = `${assetDirectory}/asset.yaml`
    const { bytes, ...metadata } = asset
    addFile(files, metadataPath, yaml(metadata))
    addInventorySource(inventorySources, 'asset', asset.id, metadataPath, metadata)

    if (model.includes.image_bytes) {
      if (!bytes) throw new Error(`Full bundle asset ${asset.id} is missing required bytes.`)
      if (bytes.byteLength !== asset.byte_length || await sha256Hex(bytes) !== asset.sha256) {
        throw new Error(`Asset ${asset.id} bytes do not match its declared integrity metadata.`)
      }
      addFile(files, `${assetDirectory}/${safeAssetFileName(asset.file_name)}`, bytes)
    }
  }

  const historyFiles = [
    ['chapter_revision', '_beta-bot/history/chapter-revisions.jsonl', sortByCreatedAtAndId(model.chapter_revisions)],
    ['chapter_activity', '_beta-bot/history/chapter-activity.jsonl', sortByCreatedAtAndId(model.chapter_activity)],
    ['wiki_update', '_beta-bot/history/wiki-updates.jsonl', sortByCreatedAtAndId(model.wiki_updates)],
  ] as const
  for (const [entityType, path, values] of historyFiles) {
    const included = entityType === 'wiki_update'
      ? model.includes.audit_records
      : model.includes.history
    if (included) {
      addFile(files, path, jsonLines(values))
      values.forEach((value) => addInventorySource(inventorySources, entityType, value.id, path, value))
    }
  }

  if (model.includes.audit_records) {
    const reviewState = [...model.wiki_review_state].sort((left, right) => (
      left.wiki_page_id.localeCompare(right.wiki_page_id)
        || left.chapter_id.localeCompare(right.chapter_id)
    ))
    const path = '_beta-bot/review-state.jsonl'
    addFile(files, path, jsonLines(reviewState))
    reviewState.forEach((value) => addInventorySource(
      inventorySources,
      'wiki_review_state',
      `${value.wiki_page_id}:${value.chapter_id}`,
      path,
      value,
    ))
  }

  const inventory = await createBundleInventory(options.bundleId, inventorySources)
  addFile(files, '_beta-bot/inventory.json', `${JSON.stringify(inventory, null, 2)}\n`)
  const orderedFiles = new Map(
    [...files.entries()].sort(([left], [right]) => left.localeCompare(right)),
  )
  return { files: orderedFiles, inventory }
}
