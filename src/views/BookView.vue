<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDatabase } from "@/composables/useDatabase";
import { useImageLibrary } from "@/composables/useImageLibrary";
import type { Book as DatabaseBook, BookPart, ImageAsset } from "@/lib/database";
import type {
  BookChapter,
  BookOrganizedPart,
  BookChaptersByPart,
  BookWikiPage,
} from "@/types/bookView";

type Chapter = BookChapter;
type OrganizedPart = BookOrganizedPart;
type WikiPage = BookWikiPage;
import { BookOpenIcon, UserIcon, MapPinIcon, LightBulbIcon } from "@heroicons/vue/24/outline";
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
  getSummary,
  getNotes,
  saveBook,
  getParts,
  updateChapterOrders,
  updatePartOrder,
  searchBook,
  replaceInChapter,
  replaceInWikiPage,
} = useDatabase();

const {
  desktopImagesAvailable,
  fetchBookCover,
  pickNewBookCover,
  getImageSource: getCoverImageSource,
  fetchChapterThumbnails,
  fetchPartThumbnails,
} = useImageLibrary();

const book = ref<DatabaseBook | null>(null);
const chapters = ref<BookChapter[]>([]);
const parts = ref<BookPart[]>([]);
const partOrder = ref<string[]>([]);
const wikiPages = ref<BookWikiPage[]>([]);
const hasWikiPages = computed(() => wikiPages.value.length > 0);
const loading = ref(false);
const loadingWiki = ref(false);
const expandedSummaries = ref<Set<string>>(new Set());
const routerViewKey = ref(0);
let suppressDbChapterSync = false;
const bookCoverImage = ref<ImageAsset | null>(null);
const bookCoverSrc = ref<string | null>(null);
const coverLoading = ref(false);
const coverError = ref<string | null>(null);
const chapterThumbnails = ref<Record<string, string>>({});
const partThumbnails = ref<Record<string, string>>({});

// Book editing state
const isEditingBookTitle = ref(false);
const editingBookTitle = ref("");

// Parts state
const expandedParts = ref<Set<string>>(new Set());

// Search service using local database
const searchService = {
  searchBook: async (bookId: string, query: string) => {
    return await searchBook(bookId, query);
  },
  replaceInChapter: async (chapterId: string, searchText: string, replaceText: string) => {
    await replaceInChapter(chapterId, searchText, replaceText);
  },
  replaceInWikiPage: async (wikiPageId: string, searchText: string, replaceText: string) => {
    await replaceInWikiPage(wikiPageId, searchText, replaceText);
  },
};

// Drag and drop state
const isDragging = ref(false);
const isDraggingInSidebar = ref(false);
const showSearchModal = ref(false);

const currentTab = computed(() => {
  // Check if we're on a wiki page child route
  if (route.path.includes("/wiki/")) {
    return "wiki";
  }
  // Check query parameter
  return route.query.tab === "wiki" ? "wiki" : "chapters";
});

