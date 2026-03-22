<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowLeftIcon,
  SparklesIcon,
  PencilIcon,
  CheckCircleIcon,
  ClockIcon,
  TrashIcon,
} from "@heroicons/vue/24/outline";
import MarkdownRenderer from "@/components/MarkdownRenderer.vue";
import { useDatabase } from "@/composables/useDatabase";
import { useImageLibrary } from "@/composables/useImageLibrary";
import {
  generatePartSummary as generatePartSummaryAi,
  type PartSummaryChapterInput,
} from "@/lib/openai";
import type { BookPart, ImageAsset } from "@/lib/database";
import ImageLightbox from "@/components/images/ImageLightbox.vue";

interface PartSummaryState {
  summary: string;
  characters: string[];
  beats: string[];
  updatedAt: string | null;
}

interface PartChapterEntry {
  id: string;
  title: string | null;
  wordCount: number;
  position: number;
  summary: string | null;
  characters: string[];
  beats: string[];
}

const route = useRoute();
const router = useRouter();

const bookId = computed(() => (route.params.bookId || route.params.id) as string);
const partId = computed(() => route.params.partId as string);

const {
  books,
  chapters,
  loadBooks,
  loadChapters,
  getParts,
  getPartSummary,
  savePartSummary,
  getSummary,
} = useDatabase();

const {
  desktopImagesAvailable,
  fetchPartImages,
  getImageSource: getPartImageSource,
  fetchPartCover,
  pickPartCover,
  fetchChapterThumbnails,
  deleteImage,
  setPartCoverImageId,
} = useImageLibrary();

const part = ref<BookPart | null>(null);
const chapterEntries = ref<PartChapterEntry[]>([]);
const partSummary = ref<PartSummaryState>({
  summary: "",
  characters: [],
  beats: [],
  updatedAt: null,
});
const editedSummary = ref("");
const loading = ref(false);
const generatingSummary = ref(false);
const savingSummary = ref(false);
const isEditingSummary = ref(false);
const errorMessage = ref<string | null>(null);
const partImages = ref<ImageAsset[]>([]);
const partImageSources = ref<Record<string, string>>({});
const partImagesLoading = ref(false);
const partImageError = ref<string | null>(null);
const partImageModalOpen = ref(false);
const partActiveImageId = ref<string | null>(null);
const partCoverImage = ref<ImageAsset | null>(null);
const partCoverSrc = ref<string | null>(null);
const partCoverLoading = ref(false);
const partCoverError = ref<string | null>(null);
const partCoverLightboxOpen = ref(false);
const chapterThumbnails = ref<Record<string, string>>({});

const book = computed(() => books.value.find((b: any) => b.id === bookId.value) || null);
const bookTitle = computed(() => book.value?.title ?? bookId.value);
const partName = computed(() => part.value?.name ?? "");

function parseIdOrder(order: string | null | undefined): string[] {
  if (!order) return [];
  try {
    const parsed = JSON.parse(order);
    if (Array.isArray(parsed)) {
      return parsed.filter((value: unknown): value is string => typeof value === "string");
    }
  } catch {
    // Ignore parse errors and fallback to empty order
  }
  return [];
}

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry): entry is string => entry.length > 0);
}

const partNumber = computed(() => {
  const order = parseIdOrder(book.value?.part_order);
  const index = order.indexOf(partId.value);
  return index >= 0 ? index + 1 : null;
});

const partLabel = computed(() => {
  if (!part.value) return "Part";
  return partNumber.value ? `Part ${partNumber.value}` : "Part";
});

const isMobileRoute = computed(() => route.meta.mobile === true);
const routePrefix = computed(() => (isMobileRoute.value ? "/m/books" : "/books"));
const bookUrl = computed(() => `${routePrefix.value}/${bookId.value}`);
const organizeUrl = computed(() => `/books/${bookId.value}/organize`);

const partActiveImageSource = computed(() => {
  const id = partActiveImageId.value;
  if (!id) return null;
  return partImageSources.value[id] ?? null;
});

