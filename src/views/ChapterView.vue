<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDatabase } from "@/composables/useDatabase";
import { useChapterImages } from "@/composables/useChapterImages";
import { useChapterSummaryContext } from "@/composables/useChapterSummaryContext";
import {
  useChapterMutationFlow,
} from "@/composables/useChapterMutationFlow";
import type { Book, BookPart, Chapter as DatabaseChapter } from "@/lib/database";
import ChapterHeaderBar from "@/components/chapter/ChapterHeaderBar.vue";
import ChapterSummaryPanel from "@/components/chapter/ChapterSummaryPanel.vue";
import ChapterNotesPanel from "@/components/chapter/ChapterNotesPanel.vue";
import ChapterContentSection from "@/components/chapter/ChapterContentSection.vue";
import ChapterReviewsSection from "@/components/chapter/ChapterReviewsSection.vue";
import ChapterHeroSection from "@/components/chapter/ChapterHeroSection.vue";
import ChapterIllustrationsSection from "@/components/chapter/ChapterIllustrationsSection.vue";
import ChapterStatusBar from "@/components/chapter/ChapterStatusBar.vue";
import FontSizeControl from "@/components/reading/FontSizeControl.vue";
import ConfirmDeleteModal from "@/components/chapter/ConfirmDeleteModal.vue";
import { useReadingFontSize } from "@/composables/useReadingFontSize";
import IllustrationDetail from "@/components/images/IllustrationDetail.vue";
import { type AutocompleteOption } from "@/components/links/AutocompleteMultiSelect.vue";
import ChapterWikiLinksCard from "@/components/links/ChapterWikiLinksCard.vue";
import Modal from "@/components/Modal.vue";
import type { ChapterWikiLink } from "@/lib/database";
import {
  CHAPTER_WIKI_LINKS_CHANGED_EVENT,
  type ChapterWikiLinksChangedDetail,
} from "@/utils/chapterWikiLinkEvents";

interface Chapter {
  id: string;
  book_id: string;
  title: string | null;
  text: string;
  word_count: number;
  part_id: string | null;
  summary: string | null;
  pov: string | null;
  characters: string[] | null;
  beats: string[] | null;
  spoilers_ok: boolean | null;
  notes: string | null;
}

interface Review {
  id: string;
  review_text: string;
  prompt_used?: string | null;
  created_at: string;
  updated_at: string;
  profile_id: number | null;
  profile_name: string | null;
  tone_key: string | null;
}

interface Character {
  id: string;
  character_name: string;
  wiki_page_id: string | null;
  has_wiki_page: boolean;
}

