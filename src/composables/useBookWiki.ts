import { computed, ref, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { ImageAsset } from '@/lib/database'
import type { BookWikiPage } from '@/types/bookView'

type WikiPage = BookWikiPage
type WikiPageType = WikiPage['page_type']

/** Loose shape of a wiki row as returned by the database layer. */
interface DatabaseWikiPage {
  id: string
  page_name: string
  page_type?: string | null
  summary?: string | null
  aliases?: string | null
  tags?: string | null
  is_major?: boolean | number | null
  is_pinned?: boolean | number | null
  created_by_ai?: boolean | number | null
  created_at: string
  updated_at: string
  content?: string | null
  cover_image_id?: string | null
}

interface CreateWikiPageInput {
  book_id: string
  page_name: string
  page_type: WikiPageType
  content: string
  summary: string
  created_by_ai: boolean
}

interface UseBookWikiDeps {
  bookId: Ref<string>
  getWikiPages: (bookId: string) => Promise<DatabaseWikiPage[]>
  getWikiPage: (bookId: string, pageName: string) => Promise<unknown>
  createWikiPage: (page: CreateWikiPageInput) => Promise<string>
  updateWikiPage: (pageId: string, updates: { is_pinned?: boolean }) => Promise<void>
  getWikiPageCoverImageAsset: (pageId: string) => Promise<ImageAsset | null>
  getImageSource: (asset: ImageAsset) => Promise<string>
}

function safeParseArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * A book's wiki pages: loading (with cover thumbnails), grouping by type, the
 * create-page modal flow, and pin toggling.
 */
export function useBookWiki(deps: UseBookWikiDeps) {
  const {
    bookId,
    getWikiPages,
    getWikiPage,
    createWikiPage,
    updateWikiPage,
    getWikiPageCoverImageAsset,
    getImageSource,
  } = deps
  const router = useRouter()

  const wikiPages = ref<WikiPage[]>([])
  const loadingWiki = ref(false)
  const wikiPageThumbnails = ref<Record<string, string>>({})
  const hasWikiPages = computed(() => wikiPages.value.length > 0)

  // Create-wiki-page modal state
  const showCreateWikiModal = ref(false)
  const newWikiPageName = ref('')
  const newWikiPageType = ref<WikiPageType>('character')
  const creatingWikiPage = ref(false)
  const createWikiPageError = ref<string | null>(null)

  const wikiPagesByType = computed(() => {
    const grouped = wikiPages.value.reduce((acc, page) => {
      if (!acc[page.page_type]) {
        acc[page.page_type] = []
      }
      acc[page.page_type].push(page)
      return acc
    }, {} as Record<string, WikiPage[]>)

    // Sort each group: pinned pages first, then alphabetical
    Object.keys(grouped).forEach((type) => {
      grouped[type].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) {
          return b.is_pinned ? 1 : -1
        }
        return a.page_name.localeCompare(b.page_name)
      })
    })

    return grouped
  })

  const loadWiki = async () => {
    if (!bookId.value) return

    try {
      loadingWiki.value = true

      const pages = await getWikiPages(bookId.value)
      wikiPages.value = pages.map((page) => ({
        id: page.id,
        page_name: page.page_name,
        page_type: (page.page_type || 'character') as WikiPageType,
        summary: page.summary ?? null,
        aliases: safeParseArray(page.aliases),
        tags: safeParseArray(page.tags),
        is_major: Boolean(page.is_major),
        is_pinned: Boolean(page.is_pinned),
        created_by_ai: Boolean(page.created_by_ai),
        created_at: page.created_at,
        updated_at: page.updated_at,
        content_length: typeof page.content === 'string' ? page.content.length : 0,
        cover_image_id: page.cover_image_id ?? null,
      }))

      // Load cover thumbnails for wiki pages that have cover images
      const thumbnails: Record<string, string> = {}
      for (const page of wikiPages.value) {
        if (page.cover_image_id) {
          try {
            const coverImage = await getWikiPageCoverImageAsset(page.id)
            if (coverImage) {
              thumbnails[page.id] = await getImageSource(coverImage)
            }
          } catch (error) {
            console.warn(`Failed to load cover thumbnail for wiki page ${page.id}:`, error)
          }
        }
      }
      wikiPageThumbnails.value = thumbnails
    } catch (error) {
      console.error('Failed to load wiki pages:', error)
      wikiPages.value = []
      wikiPageThumbnails.value = {}
    } finally {
      loadingWiki.value = false
    }
  }

  const openCreateWikiModal = () => {
    newWikiPageName.value = ''
    newWikiPageType.value = 'character'
    createWikiPageError.value = null
    showCreateWikiModal.value = true
  }

  const closeCreateWikiModal = () => {
    if (creatingWikiPage.value) return
    showCreateWikiModal.value = false
    newWikiPageName.value = ''
    createWikiPageError.value = null
  }

  const handleCreateWikiPage = async () => {
    const pageName = newWikiPageName.value.trim()
    if (!pageName) {
      createWikiPageError.value = 'Please enter a page name.'
      return
    }

    creatingWikiPage.value = true
    createWikiPageError.value = null

    try {
      // Check for duplicate name
      const existingPage = await getWikiPage(bookId.value, pageName)
      if (existingPage) {
        createWikiPageError.value = `A wiki page named "${pageName}" already exists.`
        creatingWikiPage.value = false
        return
      }

      // Create the new wiki page
      const newPageId = await createWikiPage({
        book_id: bookId.value,
        page_name: pageName,
        page_type: newWikiPageType.value,
        content: '',
        summary: '',
        created_by_ai: false,
      })

      // Refresh wiki pages list
      await loadWiki()

      // Close modal and navigate to new page
      showCreateWikiModal.value = false
      newWikiPageName.value = ''
      router.push(`/books/${bookId.value}/wiki/${newPageId}`)
    } catch (error) {
      createWikiPageError.value = error instanceof Error ? error.message : 'Failed to create wiki page.'
    } finally {
      creatingWikiPage.value = false
    }
  }

  const toggleWikiPagePinned = async (page: WikiPage) => {
    const previousPinned = page.is_pinned
    const nextPinned = !page.is_pinned
    page.is_pinned = nextPinned
    page.updated_at = new Date().toISOString()

    try {
      await updateWikiPage(page.id, { is_pinned: nextPinned })
    } catch (error) {
      page.is_pinned = previousPinned
      page.updated_at = new Date().toISOString()
      console.error('Failed to update wiki page pin:', error)
    }
  }

  const handleWikiPagePinChanged = (payload: { id: string; isPinned: boolean; updatedAt: string }) => {
    const page = wikiPages.value.find((item) => item.id === payload.id)
    if (!page) return

    page.is_pinned = payload.isPinned
    page.updated_at = payload.updatedAt
  }

  return {
    wikiPages,
    loadingWiki,
    wikiPageThumbnails,
    hasWikiPages,
    wikiPagesByType,
    showCreateWikiModal,
    newWikiPageName,
    newWikiPageType,
    creatingWikiPage,
    createWikiPageError,
    loadWiki,
    openCreateWikiModal,
    closeCreateWikiModal,
    handleCreateWikiPage,
    toggleWikiPagePinned,
    handleWikiPagePinChanged,
  }
}