const partActiveImageLabel = computed(() => {
  if (!partActiveImageId.value) return "";
  const image = partImages.value.find((entry) => entry.id === partActiveImageId.value);
  return image?.file_name ?? "";
});

const totalWordCount = computed(() =>
  chapterEntries.value.reduce((sum, chapter) => sum + (chapter.wordCount || 0), 0),
);

const summarizedChapterCount = computed(
  () =>
    chapterEntries.value.filter((chapter) => chapter.summary && chapter.summary.trim().length > 0)
      .length,
);

const summaryCoverage = computed(() => {
  const total = chapterEntries.value.length;
  if (total === 0) return "0/0";
  return `${summarizedChapterCount.value}/${total}`;
});

const availableChapterSummaries = computed<PartSummaryChapterInput[]>(() =>
  chapterEntries.value
    .filter((chapter) => chapter.summary && chapter.summary.trim().length > 0)
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.title ? chapter.title : `Chapter ${chapter.position}`,
      summary: chapter.summary!.trim(),
    })),
);

const hasPartSummary = computed(() => partSummary.value.summary.trim().length > 0);

const chapterTitleMap = computed(() => {
  const map = new Map<string, string>();
  chapterEntries.value.forEach((entry) => {
    map.set(entry.id, entry.title ? entry.title : `Chapter ${entry.position}`);
  });
  return map;
});

function truncateSummary(text: string, limit = 200) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

async function loadPartSummaryData(partIdValue: string) {
  try {
    const summaryData = await getPartSummary(partIdValue);
    if (summaryData) {
      const characters = parseJsonArray(summaryData.characters);
      const beats = parseJsonArray(summaryData.beats);
      partSummary.value = {
        summary: summaryData.summary || "",
        characters,
        beats,
        updatedAt: summaryData.updated_at || summaryData.created_at || null,
      };
      editedSummary.value = summaryData.summary || "";
    } else {
      partSummary.value = {
        summary: "",
        characters: [],
        beats: [],
        updatedAt: null,
      };
      editedSummary.value = "";
    }
  } catch (error) {
    console.error("Failed to load part summary:", error);
    partSummary.value = {
      summary: "",
      characters: [],
      beats: [],
      updatedAt: null,
    };
    editedSummary.value = "";
  }
}

async function hydrateChapterEntries(fetchedPart: BookPart) {
  const chapterOrder = parseIdOrder(fetchedPart.chapter_order);
  const assignedChapters = chapters.value.filter((ch: any) => ch.part_id === fetchedPart.id);
  const chapterMap = new Map<string, any>(
    assignedChapters.map((chapter: any) => [chapter.id, chapter]),
  );

  const sortedByOrder = chapterOrder.filter((id) => chapterMap.has(id));
  const remaining = assignedChapters
    .filter((chapter: any) => !sortedByOrder.includes(chapter.id))
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const combinedIds = [...sortedByOrder, ...remaining.map((chapter: any) => chapter.id)];
  const baseEntries = combinedIds
    .map((id, index) => {
      const chapter = chapterMap.get(id);
      if (!chapter) return null;
      return {
        id: chapter.id,
        title: chapter.title || null,
        wordCount: chapter.word_count || 0,
        position: index + 1,
      };
    })
    .filter(
      (entry): entry is { id: string; title: string | null; wordCount: number; position: number } =>
        entry !== null,
    );

  const enriched = await Promise.all(
    baseEntries.map(async (entry) => {
      const summaryData = await getSummary(entry.id);
      const characters = summaryData ? parseJsonArray(summaryData.characters) : [];
      const beats = summaryData ? parseJsonArray(summaryData.beats) : [];
      return {
        ...entry,
        summary: summaryData?.summary ?? null,
        characters,
        beats,
      } satisfies PartChapterEntry;
    }),
  );

  chapterEntries.value = enriched;
}

