<script setup lang="ts">
import { computed } from "vue";
import {
  Bars3BottomLeftIcon,
  CheckCircleIcon,
  DocumentTextIcon,
} from "@heroicons/vue/24/outline";

const props = withDefaults(
  defineProps<{
    wordCount: number;
    hasSummary: boolean;
    hasNotes: boolean;
    variant?: "inline" | "panel";
  }>(),
  { variant: "inline" },
);

const isPanel = computed(() => props.variant === "panel");

const containerClass = computed(() =>
  isPanel.value
    ? "rounded-xl border border-gray-200 bg-white p-4 pt-5 text-sm dark:border-gray-700 dark:bg-navy-800"
    : "my-3 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400",
);
</script>

<template>
  <section :class="containerClass" aria-label="Chapter tools">
    <h3 v-if="isPanel" class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
      Chapter tools
    </h3>

    <div :class="isPanel ? 'space-y-2 text-gray-600 dark:text-gray-400' : 'contents'">
      <div class="flex items-center whitespace-nowrap">
        <Bars3BottomLeftIcon v-if="isPanel" class="mr-2 h-4 w-4 text-gray-400" />
        <span>{{ wordCount.toLocaleString() }} words</span>
      </div>
      <div class="flex items-center whitespace-nowrap">
        <CheckCircleIcon
          class="h-4 w-4"
          :class="[hasSummary ? 'text-green-500' : 'text-gray-300', isPanel ? 'mr-2' : 'mr-1']"
        />
        <span :class="hasSummary ? 'text-green-600' : 'text-gray-500'">
          {{ hasSummary ? "Summarized" : "Not summarized" }}
        </span>
      </div>
      <div class="flex items-center whitespace-nowrap">
        <DocumentTextIcon
          class="h-4 w-4"
          :class="[hasNotes ? 'text-purple-500' : 'text-gray-300', isPanel ? 'mr-2' : 'mr-1']"
        />
        <span :class="hasNotes ? 'text-purple-600' : 'text-gray-500'">
          {{ hasNotes ? "Has Notes" : "No Notes" }}
        </span>
      </div>
    </div>
  </section>
</template>
