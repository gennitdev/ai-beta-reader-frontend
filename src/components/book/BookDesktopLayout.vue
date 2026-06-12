<script setup lang="ts">
import type { Component } from 'vue'
import type { Book, ImageAsset, ImageWikiTag } from '@/lib/database'
import type { BookChapter, BookChaptersByPart, BookWikiPage } from '@/types/bookView'
import BookDesktopMainPane from './BookDesktopMainPane.vue'
import BookDesktopSidebar from './BookDesktopSidebar.vue'

withDefaults(defineProps<{
  book: Book | null
  bookId: string
  isEditingBookTitle?: boolean
  editingBookTitle?: string
  chapterCount?: number
  totalWordCount?: number
  currentTab?: 'chapters' | 'wiki' | 'images'
  hasChapters?: boolean
  loadingChapters?: boolean
  chaptersByPart: BookChaptersByPart
  sidebarPartLists: Record<string, BookChapter[]>
  sidebarUncategorized: BookChapter[]
  expandedParts: Set<string>
  togglePart: (partId: string) => void
  expandPart: (partId: string) => void
  createNewChapter: () => void
  createNewChapterInPart: (partId: string) => void
  goToOrganizeChapters: () => void
  openSearchModal: () => void
  onSidebarDragStart: () => void
  onSidebarDragEnd: () => void | Promise<void>
  editChapter: (chapterId: string) => void
  insertChapter: (chapter: BookChapter, placement: 'before' | 'after') => void
  formatWordCount: (count: number) => string
  wordCountForChapters: (chapters: BookChapter[]) => number
  loadingWiki?: boolean
  hasWikiPages?: boolean
  wikiPagesByType?: Record<string, BookWikiPage[]>
  getTypeIcon: (type: string) => Component
  getTypeColor: (type: string) => string
  activeChapterId?: string
  activeWikiPageId?: string
  toggleWikiPagePinned: (page: BookWikiPage) => void | Promise<void>
  isOnBookOnly?: boolean
  routerViewKey: number
  startEditingBookTitle: () => void
  saveBookTitle: () => void
  cancelEditingBookTitle: () => void
  updateEditingBookTitle: (value: string) => void
  desktopImagesAvailable?: boolean
  coverImageSrc?: string | null
  coverLoading?: boolean
  coverError?: string | null
  selectBookCover: () => void
  deleteBookCover?: (() => void) | null
  chapterThumbnails?: Record<string, string>
  partThumbnails?: Record<string, string>
  bookImages?: ImageAsset[]
  bookImageSources?: Record<string, string>
  loadingImages?: boolean
  selectedImageId?: string | null
  selectedImageSrc?: string | null
  selectedImage?: ImageAsset | null
  selectedImageTags?: ImageWikiTag[]
  wikiPages?: BookWikiPage[]
  savingSelectedImageNotes?: boolean
  savingSelectedImageTags?: boolean
  saveSelectedImageNotes?: (notes: string) => void | Promise<void>
  saveSelectedImageTags?: (wikiPageIds: string[]) => void | Promise<void>
  downloadSelectedImage?: (imageId: string) => void
  wikiPagePinChanged: (payload: { id: string; isPinned: boolean; updatedAt: string }) => void
}>(), {
  isEditingBookTitle: false,
  editingBookTitle: '',
  chapterCount: 0,
  totalWordCount: 0,
  currentTab: 'chapters',
  hasChapters: false,
  loadingChapters: false,
  loadingWiki: false,
  hasWikiPages: false,
  wikiPagesByType: () => ({}),
  activeChapterId: undefined,
  activeWikiPageId: undefined,
  isOnBookOnly: false,
  desktopImagesAvailable: false,
  coverImageSrc: null,
  coverLoading: false,
  coverError: null,
  deleteBookCover: null,
  chapterThumbnails: () => ({}),
  partThumbnails: () => ({}),
  bookImages: () => [],
  bookImageSources: () => ({}),
  loadingImages: false,
  selectedImageId: null,
  selectedImageSrc: null,
  selectedImage: null,
  selectedImageTags: () => [],
  wikiPages: () => [],
  savingSelectedImageNotes: false,
  savingSelectedImageTags: false,
  saveSelectedImageNotes: undefined,
  saveSelectedImageTags: undefined,
  downloadSelectedImage: undefined
})
</script>

<template>
  <div class="hidden lg:flex h-[calc(100vh-4rem-1px)]">
    <div class="flex flex-1 overflow-hidden">
      <BookDesktopSidebar
        :book="book"
        :book-id="bookId"
        :is-editing-book-title="isEditingBookTitle"
        :editing-book-title="editingBookTitle"
        :chapter-count="chapterCount"
        :total-word-count="totalWordCount"
        :current-tab="currentTab"
        :has-chapters="hasChapters"
        :loading-chapters="loadingChapters"
        :chapters-by-part="chaptersByPart"
        :sidebar-part-lists="sidebarPartLists"
        :sidebar-uncategorized="sidebarUncategorized"
        :expanded-parts="expandedParts"
        :toggle-part="togglePart"
        :expand-part="expandPart"
        :create-new-chapter="createNewChapter"
        :create-new-chapter-in-part="createNewChapterInPart"
        :go-to-organize-chapters="goToOrganizeChapters"
        :open-search-modal="openSearchModal"
        :on-sidebar-drag-start="onSidebarDragStart"
        :on-sidebar-drag-end="onSidebarDragEnd"
        :edit-chapter="editChapter"
        :insert-chapter="insertChapter"
        :format-word-count="formatWordCount"
        :word-count-for-chapters="wordCountForChapters"
        :loading-wiki="loadingWiki"
        :has-wiki-pages="hasWikiPages"
        :wiki-pages-by-type="wikiPagesByType"
        :get-type-icon="getTypeIcon"
        :get-type-color="getTypeColor"
        :active-chapter-id="activeChapterId"
        :active-wiki-page-id="activeWikiPageId"
        :toggle-wiki-page-pinned="toggleWikiPagePinned"
        :start-editing-book-title="startEditingBookTitle"
        :save-book-title="saveBookTitle"
        :cancel-editing-book-title="cancelEditingBookTitle"
        :update-editing-book-title="updateEditingBookTitle"
        :desktop-images-available="desktopImagesAvailable"
        :cover-image-src="coverImageSrc"
        :cover-loading="coverLoading"
        :cover-error="coverError"
        :select-book-cover="selectBookCover"
        :delete-book-cover="deleteBookCover"
        :chapter-thumbnails="chapterThumbnails"
        :part-thumbnails="partThumbnails"
        :book-images="bookImages"
        :book-image-sources="bookImageSources"
        :loading-images="loadingImages"
        :selected-image-id="selectedImageId"
      />

      <BookDesktopMainPane
        :current-tab="currentTab"
        :selected-image-id="selectedImageId"
        :selected-image-src="selectedImageSrc"
        :selected-image="selectedImage"
        :selected-image-tags="selectedImageTags"
        :wiki-pages="wikiPages"
        :saving-selected-image-notes="savingSelectedImageNotes"
        :saving-selected-image-tags="savingSelectedImageTags"
        :save-selected-image-notes="saveSelectedImageNotes"
        :save-selected-image-tags="saveSelectedImageTags"
        :download-selected-image="downloadSelectedImage"
        :is-on-book-only="isOnBookOnly"
        :router-view-key="routerViewKey"
        :wiki-page-pin-changed="wikiPagePinChanged"
      />
    </div>
  </div>
</template>
