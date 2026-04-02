<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDatabase } from "@/composables/useDatabase";
import { useChapterImages } from "@/composables/useChapterImages";
import {
  generateChapterSummary,
  generateReview as generateAIReview,
  BUILT_IN_PROFILES,
  type PartSummaryChapterInput,
  type PartSummaryOverview,
} from "@/lib/openai";
import type { BookPart, PartSummary, ChapterSummary } from "@/lib/database";
import ChapterHeaderBar from "@/components/chapter/ChapterHeaderBar.vue";
import ChapterSummaryPanel from "@/components/chapter/ChapterSummaryPanel.vue";
import ChapterNotesPanel from "@/components/chapter/ChapterNotesPanel.vue";
import ChapterContentSection from "@/components/chapter/ChapterContentSection.vue";
import ChapterReviewsSection from "@/components/chapter/ChapterReviewsSection.vue";
import ChapterHeroSection from "@/components/chapter/ChapterHeroSection.vue";
import ChapterIllustrationsSection from "@/components/chapter/ChapterIllustrationsSection.vue";
import ChapterStatusBar from "@/components/chapter/ChapterStatusBar.vue";
import ConfirmDeleteModal from "@/components/chapter/ConfirmDeleteModal.vue";
import ImageLightbox from "@/components/images/ImageLightbox.vue";

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

// Computed route parameters to handle both nested and standalone routes
const bookId = computed(() => (route.params.bookId || route.params.id) as string);
const chapterId = computed(() => route.params.chapterId as string);

