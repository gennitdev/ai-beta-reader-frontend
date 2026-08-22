<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { logger } from '@/lib/logger'
import { useRoute, useRouter } from "vue-router";
import { useDatabase } from "@/composables/useDatabase";
import { useImageLibrary } from "@/composables/useImageLibrary";
import type { Book as DatabaseBook, BookPart, Chapter as DatabaseChapter, ChapterRevisionActivity } from "@/lib/database";
import type { FindReplaceScope } from "@/lib/findReplace";
import type {
  BookChapter,
  BookOrganizedPart,
  BookChaptersByPart,
} from "@/types/bookView";
import { useBookCover } from "@/composables/useBookCover";
import { useBookWiki } from "@/composables/useBookWiki";
import { useBookImages } from "@/composables/useBookImages";
import {
  formatWordCount,
  wordCountForChapters,
  getTypeIcon,
  getTypeColor,
  getSummaryPreview,
} from "@/utils/bookView";

type Chapter = BookChapter;
import SearchModal from "@/components/SearchModal.vue";
import BookMobileSection from "@/components/book/BookMobileSection.vue";
import BookDesktopLayout from "@/components/book/BookDesktopLayout.vue";

const route = useRoute();
const router = useRouter();
const bookId = computed(() => route.params.id as string);

// Use local database
const {
  books,
  chapters: dbChapters,
  loadBooks,
  loadChapters,
  getWikiPages,
  getWikiPage,
  createWikiPage,
  getSummary,
  getNotes,
  saveBook,
  getParts,
  updateWikiPage,
  updateChapterOrders,
  updatePartOrder,
  findReplaceMatches,
  replaceFindReplaceMatches,
  restoreFindReplaceFields,
  setBookCoverImageId,
  getBookImageAssets,
  updateImageAssetNotes,
  getImageWikiTags,
  setImageWikiTags,
  getWikiPageCoverImageAsset,
  getBookRevisionActivity,
} = useDatabase();

const {
  canSelectImages,
  canStoreImages,
  fetchBookCover,
  pickNewBookCover,
  getImageSource: getCoverImageSource,
  fetchChapterThumbnails,
  fetchPartThumbnails,
  deleteImage,
  downloadOrShareImage,
} = useImageLibrary();

const book = ref<DatabaseBook | null>(null);

// Book cover image
const {
  bookCoverSrc,
  coverLoading,
  coverError,
  loadBookCoverImage,
  handleSelectBookCover,
  handleDeleteBookCover,
} = useBookCover({
  book,
  fetchBookCover,
  getImageSource: getCoverImageSource,
  pickNewBookCover,
  deleteImage,
  setBookCoverImageId,
});

// Wiki pages (list, grouping, create modal, pinning)
const {
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
} = useBookWiki({
  bookId,
  getWikiPages,
  getWikiPage,
  createWikiPage,
  updateWikiPage,
  getWikiPageCoverImageAsset,
  getImageSource: getCoverImageSource,
});

// Book illustration gallery (Images tab)
const {
  bookImages,
  bookImageSources,
  loadingImages,
  savingSelectedImageNotes,
  savingSelectedImageTags,
  selectedImageId,
  selectedImageSrc,
  selectedImage,
  selectedImageTags,
  loadBookImages,
  saveSelectedImageNotes,
  saveSelectedImageTags,
  downloadSelectedImage,
} = useBookImages({
  bookId,
  wikiPages,
  loadWiki,
  getBookImageAssets,
  getImageSource: getCoverImageSource,
  getImageWikiTags,
  updateImageAssetNotes,
  setImageWikiTags,
  downloadOrShareImage,
});

const chapters = ref<BookChapter[]>([]);
const parts = ref<BookPart[]>([]);
const partOrder = ref<string[]>([]);
const loading = ref(false);
const expandedSummaries = ref<Set<string>>(new Set());
const routerViewKey = ref(0);
let suppressDbChapterSync = false;
const chapterThumbnails = ref<Record<string, string>>({});
const partThumbnails = ref<Record<string, string>>({});
const revisionActivity = ref<ChapterRevisionActivity[]>([]);

// Book editing state
const isEditingBookTitle = ref(false);
const editingBookTitle = ref("");

// Parts state
const expandedParts = ref<Set<string>>(new Set());

// Search service using local database
const searchService = {
  findReplaceMatches,
  replaceFindReplaceMatches,
  restoreFindReplaceFields,
};

