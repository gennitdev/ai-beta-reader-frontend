<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDatabase } from "@/composables/useDatabase";
import { useChapterImages } from "@/composables/useChapterImages";
import { useChapterSummaryContext } from "@/composables/useChapterSummaryContext";
import { useChapterMutationFlow } from "@/composables/useChapterMutationFlow";
import { useChapterReviews } from "@/composables/useChapterReviews";
import { useChapterCharacters } from "@/composables/useChapterCharacters";
import { useChapterWikiLinks } from "@/composables/useChapterWikiLinks";
import { useChapterPanels } from "@/composables/useChapterPanels";
import { useReadingFontSize } from "@/composables/useReadingFontSize";
import type { Book, BookPart, Chapter as DatabaseChapter, ChapterRevision } from "@/lib/database";
import type { Chapter } from "@/types/chapterView";
import {
  normalizeCharacterList,
  parseIdArray,
  formatDate,
  getTruncatedText,
} from "@/utils/chapterView";
import ChapterHeaderBar from "@/components/chapter/ChapterHeaderBar.vue";
import ChapterSummaryPanel from "@/components/chapter/ChapterSummaryPanel.vue";
import ChapterNotesPanel from "@/components/chapter/ChapterNotesPanel.vue";
import ChapterContentSection from "@/components/chapter/ChapterContentSection.vue";
import ChapterPreviewCard from "@/components/chapter/ChapterPreviewCard.vue";
import ChapterReadingActions from "@/components/chapter/ChapterReadingActions.vue";
import ChapterReviewsSection from "@/components/chapter/ChapterReviewsSection.vue";
import ChapterHeroSection from "@/components/chapter/ChapterHeroSection.vue";
import ChapterIllustrationsSection from "@/components/chapter/ChapterIllustrationsSection.vue";
import ChapterStatusBar from "@/components/chapter/ChapterStatusBar.vue";
import ChapterVersionHistory from "@/components/chapter/ChapterVersionHistory.vue";
import FontSizeControl from "@/components/reading/FontSizeControl.vue";
import ConfirmDeleteModal from "@/components/chapter/ConfirmDeleteModal.vue";
import IllustrationDetail from "@/components/images/IllustrationDetail.vue";
import ChapterWikiLinksCard from "@/components/links/ChapterWikiLinksCard.vue";
import Modal from "@/components/Modal.vue";
import {
  CHAPTER_WIKI_LINKS_CHANGED_EVENT,
  type ChapterWikiLinksChangedDetail,
} from "@/utils/chapterWikiLinkEvents";

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
  getChapterRevisions,
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
const chapterRevisions = ref<ChapterRevision[]>([]);
const loadingChapterRevisions = ref(false);
const isEditing = ref(false);
const editedText = ref("");
const editedTitle = ref("");
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

// Side-panel UI state (summary/notes/illustrations visibility + edit buffers)
const {
  showSummaryPanel,
  showNotesPanel,
  showFullChapterText,
  isEditingSummary,
  editedSummary,
  updateWikiOnSummary,
  isEditingNotes,
  editedNotes,
  startEditingSummary,
  cancelEditingSummary,
  startEditingNotes,
  cancelEditingNotes,
} = useChapterPanels({ chapter });

// Reading font-size preference (shared with wiki pages, persisted)
const { fontSize } = useReadingFontSize();

// Chapter delete state
const showDeleteModal = ref(false);
const deletingChapter = ref(false);

// Mobile detection
const isMobileRoute = computed(() => route.meta?.mobile === true);
const routePrefix = computed(() => (isMobileRoute.value ? "/m/books" : "/books"));

// Computed navigation URLs
// Always use /books/ prefix for going back, since /m/books/:id route doesn't exist
// BookView handles mobile display via CSS media queries
const bookUrl = computed(() => `/books/${bookId.value}`);
const backButtonUrl = computed(() => bookUrl.value);

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

// Character resolution + wiki navigation
const { loadCharacters, getCharacterWikiInfo, navigateToWiki } = useChapterCharacters({
  chapter,
  bookId,
  chapterId,
  routePrefix,
  getWikiPages,
});

// Linked wiki pages (manual chapter <-> wiki links)
const {
  linkedWikiPages,
  loadingLinkedWikiPages,
  isEditingLinkedWikiPages,
  savingLinkedWikiPages,
  selectedLinkedWikiPageIds,
  linkedWikiPageOptions,
  loadLinkedWikiPages,
  startEditingLinkedWikiPages,
  cancelEditingLinkedWikiPages,
  saveLinkedWikiPages,
} = useChapterWikiLinks({
  chapter,
  chapterId,
  bookWikiPages,
  getChapterWikiLinks,
  setChapterWikiLinks,
  reloadCharacters: loadCharacters,
});

// Saved AI reviews + reviewer profiles
const {
  savedReviews,
  loadingReviews,
  deletingReviewId,
  customProfiles,
  reviewTone,
  expandedReviews,
  expandedPrompts,
  loadSavedReviews,
  deleteReview,
  loadCustomProfiles,
  toggleReviewExpansion,
  togglePromptExpansion,
} = useChapterReviews({
  chapter,
  getReviews,
  deleteReviewFromDb: dbDeleteReview,
  getCustomProfiles,
});

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

      loadingChapterRevisions.value = true;
      try {
        chapterRevisions.value = await getChapterRevisions(chapterData.id);
      } finally {
        loadingChapterRevisions.value = false;
      }

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
    chapterRevisions.value = await getChapterRevisions(chapter.value.id);
    isEditing.value = false;
  } catch (error) {
    console.error("Failed to save chapter:", error);
  } finally {
    savingChapter.value = false;
  }
};