// Use chapter images composable
const {
  desktopImagesAvailable,
  chapterImages,
  chapterImagesLoading,
  addingChapterImages,
  chapterImageSources,
  chapterImageError,
  showImageLightbox,
  showDeleteIllustrationModal,
  deletingIllustration,
  chapterCoverImageId,
  settingCoverId,
  heroLightboxOpen,
  activeImageSource,
  activeImageLabel,
  heroImageSrc,
  hasNextImage,
  hasPrevImage,
  illustrationToDeleteName,
  refreshChapterImages,
  handleAddIllustrations,
  requestDeleteIllustration,
  cancelDeleteIllustration,
  handleDeleteIllustration,
  openImageModal,
  closeImageModal,
  goToNextImage,
  goToPrevImage,
  handleSetAsCover,
  handleDownloadImage,
  openHeroLightbox,
  closeHeroLightbox,
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
const generatingReview = ref(false);
const generatingSummary = ref(false);
const summaryProgress = ref<string>("");
const summaryError = ref<string | null>(null);

interface WikiUpdateResult {
  characterName: string;
  wikiPageId: string;
  updateType: 'created' | 'updated' | 'unchanged';
}
const wikiUpdateResults = ref<WikiUpdateResult[]>([]);
const showWikiUpdateResults = ref(false);
const reviewTone = ref<string>("fanficnet");
const customProfiles = ref<CustomReviewerProfile[]>([]);
const savedReviews = ref<Review[]>([]);
const loadingReviews = ref(false);
const deletingReviewId = ref<string | null>(null);
const characters = ref<Character[]>([]);
const showDeleteModal = ref(false);
const deletingChapter = ref(false);
const parts = ref<BookPart[]>([]);

const chapterSummaryCache = new Map<string, ChapterSummary | null>();
const partSummaryCache = new Map<string, PartSummary | null>();

const currentBook = computed(
  () => books.value.find((b: any) => b.id === bookId.value) || null
);
const currentPart = computed(() => {
  if (!chapter.value?.part_id) return null;
  return parts.value.find((part) => part.id === chapter.value?.part_id) || null;
});

const currentPartNumber = computed(() => getPartNumber(chapter.value?.part_id ?? null));

// Summary editing state
const isEditingSummary = ref(false);
const editedSummary = ref("");
const savingSummary = ref(false);
const showSummaryPanel = ref(false);

// Notes editing state
const isEditingNotes = ref(false);
const editedNotes = ref("");
const savingNotes = ref(false);
const showNotesPanel = ref(false);

// Illustrations panel state
const showIllustrationsPanel = ref(false);

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

function getPartNumber(partId: string | null): number | null {
  if (!partId) return null;
  const order = parseIdArray(currentBook.value?.part_order);
  const index = order.indexOf(partId);
  return index >= 0 ? index + 1 : null;
}

async function fetchChapterSummary(chapterId: string) {
  if (chapterSummaryCache.has(chapterId)) {
    return chapterSummaryCache.get(chapterId) || null;
  }
  const summary = await getSummary(chapterId);
  chapterSummaryCache.set(chapterId, summary || null);
  return summary || null;
}

async function fetchPartSummaryById(partId: string) {
  if (partSummaryCache.has(partId)) {
    return partSummaryCache.get(partId) || null;
  }
  const summary = await getPartSummary(partId);
  partSummaryCache.set(partId, summary || null);
  return summary || null;
}

async function buildChapterSummariesForPart(
  partId: string,
  partMetaOverride?: BookPart
): Promise<PartSummaryChapterInput[]> {
  const partMeta = partMetaOverride ?? parts.value.find((part) => part.id === partId);
  if (!partMeta) return [];

  const order = parseIdArray(partMeta.chapter_order);
  const chapterList = chapters.value.filter((ch: any) => ch.part_id === partMeta.id);
  const chapterMap = new Map(chapterList.map((ch: any) => [ch.id, ch]));

  let orderedIds = order.filter((id) => chapterMap.has(id));
  if (!orderedIds.length) {
    const bookOrder = parseIdArray(currentBook.value?.chapter_order);
    orderedIds = bookOrder.filter((id) => chapterMap.has(id));
  }
  if (!orderedIds.length) {
    orderedIds = chapterList
      .sort(
        (a: any, b: any) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      .map((ch: any) => ch.id);
  }

  const summaries: PartSummaryChapterInput[] = [];
  for (const id of orderedIds) {
    const summaryData = await fetchChapterSummary(id);
    if (summaryData?.summary) {
      const chapterInfo = chapterMap.get(id);
      summaries.push({
        id,
        title: chapterInfo?.title || id,
        summary: summaryData.summary
      });
    }
  }
  return summaries;
}

async function buildPriorPartSummaries(
  currentPartId: string | null
): Promise<PartSummaryOverview[]> {
  const result: PartSummaryOverview[] = [];
  const partOrder = parseIdArray(currentBook.value?.part_order);
  if (!partOrder.length) return result;

  const currentIndex = currentPartId ? partOrder.indexOf(currentPartId) : -1;
  const targetIds =
    currentIndex > 0 ? partOrder.slice(0, currentIndex) : currentIndex === -1 ? partOrder : [];

  for (const partId of targetIds) {
    const partMeta = parts.value.find((part) => part.id === partId);
    if (!partMeta) continue;

    const summaryRecord = await fetchPartSummaryById(partId);
    let summaryText = summaryRecord?.summary?.trim();

    if (!summaryText) {
      const chapterSummaries = await buildChapterSummariesForPart(partId, partMeta);
      if (chapterSummaries.length) {
        summaryText = chapterSummaries
          .map((entry) => `${entry.title} (${entry.id})\n${entry.summary}`)
          .join("\n\n");
      }
    }

    if (summaryText) {
      result.push({
        partId,
        partTitle: partMeta.name,
        summary: summaryText,
        partNumber: getPartNumber(partId)
      });
    }
  }

  return result;
}

async function buildPriorChapterSummariesInPart(
  partMeta: BookPart | null,
  currentChapterId: string
): Promise<PartSummaryChapterInput[]> {
  if (!partMeta) return [];

  let order = parseIdArray(partMeta.chapter_order);
  if (!order.includes(currentChapterId)) {
    const bookOrder = parseIdArray(currentBook.value?.chapter_order);
    order = bookOrder.filter((id) => {
      const chapter = chapters.value.find((ch: any) => ch.id === id);
      return chapter?.part_id === partMeta.id;
    });
  }

  const priorIds: string[] = [];
  for (const id of order) {
    if (id === currentChapterId) break;
    priorIds.push(id);
  }

  if (!priorIds.length) return [];

  const chapterMap = new Map(
    chapters.value
      .filter((chapter: any) => chapter.part_id === partMeta.id)
      .map((chapter: any) => [chapter.id, chapter])
  );

  const summaries: PartSummaryChapterInput[] = [];
  for (const id of priorIds) {
    const summaryData = await fetchChapterSummary(id);
    if (summaryData?.summary) {
      const chapterInfo = chapterMap.get(id);
      summaries.push({
        id,
        title: chapterInfo?.title || id,
        summary: summaryData.summary
      });
    }
  }

  return summaries;
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

// Computed navigation URLs
const bookUrl = computed(() => `${routePrefix.value}/${bookId.value}`);
const backButtonUrl = computed(() => bookUrl.value);

const loadChapter = async () => {
  loading.value = true;
  try {
    chapterSummaryCache.clear();
    partSummaryCache.clear();

    // Load books and chapters from database
    await loadBooks();
    await loadChapters(bookId.value);
    parts.value = await getParts(bookId.value);

    // Find the current chapter
    const chapterData = chapters.value.find((ch: any) => ch.id === chapterId.value);

    if (chapterData) {
      // Load summary from database if exists
      const summaryData = await getSummary(chapterData.id);
      chapterSummaryCache.set(chapterData.id, summaryData || null);
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

const generateSummary = async () => {
  if (!chapter.value) return;

  // Reset state
  summaryProgress.value = "";
  summaryError.value = null;
  wikiUpdateResults.value = [];
  showWikiUpdateResults.value = false;

  try {
    generatingSummary.value = true;

    // Get OpenAI API key from localStorage
    const apiKey = localStorage.getItem("openai_api_key");
    if (!apiKey) {
      alert("Please add your OpenAI API key in Settings first");
      router.push("/settings");
      return;
    }

    // Step 1: Build context
    summaryProgress.value = "Building context from previous chapters...";
    const book = currentBook.value;
    const chapterOrder = parseIdArray(book?.chapter_order);
    const isFirstChapter = chapterOrder[0] === chapter.value.id;

    const priorPartSummaries = await buildPriorPartSummaries(chapter.value.part_id ?? null);
    const priorChapterSummaries = await buildPriorChapterSummariesInPart(
      currentPart.value,
      chapter.value.id
    );

    // Step 2: Generate summary
    summaryProgress.value = "Generating chapter summary...";
    const result = await generateChapterSummary(
      apiKey,
      chapter.value.text,
      chapter.value.title || chapter.value.id,
      chapter.value.id,
      bookId.value,
      book?.title || bookId.value,
      isFirstChapter,
      {
        partName: currentPart.value?.name ?? null,
        partNumber: currentPartNumber.value,
        priorPartSummaries,
        priorChapterSummaries
      }
    );

    const generatedCharacters = normalizeCharacterList(result.characters);
    const beatsArray = Array.isArray(result.beats) ? result.beats : [];

    // Step 3: Save summary
    summaryProgress.value = "Saving summary...";
    await dbSaveSummary({
      chapter_id: chapter.value.id,
      summary: result.summary,
      pov: result.pov,
      characters: generatedCharacters,
      beats: beatsArray,
      spoilers_ok: result.spoilers_ok,
    });
    chapterSummaryCache.delete(chapter.value.id);

    // Update UI immediately so user sees the summary
    chapter.value.summary = result.summary;
    chapter.value.pov = result.pov;
    chapter.value.characters = generatedCharacters.length ? generatedCharacters : null;
    chapter.value.beats = beatsArray.length ? beatsArray : null;
    chapter.value.spoilers_ok = result.spoilers_ok;
    editedSummary.value = result.summary;

    // Step 4: Update wiki pages for characters (with individual progress tracking)
    if (generatedCharacters.length > 0) {
      const wikiResults: WikiUpdateResult[] = [];

      for (let i = 0; i < generatedCharacters.length; i++) {
        const characterName = generatedCharacters[i];
        summaryProgress.value = `Updating wiki: ${characterName} (${i + 1} of ${generatedCharacters.length})...`;

        try {
          // Check if wiki page exists
          const existingPage = await getWikiPage(bookId.value, characterName);

          // Generate wiki content
          const { generateWikiContent } = await import("@/lib/openai");
          const wikiResult = await generateWikiContent(
            apiKey,
            characterName,
            chapter.value.text,
            result.summary,
            existingPage?.content || null
          );

          if (existingPage) {
            if (wikiResult.hasChanges) {
              await updateWikiPage(existingPage.id, {
                content: wikiResult.content,
                summary: wikiResult.summary
              });
              await trackWikiUpdate({
                wiki_page_id: existingPage.id,
                chapter_id: chapter.value.id,
                update_type: wikiResult.hasContradictions ? 'update_with_contradictions' : 'update',
                change_summary: wikiResult.changeSummary,
                contradiction_notes: wikiResult.contradictions
              });
              wikiResults.push({
                characterName,
                wikiPageId: existingPage.id,
                updateType: 'updated'
              });
            } else {
              wikiResults.push({
                characterName,
                wikiPageId: existingPage.id,
                updateType: 'unchanged'
              });
            }
            await addChapterWikiMention(chapter.value.id, existingPage.id);
          } else {
            const newPageId = await createWikiPage({
              book_id: bookId.value,
              page_name: characterName,
              content: wikiResult.content,
              summary: wikiResult.summary,
              page_type: 'character',
              created_by_ai: true
            });
            await trackWikiUpdate({
              wiki_page_id: newPageId,
              chapter_id: chapter.value.id,
              update_type: 'created',
              change_summary: `Created character page for ${characterName}`
            });
            await addChapterWikiMention(chapter.value.id, newPageId);
            wikiResults.push({
              characterName,
              wikiPageId: newPageId,
              updateType: 'created'
            });
          }
        } catch (wikiError) {
          console.error(`Failed to update wiki for ${characterName}:`, wikiError);
          // Continue with other characters
        }
      }

      wikiUpdateResults.value = wikiResults;
      if (wikiResults.length > 0) {
        showWikiUpdateResults.value = true;
      }
    }

    // Reload character wiki info
    summaryProgress.value = "Finishing up...";
    await loadCharacters();
    summaryProgress.value = "";
  } catch (error: any) {
    console.error("Failed to generate summary:", error);
    summaryError.value = error.message || "Unknown error occurred";
    summaryProgress.value = "";
  } finally {
    generatingSummary.value = false;
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

const saveSummary = async () => {
  if (!chapter.value) return;

  try {
    savingSummary.value = true;

    // Update summary in database
    await dbSaveSummary({
      chapter_id: chapter.value.id,
      summary: editedSummary.value,
      pov: chapter.value.pov,
      characters: chapter.value.characters || [],
      beats: chapter.value.beats || [],
      spoilers_ok: chapter.value.spoilers_ok || false,
    });

    // Update UI
    chapter.value.summary = editedSummary.value;
    isEditingSummary.value = false;
  } catch (error) {
    console.error("Failed to save summary:", error);
    alert("Failed to save summary");
  } finally {
    savingSummary.value = false;
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

const saveNotes = async () => {
  if (!chapter.value) return;

  try {
    savingNotes.value = true;

    // Save notes to database
    await dbSaveNotes(chapter.value.id, editedNotes.value);

    // Update UI
    chapter.value.notes = editedNotes.value;
    isEditingNotes.value = false;
  } catch (error) {
    console.error("Failed to save notes:", error);
    alert("Failed to save notes");
  } finally {
    savingNotes.value = false;
  }
};

const generateReview = async () => {
  if (!chapter.value) return;

  try {
    generatingReview.value = true;

    // Get OpenAI API key
    const apiKey = localStorage.getItem("openai_api_key");
    if (!apiKey) {
      alert("Please add your OpenAI API key in Settings first");
      router.push("/settings");
      return;
    }

    // Determine which profile to use
    let profile;
    let isCustomProfile = false;
    let customProfileId: number | null = null;
    let profileName = "";

    if (reviewTone.value.startsWith("custom-")) {
      // Custom profile
      isCustomProfile = true;
      customProfileId = parseInt(reviewTone.value.replace("custom-", ""));
      const customProfile = customProfiles.value.find((p) => p.id === customProfileId);
      if (!customProfile) {
        alert("Selected custom profile not found");
        return;
      }
      profileName = customProfile.name;
      profile = {
        id: `custom-${customProfileId}`,
        name: customProfile.name,
        tone_key: `custom-${customProfileId}`,
        system_prompt: `You are a beta reader with this personality and approach: ${customProfile.description}. Please review the following chapter providing feedback in this style.`,
        is_system: false,
      };
    } else {
      // Built-in profile
      const builtInProfile = BUILT_IN_PROFILES[reviewTone.value as keyof typeof BUILT_IN_PROFILES];
      if (!builtInProfile) {
        alert("Selected profile not found");
        return;
      }
      profileName = builtInProfile.name;
      profile = builtInProfile;
    }

    const priorPartSummaries =
      await buildPriorPartSummaries(chapter.value.part_id ?? null);
    let currentPartChapterSummaries = await buildPriorChapterSummariesInPart(
      currentPart.value,
      chapter.value.id
    );

    if (!chapter.value.part_id) {
      const fallbackSummaries: PartSummaryChapterInput[] = [];
      const chapterOrder = parseIdArray(currentBook.value?.chapter_order);
      for (const chId of chapterOrder) {
        if (chId === chapter.value.id) break;
        const summary = await fetchChapterSummary(chId);
        if (summary?.summary) {
          const chData = chapters.value.find((c: any) => c.id === chId);
          fallbackSummaries.push({
            id: chId,
            title: chData?.title || chId,
            summary: summary.summary
          });
        }
      }
      currentPartChapterSummaries = fallbackSummaries;
    }

    // Generate review
    const result = await generateAIReview(
      apiKey,
      chapter.value.text,
      chapter.value.title || chapter.value.id,
      chapter.value.id,
      profile,
      {
        priorPartSummaries,
        currentPartChapterSummaries
      }
    );

    // Save to database
    await saveReview({
      chapter_id: chapter.value.id,
      review_text: result.reviewText,
      prompt_used: result.promptUsed,
      profile_id: isCustomProfile ? customProfileId : null,
      profile_name: profileName,
      tone_key: reviewTone.value,
    });

    // Update UI
    // Reload saved reviews
    await loadSavedReviews();
  } catch (error: any) {
    console.error("Failed to generate review:", error);
    alert(`Failed to generate review: ${error.message || "Unknown error"}`);
  } finally {
    generatingReview.value = false;
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
    router.push(`${routePrefix.value}/${bookId.value}/wiki/${character.wiki_page_id}`);
  }
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
  await loadChapter();
  await loadSavedReviews();
  await loadCharacters();
  await loadCustomProfiles();
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
    />

    <div class="w-full max-w-6xl md:mx-auto px-4 lg:px-8">
      <!-- Chapter Illustrations - at top below title -->
      <ChapterIllustrationsSection
        v-if="desktopImagesAvailable && (chapterImages.length > 0 || showIllustrationsPanel)"
        :images="chapterImages"
        :image-sources="chapterImageSources"
        :cover-image-id="chapterCoverImageId"
        :loading="chapterImagesLoading"
        :adding="addingChapterImages"
        :error="chapterImageError"
        :setting-cover-id="settingCoverId"
        @add-images="handleAddIllustrations"
        @open-image="openImageModal"
        @set-cover="handleSetAsCover"
        @download="handleDownloadImage"
        @delete="requestDeleteIllustration"
      />

      <ChapterStatusBar
        :word-count="chapter?.word_count || 0"
        :has-summary="Boolean(chapter?.summary)"
        :has-notes="Boolean(chapter?.notes)"
        :show-summary-panel="showSummaryPanel"
        :show-notes-panel="showNotesPanel"
        :has-illustrations="chapterImages.length > 0"
        :show-illustrations-panel="showIllustrationsPanel || chapterImages.length > 0"
        :desktop-images-available="desktopImagesAvailable"
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
          :summary-progress="summaryProgress"
          :summary-error="summaryError"
          :wiki-update-results="wikiUpdateResults"
          :show-wiki-update-results="showWikiUpdateResults"
          :character-lookup="getCharacterWikiInfo"
          :route-prefix="routePrefix"
          :book-id="bookId"
          @update:editedSummary="editedSummary = $event"
          @start-edit="startEditingSummary"
          @cancel-edit="cancelEditingSummary"
          @save="saveSummary"
          @generate="generateSummary"
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
          @save="saveNotes"
        />

        <ChapterContentSection
          :is-editing="isEditing"
          :edited-text="editedText"
          :chapter-text="chapter.text"
          :show-full-chapter-text="showFullChapterText"
          :truncated-chapter-text="chapterTruncation"
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
      </div>
    </div>
  </div>

  <ImageLightbox
    :open="showImageLightbox"
    :image-src="activeImageSource"
    :caption="activeImageLabel"
    :has-next="hasNextImage"
    :has-prev="hasPrevImage"
    @close="closeImageModal"
    @next="goToNextImage"
    @prev="goToPrevImage"
  />

  <!-- Hero image lightbox -->
  <ImageLightbox
    :open="heroLightboxOpen"
    :image-src="heroImageSrc"
    :caption="chapter?.title || 'Chapter Image'"
    @close="closeHeroLightbox"
  />

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