interface CustomReviewerProfile {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

const route = useRoute();
const router = useRouter();
defineEmits<{
  (event: 'wiki-page-pin-changed', payload: { id: string; isPinned: boolean; updatedAt: string }): void;
}>();

// Computed route parameters to handle both nested and standalone routes
const bookId = computed(() => (route.params.bookId || route.params.id) as string);
const chapterId = computed(() => route.params.chapterId as string);

// Use chapter images composable
const {
  chapterImageUploadAvailable,
  chapterImages,
  chapterImagesLoading,
  addingChapterImages,
  chapterImageSources,
  chapterImageTags,
  bookWikiPages,
  chapterImageError,
  showImageLightbox,
  showDeleteIllustrationModal,
  deletingIllustration,
  chapterCoverImageId,
  settingCoverId,
  activeImageSource,
  activeImage,
  activeImageTags,
  activeImageLabel,
  savingImageNotes,
  savingImageTags,
  heroImageSrc,
  illustrationToDeleteName,
  refreshChapterImages,
  handleAddIllustrations,
  requestDeleteIllustration,
  cancelDeleteIllustration,
  handleDeleteIllustration,
  openImageModal,
  closeImageModal,
  handleSetAsCover,
  handleDownloadImage,
  handleSaveActiveImageNotes,
  handleSaveActiveImageTags,
  openHeroLightbox,
} = useChapterImages(
  () => chapterId.value,
  () => bookId.value
);

// Use local database
const {
  books,
  chapters,
  loadBooks,
  loadChapters,
  getParts,
  saveChapter: dbSaveChapter,
  deleteChapter: dbDeleteChapter,
  saveSummary: dbSaveSummary,
  getSummary,
  getPartSummary,
  createWikiPage,
  updateWikiPage,
  getWikiPage,
  getWikiPages,
  trackWikiUpdate,
  addChapterWikiMention,
  getChapterWikiLinks,
  setChapterWikiLinks,
  ensureChapterWikiLinks,
  getCustomProfiles,
  saveReview,
  getReviews,
  deleteReview: dbDeleteReview,
  getNotes,
  saveNotes: dbSaveNotes,
} = useDatabase();

const chapter = ref<Chapter | null>(null);
const loading = ref(false);
const savingChapter = ref(false);
const isEditing = ref(false);
const editedText = ref("");
const editedTitle = ref("");
const CHAPTER_SUMMARY_WIKI_UPDATES_KEY = "chapter_summary_update_wiki_enabled";
const reviewTone = ref<string>("fanficnet");
const customProfiles = ref<CustomReviewerProfile[]>([]);
const savedReviews = ref<Review[]>([]);
const loadingReviews = ref(false);
const deletingReviewId = ref<string | null>(null);
const characters = ref<Character[]>([]);
const linkedWikiPages = ref<ChapterWikiLink[]>([]);
const loadingLinkedWikiPages = ref(false);
const isEditingLinkedWikiPages = ref(false);
const savingLinkedWikiPages = ref(false);
const selectedLinkedWikiPageIds = ref<string[]>([]);
const showDeleteModal = ref(false);
const deletingChapter = ref(false);
const parts = ref<BookPart[]>([]);

const currentBook = computed(
  () => books.value.find((b: Book) => b.id === bookId.value) || null
);
const currentPart = computed(() => {
  if (!chapter.value?.part_id) return null;
  return parts.value.find((part) => part.id === chapter.value?.part_id) || null;
});

const {
  getPartNumber,
  clearSummaryCaches,
  primeChapterSummary,
  invalidateChapterSummary,
  buildPriorPartSummaries,
  buildPriorChapterSummariesInPart,
  buildPriorChapterSummariesInBook,
} = useChapterSummaryContext({
  getCurrentBook: () => currentBook.value,
  getParts: () => parts.value,
  getChapters: () => chapters.value,
  getSummary,
  getPartSummary,
});

const currentPartNumber = computed(() => getPartNumber(chapter.value?.part_id ?? null));

// Summary editing state
const isEditingSummary = ref(false);
const editedSummary = ref("");
const showSummaryPanel = ref(false);
const updateWikiOnSummary = ref(true);

// Notes editing state
const isEditingNotes = ref(false);
const editedNotes = ref("");
const showNotesPanel = ref(false);

// Illustrations panel state
const showIllustrationsPanel = ref(false);

// Reading font-size preference (shared with wiki pages, persisted)
const { fontSize } = useReadingFontSize();

// Text truncation state
const showFullChapterText = ref(false);
const expandedReviews = ref<Set<string>>(new Set());
const expandedPrompts = ref<Set<string>>(new Set());

function normalizeCharacterList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (
        entry &&
        typeof entry === "object" &&
        "name" in entry &&
        typeof (entry as Record<string, unknown>).name === "string"
      ) {
        return String((entry as Record<string, unknown>).name).trim();
      }
      return "";
    })
    .filter((name): name is string => name.length > 0);
}

function parseIdArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string");
    }
  } catch {
    // Ignore parse errors and fall back to empty array
  }
  return [];
}

// Mobile detection
const isMobileRoute = computed(() => route.meta?.mobile === true);
const routePrefix = computed(() => (isMobileRoute.value ? "/m/books" : "/books"));