const handleSaveSummary = async () => {
  const didSave = await saveSummary();
  if (didSave) {
    isEditingSummary.value = false;
  }
};

const handleSaveNotes = async () => {
  const didSave = await saveNotes();
  if (didSave) {
    isEditingNotes.value = false;
  }
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

const handleChapterWikiLinksChanged = async (event: Event) => {
  const customEvent = event as CustomEvent<ChapterWikiLinksChangedDetail>;
  const detail = customEvent.detail;
  if (!detail || !detail.chapterIds.includes(chapterId.value)) return;

  // Find-and-replace (and its undo) writes new chapter text straight to the
  // database, so pull the current row back in — otherwise the reader preview
  // and the edit buffer keep showing the pre-replace text. Any in-progress
  // unsaved edits are preserved (the edit buffer is only re-synced when clean).
  const wasClean = !hasUnsavedChanges.value;
  await loadChapters(bookId.value);
  const updated = chapters.value.find(
    (ch: DatabaseChapter) => ch.id === chapterId.value
  );
  if (updated && chapter.value) {
    chapter.value.text = String(updated.text || "");
    chapter.value.title = updated.title || null;
    chapter.value.word_count = updated.word_count;
    if (wasClean) {
      editedText.value = String(updated.text || "");
      editedTitle.value = updated.title || "";
    }
  }

  await Promise.all([loadLinkedWikiPages(), loadCharacters()]);
};

onMounted(async () => {
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

    <div class="w-full max-w-6xl px-4 pt-6 md:mx-auto lg:px-8">
      <div class="lg:grid lg:grid-cols-3 lg:gap-8">
        <div class="lg:col-span-2">
          <ChapterStatusBar
            class="lg:hidden"
            :word-count="chapter?.word_count || 0"
            :has-summary="Boolean(chapter?.summary)"
            :has-notes="Boolean(chapter?.notes)"
          />
          <div v-if="loading && !chapter" class="flex h-64 items-center justify-center">
            <div class="h-8 w-8 animate-spin rounded-full border-b-2 border-gold-600"></div>
          </div>

          <div
            v-else-if="chapter"
            class="divide-y divide-gray-200 dark:divide-gray-700 sm:space-y-6 sm:divide-y-0"
          >
            <ChapterReadingActions
              v-if="!isEditing"
              class="mb-6 lg:hidden"
              :chapter-text="chapter.text"
              :font-size="fontSize"
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

            <div class="space-y-4 py-6 lg:hidden">
              <ChapterPreviewCard
                title="Summary"
                :content="chapter.summary || ''"
                :expanded="showSummaryPanel"
                @toggle-expanded="showSummaryPanel = !showSummaryPanel"
              >
                <ChapterSummaryPanel
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
              </ChapterPreviewCard>

              <ChapterPreviewCard
                title="Notes"
                :content="chapter.notes || ''"
                :expanded="showNotesPanel"
                @toggle-expanded="showNotesPanel = !showNotesPanel"
              >
                <ChapterNotesPanel
                  :chapter-notes="chapter.notes || ''"
                  :is-editing-notes="isEditingNotes"
                  :edited-notes="editedNotes"
                  :saving-notes="savingNotes"
                  @update:editedNotes="editedNotes = $event"
                  @start-edit="startEditingNotes"
                  @cancel-edit="cancelEditingNotes"
                  @save="handleSaveNotes"
                />
              </ChapterPreviewCard>
            </div>

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
          <ChapterStatusBar
            class="hidden lg:block"
            variant="panel"
            :word-count="chapter?.word_count || 0"
            :has-summary="Boolean(chapter?.summary)"
            :has-notes="Boolean(chapter?.notes)"
          />

          <ChapterReadingActions
            v-if="chapter && !isEditing"
            class="hidden lg:block"
            :chapter-text="chapter.text"
            :font-size="fontSize"
          />

          <ChapterPreviewCard
            v-if="chapter"
            class="hidden lg:block"
            title="Summary"
            :content="chapter.summary || ''"
            :expanded="showSummaryPanel"
            @toggle-expanded="showSummaryPanel = !showSummaryPanel"
          >
            <ChapterSummaryPanel
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
          </ChapterPreviewCard>

          <ChapterPreviewCard
            v-if="chapter"
            class="hidden lg:block"
            title="Notes"
            :content="chapter.notes || ''"
            :expanded="showNotesPanel"
            @toggle-expanded="showNotesPanel = !showNotesPanel"
          >
            <ChapterNotesPanel
              :chapter-notes="chapter.notes || ''"
              :is-editing-notes="isEditingNotes"
              :edited-notes="editedNotes"
              :saving-notes="savingNotes"
              @update:editedNotes="editedNotes = $event"
              @start-edit="startEditingNotes"
              @cancel-edit="cancelEditingNotes"
              @save="handleSaveNotes"
            />
          </ChapterPreviewCard>

          <ChapterIllustrationsSection
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

          <ChapterVersionHistory
            :book-id="bookId"
            :chapter-id="chapterId"
            :revisions="chapterRevisions"
            :loading="loadingChapterRevisions"
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
