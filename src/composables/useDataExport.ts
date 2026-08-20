import { ref, type Ref } from 'vue'
import JSZip from 'jszip'
import packageInfo from '../../package.json'
import type { Book, Chapter, ChapterNote, BookPart, ImageAsset } from '@/lib/database'
import { createFullLibraryBundleExport } from '@/lib/libraryBundle/export'
import { createPortableId } from '@/lib/portableIds'
import {
  buildMarkdownExportFiles,
  orderChaptersForBook,
  orderChaptersForPart,
  orderParts,
  sanitizeFileName,
} from '@/lib/exportHelpers'

interface UseDataExportDeps {
  books: Ref<Book[]>
  chapters: Ref<Chapter[]>
  loadBooks: () => Promise<void>
  loadChapters: (bookId: string) => Promise<void>
  getParts: (bookId: string) => Promise<BookPart[]>
  getNotes: (chapterId: string) => Promise<ChapterNote | null>
  canStoreImages: Ref<boolean>
  fetchBookCover: (bookId: string) => Promise<ImageAsset | null>
  fetchPartCover: (partId: string) => Promise<ImageAsset | null>
  fetchChapterImages: (chapterId: string) => Promise<ImageAsset[]>
  getImageBlob: (image: ImageAsset) => Promise<Blob>
  exportDatabase: () => Promise<Uint8Array>
}

