<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDatabase } from "@/composables/useDatabase";
import type { Book as DatabaseBook, BookPart } from "@/lib/database";
import {
  PlusIcon,
  DocumentTextIcon,
  PencilIcon,
  BookOpenIcon,
  UserIcon,
  MapPinIcon,
  LightBulbIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
} from "@heroicons/vue/24/outline";
import { CheckCircleIcon } from "@heroicons/vue/24/solid";
import draggable from "vuedraggable";
import SearchModal from "@/components/SearchModal.vue";

interface Chapter {
  id: string;
  title: string | null;
  word_count: number;
  has_summary: boolean;
  summary: string | null;
  position: number;
  position_in_part: number | null;
  part_id: string | null;
  part_name: string | null;
}

interface OrganizedPart extends BookPart {
  chapters: Chapter[];
  wordCount: number;
}

interface WikiPage {
  id: string;
  page_name: string;
  page_type: "character" | "location" | "concept" | "other";
  summary: string | null;
  aliases: string[];
  tags: string[];
  is_major: boolean;
  created_by_ai: boolean;
  created_at: string;
  updated_at: string;
  content_length: number;
}

const route = useRoute();
const router = useRouter();
const bookId = route.params.id as string;

// Use local database
const {
  books,
  chapters: dbChapters,
  loadBooks,
  loadChapters,
  getWikiPages,
  getSummary,
  saveBook,
  getParts,
  updateChapterOrders,
  updatePartOrder,
  searchBook,
  replaceInChapter,
  replaceInWikiPage,
} = useDatabase();

const book = ref<DatabaseBook | null>(null);
const chapters = ref<Chapter[]>([]);
const parts = ref<BookPart[]>([]);
const partOrder = ref<string[]>([]);
const wikiPages = ref<WikiPage[]>([]);
const loading = ref(false);
const loadingWiki = ref(false);
const expandedSummaries = ref<Set<string>>(new Set());
const routerViewKey = ref(0);

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

const sortedChapters = computed(() => {
  // Backend returns chapters in correct order based on array positions
  return chapters.value.slice().sort((a, b) => (a.position || 0) - (b.position || 0));
});