// Drag and drop state
const isDragging = ref(false);
const isDraggingInSidebar = ref(false);
const showSearchModal = ref(false);
const contextualSearchScope = computed<FindReplaceScope>(() => {
  if (route.params.chapterId) return "chapter";
  if (route.params.wikiPageId) return "wikiPage";
  return "book";
});
const contextualSearchTargetId = computed(() => {
  const targetId = route.params.chapterId || route.params.wikiPageId;
  return typeof targetId === "string" ? targetId : undefined;
});

// Create wiki page state
const currentTab = computed(() => {
  // Check if we're on a wiki page child route
  if (route.path.includes("/wiki/")) {
    return "wiki";
  }
  // Check query parameter
  const tab = route.query.tab;
  if (tab === "wiki") return "wiki";
  if (tab === "images") return "images";
  return "chapters";
});

const isOnBookOnly = computed(() => {
  // Check if we're on the book route but no child route (chapter or wiki page) is active
  // Also not viewing an image
  return route.name === "book" && !route.params.chapterId && !route.params.wikiPageId && !selectedImageId.value;
});

const activeChapterId = computed(() => route.params.chapterId as string | undefined);
const activeWikiPageId = computed(() => route.params.wikiPageId as string | undefined);

const sortedChapters = computed(() => {
  // Backend returns chapters in correct order based on array positions
  return chapters.value.slice().sort((a, b) => (a.position || 0) - (b.position || 0));
});

const totalWordCount = computed(() => {
  return chapters.value.reduce((total, chapter) => {
    return total + (chapter.word_count || 0);
  }, 0);
});

const chapterCount = computed(() => chapters.value.length);
const hasChapters = computed(() => chapterCount.value > 0);

const orderedParts = computed(() => {
  const partMap = new Map(parts.value.map((part) => [part.id, part]));
  const orderedList: BookPart[] = [];

  partOrder.value.forEach((partId) => {
    const part = partMap.get(partId);
    if (part) {
      orderedList.push(part);
      partMap.delete(partId);
    }
  });

  if (partMap.size > 0) {
    const remaining = Array.from(partMap.values()).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    orderedList.push(...remaining);
  }

  return orderedList;
});

// Organize chapters by parts
const chaptersByPart = computed<BookChaptersByPart>(() => {
  const partList = orderedParts.value;
  const partIdSet = new Set(partList.map((part) => part.id));
  const uncategorizedChapters = sortedChapters.value.filter(
    (chapter) => !chapter.part_id || !partIdSet.has(chapter.part_id)
  );

  const organizedParts: BookOrganizedPart[] = partList.map((part) => {
    const partChapters = sortedChapters.value.filter((chapter) => chapter.part_id === part.id);
    const wordCount = partChapters.reduce((total, chapter) => total + (chapter.word_count || 0), 0);

    return {
      ...part,
      chapters: partChapters,
      wordCount,
    };
  });

  const uncategorizedWordCount = uncategorizedChapters.reduce(
    (total, chapter) => total + (chapter.word_count || 0),
    0
  );

  return {
    parts: organizedParts,
    uncategorized: uncategorizedChapters,
    uncategorizedWordCount,
  };
});

const sidebarPartLists = ref<Record<string, BookChapter[]>>({});
const sidebarUncategorized = ref<BookChapter[]>([]);

const syncSidebarLists = () => {
  const nextParts: Record<string, Chapter[]> = {};

  orderedParts.value.forEach((part) => {
    nextParts[part.id] = chapters.value
      .filter((chapter) => chapter.part_id === part.id)
      .map((chapter) => chapter);
  });

  sidebarPartLists.value = nextParts;

  const partIdSet = new Set(Object.keys(nextParts));

  sidebarUncategorized.value = chapters.value
    .filter((chapter) => !chapter.part_id || !partIdSet.has(chapter.part_id))
    .map((chapter) => chapter);
};

watch(
  () => [chapters.value, orderedParts.value],
  () => {
    if (isDraggingInSidebar.value) return;
    syncSidebarLists();
  },
  { immediate: true, deep: true }
);

