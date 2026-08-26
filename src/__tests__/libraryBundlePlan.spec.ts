import { describe, expect, it } from 'vitest'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'
import { writeLibraryBundle } from '@/lib/libraryBundle/write'
import { readLibraryBundle } from '@/lib/libraryBundle/read'
import { validateLibraryBundle, type ValidatedLibraryBundle } from '@/lib/libraryBundle/validate'
import {
  applyIncomingInventoryOverride,
  createLibraryImportPlan,
  resolveImportConflict,
  assertImportPlanCurrent,
} from '@/lib/libraryBundle/plan'
import { applyImportPlanToModel, canonicalModelToDatabaseImport } from '@/lib/libraryBundle/apply'
import { createCanonicalLibrarySnapshot } from '@/lib/libraryBundle/snapshot'
import { chapterContentHash, semanticHash } from '@/lib/libraryBundle/semanticHash'
import { migrateLibraryBundleModel } from '@/lib/libraryBundle/migrate'

const options = { bundleId: 'bundle:test', exportedAt: '2026-08-20T15:00:00.000Z', appVersion: '1.0.0' }

async function bundle(incoming = completeCanonicalLibraryFixture()): Promise<ValidatedLibraryBundle> {
  const original = completeCanonicalLibraryFixture()
  const written = await writeLibraryBundle(original, options)
  const parsed = readLibraryBundle(written.files)
  const validated = await validateLibraryBundle(parsed, written.files)
  return { ...validated, model: incoming }
}

function chapterOperation(plan: Awaited<ReturnType<typeof createLibraryImportPlan>>) {
  return plan.operations.find((value) => value.entityType === 'chapter' && value.entityId === 'chapter-1')!
}

function emptyLocalLibrary() {
  const model = completeCanonicalLibraryFixture()
  model.book_ids = []
  for (const key of [
    'books', 'parts', 'chapters', 'chapter_notes', 'chapter_summaries', 'part_summaries',
    'reviews', 'wiki_pages', 'book_characters', 'profiles', 'assets', 'chapter_revisions',
    'chapter_activity', 'wiki_updates', 'wiki_review_state',
  ] as const) model[key] = []
  return model
}

