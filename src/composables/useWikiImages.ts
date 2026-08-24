import { ref, computed, watch } from 'vue';
import { useImageLibrary } from '@/composables/useImageLibrary';
import { useDatabase } from '@/composables/useDatabase';
import type { ImageAsset, ImageWikiTag } from '@/lib/database';

interface WikiPageOption {
  id: string;
  page_name: string;
  page_type?: string | null;
}

export function useWikiImages(wikiPageIdRef: () => string | undefined, bookIdRef: () => string | undefined) {
  const {
    canSelectImages,
    canStoreImages,
    addImagesToWikiPage,
    deleteImage,
    getImageSource,
    downloadOrShareImage,
  } = useImageLibrary();
  const {
    getWikiPageImageAssets,
    getWikiPageCoverImageAsset,
    setWikiPageCoverImageId,
    getImageWikiTags,
    getWikiPages,
    setImageWikiTags,
    updateImageAssetNotes,
  } = useDatabase();

  const wikiImages = ref<ImageAsset[]>([]);
  const wikiImagesLoading = ref(false);
  const addingWikiImages = ref(false);
  const wikiImageSources = ref<Record<string, string>>({});
  const wikiImageTags = ref<Record<string, ImageWikiTag[]>>({});
  const bookWikiPages = ref<WikiPageOption[]>([]);
  const wikiImageError = ref<string | null>(null);
  const showImageLightbox = ref(false);
  const activeImageId = ref<string | null>(null);
  const wikiCoverImageId = ref<string | null>(null);
  const settingCoverId = ref<string | null>(null);
  const savingImageNotes = ref(false);
  const savingImageTags = ref(false);
  const showDeleteIllustrationModal = ref(false);
  const deletingIllustration = ref(false);
  const illustrationToDelete = ref<string | null>(null);
  const wikiImageUploadAvailable = canSelectImages;

  const activeImageSource = computed(() => {
    const id = activeImageId.value;
    if (!id) return null;
    return wikiImageSources.value[id] ?? null;
  });

  const activeImage = computed(() => {
    if (!activeImageId.value) return null;
    return wikiImages.value.find((item) => item.id === activeImageId.value) ?? null;
  });

  const activeImageTags = computed(() => {
    if (!activeImageId.value) return [];
    return wikiImageTags.value[activeImageId.value] ?? [];
  });

  const activeImageLabel = computed(() => {
    if (!activeImageId.value) return "";
    const image = wikiImages.value.find((item) => item.id === activeImageId.value);
    return image?.file_name ?? "";
  });

  const heroImage = computed(() => {
    if (wikiImages.value.length === 0) return null;
    if (wikiCoverImageId.value) {
      const coverImage = wikiImages.value.find(img => img.id === wikiCoverImageId.value);
      if (coverImage) return coverImage;
    }
    return wikiImages.value[0];
  });

  const heroImageSrc = computed(() => {
    if (!heroImage.value) return null;
    return wikiImageSources.value[heroImage.value.id] ?? null;
  });

  const currentImageIndex = computed(() => {
    if (!activeImageId.value) return -1;
    return wikiImages.value.findIndex((img) => img.id === activeImageId.value);
  });

  const hasNextImage = computed(() => {
    return currentImageIndex.value >= 0 && currentImageIndex.value < wikiImages.value.length - 1;
  });

  const hasPrevImage = computed(() => {
    return currentImageIndex.value > 0;
  });

  const illustrationToDeleteName = computed(() => {
    if (!illustrationToDelete.value) return "";
    const image = wikiImages.value.find((item) => item.id === illustrationToDelete.value);
    return image?.file_name || "this illustration";
  });

  const canDeleteWikiImage = (image: ImageAsset) => image.asset_type === 'wiki';

  const refreshWikiImages = async () => {
    const wikiPageId = wikiPageIdRef();
    if (!wikiPageId) {
      wikiImages.value = [];
      wikiImageSources.value = {};
      wikiImageTags.value = {};
      wikiCoverImageId.value = null;
      bookWikiPages.value = [];
      return;
    }

    wikiImagesLoading.value = true;
    wikiImageError.value = null;
    try {
      const images = await getWikiPageImageAssets(wikiPageId);
      wikiImages.value = images;
      const sources: Record<string, string> = {};
      const tags: Record<string, ImageWikiTag[]> = {};
      for (const image of images) {
        try {
          sources[image.id] = await getImageSource(image);
        } catch (error) {
          console.warn("Failed to load wiki illustration preview", error);
        }
        try {
          tags[image.id] = await getImageWikiTags(image.id);
        } catch (error) {
          console.warn("Failed to load wiki illustration tags", error);
        }
      }
      wikiImageSources.value = sources;
      wikiImageTags.value = tags;

      const coverImage = await getWikiPageCoverImageAsset(wikiPageId);
      wikiCoverImageId.value = coverImage?.id ?? null;

      // Load wiki pages for tagging
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
      wikiImageError.value =
        error instanceof Error ? error.message : "Failed to load wiki illustrations";
    } finally {
      wikiImagesLoading.value = false;
    }
  };

  const handleAddIllustrations = async () => {
    const wikiPageId = wikiPageIdRef();
    const bookId = bookIdRef();
    if (!wikiPageId || !bookId) return;

    addingWikiImages.value = true;
    wikiImageError.value = null;
    try {
      const newImages = await addImagesToWikiPage(bookId, wikiPageId);
      if (!newImages.length) return;

      wikiImages.value = [...newImages, ...wikiImages.value];
      const sources = { ...wikiImageSources.value };
      const tags = { ...wikiImageTags.value };
      for (const image of newImages) {
        try {
          sources[image.id] = await getImageSource(image);
        } catch (error) {
          console.warn("Failed to load preview for new wiki illustration", error);
        }
        try {
          tags[image.id] = await getImageWikiTags(image.id);
        } catch (error) {
          console.warn("Failed to load tags for new wiki illustration", error);
          tags[image.id] = [];
        }
      }
      wikiImageSources.value = sources;
      wikiImageTags.value = tags;
    } catch (error) {
      wikiImageError.value = error instanceof Error ? error.message : "Failed to add illustrations";
    } finally {
      addingWikiImages.value = false;
    }
  };

  const requestDeleteIllustration = (imageId: string) => {
    const image = wikiImages.value.find((item) => item.id === imageId);
    if (!image || !canDeleteWikiImage(image)) return;
    illustrationToDelete.value = imageId;
    showDeleteIllustrationModal.value = true;
  };

  const cancelDeleteIllustration = () => {
    if (deletingIllustration.value) return;
    showDeleteIllustrationModal.value = false;
    illustrationToDelete.value = null;
  };

  const handleDeleteIllustration = async () => {
    const imageId = illustrationToDelete.value;
    if (!imageId) return;
    const image = wikiImages.value.find((item) => item.id === imageId);
    if (!image || !canDeleteWikiImage(image)) return;

    deletingIllustration.value = true;
    try {
      await deleteImage(image);
      wikiImages.value = wikiImages.value.filter((item) => item.id !== imageId);
      const sources = { ...wikiImageSources.value };
      delete sources[imageId];
      wikiImageSources.value = sources;
      const tags = { ...wikiImageTags.value };
      delete tags[imageId];
      wikiImageTags.value = tags;
      if (activeImageId.value === imageId) closeImageModal();
      if (wikiCoverImageId.value === imageId) wikiCoverImageId.value = null;
      showDeleteIllustrationModal.value = false;
      illustrationToDelete.value = null;
    } catch (error) {
      wikiImageError.value = error instanceof Error ? error.message : "Failed to delete illustration";
    } finally {
      deletingIllustration.value = false;
    }
  };

  const openImageModal = (imageId: string) => {
    if (!wikiImageSources.value[imageId]) return;
    activeImageId.value = imageId;
    showImageLightbox.value = true;
  };

  const closeImageModal = () => {
    showImageLightbox.value = false;
    activeImageId.value = null;
  };

  const goToNextImage = () => {
    if (!hasNextImage.value) return;
    const nextIndex = currentImageIndex.value + 1;
    const nextImage = wikiImages.value[nextIndex];
    if (nextImage && wikiImageSources.value[nextImage.id]) {
      activeImageId.value = nextImage.id;
    }
  };

  const goToPrevImage = () => {
    if (!hasPrevImage.value) return;
    const prevIndex = currentImageIndex.value - 1;
    const prevImage = wikiImages.value[prevIndex];
    if (prevImage && wikiImageSources.value[prevImage.id]) {
      activeImageId.value = prevImage.id;
    }
  };

  const handleSetAsCover = async (imageId: string) => {
    const wikiPageId = wikiPageIdRef();
    if (!wikiPageId) return;

    settingCoverId.value = imageId;
    try {
      await setWikiPageCoverImageId(wikiPageId, imageId);
      wikiCoverImageId.value = imageId;
    } catch (error) {
      wikiImageError.value =
        error instanceof Error ? error.message : "Failed to set cover image";
    } finally {
      settingCoverId.value = null;
    }
  };

  const handleDownloadImage = async (imageId: string) => {
    const image = wikiImages.value.find((img) => img.id === imageId);
    if (!image) return;
    try {
      await downloadOrShareImage(image);
    } catch (error) {
      wikiImageError.value = error instanceof Error ? error.message : 'Failed to save image';
    }
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
      wikiImages.value = wikiImages.value.map((item) =>
        item.id === image.id ? updatedImage : item
      );
    } catch (error) {
      wikiImageError.value =
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
      wikiImageTags.value = {
        ...wikiImageTags.value,
        [image.id]: await getImageWikiTags(image.id),
      };
    } catch (error) {
      wikiImageError.value =
        error instanceof Error ? error.message : "Failed to save image tags";
    } finally {
      savingImageTags.value = false;
    }
  };

  const openHeroLightbox = () => {
    const hero = heroImage.value;
    if (hero && wikiImageSources.value[hero.id]) {
      activeImageId.value = hero.id;
      showImageLightbox.value = true;
    }
  };

  // Set up watchers
  watch(() => canStoreImages.value, () => {
    refreshWikiImages();
  });

  return {
    // State
    wikiImages,
    wikiImagesLoading,
    addingWikiImages,
    wikiImageSources,
    wikiImageTags,
    bookWikiPages,
    wikiImageError,
    showImageLightbox,
    activeImageId,
    wikiCoverImageId,
    settingCoverId,
    savingImageNotes,
    savingImageTags,
    showDeleteIllustrationModal,
    deletingIllustration,
    illustrationToDelete,
    wikiImageUploadAvailable,

    // Computed
    activeImageSource,
    activeImage,
    activeImageTags,
    activeImageLabel,
    heroImage,
    heroImageSrc,
    hasNextImage,
    hasPrevImage,
    illustrationToDeleteName,
    canDeleteWikiImage,

    // Methods
    refreshWikiImages,
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
    handleSaveActiveImageNotes,
    handleSaveActiveImageTags,
    openHeroLightbox,
  };
}
