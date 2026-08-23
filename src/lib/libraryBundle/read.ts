import { z, type ZodType } from 'zod'
import { isAlias, isPair, isScalar, parseDocument, visit } from 'yaml'
import type { ReadonlyBundleFileMap } from './fileMap'
import type { CanonicalLibraryModel } from './model'
import { bundleError, bundleWarning, hasBundleErrors, type BundleDiagnostic } from './diagnostics'
import {
  bundleAssetSchema,
  bundleBookCharacterSchema,
  bundleBookSchema,
  bundleChapterActivitySchema,
  bundleChapterNoteSchema,
  bundleChapterRevisionSchema,
  bundleChapterSchema,
  bundleChapterSummarySchema,
  bundlePartSchema,
  bundlePartSummarySchema,
  bundleProfileSchema,
  bundleReviewSchema,
  bundleWikiPageSchema,
  bundleWikiReviewStateSchema,
  bundleWikiUpdateSchema,
  canonicalLibraryModelSchema,
} from './schemas'
import { bundleManifestKnownKeys, bundleManifestSchema, type BundleManifest } from './manifest'
import { bundleInventorySchema, type BundleInventory } from './inventory'
import { migrateLibraryBundleModel } from './migrate'

export interface ParsedEntitySource {
  entityType: string
  id: string
  path: string
}

export interface ReadLibraryBundleResult {
  manifest: BundleManifest | null
  inventory: BundleInventory | null
  model: CanonicalLibraryModel | null
  entitySources: readonly ParsedEntitySource[]
  unknownFiles: readonly string[]
  diagnostics: readonly BundleDiagnostic[]
}

const decoder = new TextDecoder('utf-8', { fatal: true })

function decodeText(files: ReadonlyBundleFileMap, path: string, diagnostics: BundleDiagnostic[]): string | null {
  const bytes = files.get(path)
  if (!bytes) {
    diagnostics.push(bundleError('file.missing', 'Required file is missing.', { path }))
    return null
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    diagnostics.push(bundleError('text.bom', 'UTF-8 byte-order marks are not allowed.', { path }))
    return null
  }
  try {
    return decoder.decode(bytes)
  } catch {
    diagnostics.push(bundleError('text.invalid_utf8', 'File is not valid UTF-8.', { path }))
    return null
  }
}

function strictYaml(text: string, path: string, diagnostics: BundleDiagnostic[]): unknown | null {
  const document = parseDocument(text, {
    schema: 'core', strict: true, uniqueKeys: true, merge: false,
  })
  document.errors.forEach((error) => diagnostics.push(bundleError('yaml.invalid', error.message, { path })))
  document.warnings.forEach((warning) => diagnostics.push(bundleError('yaml.invalid', warning.message, { path })))
  if (document.errors.length || document.warnings.length) return null

  let forbidden = false
  visit(document, (_key, node) => {
    if (isAlias(node)) {
      diagnostics.push(bundleError('yaml.alias', 'YAML aliases are not allowed.', { path }))
      forbidden = true
    }
    if ('anchor' in Object(node) && (node as { anchor?: string }).anchor) {
      diagnostics.push(bundleError('yaml.anchor', 'YAML anchors are not allowed.', { path }))
      forbidden = true
    }
    if (isPair(node)) {
      if (!isScalar(node.key) || typeof node.key.value !== 'string') {
        diagnostics.push(bundleError('yaml.non_string_key', 'YAML mapping keys must be strings.', { path }))
        forbidden = true
      } else if (node.key.value === '<<') {
        diagnostics.push(bundleError('yaml.merge_key', 'YAML merge keys are not allowed.', { path }))
        forbidden = true
      }
    }
  })
  if (forbidden) return null
  return document.toJS({ maxAliasCount: 0 })
}

function schemaValue<T>(
  schema: ZodType<T>,
  value: unknown,
  path: string,
  diagnostics: BundleDiagnostic[],
): T | null {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  for (const issue of parsed.error.issues) {
    diagnostics.push(bundleError('schema.invalid', `${issue.path.join('.') || '<root>'}: ${issue.message}`, { path }))
  }
  return null
}

function yamlFile<T>(files: ReadonlyBundleFileMap, path: string, schema: ZodType<T>, diagnostics: BundleDiagnostic[]): T | null {
  const text = decodeText(files, path, diagnostics)
  if (text === null) return null
  const value = strictYaml(text, path, diagnostics)
  return value === null ? null : schemaValue(schema, value, path, diagnostics)
}

function markdownFile<T extends object>(
  files: ReadonlyBundleFileMap,
  path: string,
  schema: ZodType<T>,
  diagnostics: BundleDiagnostic[],
  nullableBody = false,
): T | null {
  const text = decodeText(files, path, diagnostics)
  if (text === null) return null
  if (!text.startsWith('---\n')) {
    diagnostics.push(bundleError('markdown.frontmatter', 'Markdown must begin with a --- frontmatter delimiter followed by LF.', { path }))
    return null
  }
  const closing = text.indexOf('\n---\n', 4)
  if (closing < 0) {
    diagnostics.push(bundleError('markdown.frontmatter', 'Markdown is missing its closing frontmatter delimiter.', { path }))
    return null
  }
  const frontmatter = strictYaml(text.slice(4, closing + 1), path, diagnostics)
  if (frontmatter === null) return null
  if (typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    diagnostics.push(bundleError('markdown.frontmatter', 'Markdown frontmatter must be a YAML mapping.', { path }))
    return null
  }
  const body = text.slice(closing + 5)
  return schemaValue(schema, { ...frontmatter, body: nullableBody && body === '' ? null : body }, path, diagnostics)
}