describe('three-way library import planning', () => {
  it('creates every entity when adding a wholly absent book while preserving stable IDs', async () => {
    const plan = await createLibraryImportPlan(
      await bundle(),
      emptyLocalLibrary(),
      'generation',
      { intent: 'add-or-update-books' },
    )

    expect(plan.canApply).toBe(true)
    expect(plan.counts.create).toBe(plan.operations.length)
    expect(plan.operations.find((value) => value.entityType === 'book')).toEqual(expect.objectContaining({
      entityId: 'book-1', kind: 'create',
    }))
    expect(chapterOperation(plan).kind).toBe('create')
    expect(plan.operations.find((value) => value.entityType === 'profile')?.kind).toBe('create')

    const imported = applyImportPlanToModel(
      plan,
      emptyLocalLibrary(),
      (await bundle()).model!,
      'generation',
    )
    expect(imported.books.map((book) => book.id)).toEqual(['book-1'])
    expect(imported.assets[0].bytes).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('keeps normal three-way behavior for an already installed book in book-import mode', async () => {
    const original = completeCanonicalLibraryFixture()
    const incoming = structuredClone(original)
    incoming.chapters[0].body = 'Incoming edit'
    const plan = await createLibraryImportPlan(
      await bundle(incoming),
      structuredClone(original),
      'generation',
      { intent: 'add-or-update-books' },
    )

    expect(chapterOperation(plan).kind).toBe('update')
  })

  it('can explicitly expose edits hidden by a regenerated inventory baseline', async () => {
    const local = completeCanonicalLibraryFixture()
    const incoming = structuredClone(local)
    incoming.chapters[0].body = 'Incoming edit hidden by regenerated inventory'
    incoming.reviews = []
    const written = await writeLibraryBundle(incoming, options)
    const validated = await validateLibraryBundle(readLibraryBundle(written.files), written.files)
    const plan = await createLibraryImportPlan(validated, local, 'generation')

    expect(chapterOperation(plan).kind).toBe('keep_local')
    expect(plan.operations.find((operation) => operation.entityId === 'review-1')?.kind).toBe('keep_local')

    const overridden = applyIncomingInventoryOverride(plan)
    expect(chapterOperation(overridden).kind).toBe('update')
    expect(overridden.operations.find((operation) => operation.entityId === 'review-1')?.kind).toBe('delete')
    expect(overridden.inventoryOverrideApplied).toBe(true)
    expect(overridden.inventoryOverrideOperationCount).toBe(2)
    expect(overridden.canApply).toBe(true)

    const applied = applyImportPlanToModel(overridden, local, incoming, 'generation')
    expect(applied.chapters[0].body).toBe('Incoming edit hidden by regenerated inventory')
    expect(applied.reviews).toEqual([])
  })

  it('blocks cross-book identity collisions during a first import', async () => {
    const local = emptyLocalLibrary()
    local.book_ids = ['other-book']
    local.books = [{
      ...completeCanonicalLibraryFixture().books[0],
      id: 'other-book', title: 'Other Book', chapter_order: ['chapter-1'], part_order: [],
      cover_image_id: null,
    }]
    local.chapters = [{
      ...completeCanonicalLibraryFixture().chapters[0],
      book_id: 'other-book', part_id: null, wiki_mentions: [],
    }]
    const plan = await createLibraryImportPlan(
      await bundle(),
      local,
      'generation',
      { intent: 'add-or-update-books' },
    )

    expect(plan.canApply).toBe(false)
    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'identity.cross_book_collision', entityId: 'chapter-1' }),
    ]))
    const collision = plan.operations.find((operation) => operation.entityId === 'chapter-1')!
    expect(collision.conflictReason).toBe('cross_book_id_collision')
    expect(() => resolveImportConflict(plan, collision.key, 'use_incoming')).toThrow('cannot be resolved')
  })

  it('requires bundled image bytes when adding a new illustrated book', async () => {
    const validated = await bundle()
    validated.model!.assets[0].bytes = null
    const plan = await createLibraryImportPlan(
      validated,
      emptyLocalLibrary(),
      'generation',
      { intent: 'add-or-update-books' },
    )

    expect(plan.canApply).toBe(false)
    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset.missing_new_book_bytes', entityId: 'image-1' }),
    ]))
  })

  it('classifies unchanged, incoming-only, local-only, equal, and conflicting edits', async () => {
    const original = completeCanonicalLibraryFixture()
    expect(chapterOperation(await createLibraryImportPlan(await bundle(), structuredClone(original), 'g')).kind).toBe('unchanged')

    const incoming = structuredClone(original)
    incoming.chapters[0].body = 'Incoming edit'
    expect(chapterOperation(await createLibraryImportPlan(await bundle(incoming), structuredClone(original), 'g')).kind).toBe('update')

    const local = structuredClone(original)
    local.chapters[0].body = 'Local edit'
    expect(chapterOperation(await createLibraryImportPlan(await bundle(), local, 'g')).kind).toBe('keep_local')

    const same = structuredClone(original)
    same.chapters[0].body = 'Same edit'
    expect(chapterOperation(await createLibraryImportPlan(await bundle(same), structuredClone(same), 'g')).kind).toBe('unchanged')

    const conflict = chapterOperation(await createLibraryImportPlan(await bundle(incoming), local, 'g'))
    expect(conflict).toEqual(expect.objectContaining({ kind: 'conflict', conflictReason: 'different_edits' }))
    expect(conflict.changedFields).toContain('body')
  })

  it('handles incoming deletion, delete-versus-edit, new incoming, local-only, and duplicate-new IDs', async () => {
    const original = completeCanonicalLibraryFixture()
    const baseBundle = await bundle()
    const withoutReview = structuredClone(original)
    withoutReview.reviews = []
    const deletion = await createLibraryImportPlan({ ...baseBundle, model: withoutReview }, structuredClone(original), 'g')
    expect(deletion.operations.find((value) => value.entityType === 'review')?.kind).toBe('delete')

    const changedLocal = structuredClone(original)
    changedLocal.reviews[0].body = 'Local review edit'
    const deleteConflict = await createLibraryImportPlan({ ...baseBundle, model: withoutReview }, changedLocal, 'g')
    expect(deleteConflict.operations.find((value) => value.entityType === 'review')).toEqual(expect.objectContaining({ kind: 'conflict', conflictReason: 'delete_vs_edit' }))

    const newIncoming = structuredClone(original)
    newIncoming.reviews.push({ ...newIncoming.reviews[0], id: 'review-new' })
    const create = await createLibraryImportPlan({ ...baseBundle, model: newIncoming }, structuredClone(original), 'g')
    expect(create.operations.find((value) => value.entityId === 'review-new')?.kind).toBe('create')

    const newLocal = structuredClone(original)
    newLocal.reviews.push({ ...newLocal.reviews[0], id: 'review-local' })
    const keep = await createLibraryImportPlan(baseBundle, newLocal, 'g')
    expect(keep.operations.find((value) => value.entityId === 'review-local')?.kind).toBe('keep_local')

    const both = structuredClone(original)
    both.reviews.push({ ...both.reviews[0], id: 'review-new', body: 'local' })
    const duplicate = await createLibraryImportPlan({ ...baseBundle, model: newIncoming }, both, 'g')
    expect(duplicate.operations.find((value) => value.entityId === 'review-new')).toEqual(expect.objectContaining({ kind: 'conflict', conflictReason: 'duplicate_new_id' }))
  })

  it('treats paths as non-authoritative and never deletes selection-global profiles', async () => {
    const original = completeCanonicalLibraryFixture()
    const validated = await bundle()
    validated.manifest!.bundle_kind = 'selection'
    validated.model!.bundle_kind = 'selection'
    validated.inventory!.entities = validated.inventory!.entities.filter((value) => value.entity_type !== 'profile')
    validated.model!.profiles = []
    const plan = await createLibraryImportPlan(validated, structuredClone(original), 'g')
    expect(plan.operations.some((value) => value.entityType === 'profile')).toBe(false)
    expect(chapterOperation(plan).kind).toBe('unchanged')
  })

  it('resolves conflicts immutably and applies the selected incoming model only when current', async () => {
    const original = completeCanonicalLibraryFixture()
    const incoming = structuredClone(original)
    incoming.chapters[0].body = 'Incoming edit'
    const local = structuredClone(original)
    local.chapters[0].body = 'Local edit'
    const plan = await createLibraryImportPlan(await bundle(incoming), local, 'generation-1')
    expect(plan.canApply).toBe(false)
    const assetBytes = plan.operations.find((value) => value.entityType === 'asset')?.incomingValue as { bytes: string }
    expect(assetBytes.bytes).toBe('[3 binary bytes]')
    const key = chapterOperation(plan).key
    const resolved = resolveImportConflict(plan, key, 'use_incoming')
    expect(plan.operations.find((value) => value.key === key)?.resolution).toBeUndefined()
    expect(resolved.canApply).toBe(true)
    expect(applyImportPlanToModel(resolved, local, incoming, 'generation-1').chapters[0].body).toBe('Incoming edit')
    expect(() => applyImportPlanToModel(resolved, local, incoming, 'changed')).toThrow('library changed')
    expect(() => resolveImportConflict(resolved, 'missing', 'keep_local')).toThrow('No conflict')
    expect(() => assertImportPlanCurrent(plan, 'generation-1')).toThrow('unresolved conflicts')
  })

  it('applies text-only changes without deleting omitted history, audit data, or matching image bytes', async () => {
    const local = completeCanonicalLibraryFixture()
    const incoming = structuredClone(local)
    incoming.content_mode = 'text-only'
    incoming.includes = { image_bytes: false, history: false, audit_records: false }
    incoming.assets[0].bytes = null
    incoming.chapter_revisions = []
    incoming.chapter_activity = []
    incoming.wiki_updates = []
    incoming.wiki_review_state = []
    const written = await writeLibraryBundle(incoming, options)
    const validated = await validateLibraryBundle(readLibraryBundle(written.files), written.files)
    validated.model!.assets[0].notes = 'Updated image metadata'
    validated.model!.chapters[0].body = 'Text-only edit'
    const plan = await createLibraryImportPlan(validated, local, 'generation')
    const applied = applyImportPlanToModel(plan, local, validated.model!, 'generation')

    expect(plan.replaceEligible).toBe(false)
    expect(plan.operations.some((value) => ['chapter_revision', 'chapter_activity', 'wiki_update', 'wiki_review_state'].includes(value.entityType))).toBe(false)
    expect(applied.chapters[0].body).toBe('Text-only edit')
    expect(applied.assets[0].notes).toBe('Updated image metadata')
    expect(applied.assets[0].bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(applied.chapter_revisions).toEqual(local.chapter_revisions)
    expect(applied.wiki_review_state).toEqual(local.wiki_review_state)
  })

  it('captures all decision-support summaries in the immutable plan', async () => {
    const original = completeCanonicalLibraryFixture()
    const written = await writeLibraryBundle(original, options)
    written.files.set('draft.tmp', new TextEncoder().encode('ignored'))
    const parsed = readLibraryBundle(written.files)
    const model = parsed.model!
    model.content_mode = 'text-only'
    model.includes.image_bytes = false
    parsed.manifest!.content_mode = 'text-only'
    parsed.manifest!.includes.image_bytes = false
    model.assets[0].bytes = null
    model.reviews[0].profile_ref = 'profile:missing'
    model.wiki_pages.push({ ...model.wiki_pages[0], id: 'wiki-2', page_name: 'Alison', aliases: ['al'] })
    model.chapters[0].wiki_mentions.push({ ...model.chapters[0].wiki_mentions[0], id: 'mention-2', wiki_page_id: 'wiki-2' })
    const validated = await validateLibraryBundle(parsed, written.files)
    const local = structuredClone(original)
    local.wiki_review_state[0].chapter_content_sha256 = await chapterContentHash(local.chapters[0])
    const plan = await createLibraryImportPlan(validated, local, 'g')

    expect(plan.previewSummary.images).toEqual({ includedCount: 0, includedBytes: 0, omittedCount: 1, omittedBytes: 3 })
    expect(plan.previewSummary.wikiReview).toEqual(expect.objectContaining({ currentCount: 0 }))
    expect(plan.previewSummary.wikiReview.stale).toHaveLength(1)
    expect(plan.previewSummary.wikiReview.missing).toEqual([
      expect.objectContaining({ wikiPageTitle: 'Alison', chapterTitle: 'Opening' }),
    ])
    expect(plan.previewSummary.ambiguousAliases).toEqual([
      expect.objectContaining({ alias: 'Al', pages: expect.arrayContaining([
        expect.objectContaining({ title: 'Alice' }), expect.objectContaining({ title: 'Alison' }),
      ]) }),
    ])
    expect(plan.previewSummary.warnings.unknownProfiles[0]).toEqual(expect.objectContaining({ entityId: 'review-1' }))
    expect(plan.previewSummary.warnings.ignoredFiles[0]).toEqual(expect.objectContaining({ path: 'draft.tmp' }))
    expect(Object.isFrozen(plan.previewSummary.ambiguousAliases[0].pages)).toBe(true)
  })

  it('omits pre-existing missing wiki review state from import impact', async () => {
    const unchanged = completeCanonicalLibraryFixture()
    unchanged.wiki_review_state = []
    const written = await writeLibraryBundle(unchanged, options)
    const validated = await validateLibraryBundle(readLibraryBundle(written.files), written.files)

    const plan = await createLibraryImportPlan(validated, structuredClone(unchanged), 'g')

    expect(plan.previewSummary.wikiReview).toEqual({ currentCount: 0, stale: [], missing: [] })
  })

  it('keeps deleted wiki pages separate from surviving relinked pages that need review', async () => {
    const local = completeCanonicalLibraryFixture()
    const survivingPage = { ...local.wiki_pages[0], id: 'wiki-2', page_name: 'Dr. Cassian Vale', aliases: [] }
    local.wiki_pages.push(survivingPage)
    const incoming = structuredClone(local)
    incoming.wiki_pages = [survivingPage]
    incoming.chapters[0].wiki_mentions[0].wiki_page_id = 'wiki-2'
    incoming.book_characters[0].wiki_page_id = 'wiki-2'
    incoming.assets[0].wiki_page_ids = ['wiki-2']
    incoming.wiki_updates = []
    incoming.wiki_review_state = []

    const plan = await createLibraryImportPlan(await bundle(incoming), local, 'g')

    expect(plan.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'wiki_page', entityId: 'wiki-1', kind: 'delete', title: 'Alice' }),
    ]))
    expect(plan.previewSummary.wikiReview.missing).toEqual([
      expect.objectContaining({ wikiPageId: 'wiki-2', wikiPageTitle: 'Dr. Cassian Vale' }),
    ])
    expect(plan.previewSummary.wikiReview.missing).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ wikiPageId: 'wiki-1' }),
    ]))
  })

  it.each(['system:editorial', 'system:fanficnet', 'system:line-notes'])(
    'accepts built-in review profile reference %s without a bundled profile entity', async (profileRef) => {
      const model = completeCanonicalLibraryFixture()
      model.profiles = []
      model.reviews[0].profile_ref = profileRef
      const written = await writeLibraryBundle(model, options)
      const validated = await validateLibraryBundle(readLibraryBundle(written.files), written.files)

      expect(validated.diagnostics).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'review.unknown_profile' }),
      ]))
      const plan = await createLibraryImportPlan(validated, structuredClone(model), 'g')
      expect(plan.previewSummary.warnings.unknownProfiles).toEqual([])
    },
  )

  it('converts an applied canonical model back to a complete database contract', async () => {
    const model = completeCanonicalLibraryFixture()
    model.profiles.push({
      ...model.profiles[0], id: 'profile:ai', legacy_id: 2, profile_kind: 'system',
      description: null, tone_key: 'editorial', system_prompt: 'Review carefully.',
    })
    const data = canonicalModelToDatabaseImport(model)
    expect(data.chapters[0]).toEqual(expect.objectContaining({ text: 'Once upon a time.', word_count: 4 }))
    expect(data.image_assets[0]).toEqual(expect.objectContaining({ image_data: expect.stringContaining('data:image/png;base64,') }))
    const roundTrip = await createCanonicalLibrarySnapshot(data)
    expect(await semanticHash(roundTrip)).toBe(await semanticHash(model))
  })

  it('applies creates and deletions to the correct typed arrays', async () => {
    const original = completeCanonicalLibraryFixture()
    const incoming = structuredClone(original)
    incoming.reviews = [{ ...incoming.reviews[0], id: 'review-new' }]
    incoming.assets[0].file_name = 'renamed.png'
    const plan = await createLibraryImportPlan(await bundle(incoming), structuredClone(original), 'g')
    const applied = applyImportPlanToModel(plan, original, incoming, 'g')
    expect(applied.reviews.map((value) => value.id)).toEqual(['review-new'])
    expect(applied.assets[0].bytes).toBeInstanceOf(Uint8Array)
    expect(applied.assets[0].file_name).toBe('renamed.png')
  })

  it('keeps bundle migrations explicit and rejects unsupported versions', () => {
    const model = completeCanonicalLibraryFixture()
    expect(migrateLibraryBundleModel(1, model)).toBe(model)
    expect(() => migrateLibraryBundleModel(0, model)).toThrow('Unsupported bundle format version')
  })

  it('rejects unknown apply entity types without mutating the model', () => {
    const plan = {
      planVersion: 1 as const, bundleId: 'x', databaseGeneration: 'g', bookIds: [],
      operations: [{
        key: 'unknown\0x', entityType: 'unknown', entityId: 'x', kind: 'create' as const,
        incomingValue: { id: 'x' }, changedFields: [],
      }],
      counts: { create: 1, update: 0, delete: 0, keep_local: 0, unchanged: 0, conflict: 0 },
      countsByEntityType: { unknown: { create: 1, update: 0, delete: 0, keep_local: 0, unchanged: 0, conflict: 0 } },
      unresolvedConflicts: 0, canApply: true, replaceEligible: false, diagnostics: [],
      previewSummary: {
        images: { includedCount: 0, includedBytes: 0, omittedCount: 0, omittedBytes: 0 },
        wikiReview: { currentCount: 0, stale: [], missing: [] },
        ambiguousAliases: [], warnings: { unknownProfiles: [], ignoredFiles: [] },
      },
    }
    expect(() => applyImportPlanToModel(
      plan,
      completeCanonicalLibraryFixture(),
      completeCanonicalLibraryFixture(),
      'g',
    )).toThrow('Unsupported import entity type')
  })

  it('returns a non-applicable empty plan for structurally invalid bundles', async () => {
    const invalid: ValidatedLibraryBundle = {
      manifest: null, inventory: null, model: null, entitySources: [], unknownFiles: [],
      diagnostics: [{ severity: 'error', code: 'bad', message: 'bad' }], replaceEligible: false,
    }
    const plan = await createLibraryImportPlan(invalid, completeCanonicalLibraryFixture(), 'g')
    expect(plan).toEqual(expect.objectContaining({ bundleId: 'invalid', canApply: false, operations: [] }))
    expect(plan.previewSummary).toEqual({
      images: { includedCount: 0, includedBytes: 0, omittedCount: 0, omittedBytes: 0 },
      wikiReview: { currentCount: 0, stale: [], missing: [] },
      ambiguousAliases: [], warnings: { unknownProfiles: [], ignoredFiles: [] },
    })
  })
})
