import type { Book, BookPart, Chapter } from '@/lib/database'

export interface MarkdownExportFile {
  path: string
  content: string
}

interface BuildMarkdownExportFilesOptions {
  book: Book
  chapters: Chapter[]
  parts: BookPart[]
  chapterNotesById?: Record<string, string>
  granularity: 'book' | 'part'
  includeNotes: boolean
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_')
}

export function parseJsonArray(value?: string | null): string[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

export function orderParts(book: Book, parts: BookPart[]): BookPart[] {
  const orderedPartIds = parseJsonArray(book.part_order)
  const orderedParts = orderedPartIds
    .map((partId) => parts.find((part) => part.id === partId))
    .filter((part): part is BookPart => Boolean(part))
  const remainingParts = parts.filter((part) => !orderedPartIds.includes(part.id))
  return [...orderedParts, ...remainingParts]
}

export function orderChaptersForBook(book: Book, chapters: Chapter[]): Chapter[] {
  const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]))
  const orderedIds = parseJsonArray(book.chapter_order)
  const ordered = orderedIds
    .map((id) => chapterMap.get(id))
    .filter((chapter): chapter is Chapter => Boolean(chapter))
  const remaining = chapters.filter((chapter) => !orderedIds.includes(chapter.id))
  return [...ordered, ...remaining]
}

export function orderChaptersForPart(part: BookPart, chapters: Chapter[]): Chapter[] {
  const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]))
  const orderedIds = parseJsonArray(part.chapter_order)
  const ordered = orderedIds
    .map((id) => chapterMap.get(id))
    .filter((chapter): chapter is Chapter => Boolean(chapter))
  const remaining = chapters.filter(
    (chapter) => chapter.part_id === part.id && !orderedIds.includes(chapter.id),
  )
  return [...ordered, ...remaining]
}

export function buildChapterMarkdown(
  chapter: Chapter,
  level: number,
  note: string | undefined,
  includeNotes: boolean,
): string {
  const headingPrefix = '#'.repeat(level)
  let content = `${headingPrefix} ${chapter.title || 'Untitled Chapter'}\n\n`

  if (chapter.text) {
    content += `${chapter.text}\n\n`
  }

  if (includeNotes && note?.trim()) {
    content += `---\n\n**Notes:**\n\n${note}\n\n`
  }

  return content
}

export function buildMarkdownExportFiles(
  options: BuildMarkdownExportFilesOptions,
): MarkdownExportFile[] {
  const allParts = orderParts(options.book, options.parts)
  const hasParts = allParts.length > 0
  const chapterNotesById = options.chapterNotesById ?? {}
  const files: MarkdownExportFile[] = []

  if (options.granularity === 'part' && hasParts) {
    const exportedChapterIds = new Set<string>()
    const partPaddingLength = allParts.length.toString().length
    const bookFolder = sanitizeFileName(options.book.title)

    for (let partIndex = 0; partIndex < allParts.length; partIndex++) {
      const part = allParts[partIndex]
      const partName = part.name || `Part ${partIndex + 1}`
      const partNumber = (partIndex + 1).toString().padStart(partPaddingLength, '0')
      const partChapters = orderChaptersForPart(part, options.chapters.filter((chapter) => chapter.part_id === part.id))

      let markdown = `# ${options.book.title}\n\n## ${partName}\n\n`

      for (const chapter of partChapters) {
        markdown += buildChapterMarkdown(
          chapter,
          3,
          chapterNotesById[chapter.id],
          options.includeNotes,
        )
        exportedChapterIds.add(chapter.id)
      }

      files.push({
        path: `${bookFolder}/${partNumber} - ${sanitizeFileName(partName)}.md`,
        content: markdown,
      })
    }

    const uncategorizedChapters = options.chapters.filter(
      (chapter) => !exportedChapterIds.has(chapter.id),
    )
    if (uncategorizedChapters.length > 0) {
      let markdown = `# ${options.book.title}\n\n## Uncategorized Chapters\n\n`
      for (const chapter of uncategorizedChapters) {
        markdown += buildChapterMarkdown(
          chapter,
          3,
          chapterNotesById[chapter.id],
          options.includeNotes,
        )
      }
      files.push({
        path: `${bookFolder}/Uncategorized.md`,
        content: markdown,
      })
    }

    return files
  }

  let markdown = `# ${options.book.title}\n\n`

  if (hasParts) {
    const exportedChapterIds = new Set<string>()

    for (const part of allParts) {
      const partName = part.name || 'Untitled Part'
      markdown += `## ${partName}\n\n`

      const partChapters = orderChaptersForPart(part, options.chapters.filter((chapter) => chapter.part_id === part.id))
      for (const chapter of partChapters) {
        markdown += buildChapterMarkdown(
          chapter,
          3,
          chapterNotesById[chapter.id],
          options.includeNotes,
        )
        exportedChapterIds.add(chapter.id)
      }
    }

    const uncategorizedChapters = options.chapters.filter(
      (chapter) => !exportedChapterIds.has(chapter.id),
    )
    if (uncategorizedChapters.length > 0) {
      markdown += '## Uncategorized Chapters\n\n'
      for (const chapter of uncategorizedChapters) {
        markdown += buildChapterMarkdown(
          chapter,
          3,
          chapterNotesById[chapter.id],
          options.includeNotes,
        )
      }
    }
  } else {
    for (const chapter of orderChaptersForBook(options.book, options.chapters)) {
      markdown += buildChapterMarkdown(
        chapter,
        2,
        chapterNotesById[chapter.id],
        options.includeNotes,
      )
    }
  }

  files.push({
    path: `${sanitizeFileName(options.book.title)}.md`,
    content: markdown,
  })

  return files
}