const hasUnsavedChanges = computed(() => {
  if (!chapter.value) return false;
  return (
    editedText.value !== chapter.value.text || editedTitle.value !== (chapter.value.title || "")
  );
});

const chapterTruncation = computed(() => {
  if (!chapter.value) {
    return { truncated: "", needsTruncation: false };
  }
  return getTruncatedText(chapter.value.text);
});

const linkedWikiPageOptions = computed<AutocompleteOption[]>(() =>
  bookWikiPages.value.map((page) => ({
    id: page.id,
    label: page.page_name,
    detail: page.page_type ?? undefined,
  }))
);

// Computed navigation URLs
// Always use /books/ prefix for going back, since /m/books/:id route doesn't exist
// BookView handles mobile display via CSS media queries
const bookUrl = computed(() => `/books/${bookId.value}`);
const backButtonUrl = computed(() => bookUrl.value);

const {
  generatingReview,
  generatingSummary,
  savingSummary,
  savingNotes,
  summaryProgress,
  summaryError,
  wikiUpdateResults,
  showWikiUpdateResults,
  saveSummary,
  saveNotes,
  generateSummary,
  generateReview,
} = useChapterMutationFlow({
  chapter,
  bookId,
  currentBookTitle: () => currentBook.value?.title || bookId.value,
  currentBookChapterOrder: () => parseIdArray(currentBook.value?.chapter_order),
  currentPart,
  currentPartNumber,
  reviewTone,
  customProfiles,
  editedSummary,
  editedNotes,
  normalizeCharacterList,
  buildPriorPartSummaries,
  buildPriorChapterSummariesInPart,
  buildPriorChapterSummariesInBook,
  invalidateChapterSummary,
  saveSummaryToDb: dbSaveSummary,
  saveNotesToDb: dbSaveNotes,
  saveReviewToDb: saveReview,
  createWikiPage,
  updateWikiPage,
  getWikiPage,
  trackWikiUpdate,
  addChapterWikiMention,
  ensureChapterWikiLinks,
  reloadWikiLinks: async () => {
    await loadLinkedWikiPages();
  },
  reloadCharacters: async () => {
    await loadCharacters();
  },
  reloadReviews: async () => {
    await loadSavedReviews();
  },
  openSettings: () => router.push("/settings"),
});

const loadChapter = async () => {
  loading.value = true;
  try {
    clearSummaryCaches();

    // Load books and chapters from database
    await loadBooks();
    await loadChapters(bookId.value);
    parts.value = await getParts(bookId.value);

    // Find the current chapter
    const chapterData = chapters.value.find((ch: DatabaseChapter) => ch.id === chapterId.value);

    if (chapterData) {
      // Load summary from database if exists
      const summaryData = await getSummary(chapterData.id);
      primeChapterSummary(chapterData.id, summaryData || null);
      const parsedCharacters = summaryData?.characters ? JSON.parse(summaryData.characters) : [];
      const normalizedCharacters = normalizeCharacterList(parsedCharacters);
      const parsedBeats = summaryData?.beats ? JSON.parse(summaryData.beats) : [];
      const beatsArray = Array.isArray(parsedBeats)
        ? parsedBeats.filter(
            (beat: unknown): beat is string => typeof beat === "string" && beat.trim().length > 0
          )
        : [];

      // Load notes from database
      const notesData = await getNotes(chapterData.id);

      chapter.value = {
        id: chapterData.id,
        book_id: chapterData.book_id,
        title: chapterData.title || null,
        text: String(chapterData.text || ""),
        word_count: chapterData.word_count,
        part_id: chapterData.part_id ?? null,
        summary: summaryData?.summary || null,
        pov: summaryData?.pov || null,
        characters: normalizedCharacters.length ? normalizedCharacters : null,
        beats: beatsArray.length ? beatsArray : null,
        spoilers_ok: summaryData?.spoilers_ok || null,
        notes: notesData?.notes || null,
      };
      editedText.value = String(chapterData.text || "");
      editedTitle.value = chapterData.title || "";
      editedSummary.value = summaryData?.summary || "";
      editedNotes.value = notesData?.notes || "";

      // Load character wiki info
      await loadCharacters();

      // Load custom profiles and saved reviews
      await loadCustomProfiles();
      await loadSavedReviews();

      await refreshChapterImages();
    } else {
      console.error("Chapter not found");
      router.push(bookUrl.value);
    }
  } catch (error) {
    console.error("Failed to load chapter:", error);
    router.push(bookUrl.value);
  } finally {
    loading.value = false;
  }
};

