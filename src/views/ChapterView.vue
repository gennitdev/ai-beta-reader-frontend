<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDatabase } from "@/composables/useDatabase";
import {
  generateChapterSummary,
  updateWikiPagesFromChapter,
  generateReview as generateAIReview,
  BUILT_IN_PROFILES,
} from "@/lib/openai";
import ChapterHeaderBar from "@/components/chapter/ChapterHeaderBar.vue";
import ChapterSummaryPanel from "@/components/chapter/ChapterSummaryPanel.vue";
import ChapterContentSection from "@/components/chapter/ChapterContentSection.vue";
import ChapterReviewsSection from "@/components/chapter/ChapterReviewsSection.vue";
import { CheckCircleIcon } from "@heroicons/vue/24/outline";

interface Chapter {
  id: string;
  book_id: string;
  title: string | null;
  text: string;
  word_count: number;
  summary: string | null;
  pov: string | null;
  characters: string[] | null;
  beats: string[] | null;
  spoilers_ok: boolean | null;
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

// Use local database
const {
  books,
  chapters,
  loadBooks,
  loadChapters,
  saveChapter: dbSaveChapter,
  saveSummary: dbSaveSummary,
  getSummary,
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
} = useDatabase();

const chapter = ref<Chapter | null>(null);
const loading = ref(false);
const savingChapter = ref(false);
const isEditing = ref(false);
const editedText = ref("");
const editedTitle = ref("");
const generatingReview = ref(false);
const generatingSummary = ref(false);
const reviewTone = ref<string>("fanficnet");
const customProfiles = ref<CustomReviewerProfile[]>([]);
const savedReviews = ref<Review[]>([]);
const loadingReviews = ref(false);
const deletingReviewId = ref<string | null>(null);
const characters = ref<Character[]>([]);

// Summary editing state
const isEditingSummary = ref(false);
const editedSummary = ref("");
const savingSummary = ref(false);
const showSummaryPanel = ref(false);

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

// Mobile detection
const isMobileRoute = computed(() => route.meta?.mobile === true);

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
const bookUrl = computed(() => `/books/${bookId.value}`);
const backButtonUrl = computed(() => bookUrl.value);

const loadChapter = async () => {
  loading.value = true;
  try {
    // Load books and chapters from database
    await loadBooks();
    await loadChapters(bookId.value);

    // Find the current chapter
    const chapterData = chapters.value.find((ch: any) => ch.id === chapterId.value);

    if (chapterData) {
      // Load summary from database if exists
      const summaryData = await getSummary(chapterData.id);
      const parsedCharacters = summaryData?.characters ? JSON.parse(summaryData.characters) : [];
      const normalizedCharacters = normalizeCharacterList(parsedCharacters);
      const parsedBeats = summaryData?.beats ? JSON.parse(summaryData.beats) : [];
      const beatsArray = Array.isArray(parsedBeats)
        ? parsedBeats.filter(
            (beat: unknown): beat is string => typeof beat === "string" && beat.trim().length > 0
          )
        : [];

      chapter.value = {
        id: chapterData.id,
        book_id: chapterData.book_id,
        title: chapterData.title || null,
        text: String(chapterData.text || ""),
        word_count: chapterData.word_count,
        summary: summaryData?.summary || null,
        pov: summaryData?.pov || null,
        characters: normalizedCharacters.length ? normalizedCharacters : null,
        beats: beatsArray.length ? beatsArray : null,
        spoilers_ok: summaryData?.spoilers_ok || null,
      };
      editedText.value = String(chapterData.text || "");
      editedTitle.value = chapterData.title || "";
      editedSummary.value = summaryData?.summary || "";

      // Load character wiki info
      await loadCharacters();

      // Load custom profiles and saved reviews
      await loadCustomProfiles();
      await loadSavedReviews();
    } else {
      console.error("Chapter not found");
      router.push(`/books/${bookId.value}`);
    }
  } catch (error) {
    console.error("Failed to load chapter:", error);
    router.push(`/books/${bookId.value}`);
  } finally {
    loading.value = false;
  }
};

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

