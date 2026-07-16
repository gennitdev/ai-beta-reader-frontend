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
    canStoreImages,
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

  // An image opened in the modal that is not part of the illustration list
  // (e.g. the part cover, which is stored as a separate asset).
  const externalImage = ref<ImageAsset | null>(null);
  const externalImageSource = ref<string | null>(null);
  const externalImageTags = ref<ImageWikiTag[]>([]);

  const activeImageSource = computed(() => {
    if (externalImage.value) return externalImageSource.value;
    const id = activeImageId.value;
    if (!id) return null;
    return partImageSources.value[id] ?? null;
  });

  const activeImage = computed(() => {
    if (externalImage.value) return externalImage.value;
    if (!activeImageId.value) return null;
    return partImages.value.find((item) => item.id === activeImageId.value) ?? null;
  });

  const activeImageTags = computed(() => {
    if (externalImage.value) return externalImageTags.value;
    if (!activeImageId.value) return [];
    return partImageTags.value[activeImageId.value] ?? [];
  });

  const activeImageLabel = computed(() => {
    if (externalImage.value) return externalImage.value.file_name ?? "";
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
    externalImage.value = null;
    externalImageSource.value = null;
    externalImageTags.value = [];
    activeImageId.value = imageId;
    showImageLightbox.value = true;
  };

  const openImageAsset = async (asset: ImageAsset, source: string) => {
    activeImageId.value = null;
    externalImage.value = asset;
    externalImageSource.value = source;
    externalImageTags.value = [];
    showImageLightbox.value = true;
    try {
      externalImageTags.value = await getImageWikiTags(asset.id);
    } catch (error) {
      console.warn("Failed to load image tags", error);
    }
  };

  const closeImageModal = () => {
    showImageLightbox.value = false;
    activeImageId.value = null;
    externalImage.value = null;
    externalImageSource.value = null;
    externalImageTags.value = [];
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
      if (externalImage.value && externalImage.value.id === image.id) {
        externalImage.value = updatedImage;
      } else {
        partImages.value = partImages.value.map((item) =>
          item.id === image.id ? updatedImage : item
        );
      }
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
      const refreshedTags = await getImageWikiTags(image.id);
      if (externalImage.value && externalImage.value.id === image.id) {
        externalImageTags.value = refreshedTags;
      } else {
        partImageTags.value = {
          ...partImageTags.value,
          [image.id]: refreshedTags,
        };
      }
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
    const isExternal = externalImage.value?.id === imageId;
    const imageSrc = isExternal ? externalImageSource.value : partImageSources.value[imageId];
    if (!imageSrc) return;

    const image = isExternal
      ? externalImage.value
      : partImages.value.find((img) => img.id === imageId);
    const fileName = image?.file_name || `illustration-${imageId}.jpg`;

    const link = document.createElement("a");
    link.href = imageSrc;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Set up watchers
  watch(() => canStoreImages.value, () => {
    refreshPartImages();
  });

  return {
    // State
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
    openImageAsset,
    closeImageModal,
    handleSaveActiveImageNotes,
    handleSaveActiveImageTags,
    goToNextImage,
    goToPrevImage,
    handleDownloadImage,
  };
}