function jsonFile<T>(files: ReadonlyBundleFileMap, path: string, schema: ZodType<T>, diagnostics: BundleDiagnostic[]): T | null {
  const text = decodeText(files, path, diagnostics)
  if (text === null) return null
  try {
    return schemaValue(schema, JSON.parse(text), path, diagnostics)
  } catch (error) {
    diagnostics.push(bundleError('json.invalid', error instanceof Error ? error.message : String(error), { path }))
    return null
  }
}

function jsonLines<T>(files: ReadonlyBundleFileMap, path: string, schema: ZodType<T>, diagnostics: BundleDiagnostic[]): T[] {
  if (!files.has(path)) return []
  const text = decodeText(files, path, diagnostics)
  if (text === null) return []
  const values: T[] = []
  text.split('\n').forEach((line, index, lines) => {
    if (!line && index === lines.length - 1) return
    if (!line) {
      diagnostics.push(bundleError('jsonl.blank_line', `Blank JSONL record at line ${index + 1}.`, { path }))
      return
    }
    try {
      const value = schemaValue(schema, JSON.parse(line), path, diagnostics)
      if (value) values.push(value)
    } catch (error) {
      diagnostics.push(bundleError('jsonl.invalid', `Line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`, { path }))
    }
  })
  return values
}

function pushEntity<T extends { id: string }>(
  target: T[], value: T | null, entityType: string, path: string, sources: ParsedEntitySource[],
): void {
  if (value) {
    target.push(value)
    sources.push({ entityType, id: value.id, path })
  }
}