const syncChaptersFromDb = async () => {
  if (!book.value) {
    chapters.value = [];
    sidebarPartLists.value = {};
    sidebarUncategorized.value = [];
    return;
  }

  const partNameMap = new Map(parts.value.map((part) => [part.id, part.name]));

  const chapterPromises = dbChapters.value.map(async (ch: DatabaseChapter, index: number) => {
    const summary = await getSummary(ch.id);
    const notes = await getNotes(ch.id);
    return {
      id: ch.id,
      title: ch.title || null,
      word_count: Number(ch.word_count) || 0,
      has_summary: !!summary,
      has_notes: !!notes,
      summary: summary?.summary || null,
      position: index,
      position_in_part: null,
      part_id: ch.part_id || null,
      part_name: ch.part_id ? partNameMap.get(ch.part_id) || null : null,
    } as Chapter;
  });

  const chapterList = await Promise.all(chapterPromises);
  const chapterOrderIds = parseIdArray(book.value?.chapter_order);
  const orderedChapters = applyOrder(chapterList, chapterOrderIds);

  const partOrderMap = new Map(
    parts.value.map((part) => [part.id, parseIdArray(part.chapter_order)])
  );

  orderedChapters.forEach((chapter) => {
    if (!chapter.part_id) return;
    const orderIds = partOrderMap.get(chapter.part_id);
    if (!orderIds?.length) return;
    chapter.position_in_part = orderIds.indexOf(chapter.id);
  });

  chapters.value = orderedChapters;
  syncSidebarLists();
};

watch(
  () => dbChapters.value,
  async () => {
    if (suppressDbChapterSync) return;
    try {
      await syncChaptersFromDb();
      if (book.value) {
        revisionActivity.value = await getBookRevisionActivity(book.value.id);
      }
    } catch (error) {
      console.error("Failed to synchronize chapters:", error);
    }
  }
);

watch(
  () => canStoreImages.value,
  () => {
    if (book.value) {
      loadBookCoverImage(book.value.id);
    }
  }
);

watch(
  () => book.value?.id,
  (nextId) => {
    if (nextId) {
      loadBookCoverImage(nextId);
    }
  }
);

const parseIdArray = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const applyOrder = (items: Chapter[], orderIds: string[]) => {
  if (!orderIds.length) return items;
  const chapterMap = new Map(items.map((chapter) => [chapter.id, chapter]));
  const ordered: Chapter[] = [];

  orderIds.forEach((id) => {
    const chapter = chapterMap.get(id);
    if (chapter) {
      ordered.push(chapter);
      chapterMap.delete(id);
    }
  });

  chapterMap.forEach((chapter) => {
    ordered.push(chapter);
  });

  return ordered.map((chapter, index) => ({
    ...chapter,
    position: index,
  }));
};

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const setPartOrderState = (newOrder: string[]) => {
  const uniqueOrder = Array.from(new Set(newOrder));
  partOrder.value = uniqueOrder;
  if (book.value) {
    book.value.part_order = JSON.stringify(uniqueOrder);
  }
};