function triggerZipDownload(content: Blob, fileName: string) {
  const url = URL.createObjectURL(content)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Exports the local library to a downloadable ZIP — either a structured folder
 * tree (with images) or combined-Markdown files. Owns the export form state and
 * progress/error messaging.
 */
export function useDataExport(deps: UseDataExportDeps) {
  const {
    books,
    chapters,
    loadBooks,
    loadChapters,
    getParts,
    getNotes,
    canStoreImages,
    fetchBookCover,
    fetchPartCover,
    fetchChapterImages,
    getImageBlob,
    exportDatabase,
  } = deps

  const isExporting = ref(false)
  const exportProgress = ref('')
  const exportError = ref('')
  const exportFormat = ref<'bundle' | 'zip' | 'markdown'>('bundle')
  const markdownGranularity = ref<'book' | 'part'>('book')
  const includeNotes = ref(true)

  const stripFileExtension = (fileName: string): string => {
    const lastDot = fileName.lastIndexOf('.')
    return lastDot > 0 ? fileName.slice(0, lastDot) : fileName
  }

  const exportImageWithNotes = async (
    folder: JSZip,
    image: ImageAsset,
    fallbackBaseName: string,
  ) => {
    const blob = await getImageBlob(image)
    const data = new Uint8Array(await blob.arrayBuffer())
    const mimeType = blob.type || image.mime_type || 'image/png'
    const ext = mimeType.split('/')[1] || 'png'
    const imageFileName = image.file_name || `${fallbackBaseName}.${ext}`
    folder.file(imageFileName, data)

    if (image.notes?.trim()) {
      folder.file(`${stripFileExtension(imageFileName)}.notes.md`, image.notes)
    }
  }

  const exportFullLibraryBundle = async () => {
    if (isExporting.value) return

    exportError.value = ''
    try {
      isExporting.value = true
      exportProgress.value = 'Creating a consistent library snapshot...'
      const databaseBackup = await exportDatabase()
      exportProgress.value = 'Writing canonical bundle files and verifying images...'
      const exportedAt = new Date().toISOString()
      const bundle = await createFullLibraryBundleExport(databaseBackup, {
        bundleId: createPortableId('bundle'),
        exportedAt,
        appVersion: packageInfo.version,
        readAssetBytes: async (asset) => {
          const blob = await getImageBlob(asset)
          return new Uint8Array(await blob.arrayBuffer())
        },
      })

      exportProgress.value = 'Creating backup ZIP...'
      triggerZipDownload(
        new Blob([bundle.zipBytes.slice().buffer], { type: 'application/zip' }),
        `beta-bot-library-${exportedAt.slice(0, 10)}.zip`,
      )
      exportProgress.value = 'Full library backup exported!'
      setTimeout(() => { exportProgress.value = '' }, 3000)
    } catch (err) {
      console.error('Full library export failed:', err)
      exportError.value = 'Export failed: ' + (err instanceof Error ? err.message : 'Unknown error')
      exportProgress.value = ''
    } finally {
      isExporting.value = false
    }
  }

  const exportUserData = async () => {
    if (isExporting.value) return

    exportError.value = ''

    try {
      isExporting.value = true
      exportProgress.value = 'Fetching your books...'

      // Create zip file
      const zip = new JSZip()

      // Get all books from local database
      await loadBooks()
      const booksData = books.value
      exportProgress.value = `Found ${booksData.length} books. Processing...`

      for (let i = 0; i < booksData.length; i++) {
        const book = booksData[i]
        exportProgress.value = `Processing book ${i + 1}/${booksData.length}: ${book.title}`

        const bookFolder = zip.folder(sanitizeFileName(book.title))
        if (!bookFolder) continue

        // Create book info file
        bookFolder.file('book-info.txt', `Title: ${book.title}\nID: ${book.id}\nCreated: ${book.created_at || 'Unknown'}\n`)

        // Export book cover image if available
        if (canStoreImages.value) {
          try {
            const bookCover = await fetchBookCover(book.id)
            if (bookCover) {
              exportProgress.value = `Exporting book cover for: ${book.title}`
              await exportImageWithNotes(bookFolder, bookCover, 'cover')
            }
          } catch (err) {
            console.warn('Failed to export book cover:', err)
          }
        }

        // Get chapters for this book from local database
        await loadChapters(book.id)
        const chaptersData = chapters.value
        const partsData = await getParts(book.id)
        const chaptersFolder = bookFolder.folder('chapters')
        const allParts = orderParts(book, partsData)
        const hasParts = allParts.length > 0

        // Track which chapters have been exported (to handle uncategorized)
        const exportedChapterIds = new Set<string>()

        // Helper to export a chapter to a folder with a given number
        const exportChapter = async (chapter: typeof chaptersData[0], chapterNumber: string, parentFolder: JSZip) => {
          exportProgress.value = `Processing chapter: ${chapter.title || chapter.id}`
          const chapterFolderName = `${chapterNumber} - ${sanitizeFileName(chapter.title || chapter.id)}`
          const chapterFolder = parentFolder.folder(chapterFolderName)

          if (chapterFolder) {
            // Add chapter content
            chapterFolder.file('content.md', chapter.text || '')

            // Add chapter info
            const chapterInfo = `Title: ${chapter.title || 'Untitled'}\nID: ${chapter.id}\nWord Count: ${chapter.word_count || 0}\nCreated: ${chapter.created_at || 'Unknown'}\n`
            chapterFolder.file('chapter-info.txt', chapterInfo)

            const chapterNotes = await getNotes(chapter.id)
            if (chapterNotes?.notes?.trim()) {
              chapterFolder.file('notes.md', chapterNotes.notes)
            }

            // Export chapter images if available
            if (canStoreImages.value) {
              try {
                const chapterImages = await fetchChapterImages(chapter.id)
                if (chapterImages.length > 0) {
                  const imagesFolder = chapterFolder.folder('images')
                  if (imagesFolder) {
                    for (let imgIndex = 0; imgIndex < chapterImages.length; imgIndex++) {
                      const image = chapterImages[imgIndex]
                      try {
                        const imgNumber = (imgIndex + 1).toString().padStart(2, '0')
                        await exportImageWithNotes(imagesFolder, image, `image-${imgNumber}`)
                      } catch (imgErr) {
                        console.warn(`Failed to export image ${image.id}:`, imgErr)
                      }
                    }
                  }
                }
              } catch (err) {
                console.warn('Failed to fetch chapter images:', err)
              }
            }
          }
          exportedChapterIds.add(chapter.id)
        }

        if (hasParts && chaptersFolder) {
          const partPaddingLength = allParts.length.toString().length

          for (let partIndex = 0; partIndex < allParts.length; partIndex++) {
            const part = allParts[partIndex]
            const partNumber = (partIndex + 1).toString().padStart(partPaddingLength, '0')
            const partName = part.name || `Part ${partIndex + 1}`
            const partFolderName = `${partNumber} - ${sanitizeFileName(partName)}`
            const partFolder = chaptersFolder.folder(partFolderName)
            if (!partFolder) continue

            // Get ordered chapter IDs for this part
            const partChapters = orderChaptersForPart(
              part,
              chaptersData.filter(ch => ch.part_id === part.id),
            )

            // Part info
            const partInfoLines = [
              `Name: ${partName}`,
              `ID: ${part.id}`,
              `Chapters: ${partChapters.length}`,
              `Created: ${part.created_at || 'Unknown'}`,
              `Updated: ${part.updated_at || 'Unknown'}`,
            ]
            partFolder.file('part-info.txt', `${partInfoLines.join('\n')}\n`)

            // Export part cover image if available
            if (canStoreImages.value) {
              try {
                const partCover = await fetchPartCover(part.id)
                if (partCover) {
                  exportProgress.value = `Exporting cover for part: ${partName}`
                  await exportImageWithNotes(partFolder, partCover, 'cover')
                }
              } catch (err) {
                console.warn('Failed to export part cover:', err)
              }
            }

            // Export chapters in part order
            const chapterPaddingLength = partChapters.length.toString().length
            for (let chapterIndex = 0; chapterIndex < partChapters.length; chapterIndex++) {
              const chapter = partChapters[chapterIndex]
              const chapterNumber = (chapterIndex + 1).toString().padStart(chapterPaddingLength, '0')
              await exportChapter(chapter, chapterNumber, partFolder)
            }
          }

          // Handle uncategorized chapters (chapters not in any part's chapter_order)
          const uncategorizedChapters = chaptersData.filter(ch => !exportedChapterIds.has(ch.id))
          if (uncategorizedChapters.length > 0) {
            const uncategorizedFolder = chaptersFolder.folder('uncategorized')
            if (uncategorizedFolder) {
              uncategorizedFolder.file('readme.txt', 'Chapters without a part assignment\n')
              const uncatPaddingLength = uncategorizedChapters.length.toString().length
              for (let chapterIndex = 0; chapterIndex < uncategorizedChapters.length; chapterIndex++) {
                const chapter = uncategorizedChapters[chapterIndex]
                const chapterNumber = (chapterIndex + 1).toString().padStart(uncatPaddingLength, '0')
                await exportChapter(chapter, chapterNumber, uncategorizedFolder)
              }
            }
          }
        } else if (chaptersFolder) {
          // No parts - export chapters in book's chapter_order
          const allChapters = orderChaptersForBook(book, chaptersData)

          const paddingLength = allChapters.length.toString().length
          for (let chapterIndex = 0; chapterIndex < allChapters.length; chapterIndex++) {
            const chapter = allChapters[chapterIndex]
            const chapterNumber = (chapterIndex + 1).toString().padStart(paddingLength, '0')
            await exportChapter(chapter, chapterNumber, chaptersFolder)
          }
        }
      }

      exportProgress.value = 'Creating zip file...'

      // Generate and download zip
      const content = await zip.generateAsync({ type: 'blob' })
      triggerZipDownload(content, `beta-bot-export-${new Date().toISOString().split('T')[0]}.zip`)

      exportProgress.value = 'Export completed!'
      setTimeout(() => {
        exportProgress.value = ''
      }, 3000)

    } catch (err) {
      console.error('Export failed:', err)
      exportError.value = 'Export failed: ' + (err instanceof Error ? err.message : 'Unknown error')
      exportProgress.value = ''
    } finally {
      isExporting.value = false
    }
  }

  const exportAsMarkdown = async () => {
    if (isExporting.value) return

    exportError.value = ''

    try {
      isExporting.value = true
      exportProgress.value = 'Fetching your books...'

      const zip = new JSZip()

      // Get all books from local database
      await loadBooks()
      const booksData = books.value
      exportProgress.value = `Found ${booksData.length} books. Processing...`

      for (let i = 0; i < booksData.length; i++) {
        const book = booksData[i]
        exportProgress.value = `Processing book ${i + 1}/${booksData.length}: ${book.title}`

        // Get chapters for this book
        await loadChapters(book.id)
        const chaptersData = chapters.value
        const partsData = await getParts(book.id)
        const chapterNotesById: Record<string, string> = {}
        if (includeNotes.value) {
          for (const chapter of chaptersData) {
            exportProgress.value = `Processing chapter: ${chapter.title || chapter.id}`
            const chapterNotes = await getNotes(chapter.id)
            if (chapterNotes?.notes?.trim()) {
              chapterNotesById[chapter.id] = chapterNotes.notes
            }
          }
        }

        const files = buildMarkdownExportFiles({
          book,
          chapters: chaptersData,
          parts: partsData,
          chapterNotesById,
          granularity: markdownGranularity.value,
          includeNotes: includeNotes.value,
        })

        for (const file of files) {
          zip.file(file.path, file.content)
        }
      }

      exportProgress.value = 'Creating zip file...'

      // Generate and download zip
      const content = await zip.generateAsync({ type: 'blob' })
      triggerZipDownload(content, `beta-bot-markdown-export-${new Date().toISOString().split('T')[0]}.zip`)

      exportProgress.value = 'Export completed!'
      setTimeout(() => {
        exportProgress.value = ''
      }, 3000)

    } catch (err) {
      console.error('Export failed:', err)
      exportError.value = 'Export failed: ' + (err instanceof Error ? err.message : 'Unknown error')
      exportProgress.value = ''
    } finally {
      isExporting.value = false
    }
  }

  const handleExport = () => {
    if (exportFormat.value === 'bundle') {
      exportFullLibraryBundle()
    } else if (exportFormat.value === 'markdown') {
      exportAsMarkdown()
    } else {
      exportUserData()
    }
  }

  return {
    isExporting,
    exportProgress,
    exportError,
    exportFormat,
    markdownGranularity,
    includeNotes,
    handleExport,
    exportFullLibraryBundle,
  }
}
