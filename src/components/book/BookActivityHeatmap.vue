<script setup lang="ts">
import { computed, ref } from 'vue'
import { DocumentTextIcon, TrashIcon } from '@heroicons/vue/24/outline'
import type { ChapterRevisionActivity } from '@/lib/database'

const props = defineProps<{
  bookId: string
  activity: ChapterRevisionActivity[]
}>()

interface DayActivity {
  date: Date
  key: string
  events: ChapterRevisionActivity[]
  revisions: number
  deletions: number
  wordsChanged: number
  wordsDeleted: number
  chapterTitles: Set<string>
  intensity: number
}

interface TooltipState {
  text: string
  left: number
  top: number
}

const selectedDayKey = ref<string | null>(null)
const hovered = ref<TooltipState | null>(null)

const dateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const days = computed<DayActivity[]>(() => {
  const activityByDay = new Map<string, ChapterRevisionActivity[]>()
  for (const activity of props.activity) {
    const key = dateKey(new Date(activity.created_at))
    const events = activityByDay.get(key) ?? []
    events.push(activity)
    activityByDay.set(key, events)
  }

  const end = new Date()
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + (6 - end.getDay()))
  const start = new Date(end)
  start.setDate(start.getDate() - (52 * 7 - 1))

  return Array.from({ length: 52 * 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = dateKey(date)
    const events = activityByDay.get(key) ?? []
    const revisions = events.filter((event) => event.activity_type === 'save').length
    const deletions = events.filter((event) => event.activity_type === 'delete').length
    const wordsDeleted = events.reduce((total, event) => total + event.word_count_deleted, 0)
    const wordsChanged = events.reduce(
      (total, event) => total + event.words_added + event.words_removed + event.word_count_deleted,
      0,
    )
    const chapterTitles = new Set(events.flatMap((event) => event.chapter_title ? [event.chapter_title] : []))
    const score = wordsChanged || events.length
    const intensity = score === 0 ? 0 : score < 50 ? 1 : score < 250 ? 2 : score < 750 ? 3 : 4
    return { date, key, events, revisions, deletions, wordsChanged, wordsDeleted, chapterTitles, intensity }
  })
})

const activeDays = computed(() => days.value.filter((day) => day.events.length > 0).length)
const totalRevisions = computed(() => days.value.reduce((total, day) => total + day.revisions, 0))
const totalDeletions = computed(() => days.value.reduce((total, day) => total + day.deletions, 0))
const selectedDay = computed(() => days.value.find((day) => day.key === selectedDayKey.value) ?? null)

const cellClass = (intensity: number) => [
  'bg-gray-100 dark:bg-navy-700',
  'bg-gold-200 dark:bg-gold-900/50',
  'bg-gold-400 dark:bg-gold-700',
  'bg-gold-600 dark:bg-gold-500',
  'bg-gold-800 dark:bg-gold-300',
][intensity]

const formatDate = (date: Date) => new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date)
const formatTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(value))

const tooltip = (day: DayActivity) => {
  const parts = [formatDate(day.date)]
  if (day.revisions) parts.push(`${day.revisions} saved ${day.revisions === 1 ? 'revision' : 'revisions'}`)
  if (day.deletions) {
    parts.push(`${day.deletions} ${day.deletions === 1 ? 'chapter' : 'chapters'} deleted (${day.wordsDeleted.toLocaleString()} words)`)
  }
  return parts.join(' · ')
}

const showTooltip = (event: Event, day: DayActivity) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  hovered.value = {
    text: tooltip(day),
    left: rect.left + rect.width / 2,
    top: rect.top - 8,
  }
}

const hideTooltip = () => {
  hovered.value = null
}
</script>

