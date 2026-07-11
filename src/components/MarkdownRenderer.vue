<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
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
</script>

<template>
  <div
    class="prose prose-gray dark:prose-invert max-w-none"
    :class="[fontSizeClass, { 'markdown-body': readingLayout }]"
    v-html="renderedHtml"
  />
</template>

<style scoped>
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
  @apply bg-gray-100 dark:bg-gray-800 font-semibold;
}

/* Blockquote styles */
:deep(blockquote) {
  @apply border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic;
}

/* Reading layout: enhanced typography for long-form chapter prose */
.markdown-body {
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.65;
  letter-spacing: -0.01em;
  color: #334155; /* slate-700 for light mode */
}

/* Dark mode is driven by prefers-color-scheme (Tailwind's default "media"
   strategy — there is no .dark class on the page). */
@media (prefers-color-scheme: dark) {
  .markdown-body {
    color: #e2e8f0; /* softer off-white to prevent glare on dark */
  }
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

@media (prefers-color-scheme: dark) {
  .markdown-body :deep(blockquote) {
    background-color: rgba(255, 255, 255, 0.04);
    color: #cbd5e1;
  }
}
</style>