// Watch for chapter changes to refresh images
watch(
  () => chapterId.value,
  () => {
    refreshChapterImages();
  }
);

const saveChapter = async () => {
  if (!chapter.value || !hasUnsavedChanges.value) return;

  savingChapter.value = true;
  try {
    // Calculate word count
    const wordCount = editedText.value.trim().split(/\s+/).length;

    // Save to local database
    await dbSaveChapter({
      id: chapter.value.id,
      book_id: chapter.value.book_id,
      part_id: chapter.value.part_id ?? null,
      title: editedTitle.value,
      text: editedText.value,
      word_count: wordCount,
      created_at: new Date().toISOString(),
    });

    chapter.value.text = editedText.value;
    chapter.value.title = editedTitle.value || null;
    chapter.value.word_count = wordCount;
    isEditing.value = false;
  } catch (error) {
    console.error("Failed to save chapter:", error);
  } finally {
    savingChapter.value = false;
  }
};

const startEditingSummary = () => {
  if (!chapter.value?.summary) return;
  editedSummary.value = chapter.value.summary;
  isEditingSummary.value = true;
};

const cancelEditingSummary = () => {
  isEditingSummary.value = false;
  editedSummary.value = "";
};

const handleSaveSummary = async () => {
  const didSave = await saveSummary();
  if (didSave) {
    isEditingSummary.value = false;
  }
};

// Notes editing methods
const startEditingNotes = () => {
  editedNotes.value = chapter.value?.notes || "";
  isEditingNotes.value = true;
};

const cancelEditingNotes = () => {
  isEditingNotes.value = false;
  editedNotes.value = chapter.value?.notes || "";
};

const handleSaveNotes = async () => {
  const didSave = await saveNotes();
  if (didSave) {
    isEditingNotes.value = false;
  }
};

const loadSavedReviews = async () => {
  if (!chapter.value) {
    savedReviews.value = [];
    return;
  }

  try {
    loadingReviews.value = true;
    const reviews = await getReviews(chapter.value.id);
    savedReviews.value = reviews.map((review) => ({
      ...review,
      profile_id: review.profile_id ?? null,
      profile_name: review.profile_name ?? null,
      tone_key: review.tone_key ?? null,
    }));
  } catch (error) {
    console.error("Failed to load reviews:", error);
    savedReviews.value = [];
  } finally {
    loadingReviews.value = false;
  }
};

const deleteReview = async (reviewId: string) => {
  if (!confirm("Are you sure you want to delete this review?")) return;

  try {
    deletingReviewId.value = reviewId;
    await dbDeleteReview(reviewId);
    await loadSavedReviews();
  } catch (error) {
    console.error("Failed to delete review:", error);
    alert("Failed to delete review");
  } finally {
    deletingReviewId.value = null;
  }
};

const loadCharacters = async () => {
  if (!chapter.value?.characters || !bookId.value) {
    characters.value = [];
    return;
  }

  try {
    // Get all wiki pages for this book
    const wikiPages = await getWikiPages(bookId.value);

    // Map chapter characters to include wiki page info
    characters.value = chapter.value.characters.map((character) => {
      const characterName = character;
      const wikiPage = wikiPages.find((page) => page.page_name === characterName);
      return {
        id: wikiPage?.id || `char-${characterName}`,
        character_name: characterName,
        wiki_page_id: wikiPage?.id || null,
        has_wiki_page: !!wikiPage,
      };
    });
  } catch (error) {
    console.error("Failed to load character wiki info:", error);
    // Fallback to just character names without wiki info
    characters.value = chapter.value.characters.map((character) => ({
      id: `char-${character}`,
      character_name: character,
      wiki_page_id: null,
      has_wiki_page: false,
    }));
  }
};

