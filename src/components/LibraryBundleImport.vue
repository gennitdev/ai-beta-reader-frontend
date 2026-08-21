<script setup lang="ts">
import type { LibraryImportPlan, ImportConflictResolution } from '@/lib/libraryBundle/plan'

defineProps<{
  plan: LibraryImportPlan | null
  fileName: string
  error: string
  message: string
  isPreviewing: boolean
  isApplying: boolean
}>()

const emit = defineEmits<{
  select: [file: File]
  selectDirectory: [files: File[]]
  resolve: [key: string, resolution: ImportConflictResolution]
  apply: []
}>()

function selectFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('select', file)
}

function selectDirectory(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])]
  if (files.length) emit('selectDirectory', files)
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2) ?? 'absent'
}
</script>

<template>
  <div class="bg-white dark:bg-navy-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mt-8">
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Import a Library Bundle</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
        Preview a Beta Bot ZIP with three-way conflict detection. Nothing changes until you confirm the immutable plan.
      </p>
    </div>
    <div class="px-6 py-4 space-y-4">
      <label class="inline-flex cursor-pointer items-center rounded-lg bg-navy-700 px-4 py-2 text-sm font-medium text-white hover:bg-navy-600">
        {{ isPreviewing ? 'Reading bundle…' : 'Choose bundle ZIP' }}
        <input class="sr-only" type="file" accept=".zip,application/zip" :disabled="isPreviewing || isApplying" @change="selectFile">
      </label>
      <label class="ml-2 inline-flex cursor-pointer items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-navy-700">
        Choose bundle folder
        <input class="sr-only" type="file" webkitdirectory multiple :disabled="isPreviewing || isApplying" @change="selectDirectory">
      </label>
      <span v-if="fileName" class="ml-3 text-sm text-gray-600 dark:text-gray-300">{{ fileName }}</span>

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

        <div v-if="plan.diagnostics.length" class="space-y-1">
          <div v-for="(diagnostic, index) in plan.diagnostics" :key="`${diagnostic.code}-${index}`" class="text-sm" :class="diagnostic.severity === 'error' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'">
            <strong>{{ diagnostic.severity === 'error' ? 'Error' : 'Warning' }}:</strong>
            {{ diagnostic.path ? `${diagnostic.path}: ` : '' }}{{ diagnostic.message }}
          </div>
        </div>

        <div v-if="plan.operations.some(operation => operation.kind !== 'unchanged')" class="max-h-80 space-y-2 overflow-auto">
          <div v-for="operation in plan.operations.filter(value => value.kind !== 'unchanged')" :key="operation.key" class="rounded border border-gray-200 p-3 dark:border-gray-700">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div class="text-sm font-medium text-gray-900 dark:text-white">{{ operation.title || operation.entityId }}</div>
                <div class="text-xs text-gray-500">{{ operation.entityType }} · {{ operation.kind.replace('_', ' ') }}<template v-if="operation.path"> · {{ operation.path }}</template></div>
                <div v-if="operation.changedFields.length" class="mt-1 text-xs text-gray-500">Changed: {{ operation.changedFields.join(', ') }}</div>
                <details v-if="operation.changedFields.length" class="mt-2 text-xs">
                  <summary class="cursor-pointer text-gray-600 dark:text-gray-300">Show field differences</summary>
                  <div v-for="field in operation.changedFields" :key="field" class="mt-2 grid gap-2 sm:grid-cols-2">
                    <div><strong>Local {{ field }}</strong><pre class="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2 dark:bg-navy-900">{{ formatValue((operation.localValue as Record<string, unknown> | undefined)?.[field]) }}</pre></div>
                    <div><strong>Incoming {{ field }}</strong><pre class="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-2 dark:bg-navy-900">{{ formatValue((operation.incomingValue as Record<string, unknown> | undefined)?.[field]) }}</pre></div>
                  </div>
                </details>
              </div>
              <div v-if="operation.kind === 'conflict'" class="flex gap-2">
                <button class="rounded px-2 py-1 text-xs" :class="operation.resolution === 'keep_local' ? 'bg-navy-700 text-white' : 'bg-gray-100 dark:bg-gray-700'" @click="emit('resolve', operation.key, 'keep_local')">Keep local</button>
                <button class="rounded px-2 py-1 text-xs" :class="operation.resolution === 'use_incoming' ? 'bg-green-700 text-white' : 'bg-gray-100 dark:bg-gray-700'" @click="emit('resolve', operation.key, 'use_incoming')">Use incoming</button>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button class="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="!plan.canApply || isApplying" @click="emit('apply')">
            {{ isApplying ? 'Applying…' : 'Apply changes' }}
          </button>
          <button class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700" disabled title="Available after verified recovery storage ships in Phase 4">
            Replace library (Phase 4)
          </button>
          <span v-if="plan.unresolvedConflicts" class="text-xs text-amber-700 dark:text-amber-300">Resolve {{ plan.unresolvedConflicts }} conflict(s) before applying.</span>
        </div>
      </template>
    </div>
  </div>
</template>