const isOnBookOnly = computed(() => {
  // Check if we're on the book route but no child route (chapter or wiki page) is active
  return route.name === "book" && !route.params.chapterId && !route.params.wikiPageId;
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

  const chapterPromises = dbChapters.value.map(async (ch: any, index: number) => {
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
    } catch (error) {
      console.error("Failed to synchronize chapters:", error);
    }
  }
);

watch(
  () => desktopImagesAvailable.value,
  (available) => {
    if (available && book.value) {
      loadBookCoverImage(book.value.id);
    } else if (!available) {
      bookCoverImage.value = null;
      bookCoverSrc.value = null;
    }
  }
);

watch(
  () => book.value?.id,
  (nextId) => {
    if (nextId && desktopImagesAvailable.value) {
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

const persistPartOrder = async (newOrder: string[]) => {
  const uniqueOrder = Array.from(new Set(newOrder));
  if (arraysEqual(uniqueOrder, partOrder.value)) {
    return true;
  }

  try {
    await updatePartOrder(bookId.value, uniqueOrder);
    setPartOrderState(uniqueOrder);
    return true;
  } catch (error) {
    console.error("Failed to update part order:", error);
    return false;
  }
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

const formatWordCount = (count: number) => {
  if (count < 1000) return count.toString();
  return (count / 1000).toFixed(1) + "k";
};

const wordCountForChapters = (chapterList: Chapter[]) => {
  return chapterList.reduce((total, chapter) => total + (chapter.word_count || 0), 0);
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
    if (desktopImagesAvailable.value) {
      await loadBookCoverImage(bookId.value);
      await loadChapterThumbnailsForBook();
    } else {
      bookCoverImage.value = null;
      bookCoverSrc.value = null;
      chapterThumbnails.value = {};
      partThumbnails.value = {};
    }
  } catch (error) {
    console.error("Failed to load book:", error);
  } finally {
    suppressDbChapterSync = false;
    loading.value = false;
  }
};

const loadChapterThumbnailsForBook = async () => {
  if (!desktopImagesAvailable.value) {
    chapterThumbnails.value = {};
    partThumbnails.value = {};
    return;
  }

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

const loadBookCoverImage = async (targetBookId: string) => {
  if (!desktopImagesAvailable.value) {
    bookCoverImage.value = null;
    bookCoverSrc.value = null;
    return;
  }

  coverLoading.value = true;
  coverError.value = null;
  try {
    const asset = await fetchBookCover(targetBookId);
    bookCoverImage.value = asset;
    bookCoverSrc.value = asset ? await getCoverImageSource(asset) : null;
  } catch (error) {
    coverError.value = error instanceof Error ? error.message : "Failed to load book cover";
  } finally {
    coverLoading.value = false;
  }
};

const handleSelectBookCover = async () => {
  if (!book.value) return;

  coverLoading.value = true;
  coverError.value = null;
  try {
    const asset = await pickNewBookCover(book.value.id);
    if (asset) {
      bookCoverImage.value = asset;
      bookCoverSrc.value = await getCoverImageSource(asset);
      book.value.cover_image_id = asset.id;
    }
  } catch (error) {
    coverError.value = error instanceof Error ? error.message : "Failed to update book cover";
  } finally {
    coverLoading.value = false;
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

    console.log("Saved sidebar chapter order with arrays:", { chapterOrder, partUpdates });

    // Reload to ensure UI reflects the saved state
    await loadBook();
  } catch (error) {
    console.error("Failed to save sidebar chapter order:", error);
    // Reload on error to revert UI to correct state
    await loadBook();
  }
};

const loadWiki = async () => {
  if (!bookId.value) return;

  try {
    loadingWiki.value = true;
    const safeParseArray = (value: string | null) => {
      if (!value) return [];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const pages = await getWikiPages(bookId.value);
    wikiPages.value = pages.map((page: any) => ({
      id: page.id,
      page_name: page.page_name,
      page_type: (page.page_type || "character") as WikiPage["page_type"],
      summary: page.summary ?? null,
      aliases: safeParseArray(page.aliases),
      tags: safeParseArray(page.tags),
      is_major: Boolean(page.is_major),
      created_by_ai: Boolean(page.created_by_ai),
      created_at: page.created_at,
      updated_at: page.updated_at,
      content_length: typeof page.content === "string" ? page.content.length : 0,
    }));
  } catch (error) {
    console.error("Failed to load wiki pages:", error);
    wikiPages.value = [];
  } finally {
    loadingWiki.value = false;
  }
};

const wikiPagesByType = computed(() => {
  const grouped = wikiPages.value.reduce((acc, page) => {
    if (!acc[page.page_type]) {
      acc[page.page_type] = [];
    }
    acc[page.page_type].push(page);
    return acc;
  }, {} as Record<string, WikiPage[]>);

  // Sort each group: major pages first, then alphabetical
  Object.keys(grouped).forEach((type) => {
    grouped[type].sort((a, b) => {
      if (a.is_major !== b.is_major) {
        return b.is_major ? 1 : -1;
      }
      return a.page_name.localeCompare(b.page_name);
    });
  });

  return grouped;
});

const getTypeIcon = (type: string) => {
  switch (type) {
    case "character":
      return UserIcon;
    case "location":
      return MapPinIcon;
    case "concept":
      return LightBulbIcon;
    default:
      return BookOpenIcon;
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case "character":
      return "text-blue-600";
    case "location":
      return "text-green-600";
    case "concept":
      return "text-purple-600";
    default:
      return "text-gray-600";
  }
};

const toggleSummary = (chapterId: string) => {
  if (expandedSummaries.value.has(chapterId)) {
    expandedSummaries.value.delete(chapterId);
  } else {
    expandedSummaries.value.add(chapterId);
  }
};

const getSummaryPreview = (summary: string, maxLength: number = 100) => {
  if (!summary) return "";
  if (summary.length <= maxLength) return summary;

  // Find the last complete sentence within the limit
  const truncated = summary.substring(0, maxLength);
  const lastSentence = truncated.lastIndexOf(".");

  if (lastSentence > 0 && lastSentence > maxLength * 0.6) {
    return truncated.substring(0, lastSentence + 1);
  }

  // If no good sentence break, just truncate at word boundary
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.substring(0, lastSpace) + "..." : truncated + "...";
};

// Watch for route changes to trigger router-view rerender
watch(
  () => route.fullPath,
  () => {
    routerViewKey.value++;
  }
);


// Watch for tab changes to reload wiki pages
watch(currentTab, async (newTab) => {
  if (newTab === "wiki") {
    await loadWiki();
  }
});

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
      v-if="isOnBookOnly"
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
      :format-word-count="formatWordCount"
      :word-count-for-chapters="wordCountForChapters"
      :get-summary-preview="getSummaryPreview"
      :toggle-summary="toggleSummary"
      :create-new-chapter="createNewChapter"
      :go-to-organize-chapters="goToOrganizeChapters"
      :create-new-chapter-in-part="createNewChapterInPart"
      :edit-chapter="editChapter"
      :start-editing-book-title="startEditingBookTitle"
      :save-book-title="saveBookTitle"
      :cancel-editing-book-title="cancelEditingBookTitle"
      :update-editing-book-title="updateEditingBookTitle"
      :get-type-icon="getTypeIcon"
      :get-type-color="getTypeColor"
      :desktop-images-available="desktopImagesAvailable"
      :cover-image-src="bookCoverSrc"
      :cover-loading="coverLoading"
      :cover-error="coverError"
      :select-book-cover="handleSelectBookCover"
      :chapter-thumbnails="chapterThumbnails"
      :part-thumbnails="partThumbnails"
    />
    <router-view v-else :key="routerViewKey" />
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
    :create-new-chapter="createNewChapter"
    :create-new-chapter-in-part="createNewChapterInPart"
    :go-to-organize-chapters="goToOrganizeChapters"
    :open-search-modal="openSearchModal"
    :on-sidebar-drag-start="onSidebarDragStart"
    :on-sidebar-drag-end="onSidebarDragEnd"
    :edit-chapter="editChapter"
    :format-word-count="formatWordCount"
    :word-count-for-chapters="wordCountForChapters"
    :loading-wiki="loadingWiki"
    :has-wiki-pages="hasWikiPages"
    :wiki-pages-by-type="wikiPagesByType"
    :get-type-icon="getTypeIcon"
    :get-type-color="getTypeColor"
    :active-chapter-id="activeChapterId"
    :active-wiki-page-id="activeWikiPageId"
    :is-on-book-only="isOnBookOnly"
    :router-view-key="routerViewKey"
    :start-editing-book-title="startEditingBookTitle"
    :save-book-title="saveBookTitle"
    :cancel-editing-book-title="cancelEditingBookTitle"
    :update-editing-book-title="updateEditingBookTitle"
    :desktop-images-available="desktopImagesAvailable"
    :cover-image-src="bookCoverSrc"
    :cover-loading="coverLoading"
    :cover-error="coverError"
    :select-book-cover="handleSelectBookCover"
    :chapter-thumbnails="chapterThumbnails"
    :part-thumbnails="partThumbnails"
  />

  <SearchModal
    :show="showSearchModal"
    :book-id="bookId"
    :search-service="searchService as any"
    @close="showSearchModal = false"
    @refresh="refreshData"
  />
</template>
