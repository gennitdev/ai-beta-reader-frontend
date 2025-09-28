<script setup lang="ts">
import { ref, nextTick, onMounted, computed } from 'vue'
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/vue'
import MarkdownRenderer from './MarkdownRenderer.vue'

// Props
const props = defineProps({
  initialValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: 'Start writing...',
  },
  maxLength: {
    type: Number,
    default: 10000,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
  height: {
    type: String,
    default: '300px',
  },
})

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

// Reactive state
const textValue = ref(props.initialValue)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const selectedTab = ref(0)

// Computed
const remainingChars = computed(() => props.maxLength - textValue.value.length)
const isOverLimit = computed(() => remainingChars.value < 0)

// Methods
const updateValue = () => {
  emit('update:modelValue', textValue.value)
  emit('change', textValue.value)
}

const formatText = (type: 'bold' | 'italic' | 'code' | 'quote') => {
  if (!textareaRef.value) return

  const textarea = textareaRef.value
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selectedText = textValue.value.substring(start, end)

  let replacement = ''
  let cursorOffset = 0

  switch (type) {
    case 'bold':
      replacement = `**${selectedText}**`
      cursorOffset = selectedText ? 0 : 2
      break
    case 'italic':
      replacement = `*${selectedText}*`
      cursorOffset = selectedText ? 0 : 1
      break
    case 'code':
      replacement = `\`${selectedText}\``
      cursorOffset = selectedText ? 0 : 1
      break
    case 'quote':
      replacement = `> ${selectedText}`
      cursorOffset = selectedText ? 0 : 2
      break
  }

  textValue.value = textValue.value.substring(0, start) + replacement + textValue.value.substring(end)

  nextTick(() => {
    if (textareaRef.value) {
      const newPosition = start + replacement.length - cursorOffset
      textareaRef.value.setSelectionRange(newPosition, newPosition)
      textareaRef.value.focus()
    }
  })

  updateValue()
}

const insertHeading = (level: number) => {
  if (!textareaRef.value) return

  const textarea = textareaRef.value
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selectedText = textValue.value.substring(start, end)

  const prefix = '#'.repeat(level) + ' '
  const replacement = prefix + (selectedText || 'Heading')

  textValue.value = textValue.value.substring(0, start) + replacement + textValue.value.substring(end)

  nextTick(() => {
    if (textareaRef.value) {
      const newPosition = start + replacement.length
      textareaRef.value.setSelectionRange(newPosition, newPosition)
      textareaRef.value.focus()
    }
  })

  updateValue()
}

const insertList = (ordered = false) => {
  if (!textareaRef.value) return

  const textarea = textareaRef.value
  const start = textarea.selectionStart
  const prefix = ordered ? '1. ' : '- '
  const replacement = prefix + 'List item'

  textValue.value = textValue.value.substring(0, start) + replacement + textValue.value.substring(start)

  nextTick(() => {
    if (textareaRef.value) {
      const newPosition = start + replacement.length
      textareaRef.value.setSelectionRange(newPosition, newPosition)
      textareaRef.value.focus()
    }
  })

  updateValue()
}

onMounted(() => {
  if (textareaRef.value && !props.readonly) {
    textareaRef.value.focus()
  }
})
</script>

<template>
  <div class="w-full">
    <TabGroup v-model="selectedTab">
      <TabList class="flex space-x-1 rounded-xl bg-blue-900/20 p-1 mb-4">
        <Tab
          v-slot="{ selected }"
          class="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2"
          :class="selected
            ? 'bg-white text-blue-700 shadow'
            : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'"
        >
          Write
        </Tab>
        <Tab
          v-slot="{ selected }"
          class="w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2"
          :class="selected
            ? 'bg-white text-blue-700 shadow'
            : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'"
        >
          Preview
        </Tab>
      </TabList>

      <TabPanels>
        <TabPanel>
          <!-- Toolbar -->
          <div class="flex flex-wrap gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
            <button
              type="button"
              @click="formatText('bold')"
              class="px-3 py-1 text-sm font-bold bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
              title="Bold"
            >
              B
            </button>
            <button
              type="button"
              @click="formatText('italic')"
              class="px-3 py-1 text-sm italic bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
              title="Italic"
            >
              I
            </button>
            <button
              type="button"
              @click="formatText('code')"
              class="px-3 py-1 text-sm font-mono bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
              title="Code"
            >
              &lt;/&gt;
            </button>
            <button
              type="button"
              @click="formatText('quote')"
              class="px-3 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
              title="Quote"
            >
              "
            </button>

            <div class="border-l border-gray-300 dark:border-gray-600 mx-2"></div>

            <button
              type="button"
              @click="insertHeading(1)"
              class="px-3 py-1 text-sm font-bold bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
              title="Heading 1"
            >
              H1
            </button>
            <button
              type="button"
              @click="insertHeading(2)"
              class="px-3 py-1 text-sm font-bold bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
              title="Heading 2"
            >
              H2
            </button>
            <button
              type="button"
              @click="insertList(false)"
              class="px-3 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
              title="Bullet List"
            >
              •
            </button>
            <button
              type="button"
              @click="insertList(true)"
              class="px-3 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
              title="Numbered List"
            >
              1.
            </button>
          </div>

          <!-- Textarea -->
          <div class="relative">
            <textarea
              ref="textareaRef"
              v-model="textValue"
              @input="updateValue"
              :placeholder="placeholder"
              :readonly="readonly"
              :style="{ height }"
              class="w-full p-4 border-l border-r border-b border-gray-300 dark:border-gray-600 rounded-b-lg resize-y focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-white"
              :class="{ 'border-red-500': isOverLimit }"
            />

            <!-- Character counter -->
            <div
              class="absolute bottom-2 right-2 text-xs"
              :class="isOverLimit ? 'text-red-500' : 'text-gray-500'"
            >
              {{ remainingChars }} characters remaining
            </div>
          </div>
        </TabPanel>

        <TabPanel>
          <div
            class="border border-gray-300 dark:border-gray-600 rounded-lg p-4 min-h-[300px] bg-white dark:bg-gray-900"
            :style="{ minHeight: height }"
          >
            <MarkdownRenderer
              v-if="textValue.trim()"
              :text="textValue"
            />
            <div
              v-else
              class="text-gray-500 dark:text-gray-400 italic"
            >
              Nothing to preview
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </TabGroup>
  </div>
</template>