const loadLinkedWikiPages = async () => {
  if (!chapterId.value) {
    linkedWikiPages.value = [];
    selectedLinkedWikiPageIds.value = [];
    return;
  }

  loadingLinkedWikiPages.value = true;
  try {
    const links = await getChapterWikiLinks(chapterId.value);
    linkedWikiPages.value = links;
    selectedLinkedWikiPageIds.value = links.map((link) => link.wiki_page_id);
  } catch (error) {
    console.error("Failed to load chapter wiki links:", error);
    linkedWikiPages.value = [];
    selectedLinkedWikiPageIds.value = [];
  } finally {
    loadingLinkedWikiPages.value = false;
  }
};

const loadCustomProfiles = async () => {
  try {
    const profiles = await getCustomProfiles();
    customProfiles.value = profiles;
  } catch (error) {
    console.error("Failed to load custom profiles:", error);
    customProfiles.value = [];
  }
};

// Character lookup helper - now more functional
const getCharacterWikiInfo = (characterName: string) => {
  return characters.value.find((char) => char.character_name === characterName);
};

const navigateToWiki = (characterName: string) => {
  const character = getCharacterWikiInfo(characterName);
  if (character?.has_wiki_page && character.wiki_page_id) {
    router.push({
      path: `${routePrefix.value}/${bookId.value}/wiki/${character.wiki_page_id}`,
      query: { fromChapterId: chapterId.value },
    });
  }
};

const startEditingLinkedWikiPages = () => {
  selectedLinkedWikiPageIds.value = linkedWikiPages.value.map((link) => link.wiki_page_id);
  isEditingLinkedWikiPages.value = true;
};

const cancelEditingLinkedWikiPages = () => {
  selectedLinkedWikiPageIds.value = linkedWikiPages.value.map((link) => link.wiki_page_id);
  isEditingLinkedWikiPages.value = false;
};

const saveLinkedWikiPages = async () => {
  if (!chapter.value) return;

  savingLinkedWikiPages.value = true;
  try {
    await setChapterWikiLinks(chapter.value.id, selectedLinkedWikiPageIds.value, "manual");
    await loadLinkedWikiPages();
    await loadCharacters();
    isEditingLinkedWikiPages.value = false;
  } catch (error) {
    console.error("Failed to save chapter wiki links:", error);
    alert("Failed to save linked wiki pages");
  } finally {
    savingLinkedWikiPages.value = false;
  }
};

