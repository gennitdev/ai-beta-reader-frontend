#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createFullLibraryBundleExport } from '../../src/lib/libraryBundle/export'
import { readBundleZip } from '../../src/lib/libraryBundle/adapters/zip'
import { readLibraryBundle } from '../../src/lib/libraryBundle/read'
import { validateLibraryBundle } from '../../src/lib/libraryBundle/validate'
import { previewBundleZipImport } from '../../src/lib/libraryBundle/importPreview'
import { applyImportPlanToModel, canonicalModelToDatabaseImport } from '../../src/lib/libraryBundle/apply'
import type { LibraryImportPlan } from '../../src/lib/libraryBundle/plan'
import { sha256Hex } from '../../src/lib/libraryBundle/semanticHash'
import type { RecoveryStore, StoredRecoveryBundle } from '../../src/lib/recovery/model'
import { prepareLibraryReplacement, replaceLibraryWithRecovery } from '../../src/lib/recovery/replacement'
import {
  BUNDLE_STRESS_SCALES,
  generateBundleStressFixture,
  type BundleStressScaleName,
} from './libraryBundleFixture'

interface PhaseMetric {
  name: string
  durationMs: number
  rssMiB: number
  heapUsedMiB: number
  maxRssMiB: number
}

const DEFAULT_SEED = 132_202_608
const DEFAULT_OUTPUT = 'artifacts/bundle-stress.json'
const PHASE_LIMIT_MS = 30_000
const TOTAL_LIMIT_MS = 150_000
const RSS_LIMIT_MIB = 1_280

function argument(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

function mib(bytes: number): number {
  return Math.round(bytes / 1024 / 1024 * 10) / 10
}

async function measure<T>(name: string, action: () => Promise<T> | T): Promise<{ metric: PhaseMetric; value: T }> {
  const started = performance.now()
  const value = await action()
  const memory = process.memoryUsage()
  return {
    value,
    metric: {
      name,
      durationMs: Math.round((performance.now() - started) * 10) / 10,
      rssMiB: mib(memory.rss),
      heapUsedMiB: mib(memory.heapUsed),
      maxRssMiB: Math.round(process.resourceUsage().maxRSS / 1024 * 10) / 10,
    },
  }
}

function memoryStore(): RecoveryStore {
  const values = new Map<string, StoredRecoveryBundle>()
  return {
    async write(bundle) { values.set(bundle.metadata.id, structuredClone(bundle)) },
    async read(id) { return structuredClone(values.get(id) ?? null) },
    async list() { return [...values.values()].map((value) => value.metadata) },
    async delete(id) { values.delete(id) },
  }
}

function databaseBytes(model: Parameters<typeof canonicalModelToDatabaseImport>[0]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(canonicalModelToDatabaseImport(model)))
}

const scaleName = (argument('scale') ?? 'smoke') as BundleStressScaleName
if (!(scaleName in BUNDLE_STRESS_SCALES)) throw new Error(`Unknown scale ${scaleName}.`)
const seed = Number(argument('seed') ?? DEFAULT_SEED)
if (!Number.isSafeInteger(seed)) throw new Error('The benchmark seed must be a safe integer.')
const outputPath = resolve(argument('output') ?? DEFAULT_OUTPUT)
const enforce = process.argv.includes('--enforce')
const startedAt = new Date().toISOString()
const metrics: PhaseMetric[] = []

const setup = await measure('fixture', () => generateBundleStressFixture(scaleName, seed))
metrics.push(setup.metric)
const fixture = setup.value
const currentDatabaseBackup = databaseBytes(fixture.model)
const databaseGeneration = await sha256Hex(currentDatabaseBackup)

const exported = await measure('export', () => createFullLibraryBundleExport(currentDatabaseBackup, {
  bundleId: `bundle:stress:${scaleName}:${seed}`,
  exportedAt: '2026-08-22T12:00:00.000Z',
  appVersion: 'benchmark',
}))
metrics.push(exported.metric)

const validated = await measure('validation', async () => {
  const transport = await readBundleZip(exported.value.zipBytes)
  if (!transport.files) throw new Error('Stress ZIP transport failed validation.')
  const result = await validateLibraryBundle(readLibraryBundle(transport.files), transport.files)
  if (!result.model || result.diagnostics.some((value) => value.severity === 'error')) {
    throw new Error('Generated stress bundle failed canonical validation.')
  }
  return result
})
metrics.push(validated.metric)
if (validated.value.entitySources.length !== fixture.entityCount) {
  throw new Error(`Validation found ${validated.value.entitySources.length} of ${fixture.entityCount} generated entities.`)
}

