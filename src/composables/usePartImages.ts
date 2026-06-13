import { ref, computed, watch } from 'vue';
import { useImageLibrary } from '@/composables/useImageLibrary';
import { useDatabase } from '@/composables/useDatabase';
import type { ImageAsset, ImageWikiTag } from '@/lib/database';

interface WikiPageOption {
  id: string;
  page_name: string;
  page_type?: string | null;
}

export function usePartImages(partIdRef: () => string | undefined, bookIdRef: () => string | undefined) {
  const {
    desktopImagesAvailable,
    fetchPartImages,
    getImageSource,
  } = useImageLibrary();
  const {
    getWikiPages,
    getImageWikiTags,
    setImageWikiTags,
    updateImageAssetNotes,
  } = useDatabase();

  const partImages = ref<ImageAsset[]>([]);
  const partImagesLoading = ref(false);
  const partImageSources = ref<Record<string, string>>({});
  const partImageTags = ref<Record<string, ImageWikiTag[]>>({});
  const bookWikiPages = ref<WikiPageOption[]>([]);
  const partImageError = ref<string | null>(null);
  const showImageLightbox = ref(false);
  const activeImageId = ref<string | null>(null);
  const savingImageNotes = ref(false);
  const savingImageTags = ref(false);

  const activeImageSource = computed(() => {
    const id = activeImageId.value;
    if (!id) return null;
    return partImageSources.value[id] ?? null;
  });

  const activeImage = computed(() => {
    if (!activeImageId.value) return null;
    return partImages.value.find((item) => item.id === activeImageId.value) ?? null;
  });

  const activeImageTags = computed(() => {
    if (!activeImageId.value) return [];
    return partImageTags.value[activeImageId.value] ?? [];
  });

  const activeImageLabel = computed(() => {
    if (!activeImageId.value) return "";
    const image = partImages.value.find((item) => item.id === activeImageId.value);
    return image?.file_name ?? "";
  });

  const currentImageIndex = computed(() => {
    if (!activeImageId.value) return -1;
    return partImages.value.findIndex((img) => img.id === activeImageId.value);
  });

  const hasNextImage = computed(() => {
    return currentImageIndex.value >= 0 && currentImageIndex.value < partImages.value.length - 1;
  });

  const hasPrevImage = computed(() => {
    return currentImageIndex.value > 0;
  });

  const refreshPartImages = async () => {
    const partId = partIdRef();
    if (!partId) {
      partImages.value = [];
      partImageSources.value = {};
      partImageTags.value = {};
      return;
    }

    partImagesLoading.value = true;
    partImageError.value = null;
    try {
      const images = await fetchPartImages(partId);
      partImages.value = images;
      const sources: Record<string, string> = {};
      const tags: Record<string, ImageWikiTag[]> = {};
      for (const image of images) {
        try {
          sources[image.id] = await getImageSource(image);
        } catch (error) {
          console.warn("Failed to load part illustration preview", error);
        }
        try {
          tags[image.id] = await getImageWikiTags(image.id);
        } catch (error) {
          console.warn("Failed to load part illustration tags", error);
        }
      }
      partImageSources.value = sources;
      partImageTags.value = tags;

      const bookId = bookIdRef();
      if (bookId) {
        try {
          const pages = await getWikiPages(bookId);
          bookWikiPages.value = pages.map((page: WikiPageOption) => ({
            id: page.id,
            page_name: page.page_name,
            page_type: page.page_type ?? null,
          }));
        } catch (error) {
          console.warn("Failed to load wiki pages for illustration tags", error);
          bookWikiPages.value = [];
        }
      }
    } catch (error) {
      partImageError.value =
        error instanceof Error ? error.message : "Failed to load part illustrations";
    } finally {
      partImagesLoading.value = false;
    }
  };

  const openImageModal = (imageId: string) => {
    if (!partImageSources.value[imageId]) return;
    activeImageId.value = imageId;
    showImageLightbox.value = true;
  };

  const closeImageModal = () => {
    showImageLightbox.value = false;
    activeImageId.value = null;
  };

  const handleSaveActiveImageNotes = async (notes: string) => {
    const image = activeImage.value;
    if (!image) return;

    savingImageNotes.value = true;
    try {
      await updateImageAssetNotes(image.id, notes);
      const updatedImage = {
        ...image,
        notes,
        updated_at: new Date().toISOString(),
      };
      partImages.value = partImages.value.map((item) =>
        item.id === image.id ? updatedImage : item
      );
    } catch (error) {
      partImageError.value =
        error instanceof Error ? error.message : "Failed to save image notes";
    } finally {
      savingImageNotes.value = false;
    }
  };

  const handleSaveActiveImageTags = async (wikiPageIds: string[]) => {
    const image = activeImage.value;
    if (!image) return;

    savingImageTags.value = true;
    try {
      await setImageWikiTags(image.id, wikiPageIds);
      partImageTags.value = {
        ...partImageTags.value,
        [image.id]: await getImageWikiTags(image.id),
      };
    } catch (error) {
      partImageError.value =
        error instanceof Error ? error.message : "Failed to save image tags";
    } finally {
      savingImageTags.value = false;
    }
  };

  const goToNextImage = () => {
    if (!hasNextImage.value) return;
    const nextIndex = currentImageIndex.value + 1;
    const nextImage = partImages.value[nextIndex];
    if (nextImage && partImageSources.value[nextImage.id]) {
      activeImageId.value = nextImage.id;
    }
  };

  const goToPrevImage = () => {
    if (!hasPrevImage.value) return;
    const prevIndex = currentImageIndex.value - 1;
    const prevImage = partImages.value[prevIndex];
    if (prevImage && partImageSources.value[prevImage.id]) {
      activeImageId.value = prevImage.id;
    }
  };

  const handleDownloadImage = (imageId: string) => {
    const imageSrc = partImageSources.value[imageId];
    if (!imageSrc) return;

    const image = partImages.value.find((img) => img.id === imageId);
    const fileName = image?.file_name || `illustration-${imageId}.jpg`;

    const link = document.createElement("a");
    link.href = imageSrc;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Set up watchers
  watch(() => desktopImagesAvailable.value, () => {
    refreshPartImages();
  });

  return {
    // State
    desktopImagesAvailable,
    partImages,
    partImagesLoading,
    partImageSources,
    partImageTags,
    bookWikiPages,
    partImageError,
    showImageLightbox,
    activeImageId,
    savingImageNotes,
    savingImageTags,

    // Computed
    activeImageSource,
    activeImage,
    activeImageTags,
    activeImageLabel,
    hasNextImage,
    hasPrevImage,

    // Methods
    refreshPartImages,
    openImageModal,
    closeImageModal,
    handleSaveActiveImageNotes,
    handleSaveActiveImageTags,
    goToNextImage,
    goToPrevImage,
    handleDownloadImage,
  };
}