const syncPartOrderWithParts = async () => {
  if (!book.value) {
    partOrder.value = [];
    return;
  }

  const storedOrder = parseIdArray(book.value.part_order);
  const partIds = parts.value.map((part) => part.id);
  const sanitized = storedOrder.filter((id) => partIds.includes(id));
  const missing = parts.value
    .filter((part) => !sanitized.includes(part.id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((part) => part.id);

  const updatedOrder = [...sanitized, ...missing];

  if (!arraysEqual(updatedOrder, storedOrder)) {
    try {
    await updatePartOrder(bookId.value, updatedOrder);
    } catch (error) {
      console.error("Failed to synchronize part order:", error);
    }
  }

  setPartOrderState(updatedOrder);
};

const buildChapterOrder = (partUpdates: Record<string, string[]>) => {
  const chapterOrder: string[] = [];

  if (partUpdates["null"]) {
    chapterOrder.push(...partUpdates["null"]);
  }

  const visited = new Set<string>();
  partOrder.value.forEach((partId) => {
    visited.add(partId);
    if (partUpdates[partId]) {
      chapterOrder.push(...partUpdates[partId]);
    }
  });

  Object.entries(partUpdates).forEach(([partId, chapterIds]) => {
    if (partId !== "null" && !visited.has(partId)) {
      chapterOrder.push(...chapterIds);
    }
  });

  return chapterOrder;
};

const startEditingBookTitle = () => {
  if (!book.value) return;
  editingBookTitle.value = book.value.title;
  isEditingBookTitle.value = true;
};

const cancelEditingBookTitle = () => {
  isEditingBookTitle.value = false;
  editingBookTitle.value = "";
};

const updateEditingBookTitle = (value: string) => {
  editingBookTitle.value = value;
};

const saveBookTitle = async () => {
  if (!book.value || !editingBookTitle.value.trim()) return;

  try {
    // Update book with new title
    await saveBook({
      id: book.value.id,
      title: editingBookTitle.value.trim(),
      chapter_order: book.value.chapter_order || "[]",
      part_order: book.value.part_order || "[]",
      cover_image_id: book.value.cover_image_id ?? null,
      created_at: book.value.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Update local ref
    book.value.title = editingBookTitle.value.trim();

    // Close editor
    isEditingBookTitle.value = false;
    editingBookTitle.value = "";
  } catch (error) {
    console.error("Failed to update book title:", error);
  }
};

const loadBook = async () => {
  try {
    loading.value = true;
    suppressDbChapterSync = true;

    // Load books from database
    await loadBooks();

    // Find the current book
    book.value = (books.value.find((b) => b.id === bookId.value) as DatabaseBook | undefined) || null;

    if (!book.value) {
      router.push("/books");
      partOrder.value = [];
      return;
    }

    // Load chapters from local database
    await loadChapters(bookId.value);

    // Load parts from database first
    parts.value = await getParts(bookId.value);

    await syncPartOrderWithParts();
    await syncChaptersFromDb();
    revisionActivity.value = await getBookRevisionActivity(bookId.value);
    await loadBookCoverImage(bookId.value);
    await loadChapterThumbnailsForBook();
    if (currentTab.value === "images") {
      await loadBookImages();
    }
  } catch (error) {
    console.error("Failed to load book:", error);
  } finally {
    suppressDbChapterSync = false;
    loading.value = false;
  }
};

const loadChapterThumbnailsForBook = async () => {
  try {
    const chapterIds = chapters.value.map((ch) => ch.id);
    chapterThumbnails.value = await fetchChapterThumbnails(chapterIds);

    const partIds = parts.value.map((p) => p.id);
    partThumbnails.value = await fetchPartThumbnails(partIds);
  } catch (error) {
    console.error("Failed to load thumbnails:", error);
    chapterThumbnails.value = {};
    partThumbnails.value = {};
  }
};

const refreshData = async () => {
  await loadBook();
  await loadWiki();
};

const createNewChapter = () => {
  router.push(`/books/${bookId.value}/chapter-editor`);
};

const goToOrganizeChapters = () => {
  router.push(`/books/${bookId.value}/organize`);
};

const openSearchModal = () => {
  showSearchModal.value = true;
};

const createNewChapterInPart = (partId: string) => {
  router.push({
    path: `/books/${bookId.value}/chapter-editor`,
    query: { partId },
  });
};

const insertChapter = (chapter: Chapter, placement: "before" | "after") => {
  router.push({
    path: `/books/${bookId.value}/chapter-editor`,
    query: {
      ...(chapter.part_id ? { partId: chapter.part_id } : {}),
      insertRelativeTo: chapter.id,
      insertPlacement: placement,
    },
  });
};

const editChapter = (chapterId: string) => {
  router.push(`/books/${bookId.value}/chapter-editor/${chapterId}`);
};

// Parts management functions
const togglePart = (partId: string) => {
  if (expandedParts.value.has(partId)) {
    // Collapse the part
    expandedParts.value.delete(partId);

    // If collapsing a part that contains the active chapter, navigate to book view
    const activeId = route.params.chapterId as string | undefined;
    if (activeId) {
      const part = chaptersByPart.value.parts.find((p) => p.id === partId);
      const containsActiveChapter = part?.chapters.some((chapter) => chapter.id === activeId);
      if (containsActiveChapter) {
        router.push(`/books/${bookId.value}`);
      }
    }
  } else {
    // Expand the part and navigate to the part detail page
    expandedParts.value.add(partId);
    router.push(`/books/${bookId.value}/parts/${partId}`);
  }
};

// Expand a part without toggling or navigating (used by View link)
const expandPart = (partId: string) => {
  expandedParts.value.add(partId);
};

// Expand the part containing the active chapter (used on initial load)
const expandPartForActiveChapter = () => {
  const activeId = route.params.chapterId as string | undefined;
  if (!activeId) return;

  const part = chaptersByPart.value.parts.find((p) =>
    p.chapters.some((chapter) => chapter.id === activeId)
  );

  if (part) {
    expandedParts.value.add(part.id);
  }
};

// Sidebar-specific drag handlers
const onSidebarDragStart = () => {
  isDragging.value = true;
  isDraggingInSidebar.value = true;
};

const onSidebarDragEnd = async () => {
  isDragging.value = false;
  // For sidebar, we want to save the order after drag ends
  // This handles reordering within the same part/uncategorized section
  await saveSidebarChapterOrder();
  isDraggingInSidebar.value = false;
};

const buildSidebarPartUpdates = () => {
  const partUpdates: Record<string, string[]> = {};

  partUpdates["null"] = sidebarUncategorized.value.map((c) => c.id);

  orderedParts.value.forEach((part) => {
    const list = sidebarPartLists.value[part.id] || [];
    partUpdates[part.id] = list.map((c) => c.id);
  });

  Object.entries(sidebarPartLists.value).forEach(([partId, list]) => {
    if (!(partId in partUpdates)) {
      partUpdates[partId] = list.map((c) => c.id);
    }
  });

  return partUpdates;
};

const saveSidebarChapterOrder = async () => {
  try {
    const partUpdates = buildSidebarPartUpdates();

    const chapterOrder = buildChapterOrder(partUpdates);

    // Send array-based reorder to backend
    await updateChapterOrders(bookId.value, chapterOrder, partUpdates, partOrder.value);

    logger.log("Saved sidebar chapter order with arrays:", { chapterOrder, partUpdates });

    // Reload to ensure UI reflects the saved state
    await loadBook();
  } catch (error) {
    console.error("Failed to save sidebar chapter order:", error);
    // Reload on error to revert UI to correct state
    await loadBook();
  }
};

const toggleSummary = (chapterId: string) => {
  if (expandedSummaries.value.has(chapterId)) {
    expandedSummaries.value.delete(chapterId);
  } else {
    expandedSummaries.value.add(chapterId);
  }
};

// Watch for route changes to trigger router-view rerender
watch(
  () => route.fullPath,
  () => {
    routerViewKey.value++;
  }
);


// Watch for tab changes to reload wiki pages or images
watch(currentTab, async (newTab) => {
  if (newTab === "wiki") {
    await loadWiki();
  } else if (newTab === "images") {
    await loadBookImages();
  }
});

// Watch for returning to wiki list from a wiki page (e.g., after deletion)
watch(
  () => activeWikiPageId.value,
  async (newId, oldId) => {
    // If we had a wiki page selected and now we don't, reload the list
    if (oldId && !newId && currentTab.value === "wiki") {
      await loadWiki();
    }
  }
);

watch(
  () => bookId.value,
  async () => {
    await loadBook();
    await loadWiki();
  }
);

onMounted(async () => {
  await loadBook();
  await loadWiki();
  expandPartForActiveChapter();
});
</script>

<template>
  <div class="lg:hidden">
    <BookMobileSection
      v-if="isOnBookOnly || (currentTab === 'images' && selectedImageId)"
      :book="book"
      :book-id="bookId"
      :is-editing-book-title="isEditingBookTitle"
      :editing-book-title="editingBookTitle"
      :current-tab="currentTab"
      :loading="loading"
      :loading-wiki="loadingWiki"
      :sorted-chapters="sortedChapters"
      :chapters-by-part="chaptersByPart"
      :chapter-count="chapterCount"
      :total-word-count="totalWordCount"
      :expanded-summaries="expandedSummaries"
      :wiki-pages-by-type="wikiPagesByType"
      :wiki-page-thumbnails="wikiPageThumbnails"
      :format-word-count="formatWordCount"
      :word-count-for-chapters="wordCountForChapters"
      :get-summary-preview="getSummaryPreview"
      :toggle-summary="toggleSummary"
      :toggle-wiki-page-pinned="toggleWikiPagePinned"
      :create-new-chapter="createNewChapter"
      :go-to-organize-chapters="goToOrganizeChapters"
      :create-new-chapter-in-part="createNewChapterInPart"
      :open-create-wiki-modal="openCreateWikiModal"
      :edit-chapter="editChapter"
      :start-editing-book-title="startEditingBookTitle"
      :save-book-title="saveBookTitle"
      :cancel-editing-book-title="cancelEditingBookTitle"
      :update-editing-book-title="updateEditingBookTitle"
      :get-type-icon="getTypeIcon"
      :get-type-color="getTypeColor"
      :can-select-images="canSelectImages"
      :cover-image-src="bookCoverSrc"
      :cover-loading="coverLoading"
      :cover-error="coverError"
      :select-book-cover="handleSelectBookCover"
      :delete-book-cover="handleDeleteBookCover"
      :chapter-thumbnails="chapterThumbnails"
      :part-thumbnails="partThumbnails"
      :book-images="bookImages"
      :book-image-sources="bookImageSources"
      :loading-images="loadingImages"
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
      :revision-activity="revisionActivity"
    />
    <router-view
      v-else
      :key="routerViewKey"
      @wiki-page-pin-changed="handleWikiPagePinChanged"
    />
  </div>

  <BookDesktopLayout
    :book="book"
    :book-id="bookId"
    :is-editing-book-title="isEditingBookTitle"
    :editing-book-title="editingBookTitle"
    :chapter-count="chapterCount"
    :total-word-count="totalWordCount"
    :current-tab="currentTab"
    :has-chapters="hasChapters"
    :loading-chapters="loading"
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
    :wiki-page-thumbnails="wikiPageThumbnails"
    :get-type-icon="getTypeIcon"
    :get-type-color="getTypeColor"
    :active-chapter-id="activeChapterId"
    :active-wiki-page-id="activeWikiPageId"
    :toggle-wiki-page-pinned="toggleWikiPagePinned"
    :open-create-wiki-modal="openCreateWikiModal"
    :is-on-book-only="isOnBookOnly"
    :router-view-key="routerViewKey"
    :start-editing-book-title="startEditingBookTitle"
    :save-book-title="saveBookTitle"
    :cancel-editing-book-title="cancelEditingBookTitle"
    :update-editing-book-title="updateEditingBookTitle"
    :can-select-images="canSelectImages"
    :cover-image-src="bookCoverSrc"
    :cover-loading="coverLoading"
    :cover-error="coverError"
    :select-book-cover="handleSelectBookCover"
    :delete-book-cover="handleDeleteBookCover"
    :chapter-thumbnails="chapterThumbnails"
    :part-thumbnails="partThumbnails"
    :book-images="bookImages"
    :book-image-sources="bookImageSources"
    :loading-images="loadingImages"
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
    :wiki-page-pin-changed="handleWikiPagePinChanged"
    :revision-activity="revisionActivity"
  />

  <SearchModal
    :show="showSearchModal"
    :book-id="bookId"
    :search-service="searchService"
    :initial-scope="contextualSearchScope"
    :target-id="contextualSearchTargetId"
    @close="showSearchModal = false"
    @refresh="refreshData"
  />

  <!-- Create Wiki Page Modal -->
  <teleport to="body">
    <div
      v-if="showCreateWikiModal"
      class="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div class="absolute inset-0 bg-navy-900/70" @click="closeCreateWikiModal"></div>
      <div class="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-navy-800">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Create Wiki Page</h2>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Add a new character, location, or concept to your book's wiki.
        </p>

        <div class="mt-4 space-y-4">
          <div>
            <label for="wiki-page-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Page Name
            </label>
            <input
              id="wiki-page-name"
              v-model="newWikiPageName"
              type="text"
              class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="e.g., John Smith, The Castle, Time Travel"
              :disabled="creatingWikiPage"
              @keydown.enter="handleCreateWikiPage"
            />
          </div>

          <div>
            <label for="wiki-page-type" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Page Type
            </label>
            <select
              id="wiki-page-type"
              v-model="newWikiPageType"
              class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              :disabled="creatingWikiPage"
            >
              <option value="character">Character</option>
              <option value="location">Location</option>
              <option value="concept">Concept</option>
              <option value="other">Other</option>
            </select>
          </div>

          <p v-if="createWikiPageError" class="text-sm text-red-600 dark:text-red-400">
            {{ createWikiPageError }}
          </p>
        </div>

        <div class="mt-6 flex justify-end space-x-3">
          <button
            @click="closeCreateWikiModal"
            :disabled="creatingWikiPage"
            class="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            @click="handleCreateWikiPage"
            :disabled="creatingWikiPage || !newWikiPageName.trim()"
            class="inline-flex items-center rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              v-if="creatingWikiPage"
              class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            ></span>
            {{ creatingWikiPage ? 'Creating...' : 'Create Page' }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>