const previewed = await measure('preview', () => previewBundleZipImport(
  exported.value.zipBytes,
  currentDatabaseBackup,
))
metrics.push(previewed.metric)
if (!previewed.value.plan.canApply || !previewed.value.plan.replaceEligible) {
  throw new Error('Generated stress preview was not applicable and Replace-eligible.')
}

// Exercise the update path for every typed entity. A normal unchanged preview still
// pays the whole-model cloning cost, but would not expose per-operation lookup growth.
const updatePlan: LibraryImportPlan = {
  ...previewed.value.plan,
  operations: previewed.value.plan.operations.map((operation) => ({
    ...operation,
    kind: operation.incomingValue === undefined ? operation.kind : 'update',
  })),
  canApply: true,
}
const applied = await measure('apply', () => applyImportPlanToModel(
  updatePlan,
  previewed.value.localModel,
  databaseGeneration,
))
metrics.push(applied.metric)
if (applied.value.chapters.length !== fixture.model.chapters.length) {
  throw new Error('Apply changed the generated chapter count.')
}

const replace = await measure('replace', async () => {
  const store = memoryStore()
  const recovery = await prepareLibraryReplacement(
    store,
    previewed.value.plan,
    previewed.value.localModel,
    databaseGeneration,
    {
      recoveryId: 'stress-recovery', recoveryBundleId: 'bundle:stress:recovery',
      createdAt: '2026-08-22T12:00:00.000Z', appVersion: 'benchmark',
    },
  )
  let importedBytes = 0
  await replaceLibraryWithRecovery(
    store, previewed.value.plan, previewed.value.incomingModel, recovery,
    databaseGeneration, async (bytes) => { importedBytes = bytes.byteLength },
  )
  if (!importedBytes) throw new Error('Replace did not produce a database import.')
  return { recoveryBytes: recovery.byteLength, importedBytes }
})
metrics.push(replace.metric)

const measuredPhases = metrics.filter((metric) => metric.name !== 'fixture')
const totalDurationMs = Math.round(measuredPhases.reduce((sum, metric) => sum + metric.durationMs, 0) * 10) / 10
const violations = enforce ? [
  ...measuredPhases.filter((metric) => metric.durationMs > PHASE_LIMIT_MS)
    .map((metric) => `${metric.name} took ${metric.durationMs}ms (limit ${PHASE_LIMIT_MS}ms)`),
  ...(totalDurationMs > TOTAL_LIMIT_MS ? [`measured phases took ${totalDurationMs}ms (limit ${TOTAL_LIMIT_MS}ms)`] : []),
  ...(Math.max(...metrics.map((metric) => metric.maxRssMiB)) > RSS_LIMIT_MIB
    ? [`process peak RSS exceeded ${RSS_LIMIT_MIB} MiB`] : []),
] : []

const report = {
  schemaVersion: 1,
  startedAt,
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  fixture: {
    scale: scaleName, seed, config: BUNDLE_STRESS_SCALES[scaleName],
    entities: fixture.entityCount, files: exported.value.files.size,
    databaseBytes: currentDatabaseBackup.byteLength, zipBytes: exported.value.zipBytes.byteLength,
    binaryBytes: fixture.binaryBytes,
  },
  thresholds: enforce ? {
    phaseDurationMs: PHASE_LIMIT_MS, totalDurationMs: TOTAL_LIMIT_MS, maxRssMiB: RSS_LIMIT_MIB,
  } : null,
  totalDurationMs,
  phases: metrics,
  replace: replace.value,
  violations,
}
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)

console.table(metrics.map(({ name, durationMs, maxRssMiB }) => ({ phase: name, durationMs, maxRssMiB })))
console.log(`Fixture: ${fixture.entityCount} entities, ${exported.value.files.size} files, ${mib(exported.value.zipBytes.byteLength)} MiB ZIP`)
console.log(`Report: ${outputPath}`)
if (violations.length) {
  violations.forEach((violation) => console.error(`Threshold violation: ${violation}`))
  process.exitCode = 1
}