const handleChapterWikiLinksChanged = async (event: Event) => {
  const customEvent = event as CustomEvent<ChapterWikiLinksChangedDetail>;
  const detail = customEvent.detail;
  if (!detail || !detail.chapterIds.includes(chapterId.value)) return;

  await Promise.all([loadLinkedWikiPages(), loadCharacters()]);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const cancelEdit = () => {
  if (!chapter.value) return;
  editedText.value = chapter.value.text;
  editedTitle.value = chapter.value.title || "";
  isEditing.value = false;
};

const startEdit = () => {
  isEditing.value = true;
};

const requestDeleteChapter = () => {
  if (!chapter.value) return;
  showDeleteModal.value = true;
};

const cancelDeleteChapter = () => {
  if (deletingChapter.value) return;
  showDeleteModal.value = false;
};

const handleDeleteChapter = async () => {
  if (!chapter.value) return;

  try {
    deletingChapter.value = true;
    await dbDeleteChapter(chapter.value.id, bookId.value);
    showDeleteModal.value = false;
    isEditing.value = false;
    router.push(bookUrl.value);
  } catch (error) {
    console.error("Failed to delete chapter:", error);
  } finally {
    deletingChapter.value = false;
  }
};

const goBack = () => {
  router.push(backButtonUrl.value);
};

// Text truncation helpers - more functional approach
const getTruncatedText = (
  text: string,
  wordLimit: number = 120
): { truncated: string; needsTruncation: boolean } => {
  if (!text || typeof text !== "string") return { truncated: "", needsTruncation: false };

  const words = text.split(/(\s+)/);
  let wordCount = 0;

  const truncatedParts = words.filter((part) => {
    if (/\S/.test(part)) {
      // If part contains non-whitespace characters
      wordCount++;
      return wordCount <= wordLimit;
    }
    return wordCount <= wordLimit; // Include whitespace if we haven't exceeded limit
  });

  const needsTruncation = wordCount > wordLimit;
  return {
    truncated: needsTruncation ? truncatedParts.join("") : text,
    needsTruncation,
  };
};

const toggleReviewExpansion = (reviewId: string) => {
  if (expandedReviews.value.has(reviewId)) {
    expandedReviews.value.delete(reviewId);
  } else {
    expandedReviews.value.add(reviewId);
  }
};

const togglePromptExpansion = (reviewId: string) => {
  if (expandedPrompts.value.has(reviewId)) {
    expandedPrompts.value.delete(reviewId);
  } else {
    expandedPrompts.value.add(reviewId);
  }
};

onMounted(async () => {
  const storedUpdateWikiPreference = localStorage.getItem(CHAPTER_SUMMARY_WIKI_UPDATES_KEY);
  if (storedUpdateWikiPreference !== null) {
    updateWikiOnSummary.value = storedUpdateWikiPreference === "true";
  }
  await loadChapter();
  await loadSavedReviews();
  await loadCharacters();
  await loadLinkedWikiPages();
  await loadCustomProfiles();
  window.addEventListener(
    CHAPTER_WIKI_LINKS_CHANGED_EVENT,
    handleChapterWikiLinksChanged as EventListener,
  );
});

onBeforeUnmount(() => {
  window.removeEventListener(
    CHAPTER_WIKI_LINKS_CHANGED_EVENT,
    handleChapterWikiLinksChanged as EventListener,
  );
});

watch(updateWikiOnSummary, (value) => {
  localStorage.setItem(CHAPTER_SUMMARY_WIKI_UPDATES_KEY, String(value));
});

watch(
  () => chapterId.value,
  () => {
    isEditingLinkedWikiPages.value = false;
    loadLinkedWikiPages();
  }
);
</script>

<template>
  <div class="w-full">
    <ChapterHeaderBar
      v-if="!heroImageSrc"
      :is-mobile-route="isMobileRoute"
      :chapter-title="chapter?.title || null"
      :chapter-id="chapterId"
      :word-count="chapter?.word_count || 0"
      :is-summarized="Boolean(chapter?.summary)"
      :is-editing="isEditing"
      :edited-title="editedTitle"
      :show-summary-panel="showSummaryPanel"
      :saving-chapter="savingChapter"
      :has-unsaved-changes="hasUnsavedChanges"
      @go-back="goBack"
      @update:editedTitle="editedTitle = $event"
      @toggle-summary-panel="showSummaryPanel = !showSummaryPanel"
      @start-edit="startEdit"
      @cancel-edit="cancelEdit"
      @save-chapter="saveChapter"
      @delete-chapter="requestDeleteChapter"
    />

    <!-- Hero Image Section -->
    <ChapterHeroSection
      v-if="heroImageSrc"
      :hero-image-src="heroImageSrc"
      :book-title="currentBook?.title || ''"
      :chapter-title="chapter?.title || ''"
      :word-count="chapter?.word_count || 0"
      :has-summary="Boolean(chapter?.summary)"
      :is-editing="isEditing"
      :edited-title="editedTitle"
      :saving-chapter="savingChapter"
      :has-unsaved-changes="hasUnsavedChanges"
      @update:edited-title="editedTitle = $event"
      @open-lightbox="openHeroLightbox"
      @go-back="goBack"
      @start-edit="startEdit"
      @cancel-edit="cancelEdit"
      @save-chapter="saveChapter"
      @delete-chapter="requestDeleteChapter"
    />

    <div class="w-full max-w-6xl md:mx-auto px-4 lg:px-8">
      <div class="lg:grid lg:grid-cols-3 lg:gap-8">
        <div class="lg:col-span-2">
          <ChapterStatusBar
            :word-count="chapter?.word_count || 0"
            :has-summary="Boolean(chapter?.summary)"
            :has-notes="Boolean(chapter?.notes)"
            :show-summary-panel="showSummaryPanel"
            :show-notes-panel="showNotesPanel"
            :has-illustrations="chapterImages.length > 0"
            :show-illustrations-panel="showIllustrationsPanel || chapterImages.length > 0"
            :desktop-images-available="chapterImageUploadAvailable"
            @toggle-summary-panel="showSummaryPanel = !showSummaryPanel"
            @toggle-notes-panel="showNotesPanel = !showNotesPanel"
            @toggle-illustrations-panel="showIllustrationsPanel = !showIllustrationsPanel"
          />
          <div v-if="loading && !chapter" class="flex h-64 items-center justify-center">
            <div class="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          </div>

          <div
            v-else-if="chapter"
            class="divide-y divide-gray-200 dark:divide-gray-700 sm:space-y-6 sm:divide-y-0"
          >
        <ChapterSummaryPanel
          v-if="showSummaryPanel"
          :chapter-summary="chapter.summary || ''"
          :chapter-pov="chapter.pov ?? undefined"
          :chapter-characters="chapter.characters || []"
          :chapter-beats="chapter.beats || []"
          :is-editing-summary="isEditingSummary"
          :edited-summary="editedSummary"
          :generating-summary="generatingSummary"
          :saving-summary="savingSummary"
          :update-wiki-enabled="updateWikiOnSummary"
          :summary-progress="summaryProgress"
          :summary-error="summaryError"
          :wiki-update-results="wikiUpdateResults"
          :show-wiki-update-results="showWikiUpdateResults"
          :character-lookup="getCharacterWikiInfo"
          :route-prefix="routePrefix"
          :book-id="bookId"
          @update:editedSummary="editedSummary = $event"
          @update:updateWikiEnabled="updateWikiOnSummary = $event"
          @start-edit="startEditingSummary"
          @cancel-edit="cancelEditingSummary"
          @save="handleSaveSummary"
          @generate="() => generateSummary(updateWikiOnSummary)"
          @character-click="navigateToWiki"
          @dismiss-wiki-results="showWikiUpdateResults = false"
        />

        <ChapterNotesPanel
          v-if="showNotesPanel"
          :chapter-notes="chapter.notes || ''"
          :is-editing-notes="isEditingNotes"
          :edited-notes="editedNotes"
          :saving-notes="savingNotes"
          @update:editedNotes="editedNotes = $event"
          @start-edit="startEditingNotes"
          @cancel-edit="cancelEditingNotes"
          @save="handleSaveNotes"
        />

        <ChapterContentSection
          :is-editing="isEditing"
          :edited-text="editedText"
          :chapter-text="chapter.text"
          :show-full-chapter-text="showFullChapterText"
          :truncated-chapter-text="chapterTruncation"
          :font-size="fontSize"
          @update:editedText="editedText = $event"
          @toggle-full-chapter="showFullChapterText = $event"
        />

        <ChapterReviewsSection
          :review-tone="reviewTone"
          :custom-profiles="customProfiles"
          :saved-reviews="savedReviews"
          :loading-reviews="loadingReviews"
          :generating-review="generatingReview"
          :deleting-review-id="deletingReviewId"
          :expanded-reviews="expandedReviews"
          :expanded-prompts="expandedPrompts"
          :format-date="formatDate"
          :get-truncated-text="getTruncatedText"
          @update:reviewTone="reviewTone = $event"
          @generate-review="generateReview"
          @delete-review="deleteReview"
          @toggle-review="toggleReviewExpansion"
          @toggle-prompt="togglePromptExpansion"
        />

        <div class="mt-6 lg:hidden">
          <ChapterWikiLinksCard
            :route-prefix="routePrefix"
            :book-id="bookId"
            :chapter-id="chapterId"
            :links="linkedWikiPages"
            :options="linkedWikiPageOptions"
            :selected-ids="selectedLinkedWikiPageIds"
            :loading="loadingLinkedWikiPages"
            :is-editing="isEditingLinkedWikiPages"
            :saving="savingLinkedWikiPages"
            @start-edit="startEditingLinkedWikiPages"
            @cancel-edit="cancelEditingLinkedWikiPages"
            @save="saveLinkedWikiPages"
            @update:selected-ids="selectedLinkedWikiPageIds = $event"
          />
        </div>
          </div>
        </div>

        <aside class="mt-6 space-y-6 lg:mt-0">
          <ChapterIllustrationsSection
            v-if="chapterImages.length > 0 || (chapterImageUploadAvailable && showIllustrationsPanel)"
            layout="panel"
            :images="chapterImages"
            :image-sources="chapterImageSources"
            :image-tags="chapterImageTags"
            :cover-image-id="chapterCoverImageId"
            :loading="chapterImagesLoading"
            :adding="addingChapterImages"
            :error="chapterImageError"
            :setting-cover-id="settingCoverId"
            :can-add-images="chapterImageUploadAvailable"
            @add-images="handleAddIllustrations"
            @open-image="openImageModal"
            @set-cover="handleSetAsCover"
            @download="handleDownloadImage"
            @delete="requestDeleteIllustration"
          />

          <ChapterWikiLinksCard
            class="hidden lg:block"
            :route-prefix="routePrefix"
            :book-id="bookId"
            :chapter-id="chapterId"
            :links="linkedWikiPages"
            :options="linkedWikiPageOptions"
            :selected-ids="selectedLinkedWikiPageIds"
            :loading="loadingLinkedWikiPages"
            :is-editing="isEditingLinkedWikiPages"
            :saving="savingLinkedWikiPages"
            @start-edit="startEditingLinkedWikiPages"
            @cancel-edit="cancelEditingLinkedWikiPages"
            @save="saveLinkedWikiPages"
            @update:selected-ids="selectedLinkedWikiPageIds = $event"
          />

          <FontSizeControl v-model="fontSize" variant="panel" />
        </aside>
      </div>
    </div>
  </div>

  <Modal
    :show="showImageLightbox"
    :title="activeImageLabel || 'Illustration'"
    max-width="4xl"
    @close="closeImageModal"
  >
    <IllustrationDetail
      :image="activeImage"
      :image-src="activeImageSource"
      :wiki-pages="bookWikiPages"
      :tags="activeImageTags"
      :saving-notes="savingImageNotes"
      :saving-tags="savingImageTags"
      :can-edit-notes="true"
      :can-edit-tags="true"
      :can-download="true"
      @save-notes="handleSaveActiveImageNotes"
      @save-tags="handleSaveActiveImageTags"
      @download="handleDownloadImage"
    />
  </Modal>

  <!-- Delete Chapter Confirmation Modal -->
  <ConfirmDeleteModal
    :show="showDeleteModal"
    title="Delete chapter?"
    :item-name="chapter?.title || chapterId"
    description="along with its summaries and reviews. This action cannot be undone."
    :deleting="deletingChapter"
    @cancel="cancelDeleteChapter"
    @confirm="handleDeleteChapter"
  />

  <!-- Delete Illustration Confirmation Modal -->
  <ConfirmDeleteModal
    :show="showDeleteIllustrationModal"
    title="Delete illustration?"
    :item-name="illustrationToDeleteName"
    :deleting="deletingIllustration"
    @cancel="cancelDeleteIllustration"
    @confirm="handleDeleteIllustration"
  />
</template>
