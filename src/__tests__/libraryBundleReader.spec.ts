import { describe, expect, it } from 'vitest'
import { stringify } from 'yaml'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'
import { writeLibraryBundle } from '@/lib/libraryBundle/write'
import { readLibraryBundle } from '@/lib/libraryBundle/read'
import { validateLibraryBundle } from '@/lib/libraryBundle/validate'
import { encodeBundleText } from '@/lib/libraryBundle/fileMap'
import { chapterContentHash } from '@/lib/libraryBundle/semanticHash'

const options = { bundleId: 'bundle:test', exportedAt: '2026-08-20T15:00:00.000Z', appVersion: '1.0.0' }

async function validFiles() {
  return (await writeLibraryBundle(completeCanonicalLibraryFixture(), options)).files
}

describe('library bundle reader and validation', () => {
  it('round-trips every canonical entity and preserves exact Markdown bodies', async () => {
    const files = await validFiles()
    const parsed = readLibraryBundle(files)
    const validated = await validateLibraryBundle(parsed, files)
    expect(validated.diagnostics.filter((value) => value.severity === 'error')).toEqual([])
    expect(validated.model).toEqual(completeCanonicalLibraryFixture())
    expect(validated.replaceEligible).toBe(true)
    expect(validated.diagnostics).toContainEqual(expect.objectContaining({ code: 'review_state.stale' }))
  })

  it('reports unknown files and manifest keys without rejecting a valid bundle', async () => {
    const files = await validFiles()
    const manifest = new TextDecoder().decode(files.get('beta-bot.yaml')) + 'agent_note: hello\n'
    files.set('beta-bot.yaml', encodeBundleText(manifest))
    files.set('notes-for-humans.txt', encodeBundleText('hello'))
    const parsed = readLibraryBundle(files)
    expect(parsed.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'manifest.unknown_key', severity: 'warning' }),
      expect.objectContaining({ code: 'file.unknown', path: 'notes-for-humans.txt' }),
    ]))
    expect(parsed.model).not.toBeNull()
  })

  it('accepts standard repository documentation and GitHub workflow files as workspace scaffolding', async () => {
    const files = await validFiles()
    files.set('README.md', encodeBundleText('# Example story\n'))
    files.set('LICENSE.md', encodeBundleText('License text\n'))
    files.set('.gitignore', encodeBundleText('.DS_Store\n'))
    files.set('.github/workflows/validate.yml', encodeBundleText('name: Validate\n'))

    const parsed = readLibraryBundle(files)

    expect(parsed.unknownFiles).toEqual([])
    expect(parsed.diagnostics.map((value) => value.code)).not.toContain('file.unknown')
    expect(parsed.model).not.toBeNull()
  })

  it.each([
    ['duplicate key', 'id: one\nid: two\n', 'yaml.invalid'],
    ['alias', 'id: &id one\ntitle: *id\n', 'yaml.anchor'],
    ['merge', 'id: one\n<<: { title: hi }\n', 'yaml.merge_key'],
    ['custom tag', 'id: !thing one\n', 'yaml.custom_tag'],
    ['non-string key', '? [one, two]\n: value\n', 'yaml.non_string_key'],
  ])('rejects forbidden YAML: %s', async (_name, yaml, code) => {
    const files = await validFiles()
    const path = [...files.keys()].find((value) => value.endsWith('/book.yaml'))!
    files.set(path, encodeBundleText(yaml))
    const parsed = readLibraryBundle(files)
    expect(parsed.model).toBeNull()
    expect(parsed.diagnostics.some((value) => value.code === code || value.code === 'yaml.invalid')).toBe(true)
  })

  it('rejects malformed UTF-8, BOMs, JSON, JSONL, and Markdown frontmatter exhaustively', async () => {
    const files = await validFiles()
    const bookPath = [...files.keys()].find((value) => value.endsWith('/book.yaml'))!
    const chapterPath = [...files.keys()].find((value) => value.endsWith('/chapter.md'))!
    files.set(bookPath, new Uint8Array([0xff]))
    files.set(chapterPath, encodeBundleText('no frontmatter'))
    files.set('_beta-bot/inventory.json', encodeBundleText('{nope'))
    files.set('_beta-bot/history/wiki-updates.jsonl', encodeBundleText('\n{nope}\n'))
    files.set('profiles/bom.yaml', new Uint8Array([0xef, 0xbb, 0xbf, ...encodeBundleText('id: x')]))
    const parsed = readLibraryBundle(files)
    expect(parsed.diagnostics.map((value) => value.code)).toEqual(expect.arrayContaining([
      'text.invalid_utf8', 'markdown.frontmatter', 'json.invalid', 'jsonl.blank_line', 'jsonl.invalid', 'text.bom',
    ]))
  })

  it('reports missing entry points and an unterminated frontmatter block', async () => {
    const files = await validFiles()
    const chapterPath = [...files.keys()].find((value) => value.endsWith('/chapter.md'))!
    files.delete('beta-bot.yaml')
    files.delete('_beta-bot/inventory.json')
    files.set(chapterPath, encodeBundleText('---\nid: chapter-1\n'))
    const parsed = readLibraryBundle(files)
    expect(parsed.diagnostics.map((value) => value.code)).toEqual(expect.arrayContaining([
      'file.missing', 'inventory.missing', 'markdown.frontmatter',
    ]))
  })

  it('reports manifest/inventory mismatch, duplicate IDs, bad ordering, and broken references together', async () => {
    const files = await validFiles()
    const inventory = JSON.parse(new TextDecoder().decode(files.get('_beta-bot/inventory.json')!))
    inventory.bundle_id = 'bundle:other'
    inventory.entities.push(inventory.entities[0])
    files.set('_beta-bot/inventory.json', encodeBundleText(JSON.stringify(inventory)))
    const parsed = readLibraryBundle(files)
    expect(parsed.model).not.toBeNull()
    parsed.model!.books[0].chapter_order = ['missing', 'missing']
    parsed.model!.chapters[0].part_id = 'missing'
    parsed.model!.chapter_notes.push({ ...parsed.model!.chapter_notes[0], id: 'note-2' })
    const validated = await validateLibraryBundle(parsed, files)
    const codes = validated.diagnostics.map((value) => value.code)
    expect(codes).toEqual(expect.arrayContaining([
      'inventory.bundle_id', 'inventory.duplicate', 'order.duplicate_chapter',
      'order.unknown_chapter', 'order.missing_chapter', 'reference.part', 'cardinality.chapter_note',
    ]))
    expect(validated.replaceEligible).toBe(false)
  })

  it('warns about ambiguous aliases, unknown profiles, old timestamps, and text-only omissions', async () => {
    const files = await validFiles()
    const parsed = readLibraryBundle(files)
    const model = parsed.model!
    model.wiki_pages.push({ ...model.wiki_pages[0], id: 'wiki-2', aliases: ['al'] })
    model.reviews[0].profile_ref = 'profile:missing'
    model.reviews[0].updated_at = '2026-08-19T15:00:00.000Z'
    model.content_mode = 'text-only'
    model.includes.image_bytes = false
    parsed.manifest!.content_mode = 'text-only'
    parsed.manifest!.includes.image_bytes = false
    model.assets[0].bytes = null
    const validated = await validateLibraryBundle(parsed, files)
    expect(validated.diagnostics.map((value) => value.code)).toEqual(expect.arrayContaining([
      'wiki.ambiguous_alias', 'review.unknown_profile', 'timestamp.updated_before_created', 'asset.bytes_omitted',
    ]))
    expect(validated.replaceEligible).toBe(false)
  })

  it('requires declared history files and verifies asset length and hash', async () => {
    const files = await validFiles()
    files.delete('_beta-bot/history/chapter-activity.jsonl')
    const parsed = readLibraryBundle(files)
    parsed.model!.assets[0].byte_length = 7
    parsed.model!.assets[0].sha256 = '0'.repeat(64)
    const validated = await validateLibraryBundle(parsed, files)
    expect(validated.diagnostics.map((value) => value.code)).toEqual(expect.arrayContaining([
      'manifest.missing_declared_data', 'asset.byte_length', 'asset.sha256',
    ]))
  })

  it('reports duplicate typed entities and entities outside declared scope', async () => {
    const files = await validFiles()
    const parsed = readLibraryBundle(files)
    parsed.model!.chapter_notes.push({ ...parsed.model!.chapter_notes[0] })
    parsed.model!.parts[0].book_id = 'outside-scope'
    const validated = await validateLibraryBundle(parsed, files)
    expect(validated.diagnostics.map((value) => value.code)).toEqual(expect.arrayContaining([
      'entity.duplicate_id', 'scope.outside_bundle',
    ]))
  })

  it('allows moves by stable ID while detecting ID substitution at an inventoried path', async () => {
    const files = await validFiles()
    const parsed = readLibraryBundle(files)
    const chapter = parsed.entitySources.find((value) => value.entityType === 'chapter')!
    const review = parsed.inventory!.entities.find((value) => value.entity_type === 'review')!
    review.path = chapter.path
    const validated = await validateLibraryBundle(parsed, files)
    expect(validated.diagnostics.map((value) => value.code)).toContain('inventory.id_substitution')

    const movedFiles = await validFiles()
    const oldPath = [...movedFiles.keys()].find((value) => value.endsWith('/chapter.md'))!
    const newPath = oldPath.replace(/\/chapters\/[^/]+\//, '/chapters/renamed-parent/')
    movedFiles.set(newPath, movedFiles.get(oldPath)!)
    movedFiles.delete(oldPath)
    const moved = await validateLibraryBundle(readLibraryBundle(movedFiles), movedFiles)
    expect(moved.diagnostics.filter((value) => value.severity === 'error')).toEqual([])
  })

  it('allows records to be deleted from aggregate files while retaining their baseline inventory entries', async () => {
    const files = await validFiles()
    files.set('_beta-bot/history/wiki-updates.jsonl', encodeBundleText(''))

    const validated = await validateLibraryBundle(readLibraryBundle(files), files)

    expect(validated.diagnostics.filter((value) => value.code === 'inventory.id_substitution')).toEqual([])
    expect(validated.model?.wiki_updates).toEqual([])
  })

  it('cascades an authored wiki-page deletion through generated references', async () => {
    const files = await validFiles()
    const wikiPath = [...files.keys()].find((value) => /\/wiki\/.*\.md$/.test(value))!
    files.delete(wikiPath)

    const validated = await validateLibraryBundle(readLibraryBundle(files), files)

    expect(validated.diagnostics.filter((value) => value.severity === 'error')).toEqual([])
    expect(validated.diagnostics).toContainEqual(expect.objectContaining({
      code: 'reference.wiki_page_deletion_cascade',
      severity: 'warning',
      entityType: 'wiki_page',
      entityId: 'wiki-1',
    }))
    expect(validated.model).toMatchObject({
      wiki_pages: [],
      wiki_updates: [],
      wiki_review_state: [],
      chapters: [{ wiki_mentions: [] }],
      assets: [{ wiki_page_ids: [] }],
      book_characters: [{ wiki_page_id: null }],
    })
  })

  it('handles missing binary and review-state files and invalid UTF-8 JSONL', async () => {
    const files = await validFiles()
    const assetPath = [...files.keys()].find((value) => value.endsWith('/cover.png'))!
    files.delete(assetPath)
    files.delete('_beta-bot/review-state.jsonl')
    files.set('_beta-bot/history/chapter-activity.jsonl', new Uint8Array([0xff]))
    const parsed = readLibraryBundle(files)
    expect(parsed.model).toBeNull()
    expect(parsed.diagnostics.some((value) => value.code === 'text.invalid_utf8')).toBe(true)
  })

  it('rejects frontmatter whose YAML root is not an object', async () => {
    const files = await validFiles()
    const chapterPath = [...files.keys()].find((value) => value.endsWith('/chapter.md'))!
    files.set(chapterPath, encodeBundleText('---\n- item\n---\nbody'))
    expect(readLibraryBundle(files).model).toBeNull()
  })

  it('checks cross-book and optional references while accepting current review state', async () => {
    const files = await validFiles()
    const parsed = readLibraryBundle(files)
    const model = parsed.model!
    model.books.push({ ...model.books[0], id: 'book-2', title: 'Second', chapter_order: [], part_order: ['part-1'], cover_image_id: null })
    model.book_ids.push('book-2')
    parsed.manifest!.book_ids.push('book-2', 'book-2')
    model.parts[0].book_id = 'book-2'
    model.book_characters[0].wiki_page_id = null
    model.wiki_updates[0].chapter_id = null
    model.assets[0].chapter_id = 'chapter-1'
    model.wiki_review_state[0].chapter_content_sha256 = await chapterContentHash(model.chapters[0])
    const validated = await validateLibraryBundle(parsed, files)
    expect(validated.diagnostics.map((value) => value.code)).toEqual(expect.arrayContaining([
      'scope.duplicate_book', 'reference.part_book',
    ]))
    expect(validated.diagnostics.some((value) => value.code === 'review_state.stale')).toBe(false)
  })

  it('rejects unsupported versions and invalid manifest types before model construction', async () => {
    const files = await validFiles()
    const manifest = { format: 'beta-bot-library', format_version: 2, bundle_id: 'x' }
    files.set('beta-bot.yaml', encodeBundleText(stringify(manifest)))
    const parsed = readLibraryBundle(files)
    expect(parsed.model).toBeNull()
    expect(parsed.diagnostics.some((value) => value.code === 'schema.invalid')).toBe(true)
  })
})
