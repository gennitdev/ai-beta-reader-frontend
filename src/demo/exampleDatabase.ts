import { ref } from 'vue'
import type {
  Book,
  BookPart,
  Chapter,
  ChapterNote,
  ChapterReview,
  ChapterSummary,
  ChapterWikiLink,
  ImageAsset,
  ImageWikiTag,
  PartSummary,
  WikiPage,
  WikiPageChapterLink,
} from '@/lib/database'
import type { DatabaseApi } from '@/composables/useDatabase'
import { loadExampleStory } from './exampleStory'

const READ_ONLY_MESSAGE = 'This example is read-only. Import it or create your own book to try this action.'

function dataUrl(bytes: Uint8Array, mimeType: string | null): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return `data:${mimeType ?? 'application/octet-stream'};base64,${btoa(binary)}`
}

export function createExampleDatabase(base: DatabaseApi): { api: DatabaseApi; load: () => Promise<void> } {
  const books = ref<Book[]>([])
  const chapters = ref<Chapter[]>([])
  const loading = ref(true)
  const error = ref<string | null>(null)
  let parts: BookPart[] = []
  let summaries: ChapterSummary[] = []
  let partSummaries: PartSummary[] = []
  let notes: ChapterNote[] = []
  let reviews: ChapterReview[] = []
  let wikiPages: WikiPage[] = []
  let images: ImageAsset[] = []
  let imageWikiIds = new Map<string, string[]>()
  let chapterLinks = new Map<string, ChapterWikiLink[]>()
  let loadPromise: Promise<void> | null = null

  const load = async () => {
    loadPromise ??= (async () => {
      loading.value = true
      try {
        const { model } = await loadExampleStory()
        books.value = model.books.map((book) => ({
          ...book,
          chapter_order: JSON.stringify(book.chapter_order),
          part_order: JSON.stringify(book.part_order),
          updated_at: book.updated_at,
        }))
        chapters.value = model.chapters.map((chapter) => ({
          id: chapter.id,
          book_id: chapter.book_id,
          part_id: chapter.part_id,
          title: chapter.title ?? undefined,
          text: chapter.body,
          word_count: chapter.body.trim() ? chapter.body.trim().split(/\s+/).length : 0,
          cover_image_id: chapter.cover_image_id,
          created_at: chapter.created_at,
          updated_at: chapter.updated_at,
        }))
        parts = model.parts.map((part) => ({
          ...part,
          chapter_order: JSON.stringify(
            model.books[0]?.chapter_order.filter((id) => model.chapters.find((chapter) => chapter.id === id)?.part_id === part.id) ?? [],
          ),
        }))
        summaries = model.chapter_summaries.map((summary) => ({
          ...summary,
          summary: summary.body,
          characters: JSON.stringify(summary.characters),
          beats: JSON.stringify(summary.beats),
        }))
        partSummaries = model.part_summaries.map((summary) => ({
          ...summary,
          summary: summary.body,
          characters: JSON.stringify(summary.characters),
          beats: JSON.stringify(summary.beats),
        }))
        notes = model.chapter_notes.map((note) => ({ ...note, notes: note.body }))
        reviews = model.reviews.map((review) => ({
          id: review.id,
          chapter_id: review.chapter_id,
          review_text: review.body,
          prompt_used: review.prompt_used,
          profile_id: null,
          profile_name: review.profile_name,
          tone_key: review.tone_key,
          profile_stable_id: review.profile_ref,
          created_at: review.created_at,
          updated_at: review.updated_at,
        }))
        wikiPages = model.wiki_pages.map((page) => ({
          ...page,
          content: page.body,
          aliases: JSON.stringify(page.aliases),
          tags: JSON.stringify(page.tags),
        }))
        images = model.assets.map((asset) => ({
          id: asset.id,
          book_id: asset.book_id,
          chapter_id: asset.chapter_id,
          asset_type: asset.asset_type,
          file_name: asset.file_name,
          file_path: `example/${asset.file_name}`,
          mime_type: asset.mime_type,
          image_data: asset.bytes ? dataUrl(asset.bytes, asset.mime_type) : null,
          content_hash: asset.sha256,
          content_hash_algorithm: 'sha256-v1',
          content_byte_length: asset.byte_length,
          notes: asset.notes,
          created_at: asset.created_at,
          updated_at: asset.updated_at,
        }))
        imageWikiIds = new Map(model.assets.map((asset) => [asset.id, asset.wiki_page_ids]))
        chapterLinks = new Map(model.chapters.map((chapter) => [
          chapter.id,
          chapter.wiki_mentions.flatMap((mention) => {
            const page = wikiPages.find((candidate) => candidate.id === mention.wiki_page_id)
            return page ? [{
              wiki_page_id: page.id,
              page_name: page.page_name,
              page_type: page.page_type,
              link_source: mention.source,
              created_at: mention.created_at,
              updated_at: mention.updated_at,
            }] : []
          }),
        ]))
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause)
        throw cause
      } finally {
        loading.value = false
      }
    })()
    return loadPromise
  }

  const ensureLoaded = async () => { await load() }
  const readOnly = async (): Promise<never> => { throw new Error(READ_ONLY_MESSAGE) }
  const api = {
    ...base,
    books,
    chapters,
    loading,
    error,
    loadBooks: ensureLoaded,
    loadChapters: ensureLoaded,
    getParts: async (bookId: string) => (await ensureLoaded(), parts.filter((part) => part.book_id === bookId)),
    getSummary: async (chapterId: string) => (await ensureLoaded(), summaries.find((item) => item.chapter_id === chapterId) ?? null),
    getPartSummary: async (partId: string) => (await ensureLoaded(), partSummaries.find((item) => item.part_id === partId) ?? null),
    getNotes: async (chapterId: string) => (await ensureLoaded(), notes.find((item) => item.chapter_id === chapterId) ?? null),
    getReviews: async (chapterId: string) => (await ensureLoaded(), reviews.filter((item) => item.chapter_id === chapterId)),
    getCustomProfiles: async () => [],
    getWikiPageById: async (id: string) => (await ensureLoaded(), wikiPages.find((page) => page.id === id) ?? null),
    getWikiPage: async (bookId: string, pageName: string, pageType?: string) => (await ensureLoaded(), wikiPages.find((page) => page.book_id === bookId && page.page_name === pageName && (!pageType || page.page_type === pageType)) ?? null),
    getWikiPages: async (bookId: string) => (await ensureLoaded(), wikiPages.filter((page) => page.book_id === bookId)),
    getChapterWikiLinks: async (chapterId: string) => (await ensureLoaded(), chapterLinks.get(chapterId) ?? []),
    ensureChapterWikiLinks: async () => undefined,
    getWikiPageChapterLinks: async (wikiPageId: string): Promise<WikiPageChapterLink[]> => (await ensureLoaded(), chapters.value.flatMap((chapter) => (chapterLinks.get(chapter.id) ?? []).some((link) => link.wiki_page_id === wikiPageId) ? [{
      chapter_id: chapter.id,
      chapter_title: chapter.title ?? null,
      part_id: chapter.part_id ?? null,
      link_source: chapterLinks.get(chapter.id)?.find((link) => link.wiki_page_id === wikiPageId)?.link_source ?? null,
      created_at: chapter.created_at,
      updated_at: chapter.updated_at ?? null,
    }] : [])),
    getChapterRevisions: async () => [],
    getBookRevisionActivity: async () => [],
    getChapterImageAssets: async (chapterId: string) => (await ensureLoaded(), images.filter((image) => image.chapter_id === chapterId && image.asset_type === 'chapter')),
    getPartImageAssets: async (partId: string) => (await ensureLoaded(), images.filter((image) => chapters.value.some((chapter) => chapter.id === image.chapter_id && chapter.part_id === partId))),
    getBookCoverImageAsset: async (bookId: string) => (await ensureLoaded(), images.find((image) => books.value.find((book) => book.id === bookId)?.cover_image_id === image.id) ?? null),
    getPartCoverImageAsset: async (partId: string) => (await ensureLoaded(), images.find((image) => parts.find((part) => part.id === partId)?.cover_image_id === image.id) ?? null),
    getChapterCoverImageAsset: async (chapterId: string) => (await ensureLoaded(), images.find((image) => chapters.value.find((chapter) => chapter.id === chapterId)?.cover_image_id === image.id) ?? null),
    getWikiPageCoverImageAsset: async (wikiPageId: string) => (await ensureLoaded(), images.find((image) => wikiPages.find((page) => page.id === wikiPageId)?.cover_image_id === image.id) ?? null),
    getBookImageAssets: async (bookId: string) => (await ensureLoaded(), images.filter((image) => image.book_id === bookId)),
    getWikiPageImageAssets: async (wikiPageId: string) => (await ensureLoaded(), images.filter((image) => imageWikiIds.get(image.id)?.includes(wikiPageId))),
    getImageWikiTags: async (imageId: string): Promise<ImageWikiTag[]> => (await ensureLoaded(), (imageWikiIds.get(imageId) ?? []).flatMap((id) => {
      const page = wikiPages.find((candidate) => candidate.id === id)
      return page ? [{ image_id: imageId, wiki_page_id: id, page_name: page.page_name, page_type: page.page_type, created_at: page.created_at }] : []
    })),
  } as DatabaseApi

  const mutations = [
    'saveBook', 'saveChapter', 'deleteChapter', 'restoreChapterRevision', 'discardChapterRevision',
    'saveSummary', 'savePartSummary', 'saveReview', 'deleteReview', 'saveNotes', 'deleteNotes',
    'createWikiPage', 'updateWikiPage', 'deleteWikiPage', 'trackWikiUpdate', 'addChapterWikiMention',
    'setChapterWikiLinks', 'setWikiPageChapterLinks', 'createPart', 'updatePart', 'deletePart',
    'updateChapterOrders', 'updatePartOrder', 'replaceFindReplaceMatches', 'restoreFindReplaceFields',
    'replaceInChapter', 'replaceInWikiPage', 'saveImageAssetRecord', 'deleteImageAssetRecord',
    'setBookCoverImageId', 'setPartCoverImageId', 'setChapterCoverImageId', 'setWikiPageCoverImageId',
    'updateImageAssetNotes', 'updateImageAssetIntegrity', 'setImageWikiTags', 'importFromJSON',
    'importDatabaseBackup', 'backupToCloud', 'restoreFromCloud',
  ]
  const writableApi = api as unknown as Record<string, unknown>
  mutations.forEach((name) => { writableApi[name] = readOnly })
  return { api, load }
}

export { READ_ONLY_MESSAGE }