<template>
  <section class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-navy-800">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">Writing activity</h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Every square comes from chapter saves and deletions.</p>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {{ totalRevisions }} {{ totalRevisions === 1 ? 'revision' : 'revisions' }}<template v-if="totalDeletions">,
        {{ totalDeletions }} {{ totalDeletions === 1 ? 'deletion' : 'deletions' }}</template> across
        {{ activeDays }} active {{ activeDays === 1 ? 'day' : 'days' }}
      </p>
    </div>

    <div class="overflow-x-auto pb-1">
      <div class="grid min-w-[728px] grid-flow-col grid-rows-7 gap-1" aria-label="Chapter activity for the past year">
        <template v-for="day in days" :key="day.key">
          <button
            v-if="day.events.length"
            type="button"
            class="h-3 w-3 cursor-pointer rounded-[3px] ring-gold-500 transition hover:scale-125 hover:ring-2 focus:outline-none focus:ring-2"
            :class="[cellClass(day.intensity), selectedDayKey === day.key ? 'ring-2 ring-offset-1 dark:ring-offset-navy-800' : '']"
            :aria-label="`${tooltip(day)}. Show activity.`"
            :aria-pressed="selectedDayKey === day.key"
            @mouseenter="showTooltip($event, day)"
            @mouseleave="hideTooltip"
            @focus="showTooltip($event, day)"
            @blur="hideTooltip"
            @click="selectedDayKey = day.key"
          ></button>
          <span v-else class="h-3 w-3 rounded-[3px]" :class="cellClass(0)" aria-hidden="true"></span>
        </template>
      </div>
    </div>

    <div class="mt-3 flex items-center justify-end gap-1 text-xs text-gray-500 dark:text-gray-400">
      <span class="mr-1">Less</span>
      <span v-for="level in 5" :key="level" class="h-3 w-3 rounded-[3px]" :class="cellClass(level - 1)"></span>
      <span class="ml-1">More</span>
    </div>

    <div v-if="selectedDay" class="mt-5 border-t border-gray-200 pt-4 dark:border-gray-700">
      <h3 class="text-sm font-semibold text-gray-900 dark:text-white">{{ formatDate(selectedDay.date) }}</h3>
      <ul class="mt-3 space-y-2">
        <li
          v-for="event in [...selectedDay.events].reverse()"
          :key="event.id"
          class="flex items-start gap-3 rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-navy-900"
        >
          <span class="mt-0.5 rounded-md p-1.5" :class="event.activity_type === 'delete' || event.revision_discarded ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-300'">
            <TrashIcon v-if="event.activity_type === 'delete' || event.revision_discarded" class="h-4 w-4" />
            <DocumentTextIcon v-else class="h-4 w-4" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <RouterLink
                v-if="event.activity_type === 'save' && event.revision_available"
                :to="`/books/${bookId}/chapters/${event.chapter_id}/versions/${event.id}`"
                class="truncate text-sm font-medium text-gray-900 underline-offset-2 hover:text-gold-700 hover:underline dark:text-white dark:hover:text-gold-300"
              >
                {{ event.chapter_title || 'Untitled chapter' }}
              </RouterLink>
              <p v-else class="truncate text-sm font-medium text-gray-900 dark:text-white">{{ event.chapter_title || 'Untitled chapter' }}</p>
              <time class="text-xs text-gray-500 dark:text-gray-400">{{ formatTime(event.created_at) }}</time>
            </div>
            <p v-if="event.activity_type === 'delete'" class="mt-0.5 text-xs text-rose-600 dark:text-rose-300">
              Chapter deleted · {{ event.word_count_deleted.toLocaleString() }} words deleted
            </p>
            <p v-else-if="event.revision_discarded" class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Revision discarded · historical change totals retained
            </p>
            <p v-else class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Saved revision · <span class="text-emerald-600 dark:text-emerald-400">+{{ event.words_added }}</span>
              <span class="ml-1 text-rose-600 dark:text-rose-400">−{{ event.words_removed }}</span>
            </p>
          </div>
        </li>
      </ul>
    </div>
  </section>

  <Teleport to="body">
    <div
      v-if="hovered"
      class="pointer-events-none fixed z-[100] max-w-xs -translate-x-1/2 -translate-y-full rounded-md bg-gray-950 px-2.5 py-1.5 text-xs text-white shadow-lg"
      :style="{ left: `${hovered.left}px`, top: `${hovered.top}px` }"
      role="tooltip"
    >
      {{ hovered.text }}
    </div>
  </Teleport>
</template>