  try {
    generatingSummary.value = true;

    // Get OpenAI API key from localStorage
    const apiKey = localStorage.getItem("openai_api_key");
    if (!apiKey) {
      alert("Please add your OpenAI API key in Settings first");
      router.push("/settings");
      return;
    }

    // Check if this is the first chapter (position 0 in book's chapter order)
    const book = books.value.find((b: any) => b.id === bookId.value);
    const chapterOrder = book?.chapter_order ? JSON.parse(book.chapter_order) : [];
    const isFirstChapter = chapterOrder[0] === chapter.value.id;

    // Generate summary using OpenAI
    const result = await generateChapterSummary(
      apiKey,
      chapter.value.text,
      chapter.value.title || chapter.value.id,
      chapter.value.id,
      bookId.value,
      book?.title || bookId.value,
      isFirstChapter
    );

    const generatedCharacters = normalizeCharacterList(result.characters);
    const beatsArray = Array.isArray(result.beats) ? result.beats : [];

    // Save summary to database
    await dbSaveSummary({
      chapter_id: chapter.value.id,
      summary: result.summary,
      pov: result.pov,
      characters: generatedCharacters,
      beats: beatsArray,
      spoilers_ok: result.spoilers_ok,
    });

    // Update UI
    chapter.value.summary = result.summary;
    chapter.value.pov = result.pov;
    chapter.value.characters = generatedCharacters.length ? generatedCharacters : null;
    chapter.value.beats = beatsArray.length ? beatsArray : null;
    chapter.value.spoilers_ok = result.spoilers_ok;

    // Update summary editing state
    editedSummary.value = result.summary;

    // Auto-generate/update wiki pages for characters
    if (generatedCharacters.length > 0) {
      try {
        await updateWikiPagesFromChapter(
          apiKey,
          bookId.value,
          chapter.value.id,
          chapter.value.text,
          result.summary,
          generatedCharacters,
          getWikiPage,
          createWikiPage,
          updateWikiPage,
          trackWikiUpdate,
          addChapterWikiMention
        );
        console.log(`Updated wiki pages for ${generatedCharacters.length} characters`);
      } catch (wikiError: any) {
        console.error("Failed to update wiki pages:", wikiError);
        // Don't fail the whole operation if wiki update fails
      }
    }

    // Reload character wiki info
    await loadCharacters();
  } catch (error: any) {
    console.error("Failed to generate summary:", error);
    alert(`Failed to generate summary: ${error.message || "Unknown error"}`);
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

    // Get prior chapter summaries
    const book = books.value.find((b: any) => b.id === bookId.value);
    const chapterOrder = book?.chapter_order ? JSON.parse(book.chapter_order) : [];

    let priorSummaries = "";
    for (const chId of chapterOrder) {
      if (chId === chapter.value.id) break;

      const chData = chapters.value.find((c: any) => c.id === chId);
      if (chData) {
        const summary = await getSummary(chId);
        if (summary) {
          priorSummaries += `# ${chId}${chData.title ? ` — ${chData.title}` : ""}\n${
            summary.summary
          }\n\n`;
        }
      }
    }

    // Generate review
    const result = await generateAIReview(
      apiKey,
      chapter.value.text,
      chapter.value.title || chapter.value.id,
      chapter.value.id,
      profile,
      priorSummaries || undefined
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
    router.push(`/books/${bookId.value}/wiki/${character.wiki_page_id}`);
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
    />

    <div class="w-full max-w-6xl mx-0 md:mx-auto px-0 sm:px-4 lg:px-8 ">
      <div class="my-3 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
        <span class="whitespace-nowrap"
          >{{ (chapter?.word_count || 0).toLocaleString() }} words</span
        >
        <div class="flex items-center whitespace-nowrap">
          <CheckCircleIcon
            :class="Boolean(chapter?.summary) ? 'text-green-500' : 'text-gray-300'"
            class="mr-1 h-4 w-4"
          />
          <span :class="Boolean(chapter?.summary) ? 'text-green-600' : 'text-gray-500'">
            {{ Boolean(chapter?.summary) ? "Summarized" : "Not summarized" }}
          </span>
        </div>
        <button
          @click="$emit('toggle-summary-panel')"
          class="font-medium text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {{ showSummaryPanel ? "Hide Summary Panel" : "Show Summary Panel" }}
        </button>
      </div>
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
          :character-lookup="getCharacterWikiInfo"
          @update:editedSummary="editedSummary = $event"
          @start-edit="startEditingSummary"
          @cancel-edit="cancelEditingSummary"
          @save="saveSummary"
          @generate="generateSummary"
          @character-click="navigateToWiki"
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
</template>
