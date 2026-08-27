<script setup lang="ts">
import { computed } from 'vue'
import { diffLines } from 'diff'

const props = defineProps<{
  field: string
  localValue?: unknown
  incomingValue?: unknown
}>()

type DiffRow = {
  kind: 'context' | 'added' | 'removed' | 'collapsed'
  text?: string
  oldLine?: number
  newLine?: number
  hiddenLines?: number
}

const CONTEXT_LINES = 3

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2) ?? 'absent'
}

function lines(value: string): string[] {
  if (!value) return []
  const normalized = value.endsWith('\n') ? value.slice(0, -1) : value
  return normalized.split('\n')
}

const rows = computed<DiffRow[]>(() => {
  const changes = diffLines(formatValue(props.localValue), formatValue(props.incomingValue))
  const result: DiffRow[] = []
  let oldLine = 1
  let newLine = 1

  const addLines = (kind: DiffRow['kind'], values: readonly string[]) => {
    for (const text of values) {
      result.push({
        kind,
        text,
        oldLine: kind !== 'added' ? oldLine : undefined,
        newLine: kind !== 'removed' ? newLine : undefined,
      })
      if (kind !== 'added') oldLine++
      if (kind !== 'removed') newLine++
    }
  }

  changes.forEach((change, index) => {
    const values = lines(change.value)
    if (change.added) return addLines('added', values)
    if (change.removed) return addLines('removed', values)
    if (values.length <= CONTEXT_LINES * 2) return addLines('context', values)

    const atStart = index === 0
    const atEnd = index === changes.length - 1
    const leading = atStart && !atEnd ? [] : values.slice(0, CONTEXT_LINES)
    const trailing = atEnd && !atStart ? [] : values.slice(-CONTEXT_LINES)
    addLines('context', leading)
    const hiddenLines = values.length - leading.length - trailing.length
    if (hiddenLines) {
      result.push({ kind: 'collapsed', hiddenLines })
      oldLine += hiddenLines
      newLine += hiddenLines
    }
    addLines('context', trailing)
  })
  return result
})
</script>

<template>
  <div class="mt-2 overflow-hidden rounded border border-gray-200 bg-gray-50 font-mono text-[11px] leading-5 dark:border-gray-700 dark:bg-navy-900" :aria-label="`Diff for ${field}`">
    <div class="border-b border-gray-200 px-2 py-1 font-sans text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">{{ field }}</div>
    <div
      v-for="(row, index) in rows"
      :key="index"
      class="grid grid-cols-[2.5rem_2.5rem_1rem_minmax(0,1fr)]"
      :class="{
        'bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200': row.kind === 'removed',
        'bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200': row.kind === 'added',
        'text-gray-700 dark:text-gray-300': row.kind === 'context',
        'bg-gray-100 text-gray-500 dark:bg-navy-800 dark:text-gray-400': row.kind === 'collapsed',
      }"
    >
      <span class="select-none border-r border-gray-200 px-1 text-right text-gray-400 dark:border-gray-700">{{ row.oldLine ?? '' }}</span>
      <span class="select-none border-r border-gray-200 px-1 text-right text-gray-400 dark:border-gray-700">{{ row.newLine ?? '' }}</span>
      <span class="select-none text-center">{{ row.kind === 'removed' ? '−' : row.kind === 'added' ? '+' : '' }}</span>
      <span v-if="row.kind === 'collapsed'" class="px-2 italic">… {{ row.hiddenLines }} unchanged line(s) collapsed …</span>
      <span v-else class="whitespace-pre-wrap break-words px-2">{{ row.text || ' ' }}</span>
    </div>
  </div>
</template>
