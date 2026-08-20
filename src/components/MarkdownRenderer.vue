<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import { processWikiLinks } from '@/utils/wikiLinks'

// Helper function to generate heading anchors
function generateHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
}

interface Character {
  id: string
  character_name: string
  wiki_page_id: string | null
  has_wiki_page: boolean
  aliases?: string[]
}

const props = defineProps({
  text: {
    type: String,
    required: true,
  },
  fontSize: {
    type: String,
    default: 'medium',
  },
  fontFamily: {
    type: String,
    default: 'system',
  },
  imageMaxHeight: {
    type: String,
    default: '350px',
  },
  characters: {
    type: Array as () => Character[],
    default: () => [],
  },
  bookId: {
    type: String,
    default: '',
  },
  enableWikiLinks: {
    type: Boolean,
    default: false,
  },
  readingLayout: {
    type: Boolean,
    default: false,
  },
})

const md = new MarkdownIt({
  html: true, // Enable HTML tags in source
  highlight: (str, lang): string => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs p-4 text-xs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`
      } catch (error) {
        console.warn('Failed to highlight code block', error)
      }
    }
    return ''
  },
})

// Custom renderer for headings with anchors
md.renderer.rules.heading_open = function (tokens, idx) {
  const token = tokens[idx]
  const level = token.tag
  const nextToken = tokens[idx + 1]

  if (nextToken && nextToken.type === 'inline') {
    const headingText = nextToken.content
    const headingId = generateHeadingId(headingText)
    return `<${level} id="${headingId}" class="group relative">`
  }

  return `<${level} class="group relative">`
}

md.renderer.rules.heading_close = function (tokens, idx) {
  const token = tokens[idx]
  const level = token.tag
  const prevToken = tokens[idx - 1]

  if (prevToken && prevToken.type === 'inline') {
    const headingText = prevToken.content
    const headingId = generateHeadingId(headingText)
    return `<a href="#${headingId}" class="anchor absolute -left-6 top-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Link to ${headingText}">#</a></${level}>`
  }

  return `</${level}>`
}

// Render markdown with custom image styling and wiki links
const renderedHtml = computed(() => {
  // Process wiki links if enabled
  let text = props.text
  if (props.enableWikiLinks && props.characters.length > 0 && props.bookId) {
    text = processWikiLinks(text, props.characters, props.bookId)
  }

  let html = md.render(text)

  // Add custom styling to images
  html = html.replace(
    /<img([^>]*)>/g,
    `<img$1 style="max-height: ${props.imageMaxHeight}; width: auto;" class="max-w-full h-auto rounded-lg shadow-md">`
  )

  return html
})

const fontSizeClass = computed(() => {
  switch (props.fontSize) {
    case 'small':
      return 'text-sm'
    case 'large':
      return 'text-lg'
    case 'medium':
    default:
      return 'text-base'
  }
})

const fontFamilyClass = computed(() => `reading-font-${props.fontFamily}`)
</script>

<template>
  <div
    class="markdown-renderer prose prose-gray max-w-none"
    :class="[fontSizeClass, { 'markdown-body': readingLayout }, readingLayout ? fontFamilyClass : '']"
    v-html="renderedHtml"
  />
</template>

<style scoped>
/* Tailwind v4 compiles each scoped block in isolation, so pull in the
   project stylesheet (and its @config) to resolve @apply utilities. */
@reference '../style.css';

/* Custom styles for code blocks */
:deep(.hljs) {
  @apply rounded-md border border-gray-200 dark:border-gray-700;
}

/* Anchor link styles */
:deep(.anchor) {
  text-decoration: none;
}

/* Table styles */
:deep(table) {
  @apply border-collapse border border-gray-300 dark:border-gray-600;
}

:deep(th),
:deep(td) {
  @apply border border-gray-300 dark:border-gray-600 px-4 py-2;
}

:deep(th) {
  @apply bg-gray-100 dark:bg-navy-800 font-semibold;
}

/* Blockquote styles */
:deep(blockquote) {
  @apply border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic;
}

/* Reading layout: enhanced typography for long-form chapter prose.
   Only vertical padding so text flows to the container's horizontal edges;
   the surrounding layout owns the left/right margins. */
.markdown-body {
  padding: 2rem 0;
  line-height: 1.65;
  letter-spacing: -0.01em;
  color: #334155; /* slate-700 for light mode */
}

:global(.dark .markdown-body) {
  color: #f3f4f6;
}

/* Typography uses semantic custom properties for nested elements, so setting
   only the renderer's text color leaves headings, links, lists, and code at
   their default contrast. Keep the complete dark reading palette explicit. */
:global(.dark .markdown-renderer) {
  --tw-prose-body: #e5e7eb;
  --tw-prose-headings: #ffffff;
  --tw-prose-lead: #d1d5db;
  --tw-prose-links: #f0ca81;
  --tw-prose-bold: #ffffff;
  --tw-prose-counters: #d1d5db;
  --tw-prose-bullets: #d1d5db;
  --tw-prose-hr: #4b5563;
  --tw-prose-quotes: #f3f4f6;
  --tw-prose-quote-borders: #d3a63f;
  --tw-prose-captions: #d1d5db;
  --tw-prose-code: #fae8cd;
  --tw-prose-pre-code: #e5e7eb;
  --tw-prose-pre-bg: #00091c;
  --tw-prose-th-borders: #6b7280;
  --tw-prose-td-borders: #4b5563;
}

/* Generous paragraph spacing so the eye rests between thoughts */
.markdown-body :deep(p) {
  margin-top: 0;
  margin-bottom: 1.5rem;
}

/* Blockquotes / emphasized thought callouts */
.markdown-body :deep(blockquote) {
  margin: 1.5rem 0;
  padding: 0.75rem 1.2rem;
  background-color: rgba(0, 0, 0, 0.04);
  border-left: 3px solid #f0a975; /* warm accent line */
  border-radius: 4px;
  font-style: italic;
  color: #475569;
}

:global(.dark .markdown-body blockquote) {
  background-color: rgba(255, 255, 255, 0.07);
  color: #f3f4f6;
}
</style>