/** Parse a validated file map into typed entities without performing any database writes. */
export function readLibraryBundle(files: ReadonlyBundleFileMap): ReadLibraryBundleResult {
  const diagnostics: BundleDiagnostic[] = []
  const sources: ParsedEntitySource[] = []
  const knownFiles = new Set([
    'beta-bot.yaml', '_beta-bot/inventory.json',
    // Optional Git-workspace scaffolding lives outside the managed bundle tree.
    'AGENTS.md', 'CLAUDE.md', '.gitattributes', '.gitignore',
    'README.md', 'LICENSE', 'LICENSE.md',
  ])
  const rawManifest = yamlFile(files, 'beta-bot.yaml', z.record(z.string(), z.unknown()), diagnostics)
  if (rawManifest) {
    Object.keys(rawManifest).filter((key) => !bundleManifestKnownKeys.has(key)).forEach((key) => {
      diagnostics.push(bundleWarning('manifest.unknown_key', `Unknown manifest key ${key} is ignored.`, { path: 'beta-bot.yaml' }))
    })
  }
  const manifest = rawManifest ? schemaValue(bundleManifestSchema, rawManifest, 'beta-bot.yaml', diagnostics) : null
  const inventory = files.has('_beta-bot/inventory.json')
    ? jsonFile(files, '_beta-bot/inventory.json', bundleInventorySchema, diagnostics)
    : (diagnostics.push(bundleError('inventory.missing', 'Required inventory is missing.', { path: '_beta-bot/inventory.json' })), null)

  const books: CanonicalLibraryModel['books'] = []
  const parts: CanonicalLibraryModel['parts'] = []
  const chapters: CanonicalLibraryModel['chapters'] = []
  const chapterNotes: CanonicalLibraryModel['chapter_notes'] = []
  const chapterSummaries: CanonicalLibraryModel['chapter_summaries'] = []
  const partSummaries: CanonicalLibraryModel['part_summaries'] = []
  const reviews: CanonicalLibraryModel['reviews'] = []
  const wikiPages: CanonicalLibraryModel['wiki_pages'] = []
  const bookCharacters: CanonicalLibraryModel['book_characters'] = []
  const profiles: CanonicalLibraryModel['profiles'] = []
  const assets: CanonicalLibraryModel['assets'] = []

  for (const path of [...files.keys()].sort()) {
    let matched = true
    if (/^books\/[^/]+\/book\.yaml$/.test(path)) pushEntity(books, yamlFile(files, path, bundleBookSchema, diagnostics), 'book', path, sources)
    else if (/^books\/[^/]+\/parts\/[^/]+\/part\.yaml$/.test(path)) pushEntity(parts, yamlFile(files, path, bundlePartSchema, diagnostics), 'part', path, sources)
    else if (/^books\/[^/]+\/chapters\/[^/]+\/chapter\.md$/.test(path)) pushEntity(chapters, markdownFile(files, path, bundleChapterSchema, diagnostics), 'chapter', path, sources)
    else if (/^books\/[^/]+\/chapters\/[^/]+\/notes\.md$/.test(path)) pushEntity(chapterNotes, markdownFile(files, path, bundleChapterNoteSchema, diagnostics), 'chapter_note', path, sources)
    else if (/^books\/[^/]+\/chapters\/[^/]+\/summary\.md$/.test(path)) pushEntity(chapterSummaries, markdownFile(files, path, bundleChapterSummarySchema, diagnostics, true), 'chapter_summary', path, sources)
    else if (/^books\/[^/]+\/parts\/[^/]+\/summary\.md$/.test(path)) pushEntity(partSummaries, markdownFile(files, path, bundlePartSummarySchema, diagnostics, true), 'part_summary', path, sources)
    else if (/^books\/[^/]+\/chapters\/[^/]+\/reviews\/[^/]+\.md$/.test(path)) pushEntity(reviews, markdownFile(files, path, bundleReviewSchema, diagnostics), 'review', path, sources)
    else if (/^books\/[^/]+\/wiki\/[^/]+\.md$/.test(path)) pushEntity(wikiPages, markdownFile(files, path, bundleWikiPageSchema, diagnostics), 'wiki_page', path, sources)
    else if (/^profiles\/[^/]+\.yaml$/.test(path)) pushEntity(profiles, yamlFile(files, path, bundleProfileSchema, diagnostics), 'profile', path, sources)
    else if (/^books\/[^/]+\/characters\.yaml$/.test(path)) {
      const wrapper = yamlFile(files, path, z.strictObject({ characters: z.array(bundleBookCharacterSchema) }), diagnostics)
      wrapper?.characters.forEach((value) => pushEntity(bookCharacters, value, 'book_character', path, sources))
    } else if (/^books\/[^/]+\/assets\/[^/]+\/asset\.yaml$/.test(path)) {
      const metadata = yamlFile(files, path, bundleAssetSchema.omit({ bytes: true }).extend({ bytes: z.undefined().optional() }), diagnostics)
      if (metadata) {
        const directory = path.slice(0, -'asset.yaml'.length)
        const binaryPath = `${directory}${metadata.file_name}`
        if (files.has(binaryPath)) knownFiles.add(binaryPath)
        const value = schemaValue(bundleAssetSchema, { ...metadata, bytes: files.get(binaryPath) ?? null }, path, diagnostics)
        pushEntity(assets, value, 'asset', path, sources)
      }
    } else matched = false
    if (matched) knownFiles.add(path)
  }

  const readHistory = <T extends { id: string }>(entityType: string, path: string, schema: ZodType<T>): T[] => {
    if (files.has(path)) knownFiles.add(path)
    const values = jsonLines(files, path, schema, diagnostics)
    values.forEach((value) => sources.push({ entityType, id: value.id, path }))
    return values
  }
  const chapterRevisions = readHistory('chapter_revision', '_beta-bot/history/chapter-revisions.jsonl', bundleChapterRevisionSchema)
  const chapterActivity = readHistory('chapter_activity', '_beta-bot/history/chapter-activity.jsonl', bundleChapterActivitySchema)
  const wikiUpdates = readHistory('wiki_update', '_beta-bot/history/wiki-updates.jsonl', bundleWikiUpdateSchema)
  const reviewStatePath = '_beta-bot/review-state.jsonl'
  if (files.has(reviewStatePath)) knownFiles.add(reviewStatePath)
  const wikiReviewState = jsonLines(files, reviewStatePath, bundleWikiReviewStateSchema, diagnostics)
  wikiReviewState.forEach((value) => sources.push({
    entityType: 'wiki_review_state', id: `${value.wiki_page_id}:${value.chapter_id}`, path: reviewStatePath,
  }))

  const unknownFiles = [...files.keys()]
    .filter((path) => !knownFiles.has(path) && !path.startsWith('.github/'))
    .sort()
  unknownFiles.forEach((path) => diagnostics.push(bundleWarning('file.unknown', 'Unknown file is ignored during database import.', { path })))
  if (!manifest || !inventory || hasBundleErrors(diagnostics)) {
    return { manifest, inventory, model: null, entitySources: sources, unknownFiles, diagnostics }
  }
  const candidate = {
    format_version: manifest.format_version,
    bundle_kind: manifest.bundle_kind,
    content_mode: manifest.content_mode,
    book_ids: manifest.book_ids,
    includes: manifest.includes,
    books, parts, chapters, chapter_notes: chapterNotes, chapter_summaries: chapterSummaries,
    part_summaries: partSummaries, reviews, wiki_pages: wikiPages, book_characters: bookCharacters,
    profiles, assets, chapter_revisions: chapterRevisions, chapter_activity: chapterActivity,
    wiki_updates: wikiUpdates, wiki_review_state: wikiReviewState,
  }
  const typed = schemaValue(canonicalLibraryModelSchema, candidate, '<bundle>', diagnostics)
  return {
    manifest, inventory,
    model: typed && !hasBundleErrors(diagnostics) ? migrateLibraryBundleModel(manifest.format_version, typed) : null,
    entitySources: sources, unknownFiles, diagnostics,
  }
}