async function loadPart() {
  loading.value = true;
  errorMessage.value = null;
  try {
    await loadBooks();
    await loadChapters(bookId.value);
    const parts = await getParts(bookId.value);
    const currentPart = parts.find((p: BookPart) => p.id === partId.value) || null;

    if (!currentPart) {
      part.value = null;
      chapterEntries.value = [];
      await loadPartSummaryData(partId.value);
      errorMessage.value = "Part not found.";
      return;
    }

    part.value = currentPart;
    await hydrateChapterEntries(currentPart);
    await loadPartSummaryData(currentPart.id);
    // Load images - works on desktop (filesystem) or web (restored from backup)
    await refreshPartImages(currentPart.id);
    await loadPartCoverImage(currentPart.id);
    // Load chapter thumbnails
    await loadChapterThumbnailsForPart();
  } catch (error) {
    console.error("Failed to load part data:", error);
    errorMessage.value = "Failed to load part details.";
  } finally {
    loading.value = false;
  }
}

const loadChapterThumbnailsForPart = async () => {
  const chapterIds = chapterEntries.value.map((entry) => entry.id);
  if (chapterIds.length === 0) {
    chapterThumbnails.value = {};
    return;
  }
  try {
    chapterThumbnails.value = await fetchChapterThumbnails(chapterIds);
  } catch (error) {
    console.warn("Failed to load chapter thumbnails:", error);
    chapterThumbnails.value = {};
  }
};

const refreshPartImages = async (targetPartId?: string) => {
  const resolvedPartId = targetPartId ?? partId.value;
  if (!resolvedPartId) {
    partImages.value = [];
    partImageSources.value = {};
    return;
  }

  partImagesLoading.value = true;
  partImageError.value = null;
  try {
    const images = await fetchPartImages(resolvedPartId);
    partImages.value = images;
    const sources: Record<string, string> = {};
    for (const image of images) {
      try {
        sources[image.id] = await getPartImageSource(image);
      } catch (error) {
        // Silently skip images that can't be loaded
      }
    }
    partImageSources.value = sources;
  } catch (error) {
    partImageError.value =
      error instanceof Error ? error.message : "Failed to load part illustrations.";
  } finally {
    partImagesLoading.value = false;
  }
};

const loadPartCoverImage = async (targetPartId: string) => {
  partCoverLoading.value = true;
  partCoverError.value = null;
  try {
    const asset = await fetchPartCover(targetPartId);
    partCoverImage.value = asset;
    if (asset) {
      try {
        partCoverSrc.value = await getPartImageSource(asset);
      } catch {
        partCoverSrc.value = null;
      }
    } else {
      partCoverSrc.value = null;
    }
  } catch (error) {
    partCoverError.value = error instanceof Error ? error.message : "Failed to load part cover";
  } finally {
    partCoverLoading.value = false;
  }
};

const handleSelectPartCover = async () => {
  if (!part.value) return;

  partCoverLoading.value = true;
  partCoverError.value = null;
  try {
    const asset = await pickPartCover(bookId.value, part.value.id);
    if (asset) {
      partCoverImage.value = asset;
      partCoverSrc.value = await getPartImageSource(asset);
      part.value.cover_image_id = asset.id;
    }
  } catch (error) {
    partCoverError.value = error instanceof Error ? error.message : "Failed to update part cover";
  } finally {
    partCoverLoading.value = false;
  }
};

const handleDeletePartCover = async () => {
  if (!part.value || !partCoverImage.value) return;

  partCoverLoading.value = true;
  partCoverError.value = null;
  try {
    await deleteImage(partCoverImage.value);
    await setPartCoverImageId(part.value.id, null);
    partCoverImage.value = null;
    partCoverSrc.value = null;
    part.value.cover_image_id = null;
  } catch (error) {
    partCoverError.value = error instanceof Error ? error.message : "Failed to delete part cover";
  } finally {
    partCoverLoading.value = false;
  }
};

const openPartImageModal = (imageId: string) => {
  if (!partImageSources.value[imageId]) return;
  partActiveImageId.value = imageId;
  partImageModalOpen.value = true;
};

const closePartImageModal = () => {
  partImageModalOpen.value = false;
  partActiveImageId.value = null;
};

