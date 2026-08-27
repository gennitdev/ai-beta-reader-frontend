<script setup lang="ts">
import { computed } from 'vue'
import type { LibraryImportPlan, ImportConflictResolution, ImportPlanOperation } from '@/lib/libraryBundle/plan'
import type { RecoveryBundleMetadata } from '@/lib/recovery/model'
import LibraryBundleFieldDiff from '@/components/LibraryBundleFieldDiff.vue'

const props = withDefaults(defineProps<{
  plan: LibraryImportPlan | null
  fileName: string
  exportedAt?: string | null
  error: string
  message: string
  isPreviewing: boolean
  isApplying: boolean
  isPreparingReplace: boolean
  isReplacing: boolean
  recoveries: readonly RecoveryBundleMetadata[]
  preparedRecovery: RecoveryBundleMetadata | null
  replaceRemovalCounts: { books: number; chapters: number; wikiPages: number }
  heading?: string
  description?: string
  applyLabel?: string
  showReplace?: boolean
  showRecoveries?: boolean
  embedded?: boolean
}>(), {
  heading: 'Import a Library Bundle',
  description: 'Preview a Beta Bot ZIP with three-way conflict detection. Nothing changes until you confirm the immutable plan.',
  applyLabel: 'Apply changes',
  showReplace: true,
  showRecoveries: true,
  embedded: false,
})

const emit = defineEmits<{
  select: [file: File]
  selectDirectory: [files: File[]]
  resolve: [key: string, resolution: ImportConflictResolution]
  overrideInventory: []
  apply: []
  prepareReplace: []
  replace: []
  previewRecovery: [id: string]
  downloadRecovery: [id: string]
}>()

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('select', file)
  input.value = ''
}