const totalWordCount = computed(() => {
  return chapters.value.reduce((total, chapter) => {
    return total + (chapter.word_count || 0);
  }, 0);
});

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
const chaptersByPart = computed(() => {
  const partList = orderedParts.value;
  const partIdSet = new Set(partList.map((part) => part.id));
  const uncategorizedChapters = sortedChapters.value.filter(
    (chapter) => !chapter.part_id || !partIdSet.has(chapter.part_id)
  );

  const organizedParts: OrganizedPart[] = partList.map((part) => {
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

const sidebarPartLists = ref<Record<string, Chapter[]>>({});
const sidebarUncategorized = ref<Chapter[]>([]);

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

const parseIdArray = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
      await updatePartOrder(bookId, updatedOrder);
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
    await updatePartOrder(bookId, uniqueOrder);
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

// Check if a part should be expanded by default (contains active chapter)
const shouldExpandPart = (partId: string) => {
  const activeChapterId = route.params.chapterId;
  if (!activeChapterId) return false;

  return (
    chaptersByPart.value.parts
      .find((part) => part.id === partId)
      ?.chapters.some((chapter) => chapter.id === activeChapterId) || false
  );
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

const saveBookTitle = async () => {
  if (!book.value || !editingBookTitle.value.trim()) return;

  try {
    // Update book with new title
    await saveBook({
      id: book.value.id,
      title: editingBookTitle.value.trim(),
      chapter_order: book.value.chapter_order || "[]",
      part_order: book.value.part_order || "[]",
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

    // Load books from database
    await loadBooks();

    // Find the current book
    book.value = (books.value.find((b) => b.id === bookId) as DatabaseBook | undefined) || null;

    if (!book.value) {
      router.push("/books");
      partOrder.value = [];
      return;
    }

    // Load chapters from local database
    await loadChapters(bookId);

    // Load parts from database first
    parts.value = await getParts(bookId);

    await syncPartOrderWithParts();

    // Create a map of part IDs to part names for quick lookup
    const partNameMap = new Map<string, string>();
    parts.value.forEach((part) => {
      partNameMap.set(part.id, part.name);
    });

    // Map database chapters to BookView chapter format and check for summaries
    const chapterPromises = dbChapters.value.map(async (ch: any, index: number) => {
      const summary = await getSummary(ch.id);
      return {
        id: ch.id,
        title: ch.title || null,
        word_count: Number(ch.word_count) || 0,
        has_summary: !!summary,
        summary: summary?.summary || null,
        position: index,
        position_in_part: null,
        part_id: ch.part_id || null,
        part_name: ch.part_id ? partNameMap.get(ch.part_id) || null : null,
      };
    });

    chapters.value = await Promise.all(chapterPromises);
    syncSidebarLists();
  } catch (error) {
    console.error("Failed to load book:", error);
  } finally {
    loading.value = false;
  }
};

const refreshData = async () => {
  await loadBook();
  await loadWiki();
};

const createNewChapter = () => {
  router.push(`/books/${bookId}/chapter-editor`);
};

const goToOrganizeChapters = () => {
  router.push(`/books/${bookId}/organize`);
};

const createNewChapterInPart = (partId: string) => {
  router.push({
    path: `/books/${bookId}/chapter-editor`,
    query: { partId },
  });
};

const editChapter = (chapterId: string) => {
  router.push(`/books/${bookId}/chapter-editor/${chapterId}`);
};

// Parts management functions
const togglePart = (partId: string) => {
  if (expandedParts.value.has(partId)) {
    expandedParts.value.delete(partId);
  } else {
    expandedParts.value.add(partId);
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
    await updateChapterOrders(bookId, chapterOrder, partUpdates, partOrder.value);

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
  if (!bookId) return;

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

    const pages = await getWikiPages(bookId);
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

const checkAndRedirectToFirstChapter = () => {
  const isDesktop = window.innerWidth >= 1024; // lg breakpoint
  const hasChapterInRoute = route.path.includes("/chapters/") || route.path.includes("/wiki/");

  if (isDesktop && !hasChapterInRoute && sortedChapters.value.length > 0) {
    const firstChapter = sortedChapters.value[0];
    router.replace(`/books/${bookId}/chapters/${firstChapter.id}`);
  }
};

const handleResize = () => {
  checkAndRedirectToFirstChapter();
};

// Watch for tab changes to reload wiki pages
watch(currentTab, async (newTab) => {
  if (newTab === "wiki") {
    await loadWiki();
  }
});

onMounted(async () => {
  await loadBook();
  await loadWiki();

  // Check if we need to redirect to first chapter
  checkAndRedirectToFirstChapter();

  // Add resize listener
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});
</script>

<template>
  <!-- Mobile layout: Keep the exact same behavior as before -->
  <div class="lg:hidden max-w-6xl mx-auto p-6">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex-1">
          <!-- Editing mode -->
          <div v-if="isEditingBookTitle" class="flex items-center space-x-2">
            <input
              v-model="editingBookTitle"
              @keyup.enter="saveBookTitle"
              @keyup.esc="cancelEditingBookTitle"
              type="text"
              class="text-3xl font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Book title"
              autofocus
            />
            <button
              @click="saveBookTitle"
              class="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Save
            </button>
            <button
              @click="cancelEditingBookTitle"
              class="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>

          <!-- Display mode -->
          <div v-else class="flex items-center space-x-2 group">
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">{{ book?.title }}</h1>
            <button
              @click="startEditingBookTitle"
              class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Rename book"
            >
              <PencilIcon class="w-5 h-5" />
            </button>
          </div>

          <p class="text-gray-600 dark:text-gray-400 mt-1">
            {{ chapters.length }} chapters · {{ formatWordCount(totalWordCount) }} words total
          </p>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <button
            @click="createNewChapter"
            class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon class="w-5 h-5 mr-2" />
            New Chapter
          </button>
          <button
            @click="goToOrganizeChapters"
            class="inline-flex items-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <Cog6ToothIcon class="w-5 h-5 mr-2" />
            Organize Chapters
          </button>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex space-x-1 rounded-xl bg-blue-900/20 p-1 mb-6">
      <router-link
        :to="`/books/${bookId}`"
        :class="[
          'w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 flex items-center justify-center',
          currentTab === 'chapters'
            ? 'bg-white text-blue-700 shadow'
            : 'text-blue-100 hover:bg-white/[0.12] hover:text-white',
        ]"
      >
        <DocumentTextIcon class="w-5 h-5 inline mr-2" />
        Chapters
      </router-link>
      <router-link
        :to="`/books/${bookId}?tab=wiki`"
        :class="[
          'w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-400 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 flex items-center justify-center',
          currentTab === 'wiki'
            ? 'bg-white text-blue-700 shadow'
            : 'text-blue-100 hover:bg-white/[0.12] hover:text-white',
        ]"
      >
        <BookOpenIcon class="w-5 h-5 inline mr-2" />
        Characters
      </router-link>
    </div>

    <!-- Mobile Tab Content -->
    <div v-if="currentTab === 'chapters'">
      <!-- Loading state -->
      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <!-- Chapters list -->
    <div v-else-if="chapters.length > 0" class="space-y-6">
      <!-- Parts -->
      <div v-if="chaptersByPart.parts.length > 0" class="space-y-6">
        <section
          v-for="part in chaptersByPart.parts"
          :key="part.id"
          class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm"
        >
          <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ part.name }}</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {{ part.chapters.length }} chapter{{ part.chapters.length !== 1 ? 's' : '' }} ·
                {{ formatWordCount(part.wordCount) }} words
              </p>
            </div>
            <button
              @click="createNewChapterInPart(part.id)"
              class="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusIcon class="w-4 h-4 mr-2" />
              Add Chapter
            </button>
          </div>

          <div class="divide-y divide-gray-200 dark:divide-gray-700">
            <div
              v-for="chapter in part.chapters"
              :key="chapter.id"
              class="px-4 py-4"
            >
              <div class="flex items-start gap-3">
                <router-link
                  :to="`/m/books/${bookId}/chapters/${chapter.id}`"
                  class="flex-1"
                >
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    {{ chapter.title || chapter.id }}
                  </h3>
                  <div class="mt-1 flex flex-wrap items-center gap-4">
                    <span class="text-sm text-gray-500 dark:text-gray-400">
                      {{ chapter.word_count?.toLocaleString() || 0 }} words
                    </span>
                    <div
                      class="flex items-center"
                      :title="chapter.has_summary ? 'Summarized' : 'Not summarized'"
                    >
                      <CheckCircleIcon
                        :class="chapter.has_summary ? 'text-green-500' : 'text-gray-300'"
                        class="w-4 h-4 mr-1"
                      />
                      <span
                        :class="chapter.has_summary ? 'text-green-600' : 'text-gray-500'"
                        class="text-sm"
                      >
                        {{ chapter.has_summary ? 'Summarized' : 'Not summarized' }}
                      </span>
                    </div>
                  </div>

                  <div v-if="chapter.has_summary && chapter.summary" class="mt-3">
                    <div class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                      <span v-if="!expandedSummaries.has(chapter.id)">
                        {{ getSummaryPreview(chapter.summary) }}
                        <button
                          @click.stop.prevent="toggleSummary(chapter.id)"
                          class="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                        >
                          See more
                        </button>
                      </span>
                      <span v-else>
                        {{ chapter.summary }}
                        <button
                          @click.stop.prevent="toggleSummary(chapter.id)"
                          class="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                        >
                          Show less
                        </button>
                      </span>
                    </div>
                  </div>
                </router-link>

                <button
                  @click="editChapter(chapter.id)"
                  class="mt-1 inline-flex items-center px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                >
                  <PencilIcon class="w-4 h-4 mr-1" />
                  Edit
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Uncategorized chapters -->
      <div
        v-if="chaptersByPart.uncategorized.length > 0"
        class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm"
      >
        <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Uncategorized</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {{ chaptersByPart.uncategorized.length }} chapter{{
                chaptersByPart.uncategorized.length !== 1 ? 's' : ''
              }}
            </p>
          </div>
          <button
            @click="createNewChapter"
            class="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon class="w-4 h-4 mr-2" />
            Add Chapter
          </button>
        </div>

        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          <div
            v-for="chapter in chaptersByPart.uncategorized"
            :key="chapter.id"
            class="px-4 py-4"
          >
            <div class="flex items-start gap-3">
              <router-link
                :to="`/m/books/${bookId}/chapters/${chapter.id}`"
                class="flex-1"
              >
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  {{ chapter.title || chapter.id }}
                </h3>
                <div class="mt-1 flex flex-wrap items-center gap-4">
                  <span class="text-sm text-gray-500 dark:text-gray-400">
                    {{ chapter.word_count?.toLocaleString() || 0 }} words
                  </span>
                  <div
                    class="flex items-center"
                    :title="chapter.has_summary ? 'Summarized' : 'Not summarized'"
                  >
                    <CheckCircleIcon
                      :class="chapter.has_summary ? 'text-green-500' : 'text-gray-300'"
                      class="w-4 h-4 mr-1"
                    />
                    <span
                      :class="chapter.has_summary ? 'text-green-600' : 'text-gray-500'"
                      class="text-sm"
                    >
                      {{ chapter.has_summary ? 'Summarized' : 'Not summarized' }}
                    </span>
                  </div>
                </div>

                <div v-if="chapter.has_summary && chapter.summary" class="mt-3">
                  <div class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    <span v-if="!expandedSummaries.has(chapter.id)">
                      {{ getSummaryPreview(chapter.summary) }}
                      <button
                        @click.stop.prevent="toggleSummary(chapter.id)"
                        class="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                      >
                        See more
                      </button>
                    </span>
                    <span v-else>
                      {{ chapter.summary }}
                      <button
                        @click.stop.prevent="toggleSummary(chapter.id)"
                        class="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                      >
                        Show less
                      </button>
                    </span>
                  </div>
                </div>
              </router-link>

              <button
                @click="editChapter(chapter.id)"
                class="mt-1 inline-flex items-center px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
              >
                <PencilIcon class="w-4 h-4 mr-1" />
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Fallback list when there are no parts -->
      <div
        v-if="chaptersByPart.parts.length === 0"
        class="space-y-4"
      >
        <div
          v-for="chapter in sortedChapters"
          :key="chapter.id"
          class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm px-4 py-4"
        >
          <div class="flex items-start gap-3">
            <router-link
              :to="`/m/books/${bookId}/chapters/${chapter.id}`"
              class="flex-1"
            >
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                {{ chapter.title || chapter.id }}
              </h3>
              <div class="mt-1 flex flex-wrap items-center gap-4">
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  {{ chapter.word_count?.toLocaleString() || 0 }} words
                </span>
                <div
                  class="flex items-center"
                  :title="chapter.has_summary ? 'Summarized' : 'Not summarized'"
                >
                  <CheckCircleIcon
                    :class="chapter.has_summary ? 'text-green-500' : 'text-gray-300'"
                    class="w-4 h-4 mr-1"
                  />
                  <span
                    :class="chapter.has_summary ? 'text-green-600' : 'text-gray-500'"
                    class="text-sm"
                  >
                    {{ chapter.has_summary ? 'Summarized' : 'Not summarized' }}
                  </span>
                </div>
              </div>

              <div v-if="chapter.has_summary && chapter.summary" class="mt-3">
                <div class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span v-if="!expandedSummaries.has(chapter.id)">
                    {{ getSummaryPreview(chapter.summary) }}
                    <button
                      @click.stop.prevent="toggleSummary(chapter.id)"
                      class="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                    >
                      See more
                    </button>
                  </span>
                  <span v-else>
                    {{ chapter.summary }}
                    <button
                      @click.stop.prevent="toggleSummary(chapter.id)"
                      class="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                    >
                      Show less
                    </button>
                  </span>
                </div>
              </div>
            </router-link>

            <button
              @click="editChapter(chapter.id)"
              class="mt-1 inline-flex items-center px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
            >
              <PencilIcon class="w-4 h-4 mr-1" />
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>

      <!-- Empty state -->
      <div v-else class="text-center py-16">
        <DocumentTextIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No chapters yet</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Add your first chapter to start getting AI feedback.
        </p>
        <button
          @click="createNewChapter"
          class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusIcon class="w-5 h-5 mr-2" />
          Add First Chapter
        </button>
      </div>
    </div>

    <div v-else-if="currentTab === 'wiki'">
      <!-- Mobile Wiki Content -->
      <div v-if="loadingWiki" class="flex justify-center items-center h-64">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <div v-else-if="wikiPages.length > 0" class="space-y-8">
        <div v-for="(pages, type) in wikiPagesByType" :key="type" class="space-y-4">
          <div class="flex items-center space-x-2">
            <component :is="getTypeIcon(type)" :class="['w-6 h-6', getTypeColor(type)]" />
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white capitalize">
              {{ type }}s
            </h2>
            <span class="text-sm text-gray-500 dark:text-gray-400">({{ pages.length }})</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <router-link
              v-for="page in pages"
              :key="page.id"
              :to="`/m/books/${bookId}/wiki/${page.id}`"
              class="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 p-4 block hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer"
            >
              <div class="flex items-start justify-between mb-2">
                <div class="flex items-center space-x-2">
                  <h3 class="font-semibold text-gray-900 dark:text-white">{{ page.page_name }}</h3>
                  <span
                    v-if="page.is_major"
                    class="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full"
                  >
                    Major
                  </span>
                </div>
              </div>

              <p
                v-if="page.summary"
                class="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2"
              >
                {{ page.summary }}
              </p>

              <div
                class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
              >
                <span>{{
                  page.content_length ? `${page.content_length} chars` : "No content"
                }}</span>
                <span>Updated {{ new Date(page.updated_at).toLocaleDateString() }}</span>
              </div>

              <div v-if="page.tags && page.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
                <span
                  v-for="tag in page.tags.slice(0, 3)"
                  :key="tag"
                  class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                >
                  {{ tag }}
                </span>
                <span v-if="page.tags.length > 3" class="text-xs text-gray-500">
                  +{{ page.tags.length - 3 }} more
                </span>
              </div>
            </router-link>
          </div>
        </div>
      </div>

      <!-- Empty wiki state -->
      <div v-else class="text-center py-16">
        <BookOpenIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No wiki pages yet</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Wiki pages will be automatically created when you generate chapter summaries with
          character mentions.
        </p>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          💡 Try generating a summary for a chapter to see the wiki in action!
        </div>
      </div>
    </div>
  </div>

  <!-- Desktop layout: Full screen split view -->
  <div class="hidden lg:flex h-[calc(100vh-4rem-1px)]">
    <!-- Split view -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left sidebar: Compact list -->
      <div
        class="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto relative"
      >
        <div class="p-4 pb-16">
          <!-- Book header -->
          <div class="mb-6">
            <!-- Editing mode -->
            <div v-if="isEditingBookTitle" class="flex flex-col space-y-2">
              <input
                v-model="editingBookTitle"
                @keyup.enter="saveBookTitle"
                @keyup.esc="cancelEditingBookTitle"
                type="text"
                class="text-xl font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Book title"
                autofocus
              />
              <div class="flex space-x-2">
                <button
                  @click="saveBookTitle"
                  class="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
                <button
                  @click="cancelEditingBookTitle"
                  class="flex-1 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>

            <!-- Display mode -->
            <div v-else class="flex items-center space-x-2">
              <h1 class="text-xl font-bold text-gray-900 dark:text-white flex-1">
                {{ book?.title }}
              </h1>
              <button
                @click="startEditingBookTitle"
                class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Rename book"
              >
                <PencilIcon class="w-5 h-5" />
              </button>
            </div>

            <p class="text-gray-600 dark:text-gray-400 mt-1">
              {{ chapters.length }} chapters · {{ formatWordCount(totalWordCount) }} words total
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="space-y-3 mb-6">
            <button
              @click="createNewChapter"
              class="w-full inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusIcon class="w-5 h-5 mr-2" />
              New Chapter
            </button>
            <button
              @click="goToOrganizeChapters"
              class="w-full inline-flex items-center justify-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Cog6ToothIcon class="w-5 h-5 mr-2" />
              Organize Chapters
            </button>
            <button
              @click="showSearchModal = true"
              class="w-full inline-flex items-center justify-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <MagnifyingGlassIcon class="w-5 h-5 mr-2" />
              Search & Replace
            </button>
          </div>

          <div class="flex space-x-1 rounded-xl bg-blue-900/20 p-1 mb-2">
            <router-link
              :to="`/books/${bookId}`"
              :class="[
                'px-4 py-2 text-sm font-medium leading-5 text-blue-700 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 flex items-center rounded-lg transition-colors',
                currentTab === 'chapters'
                  ? 'bg-white text-blue-700 shadow'
                  : 'text-blue-100 hover:bg-white/[0.12] hover:text-white',
              ]"
            >
              <DocumentTextIcon class="w-4 h-4 inline mr-2" />
              Chapters
            </router-link>
            <router-link
              :to="`/books/${bookId}?tab=wiki`"
              :class="[
                'px-4 py-2 text-sm font-medium leading-5 text-blue-400 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 flex items-center rounded-lg transition-colors',
                currentTab === 'wiki'
                  ? 'bg-white text-blue-700 shadow'
                  : 'text-blue-100 hover:bg-white/[0.12] hover:text-white',
              ]"
            >
              <BookOpenIcon class="w-4 h-4 inline mr-2" />
              Characters
            </router-link>
          </div>
          <!-- Chapters tab content -->
          <div v-if="currentTab === 'chapters'">
            <!-- Loading state -->
            <div v-if="loading" class="flex justify-center items-center h-32">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>

            <!-- Parts and Chapters -->
            <div v-else-if="chapters.length > 0" class="space-y-3">
              <!-- Parts accordion -->
              <div
                v-for="part in chaptersByPart.parts"
                :key="part.id"
                class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                <!-- Part header -->
                <button
                  @click="togglePart(part.id)"
                  class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-between text-left transition-colors"
                >
                  <div>
                    <h4 class="font-medium text-gray-900 dark:text-white">{{ part.name }}</h4>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {{ (sidebarPartLists[part.id]?.length || 0) }} chapter{{
                        (sidebarPartLists[part.id]?.length || 0) !== 1 ? "s" : ""
                      }}
                      ·
                      {{
                        formatWordCount(
                          wordCountForChapters(sidebarPartLists[part.id] || [])
                        )
                      }}
                      words
                    </p>
                  </div>
                  <svg
                    :class="
                      expandedParts.has(part.id) || shouldExpandPart(part.id) ? 'rotate-180' : ''
                    "
                    class="w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </button>

                <!-- Part chapters -->
                <div
                  v-if="expandedParts.has(part.id) || shouldExpandPart(part.id)"
                  class="bg-white dark:bg-gray-800"
                >
                  <div class="px-4 pt-3 pb-2 flex justify-end border-t border-gray-200 dark:border-gray-700">
                    <button
                      @click.prevent.stop="createNewChapterInPart(part.id)"
                      class="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      <PlusIcon class="w-4 h-4 mr-1" />
                      Add Chapter in Part
                    </button>
                  </div>
                  <draggable
                    v-model="sidebarPartLists[part.id]"
                    item-key="id"
                    group="sidebar-chapters"
                    class="space-y-1"
                    @start="onSidebarDragStart"
                    @end="onSidebarDragEnd"
                    :disabled="false"
                    ghost-class="opacity-50"
                    drag-class="rotate-1"
                    handle=".drag-handle"
                  >
                    <template #item="{ element: chapter }">
                      <router-link
                        :to="`/books/${bookId}/chapters/${chapter.id}`"
                        class="block p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer border-l-4"
                        :class="
                          route.params.chapterId === chapter.id
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-l-blue-500'
                            : 'border-l-transparent hover:border-l-gray-300 dark:hover:border-l-gray-600'
                        "
                      >
                        <div class="flex items-center justify-between">
                          <div
                            class="drag-handle mr-3 cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                            @click.prevent.stop
                          >
                            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
                              ></path>
                            </svg>
                          </div>
                          <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {{ chapter.title || chapter.id }}
                            </h3>
                            <div class="flex items-center space-x-3 mt-1">
                              <span class="text-xs text-gray-500 dark:text-gray-400">
                                {{ chapter.word_count?.toLocaleString() || 0 }} words
                              </span>
                              <CheckCircleIcon
                                :class="chapter.has_summary ? 'text-green-500' : 'text-gray-300'"
                                class="w-3 h-3"
                                :title="chapter.has_summary ? 'Summarized' : 'Not summarized'"
                              />
                            </div>
                          </div>
                          <div class="flex items-center space-x-1 ml-2">
                            <button
                              @click.prevent.stop="editChapter(chapter.id)"
                              class="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                              <PencilIcon class="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </router-link>
                    </template>
                  </draggable>
                </div>
              </div>

              <!-- Uncategorized chapters -->
              <div
                v-if="sidebarUncategorized.length > 0"
                class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                <div class="px-4 py-3 bg-gray-50 dark:bg-gray-700">
                  <h4 class="font-medium text-gray-900 dark:text-white">Uncategorized</h4>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {{ sidebarUncategorized.length }} chapter{{
                      sidebarUncategorized.length !== 1 ? "s" : ""
                    }}
                    · {{ formatWordCount(wordCountForChapters(sidebarUncategorized)) }} words
                  </p>
                </div>
                <div class="bg-white dark:bg-gray-800">
                  <draggable
                    v-model="sidebarUncategorized"
                    item-key="id"
                    group="sidebar-chapters"
                    class="space-y-1"
                    @start="onSidebarDragStart"
                    @end="onSidebarDragEnd"
                    :disabled="false"
                    ghost-class="opacity-50"
                    drag-class="rotate-1"
                    handle=".drag-handle"
                  >
                    <template #item="{ element: chapter }">
                      <router-link
                        :to="`/books/${bookId}/chapters/${chapter.id}`"
                        class="block p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer border-l-4"
                        :class="
                          route.params.chapterId === chapter.id
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-l-blue-500'
                            : 'border-l-transparent hover:border-l-gray-300 dark:hover:border-l-gray-600'
                        "
                      >
                        <div class="flex items-center justify-between">
                          <div
                            class="drag-handle mr-3 cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                            @click.prevent.stop
                          >
                            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
                              ></path>
                            </svg>
                          </div>
                          <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {{ chapter.title || chapter.id }}
                            </h3>
                            <div class="flex items-center space-x-3 mt-1">
                              <span class="text-xs text-gray-500 dark:text-gray-400">
                                {{ chapter.word_count?.toLocaleString() || 0 }} words
                              </span>
                              <CheckCircleIcon
                                :class="chapter.has_summary ? 'text-green-500' : 'text-gray-300'"
                                class="w-3 h-3"
                                :title="chapter.has_summary ? 'Summarized' : 'Not summarized'"
                              />
                            </div>
                          </div>
                          <div class="flex items-center space-x-1 ml-2">
                            <button
                              @click.prevent.stop="editChapter(chapter.id)"
                              class="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                              <PencilIcon class="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </router-link>
                    </template>
                  </draggable>
                </div>
              </div>
            </div>

            <!-- Empty state -->
            <div v-else class="text-center py-8">
              <DocumentTextIcon class="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
                No chapters yet
              </h3>
              <p class="text-xs text-gray-600 dark:text-gray-400 mb-4">
                Add your first chapter to get started.
              </p>
            </div>
          </div>

          <!-- Wiki tab content -->
          <div v-else-if="currentTab === 'wiki'">
            <div v-if="loadingWiki" class="flex justify-center items-center h-32">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>

            <div v-else-if="wikiPages.length > 0" class="space-y-4">
              <div v-for="(pages, type) in wikiPagesByType" :key="type" class="space-y-2">
                <div class="flex items-center space-x-2">
                  <component :is="getTypeIcon(type)" :class="['w-4 h-4', getTypeColor(type)]" />
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                    {{ type }}s
                  </h3>
                  <span class="text-xs text-gray-500 dark:text-gray-400">({{ pages.length }})</span>
                </div>

                <div class="space-y-1">
                  <router-link
                    v-for="page in pages"
                    :key="page.id"
                    :to="`/books/${bookId}/wiki/${page.id}`"
                    class="block p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    :class="
                      route.params.wikiPageId === page.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600'
                        : ''
                    "
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center space-x-2 min-w-0">
                        <h4 class="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {{ page.page_name }}
                        </h4>
                        <span
                          v-if="page.is_major"
                          class="px-1 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded"
                        >
                          Major
                        </span>
                      </div>
                    </div>
                    <p
                      v-if="page.summary"
                      class="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2"
                    >
                      {{
                        page.summary.length > 60
                          ? page.summary.substring(0, 60) + "..."
                          : page.summary
                      }}
                    </p>
                  </router-link>
                </div>
              </div>
            </div>

            <!-- Empty wiki state -->
            <div v-else class="text-center py-8">
              <BookOpenIcon class="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
                No wiki pages yet
              </h3>
              <p class="text-xs text-gray-600 dark:text-gray-400">
                Generate chapter summaries to create wiki pages.
              </p>
            </div>
          </div>

          <!-- Settings link at bottom of sidebar -->
          <div class="fixed bottom-4 left-4 z-10">
            <router-link
              to="/settings"
              class="inline-flex items-center px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 shadow-sm border border-gray-200 dark:border-gray-700"
              title="User Settings"
            >
              <Cog6ToothIcon class="w-5 h-5 mr-2" />
              Settings
            </router-link>
          </div>
        </div>
      </div>

      <!-- Right content area: router-view -->
      <div class="flex-1 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
        <!-- Show placeholder when no chapter is selected -->
        <div v-if="isOnBookOnly" class="flex items-center justify-center h-full">
          <div class="text-center">
            <DocumentTextIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 class="text-xl font-medium text-gray-900 dark:text-white mb-2">
              Please select a chapter
            </h3>
            <p class="text-gray-600 dark:text-gray-400 max-w-md">
              Choose a chapter from the sidebar to view and edit its content, or create a new
              chapter to get started.
            </p>
          </div>
        </div>
        <!-- Regular router view when chapter/wiki page is selected -->
        <router-view v-else :key="routerViewKey" />
      </div>
    </div>
  </div>

  <!-- Search Modal -->
  <SearchModal
    :show="showSearchModal"
    :book-id="bookId"
    :search-service="searchService as any"
    @close="showSearchModal = false"
    @refresh="refreshData"
  />
</template>