const currentPartImageIndex = computed(() => {
  if (!partActiveImageId.value) return -1;
  return partImages.value.findIndex((img) => img.id === partActiveImageId.value);
});

const hasNextPartImage = computed(() => {
  return (
    currentPartImageIndex.value >= 0 && currentPartImageIndex.value < partImages.value.length - 1
  );
});

const hasPrevPartImage = computed(() => {
  return currentPartImageIndex.value > 0;
});

const goToNextPartImage = () => {
  if (!hasNextPartImage.value) return;
  const nextIndex = currentPartImageIndex.value + 1;
  const nextImage = partImages.value[nextIndex];
  if (nextImage && partImageSources.value[nextImage.id]) {
    partActiveImageId.value = nextImage.id;
  }
};

const goToPrevPartImage = () => {
  if (!hasPrevPartImage.value) return;
  const prevIndex = currentPartImageIndex.value - 1;
  const prevImage = partImages.value[prevIndex];
  if (prevImage && partImageSources.value[prevImage.id]) {
    partActiveImageId.value = prevImage.id;
  }
};

const openPartCoverLightbox = () => {
  if (partCoverSrc.value) {
    partCoverLightboxOpen.value = true;
  }
};

const closePartCoverLightbox = () => {
  partCoverLightboxOpen.value = false;
};

const goBack = () => {
  router.push(bookUrl.value);
};

const startEditingSummary = () => {
  if (!hasPartSummary.value) return;
  editedSummary.value = partSummary.value.summary;
  isEditingSummary.value = true;
};

const cancelEditingSummary = () => {
  editedSummary.value = partSummary.value.summary;
  isEditingSummary.value = false;
};

const saveEditedSummary = async () => {
  if (!part.value) return;
  if (!editedSummary.value.trim()) {
    alert("Part summary cannot be empty.");
    return;
  }

  savingSummary.value = true;
  try {
    await savePartSummary({
      part_id: part.value.id,
      summary: editedSummary.value.trim(),
      characters: partSummary.value.characters,
      beats: partSummary.value.beats,
    });
    await loadPartSummaryData(part.value.id);
    isEditingSummary.value = false;
  } catch (error) {
    console.error("Failed to save part summary:", error);
    alert("Failed to save part summary.");
  } finally {
    savingSummary.value = false;
  }
};

const handleGeneratePartSummary = async () => {
  if (!part.value) return;

  generatingSummary.value = true;
  try {
    await hydrateChapterEntries(part.value);
    const summaries = availableChapterSummaries.value;
    if (!summaries.length) {
      alert("Add chapter summaries within this part before generating a part summary.");
      return;
    }

    const apiKey = localStorage.getItem("openai_api_key");
    if (!apiKey) {
      alert("Please add your OpenAI API key in Settings first.");
      router.push("/settings");
      return;
    }

    const result = await generatePartSummaryAi(
      apiKey,
      bookTitle.value,
      part.value.name,
      part.value.id,
      summaries,
      partNumber.value || undefined,
    );

    await savePartSummary({
      part_id: part.value.id,
      summary: result.summary,
      characters: result.characters,
      beats: result.beats,
    });
    await loadPartSummaryData(part.value.id);
    isEditingSummary.value = false;
  } catch (error: any) {
    console.error("Failed to generate part summary:", error);
    const message = error?.message ?? "Unknown error";
    alert(`Failed to generate part summary: ${message}`);
  } finally {
    generatingSummary.value = false;
  }
};

const openChapter = (chapterId: string) => {
  router.push(`${routePrefix.value}/${bookId.value}/chapters/${chapterId}`);
};

watch(
  () => desktopImagesAvailable.value,
  async () => {
    if (part.value) {
      await refreshPartImages(part.value.id);
      await loadPartCoverImage(part.value.id);
    }
  },
);

watch(partId, async () => {
  await refreshPartImages(partId.value);
});

onMounted(async () => {
  await loadPart();
});

watch([bookId, partId], async () => {
  await loadPart();
});
</script>