function selectDirectory(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  if (files.length) emit('selectDirectory', files)
  input.value = ''
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toLocaleString()} bytes`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = units[0]
  for (let index = 1; value >= 1024 && index < units.length; index++) {
    value /= 1024
    unit = units[index]
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

function formatExportedAt(value: string): string {
  return new Date(value).toLocaleString()
}

const MAX_VISIBLE_IGNORED_FILES = 20
const MAX_VISIBLE_REVIEW_WARNINGS = 20
const MAX_VISIBLE_UNKNOWN_PROFILES = 20
const visibleIgnoredFiles = computed(() => props.plan?.previewSummary.warnings.ignoredFiles
  .slice(0, MAX_VISIBLE_IGNORED_FILES) ?? [])
const hiddenIgnoredFileCount = computed(() => Math.max(
  0,
  (props.plan?.previewSummary.warnings.ignoredFiles.length ?? 0) - MAX_VISIBLE_IGNORED_FILES,
))
const visibleWikiReviewWarnings = computed(() => [
  ...(props.plan?.previewSummary.wikiReview.stale ?? []).map((item) => ({ kind: 'Stale', item })),
  ...(props.plan?.previewSummary.wikiReview.missing ?? []).map((item) => ({ kind: 'Missing', item })),
].slice(0, MAX_VISIBLE_REVIEW_WARNINGS))
const hiddenWikiReviewWarningCount = computed(() => Math.max(
  0,
  (props.plan?.previewSummary.wikiReview.stale.length ?? 0)
    + (props.plan?.previewSummary.wikiReview.missing.length ?? 0)
    - MAX_VISIBLE_REVIEW_WARNINGS,
))
const deletedWikiPages = computed(() => props.plan?.operations.filter((operation) =>
  operation.entityType === 'wiki_page' && (operation.kind === 'delete'
    || operation.kind === 'conflict' && operation.resolution === 'use_incoming' && !operation.incomingHash)) ?? [])
const visibleUnknownProfiles = computed(() => props.plan?.previewSummary.warnings.unknownProfiles
  .slice(0, MAX_VISIBLE_UNKNOWN_PROFILES) ?? [])
const hiddenUnknownProfileCount = computed(() => Math.max(
  0,
  (props.plan?.previewSummary.warnings.unknownProfiles.length ?? 0) - MAX_VISIBLE_UNKNOWN_PROFILES,
))
const hasApplicableChanges = computed(() => props.plan?.operations.some((operation) =>
  operation.kind === 'create' || operation.kind === 'update' || operation.kind === 'delete'
    || operation.kind === 'conflict' && operation.resolution === 'use_incoming',
) ?? false)

const dedicatedDiagnosticCodes = new Set([
  'asset.bytes_omitted', 'review_state.stale', 'wiki.ambiguous_alias', 'review.unknown_profile', 'file.unknown',
])

const otherDiagnostics = computed(() => props.plan?.diagnostics
  .filter((diagnostic) => !dedicatedDiagnosticCodes.has(diagnostic.code)) ?? [])

interface OperationTypeGroup {
  entityType: string
  operations: ImportPlanOperation[]
}

interface OperationBookGroup {
  bookId: string
  title: string
  entityTypes: OperationTypeGroup[]
}

const MAX_VISIBLE_NON_CONFLICT_OPERATIONS = 100
const visibleOperations = computed(() => {
  const changed = props.plan?.operations.filter((operation) =>
    operation.kind !== 'unchanged' && operation.kind !== 'keep_local') ?? []
  const conflicts = changed.filter((operation) => operation.kind === 'conflict')
  const nonConflicts = changed.filter((operation) => operation.kind !== 'conflict')
    .slice(0, MAX_VISIBLE_NON_CONFLICT_OPERATIONS)
  return [...conflicts, ...nonConflicts]
})
const hiddenOperationCount = computed(() => Math.max(
  0,
  (props.plan?.operations.filter((operation) =>
    operation.kind !== 'unchanged' && operation.kind !== 'keep_local' && operation.kind !== 'conflict').length ?? 0)
    - MAX_VISIBLE_NON_CONFLICT_OPERATIONS,
))

const operationGroups = computed<OperationBookGroup[]>(() => {
  if (!props.plan) return []
  const bookTitles = new Map(visibleOperations.value
    .filter((operation) => operation.bookId)
    .map((operation) => [operation.bookId!, operation.bookTitle ?? operation.bookId!]))
  const groups = new Map<string, Map<string, ImportPlanOperation[]>>()
  for (const operation of visibleOperations.value) {
    const bookId = operation.bookId ?? 'library-wide'
    const byType = groups.get(bookId) ?? new Map<string, ImportPlanOperation[]>()
    const operations = byType.get(operation.entityType) ?? []
    operations.push(operation)
    byType.set(operation.entityType, operations)
    groups.set(bookId, byType)
  }
  return [...groups.entries()].map(([bookId, byType]) => ({
    bookId,
    title: bookId === 'library-wide' ? 'Library-wide' : (bookTitles.get(bookId) ?? `Book ${bookId}`),
    entityTypes: [...byType.entries()].map(([entityType, operations]) => ({ entityType, operations })),
  }))
})
</script>

<template>
  <div
    class="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-navy-800"
    :class="{ 'mt-8': !embedded }"
  >
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ heading }}</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
        {{ description }}
      </p>
    </div>
    <div class="px-6 py-4 space-y-4">
      <label class="inline-flex cursor-pointer items-center rounded-lg bg-navy-700 px-4 py-2 text-sm font-medium text-white hover:bg-navy-600">
        {{ isPreviewing ? 'Reading bundle…' : 'Choose bundle ZIP' }}
        <input class="sr-only" type="file" accept=".zip,application/zip" :disabled="isPreviewing || isApplying || isPreparingReplace || isReplacing" @change="selectFile">
      </label>
      <label class="ml-2 inline-flex cursor-pointer items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-navy-700">
        Choose bundle folder
        <input class="sr-only" type="file" webkitdirectory multiple :disabled="isPreviewing || isApplying || isPreparingReplace || isReplacing" @change="selectDirectory">
      </label>
      <span v-if="fileName" class="ml-3 text-sm text-gray-600 dark:text-gray-300">{{ fileName }}</span>
      <p v-if="exportedAt" class="text-xs text-gray-500 dark:text-gray-400">
        Bundle exported {{ formatExportedAt(exportedAt) }}
      </p>

      <div v-if="error" class="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 whitespace-pre-wrap">{{ error }}</div>
      <div v-if="message" class="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">{{ message }}</div>

      <template v-if="plan">
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <div v-for="kind in ['create', 'update', 'delete', 'keep_local', 'unchanged', 'conflict'] as const" :key="kind" class="rounded bg-gray-50 p-2 dark:bg-navy-900">
            <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ plan.counts[kind] }}</div>
            <div class="text-xs capitalize text-gray-500 dark:text-gray-400">{{ kind.replace('_', ' ') }}</div>
          </div>
        </div>
        <div v-if="Object.keys(plan.countsByEntityType).length" class="overflow-x-auto">
          <table class="w-full text-left text-xs text-gray-600 dark:text-gray-300">
            <thead><tr><th class="py-1">Entity type</th><th>Create</th><th>Update</th><th>Delete</th><th>Conflict</th></tr></thead>
            <tbody>
              <tr v-for="(counts, entityType) in plan.countsByEntityType" :key="entityType" class="border-t border-gray-100 dark:border-gray-700">
                <td class="py-1">{{ entityType }}</td><td>{{ counts.create }}</td><td>{{ counts.update }}</td><td>{{ counts.delete }}</td><td>{{ counts.conflict }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="plan.canApply && !hasApplicableChanges" class="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
          No incoming changes were detected. Your local content will be kept, so there is nothing to apply.
        </div>
        <div v-if="plan.counts.keep_local && !plan.inventoryOverrideApplied" class="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <strong>{{ plan.counts.keep_local }} difference(s) are classified “keep local.”</strong>
          The incoming values match the inventory baseline, which normally means they were changed locally after export. If the inventory was regenerated after editing this bundle, those edits are hidden by the new baseline.
          <div class="mt-3">
            <button class="rounded border border-amber-500 px-3 py-1.5 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40" :disabled="isApplying || isPreparingReplace || isReplacing" @click="emit('overrideInventory')">
              Review keep-local differences as incoming
            </button>
          </div>
        </div>
        <div v-else-if="plan.inventoryOverrideApplied" class="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          Inventory baseline override is active for {{ plan.inventoryOverrideOperationCount }} difference(s). These are now shown as incoming updates or deletions; review them carefully before applying.
        </div>

        <section aria-labelledby="image-impact-heading" class="rounded border border-gray-200 p-3 dark:border-gray-700">
          <h3 id="image-impact-heading" class="text-sm font-semibold text-gray-900 dark:text-white">Image impact</h3>
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <div class="rounded bg-gray-50 p-2 text-sm dark:bg-navy-900">
              <strong>{{ formatBytes(plan.previewSummary.images.includedBytes) }}</strong>
              included across {{ plan.previewSummary.images.includedCount }} image(s)
            </div>
            <div class="rounded bg-gray-50 p-2 text-sm dark:bg-navy-900">
              <strong>{{ formatBytes(plan.previewSummary.images.omittedBytes) }}</strong>
              omitted across {{ plan.previewSummary.images.omittedCount }} image(s)
            </div>
          </div>
        </section>

        <section aria-labelledby="wiki-review-heading" class="rounded border border-gray-200 p-3 dark:border-gray-700">
          <h3 id="wiki-review-heading" class="text-sm font-semibold text-gray-900 dark:text-white">Wiki impact</h3>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {{ formatCount(deletedWikiPages.length, 'page') }} deleted ·
            {{ formatCount(plan.previewSummary.wikiReview.currentCount, 'review') }} current ·
            {{ plan.previewSummary.wikiReview.stale.length }} stale ·
            {{ formatCount(plan.previewSummary.wikiReview.missing.length, 'link') }} {{ plan.previewSummary.wikiReview.missing.length === 1 ? 'needs' : 'need' }} review
          </p>
          <p v-if="deletedWikiPages.length" class="mt-2 text-xs text-gray-600 dark:text-gray-300">
            Deleted pages are included as normal delete operations below. Review notices refer only to surviving pages that are newly linked to chapters.
          </p>
          <div v-if="plan.previewSummary.wikiReview.stale.length || plan.previewSummary.wikiReview.missing.length" class="mt-2 space-y-2 text-xs">
            <div v-for="warning in visibleWikiReviewWarnings" :key="`${warning.kind}-${warning.item.entityId}`" class="rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>{{ warning.kind === 'Missing' ? 'Needs review' : warning.kind }}:</strong> {{ warning.item.wikiPageTitle }} for {{ warning.item.chapterTitle }}<template v-if="warning.item.path"> · {{ warning.item.path }}</template>
              <div v-if="warning.kind === 'Missing'" class="mt-1 opacity-80">This surviving wiki page has a new or changed chapter link without a review record; the page itself is not missing.</div>
            </div>
            <p v-if="hiddenWikiReviewWarningCount" class="text-xs text-amber-800 dark:text-amber-200">
              {{ hiddenWikiReviewWarningCount }} additional wiki review notice(s) are not shown.
            </p>
          </div>
          <p v-else class="mt-2 text-xs text-gray-500 dark:text-gray-400">No wiki links need review.</p>
        </section>

        <section aria-labelledby="alias-heading" class="rounded border border-gray-200 p-3 dark:border-gray-700">
          <h3 id="alias-heading" class="text-sm font-semibold text-gray-900 dark:text-white">Ambiguous wiki aliases</h3>
          <div v-if="plan.previewSummary.ambiguousAliases.length" class="mt-2 space-y-2">
            <div v-for="item in plan.previewSummary.ambiguousAliases" :key="item.alias" class="rounded bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>“{{ item.alias }}”</strong> is shared by
              {{ item.pages.map(page => page.title || page.entityId).join(', ') }}.
              <div class="mt-1 text-xs opacity-80">{{ item.pages.map(page => page.path || page.entityId).join(' · ') }}</div>
            </div>
          </div>
          <p v-else class="mt-2 text-xs text-gray-500 dark:text-gray-400">No ambiguous aliases.</p>
        </section>

        <section aria-labelledby="content-warnings-heading" class="rounded border border-gray-200 p-3 dark:border-gray-700">
          <h3 id="content-warnings-heading" class="text-sm font-semibold text-gray-900 dark:text-white">Content warnings</h3>
          <div v-if="plan.previewSummary.warnings.unknownProfiles.length || plan.previewSummary.warnings.ignoredFiles.length" class="mt-2 space-y-2 text-sm">
            <div v-for="warning in visibleUnknownProfiles" :key="`profile-${warning.entityId}`" class="rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>Unknown review profile:</strong> {{ warning.title || warning.entityId }}<template v-if="warning.path"> · {{ warning.path }}</template>
              <div class="text-xs">{{ warning.message }}</div>
            </div>
            <p v-if="hiddenUnknownProfileCount" class="text-xs text-amber-800 dark:text-amber-200">
              {{ hiddenUnknownProfileCount }} additional unknown profile warning(s) are not shown.
            </p>
            <div v-for="warning in visibleIgnoredFiles" :key="`file-${warning.entityId}`" class="rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <strong>Ignored file:</strong> {{ warning.path || warning.entityId }}
              <div class="text-xs">{{ warning.message }}</div>
            </div>
            <p v-if="hiddenIgnoredFileCount" class="text-xs text-amber-800 dark:text-amber-200">
              {{ hiddenIgnoredFileCount }} additional ignored file(s) are not shown.
            </p>
          </div>
          <p v-else class="mt-2 text-xs text-gray-500 dark:text-gray-400">No unknown profiles or ignored files.</p>
        </section>

        <div v-if="otherDiagnostics.length" class="space-y-1">
          <div v-for="(diagnostic, index) in otherDiagnostics" :key="`${diagnostic.code}-${index}`" class="text-sm" :class="diagnostic.severity === 'error' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'">
            <strong>{{ diagnostic.severity === 'error' ? 'Error' : 'Warning' }}:</strong>
            {{ diagnostic.path ? `${diagnostic.path}: ` : '' }}{{ diagnostic.message }}
          </div>
        </div>

        <div v-if="operationGroups.length" class="max-h-96 space-y-3 overflow-auto" aria-label="Planned entity changes">
          <details v-for="bookGroup in operationGroups" :key="bookGroup.bookId" open class="rounded border border-gray-200 p-3 dark:border-gray-700">
            <summary class="cursor-pointer text-sm font-semibold text-gray-900 dark:text-white">{{ bookGroup.title }}</summary>
            <section v-for="typeGroup in bookGroup.entityTypes" :key="typeGroup.entityType" class="mt-3 border-t border-gray-100 pt-2 dark:border-gray-700">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ typeGroup.entityType.replaceAll('_', ' ') }}</h4>
              <div v-for="operation in typeGroup.operations" :key="operation.key" class="mt-2 rounded border border-gray-200 p-3 dark:border-gray-700">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-gray-900 dark:text-white">{{ operation.title || operation.entityId }}</div>
                    <div class="text-xs text-gray-500">{{ operation.entityType }} · {{ operation.kind.replace('_', ' ') }}<template v-if="operation.path"> · {{ operation.path }}</template></div>
                    <div v-if="operation.changedFields.length" class="mt-1 text-xs text-gray-500">Changed: {{ operation.changedFields.join(', ') }}</div>
                    <details v-if="operation.changedFields.length" class="mt-2 text-xs">
                      <summary class="cursor-pointer text-gray-600 dark:text-gray-300">Show field differences</summary>
                      <LibraryBundleFieldDiff
                        v-for="field in operation.changedFields"
                        :key="field"
                        :field="field"
                        :local-value="(operation.localValue as Record<string, unknown> | undefined)?.[field]"
                        :incoming-value="(operation.incomingValue as Record<string, unknown> | undefined)?.[field]"
                      />
                    </details>
                  </div>
                  <div v-if="operation.kind === 'conflict' && operation.conflictReason !== 'cross_book_id_collision'" class="flex gap-2">
                    <button class="rounded px-2 py-1 text-xs" :class="operation.resolution === 'keep_local' ? 'bg-navy-700 text-white' : 'bg-gray-100 dark:bg-gray-700'" @click="emit('resolve', operation.key, 'keep_local')">Keep local</button>
                    <button class="rounded px-2 py-1 text-xs" :class="operation.resolution === 'use_incoming' ? 'bg-green-700 text-white' : 'bg-gray-100 dark:bg-gray-700'" @click="emit('resolve', operation.key, 'use_incoming')">Use incoming</button>
                  </div>
                </div>
              </div>
            </section>
          </details>
        </div>
        <p v-if="hiddenOperationCount" class="text-xs text-gray-500 dark:text-gray-400">
          {{ hiddenOperationCount }} additional non-conflict operation(s) are not shown.
        </p>

        <div class="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button class="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="!plan.canApply || !hasApplicableChanges || isApplying || isPreparingReplace || isReplacing" @click="emit('apply')">
            {{ isApplying ? 'Applying…' : applyLabel }}
          </button>
          <template v-if="showReplace">
            <button
              v-if="!preparedRecovery"
              class="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-300"
              :disabled="!plan.replaceEligible || isPreparingReplace || isApplying || isPreviewing"
              :title="plan.replaceEligible ? 'Create and verify a recovery before confirmation' : 'Only a complete, validated full-library bundle can replace the library'"
              @click="emit('prepareReplace')"
            >
              {{ isPreparingReplace ? 'Verifying recovery…' : 'Prepare Replace library' }}
            </button>
            <button
              v-else
              class="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="isReplacing || isApplying || isPreviewing"
              @click="emit('replace')"
            >
              {{ isReplacing ? 'Replacing…' : 'Confirm Replace library' }}
            </button>
          </template>
          <span v-if="plan.unresolvedConflicts" class="text-xs text-amber-700 dark:text-amber-300">Resolve {{ plan.unresolvedConflicts }} conflict(s) before applying.</span>
        </div>
        <div v-if="showReplace && preparedRecovery" class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          Recovery {{ preparedRecovery.id }} was written and SHA-256 verified outside the main database.
          Replacing will remove {{ replaceRemovalCounts.books }} book(s), {{ replaceRemovalCounts.chapters }} chapter(s), and {{ replaceRemovalCounts.wikiPages }} wiki page(s) absent from this bundle.
        </div>
      </template>

      <div v-if="showRecoveries && recoveries.length" class="border-t border-gray-200 pt-4 dark:border-gray-700">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Verified recovery bundles</h3>
        <div class="mt-2 space-y-2">
          <div v-for="recovery in recoveries" :key="recovery.id" class="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 p-3 dark:border-gray-700">
            <div class="text-xs text-gray-600 dark:text-gray-300">
              <div class="font-medium">{{ new Date(recovery.createdAt).toLocaleString() }}</div>
              <div>{{ recovery.appVersion }} · {{ recovery.byteLength.toLocaleString() }} bytes · {{ recovery.sourceOperation }}</div>
            </div>
            <div class="flex gap-2">
              <button class="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-gray-600" :disabled="isPreviewing || isApplying || isPreparingReplace || isReplacing" @click="emit('previewRecovery', recovery.id)">Restore…</button>
              <button class="rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-gray-600" :disabled="isPreviewing || isApplying || isPreparingReplace || isReplacing" @click="emit('downloadRecovery', recovery.id)">Download</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
