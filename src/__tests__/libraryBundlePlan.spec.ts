import { describe, expect, it } from 'vitest'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'
import { writeLibraryBundle } from '@/lib/libraryBundle/write'
import { readLibraryBundle } from '@/lib/libraryBundle/read'
import { validateLibraryBundle, type ValidatedLibraryBundle } from '@/lib/libraryBundle/validate'
import { createLibraryImportPlan, resolveImportConflict, assertImportPlanCurrent } from '@/lib/libraryBundle/plan'
import { applyImportPlanToModel, canonicalModelToDatabaseImport } from '@/lib/libraryBundle/apply'
import { createCanonicalLibrarySnapshot } from '@/lib/libraryBundle/snapshot'
import { semanticHash } from '@/lib/libraryBundle/semanticHash'
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

describe('three-way library import planning', () => {
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
    const assetBytes = plan.operations.find((value) => value.entityType === 'asset')?.incomingValue as { bytes: number[] }
    expect(Object.isFrozen(assetBytes.bytes)).toBe(true)
    const key = chapterOperation(plan).key
    const resolved = resolveImportConflict(plan, key, 'use_incoming')
    expect(plan.operations.find((value) => value.key === key)?.resolution).toBeUndefined()
    expect(resolved.canApply).toBe(true)
    expect(applyImportPlanToModel(resolved, local, 'generation-1').chapters[0].body).toBe('Incoming edit')
    expect(() => applyImportPlanToModel(resolved, local, 'changed')).toThrow('library changed')
    expect(() => resolveImportConflict(resolved, 'missing', 'keep_local')).toThrow('No conflict')
    expect(() => assertImportPlanCurrent(plan, 'generation-1')).toThrow('unresolved conflicts')
  })

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
    const applied = applyImportPlanToModel(plan, original, 'g')
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
    }
    expect(() => applyImportPlanToModel(plan, completeCanonicalLibraryFixture(), 'g')).toThrow('Unsupported import entity type')
  })

  it('returns a non-applicable empty plan for structurally invalid bundles', async () => {
    const invalid: ValidatedLibraryBundle = {
      manifest: null, inventory: null, model: null, entitySources: [], unknownFiles: [],
      diagnostics: [{ severity: 'error', code: 'bad', message: 'bad' }], replaceEligible: false,
    }
    const plan = await createLibraryImportPlan(invalid, completeCanonicalLibraryFixture(), 'g')
    expect(plan).toEqual(expect.objectContaining({ bundleId: 'invalid', canApply: false, operations: [] }))
  })
})