<template>
  <div class="w-full">
    <div
      class="border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-6 lg:px-8"
    >
      <div class="mx-auto flex w-full max-w-6xl items-center justify-between">
        <div class="flex items-center space-x-4">
          <button
            @click="goBack"
            class="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <ArrowLeftIcon class="h-5 w-5" />
          </button>
          <div v-if="!partCoverSrc">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
              {{ partLabel }}<span v-if="partName">: {{ partName }}</span>
            </h1>
          </div>
        </div>

        <div class="flex items-center space-x-3">
          <router-link
            :to="organizeUrl"
            class="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Manage Parts
          </router-link>
        </div>
      </div>
    </div>

    <div class="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div v-if="loading" class="flex h-64 items-center justify-center">
        <div class="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>

      <div v-else>
        <div
          v-if="errorMessage"
          class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200"
        >
          {{ errorMessage }}
        </div>

        <template v-else>
          <!-- Part Cover Hero -->
          <div v-if="partCoverSrc" class="relative -mx-4 -mt-8 mb-8 sm:-mx-6 lg:-mx-8">
            <!-- Hero image container -->
            <div
              class="relative h-48 w-full overflow-hidden bg-gray-900 sm:h-64 md:h-80 lg:h-96 cursor-pointer"
              @click="openPartCoverLightbox"
            >
              <img
                :src="partCoverSrc"
                class="h-full w-full object-cover opacity-90 transition-opacity hover:opacity-100"
                alt="Part cover"
              />
              <!-- Gradient overlay -->
              <div
                class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
              ></div>
              <!-- Part info overlay -->
              <div class="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8">
                <p class="text-sm font-medium text-white/80">{{ bookTitle }}</p>
                <h2 class="mt-1 text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
                  {{ partLabel }}<span v-if="partName">: {{ partName }}</span>
                </h2>
                <p class="mt-2 text-sm text-white/70">
                  {{ chapterEntries.length }} chapters &middot;
                  {{ totalWordCount.toLocaleString() }} words
                </p>
              </div>
            </div>
            <!-- Cover action buttons -->
            <div
              v-if="desktopImagesAvailable"
              class="absolute right-4 top-4 flex items-center gap-2 sm:right-6 lg:right-8"
            >
              <button
                type="button"
                class="inline-flex items-center rounded-md bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="partCoverLoading"
                @click.stop="handleSelectPartCover"
              >
                <span
                  v-if="partCoverLoading"
                  class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                ></span>
                {{ partCoverLoading ? "Updating..." : "Change cover" }}
              </button>
              <button
                type="button"
                class="inline-flex items-center rounded-md bg-red-600/80 px-2.5 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="partCoverLoading"
                title="Delete cover"
                @click.stop="handleDeletePartCover"
              >
                <TrashIcon class="h-4 w-4" />
              </button>
            </div>
            <p
              v-if="partCoverError"
              class="absolute right-4 top-14 text-xs text-red-400 sm:right-6 lg:right-8"
            >
              {{ partCoverError }}
            </p>
          </div>

          <!-- Add cover prompt (when no cover) -->
          <div
            v-else-if="desktopImagesAvailable"
            class="mb-8 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800/50"
          >
            <div class="mx-auto max-w-md">
              <div
                class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700"
              >
                <svg
                  class="h-8 w-8 text-gray-400 dark:text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Add a Part Cover</h3>
              <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Set a cover image for this part to create a visual header.
              </p>
              <button
                type="button"
                class="mt-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="partCoverLoading"
                @click="handleSelectPartCover"
              >
                <span
                  v-if="partCoverLoading"
                  class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                ></span>
                {{ partCoverLoading ? "Adding..." : "Add cover image" }}
              </button>
              <p v-if="partCoverError" class="mt-2 text-xs text-red-600 dark:text-red-400">
                {{ partCoverError }}
              </p>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-3 mb-8">
            <div
              class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
            >
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Chapters</p>
              <p class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                {{ chapterEntries.length.toLocaleString() }}
              </p>
            </div>
            <div
              class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
            >
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Words</p>
              <p class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                {{ totalWordCount.toLocaleString() }}
              </p>
            </div>
            <div
              class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
            >
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Summaries Ready</p>
              <p class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                {{ summaryCoverage }}
              </p>
            </div>
          </div>

          <section
            class="mb-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Part Summary</h2>
                <p
                  v-if="formatDateTime(partSummary.updatedAt)"
                  class="text-sm text-gray-500 dark:text-gray-400"
                >
                  Updated {{ formatDateTime(partSummary.updatedAt) }}
                </p>
              </div>
              <div class="flex flex-wrap gap-3">
                <button
                  @click="handleGeneratePartSummary"
                  :disabled="generatingSummary || chapterEntries.length === 0"
                  class="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span
                    v-if="generatingSummary"
                    class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  ></span>
                  <SparklesIcon v-else class="mr-2 h-4 w-4" />
                  {{
                    generatingSummary
                      ? "Generating..."
                      : hasPartSummary
                        ? "Regenerate Summary"
                        : "Generate Summary"
                  }}
                </button>
                <button
                  v-if="hasPartSummary && !isEditingSummary"
                  @click="startEditingSummary"
                  class="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <PencilIcon class="mr-2 h-4 w-4" />
                  Edit
                </button>
              </div>
            </div>

            <div
              v-if="generatingSummary"
              class="mt-6 flex items-center rounded-md border border-dashed border-blue-300 bg-blue-50/70 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200"
            >
              <div
                class="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
              ></div>
              AI is generating a higher-level summary using your chapter summaries…
            </div>

            <div v-else class="mt-6 space-y-6">
              <div v-if="isEditingSummary">
                <textarea
                  v-model="editedSummary"
                  rows="6"
                  class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  placeholder="Write a concise overview of this part..."
                ></textarea>
                <div class="mt-3 flex items-center gap-3">
                  <button
                    @click="saveEditedSummary"
                    :disabled="savingSummary"
                    class="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span
                      v-if="savingSummary"
                      class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    ></span>
                    {{ savingSummary ? "Saving..." : "Save Summary" }}
                  </button>
                  <button
                    @click="cancelEditingSummary"
                    class="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <div v-else>
                <MarkdownRenderer
                  v-if="hasPartSummary"
                  :text="partSummary.summary"
                  class="prose prose-sm max-w-none text-gray-700 dark:prose-invert dark:text-gray-200"
                />
                <div
                  v-else
                  class="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400"
                >
                  Generate this part summary to brief the AI on everything that happened in these
                  chapters.
                </div>
              </div>

              <div v-if="partSummary.characters.length" class="space-y-2">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Key Characters</h3>
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="character in partSummary.characters"
                    :key="character"
                    class="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                  >
                    {{ character }}
                  </span>
                </div>
              </div>

              <div v-if="partSummary.beats.length" class="space-y-2">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">Major Beats</h3>
                <ul class="list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
                  <li v-for="beat in partSummary.beats" :key="beat">
                    {{ beat }}
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section
            v-if="desktopImagesAvailable"
            class="mb-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div class="mb-4">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                Part Illustrations
              </h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Every chapter illustration assigned to this part appears here.
              </p>
            </div>
            <p v-if="partImageError" class="text-sm text-red-600 dark:text-red-400">
              {{ partImageError }}
            </p>
            <div
              v-if="partImagesLoading"
              class="py-8 text-center text-sm text-gray-500 dark:text-gray-400"
            >
              Loading images...
            </div>
            <div v-else>
              <div v-if="partImages.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <button
                  v-for="image in partImages"
                  :key="image.id"
                  type="button"
                  class="group overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-left transition hover:shadow dark:border-gray-700 dark:bg-gray-800"
                  @click="openPartImageModal(image.id)"
                >
                  <div class="aspect-[4/3] w-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                    <img
                      v-if="partImageSources[image.id]"
                      :src="partImageSources[image.id]"
                      class="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                      :alt="chapterTitleMap.get(image.chapter_id || '') || 'Part illustration'"
                    />
                    <div
                      v-else
                      class="flex h-full w-full items-center justify-center text-xs text-gray-500 dark:text-gray-300"
                    >
                      Loading...
                    </div>
                  </div>
                  <div class="border-t border-gray-200 px-3 py-2 text-xs dark:border-gray-700">
                    <p class="font-medium text-gray-900 dark:text-gray-100">
                      {{ chapterTitleMap.get(image.chapter_id || "") || "Unassigned chapter" }}
                    </p>
                    <p class="mt-1 truncate text-gray-500 dark:text-gray-400">
                      {{ image.file_name }}
                    </p>
                  </div>
                </button>
              </div>
              <div
                v-else
                class="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-300"
              >
                No chapter illustrations yet.
              </div>
            </div>
          </section>

          <section>
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                Chapters in this Part
              </h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ summarizedChapterCount }} of {{ chapterEntries.length }} chapters summarized
              </p>
            </div>

            <div
              v-if="chapterEntries.length === 0"
              class="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400"
            >
              No chapters are currently assigned to this part.
            </div>

            <div v-else class="space-y-4">
              <div
                v-for="chapter in chapterEntries"
                :key="chapter.id"
                class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-200 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-700/50"
              >
                <div class="flex gap-4">
                  <!-- Chapter thumbnail -->
                  <div
                    v-if="chapterThumbnails[chapter.id]"
                    class="hidden h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:block dark:bg-gray-800"
                  >
                    <img
                      :src="chapterThumbnails[chapter.id]"
                      :alt="`${chapter.title || 'Chapter'} thumbnail`"
                      class="h-full w-full object-cover"
                    />
                  </div>

                  <div
                    class="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div>
                      <p class="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        Chapter {{ chapter.position.toString().padStart(2, "0") }}
                      </p>
                      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                        {{ chapter.title || `Chapter ${chapter.position}` }}
                      </h3>
                      <p class="text-sm text-gray-500 dark:text-gray-400">
                        {{ chapter.wordCount.toLocaleString() }} words
                      </p>
                    </div>
                    <div class="flex items-center gap-2 text-sm font-medium">
                      <CheckCircleIcon v-if="chapter.summary" class="h-5 w-5 text-green-500" />
                      <ClockIcon v-else class="h-5 w-5 text-gray-400" />
                      <span class="text-gray-600 dark:text-gray-300">
                        {{ chapter.summary ? "Summary ready" : "Needs summary" }}
                      </span>
                    </div>
                  </div>
                </div>

                <p v-if="chapter.summary" class="mt-3 text-sm text-gray-700 dark:text-gray-300">
                  {{ truncateSummary(chapter.summary) }}
                </p>
                <p v-else class="mt-3 text-sm italic text-gray-500 dark:text-gray-400">
                  No summary yet. Summaries help the AI understand how this chapter contributes to
                  the part.
                </p>

                <div v-if="chapter.characters.length" class="mt-4 flex flex-wrap gap-2">
                  <span
                    v-for="character in chapter.characters"
                    :key="`${chapter.id}-${character}`"
                    class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    {{ character }}
                  </span>
                </div>

                <div class="mt-4 flex flex-wrap gap-3">
                  <button
                    @click="openChapter(chapter.id)"
                    class="rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30"
                  >
                    Open Chapter
                  </button>
                </div>
              </div>
            </div>
          </section>
        </template>
      </div>
    </div>
  </div>

  <ImageLightbox
    :open="partImageModalOpen"
    :image-src="partActiveImageSource"
    :caption="partActiveImageLabel"
    :has-next="hasNextPartImage"
    :has-prev="hasPrevPartImage"
    @close="closePartImageModal"
    @next="goToNextPartImage"
    @prev="goToPrevPartImage"
  />

  <ImageLightbox
    :open="partCoverLightboxOpen"
    :image-src="partCoverSrc"
    :caption="`${partLabel}${partName ? ': ' + partName : ''} - Cover`"
    @close="closePartCoverLightbox"
  />
</template>
