import { ref, computed, watch } from 'vue';
import { useImageLibrary } from '@/composables/useImageLibrary';
import { useDatabase } from '@/composables/useDatabase';
import type { ImageAsset, ImageWikiTag } from '@/lib/database';

interface WikiPageOption {
  id: string;
  page_name: string;
  page_type?: string | null;
}

export function useChapterImages(chapterIdRef: () => string | undefined, bookIdRef: () => string | undefined) {
  const {
    desktopImagesAvailable,
    addImagesToChapter,
    deleteImage: deleteChapterImageAsset,
    fetchChapterImages,
    fetchChapterCover,
    setChapterCoverImageId,
    getImageSource,
    canUploadImages,
  } = useImageLibrary();
  const {
    getWikiPages,
    getImageWikiTags,
    setImageWikiTags,
    updateImageAssetNotes,
  } = useDatabase();

  const chapterImages = ref<ImageAsset[]>([]);
  const chapterImagesLoading = ref(false);
  const addingChapterImages = ref(false);
  const chapterImageSources = ref<Record<string, string>>({});
  const chapterImageTags = ref<Record<string, ImageWikiTag[]>>({});
  const bookWikiPages = ref<WikiPageOption[]>([]);
  const chapterImageError = ref<string | null>(null);
  const showImageLightbox = ref(false);
  const activeImageId = ref<string | null>(null);
  const savingImageNotes = ref(false);
  const savingImageTags = ref(false);
  const showDeleteIllustrationModal = ref(false);
  const deletingIllustration = ref(false);
  const illustrationToDelete = ref<string | null>(null);
  const chapterCoverImageId = ref<string | null>(null);
  const settingCoverId = ref<string | null>(null);
  const chapterImageUploadAvailable = computed(() => canUploadImages());

  const activeImageSource = computed(() => {
    const id = activeImageId.value;
    if (!id) return null;
    return chapterImageSources.value[id] ?? null;
  });

  const activeImage = computed(() => {
    if (!activeImageId.value) return null;
    return chapterImages.value.find((item) => item.id === activeImageId.value) ?? null;
  });

  const activeImageTags = computed(() => {
    if (!activeImageId.value) return [];
    return chapterImageTags.value[activeImageId.value] ?? [];
  });

  const activeImageLabel = computed(() => {
    if (!activeImageId.value) return "";
    const image = chapterImages.value.find((item) => item.id === activeImageId.value);
    return image?.file_name ?? "";
  });

  const heroImage = computed(() => {
    if (chapterImages.value.length === 0) return null;
    if (chapterCoverImageId.value) {
      const coverImage = chapterImages.value.find(img => img.id === chapterCoverImageId.value);
      if (coverImage) return coverImage;
    }
    return chapterImages.value[0];
  });

  const heroImageSrc = computed(() => {
    if (!heroImage.value) return null;
    return chapterImageSources.value[heroImage.value.id] ?? null;
  });

  const currentImageIndex = computed(() => {
    if (!activeImageId.value) return -1;
    return chapterImages.value.findIndex((img) => img.id === activeImageId.value);
  });

  const hasNextImage = computed(() => {
    return currentImageIndex.value >= 0 && currentImageIndex.value < chapterImages.value.length - 1;
  });

  const hasPrevImage = computed(() => {
    return currentImageIndex.value > 0;
  });

  const illustrationToDeleteName = computed(() => {
    if (!illustrationToDelete.value) return "";
    const image = chapterImages.value.find((img) => img.id === illustrationToDelete.value);
    return image?.file_name || "this illustration";
  });

  const refreshChapterImages = async () => {
    const chapterId = chapterIdRef();
    if (!chapterId) {
      chapterImages.value = [];
      chapterImageSources.value = {};
      chapterImageTags.value = {};
      chapterCoverImageId.value = null;
      return;
    }

    chapterImagesLoading.value = true;
    chapterImageError.value = null;
    try {
      const images = await fetchChapterImages(chapterId);
      chapterImages.value = images;
      const sources: Record<string, string> = {};
      const tags: Record<string, ImageWikiTag[]> = {};
      for (const image of images) {
        try {
          sources[image.id] = await getImageSource(image);
        } catch (error) {
          console.warn("Failed to load illustration preview", error);
        }
        try {
          tags[image.id] = await getImageWikiTags(image.id);
        } catch (error) {
          console.warn("Failed to load illustration tags", error);
        }
      }
      chapterImageSources.value = sources;
      chapterImageTags.value = tags;

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

      const coverImage = await fetchChapterCover(chapterId);
      chapterCoverImageId.value = coverImage?.id ?? null;
    } catch (error) {
      chapterImageError.value =
        error instanceof Error ? error.message : "Failed to load chapter illustrations";
    } finally {
      chapterImagesLoading.value = false;
    }
  };

  const handleAddIllustrations = async () => {
    const chapterId = chapterIdRef();
    const bookId = bookIdRef();
    if (!chapterId || !bookId) return;

    addingChapterImages.value = true;
    chapterImageError.value = null;

    try {
      const newImages = await addImagesToChapter(bookId, chapterId);
      if (!newImages.length) return;

      chapterImages.value = [...newImages, ...chapterImages.value];
      const updatedSources: Record<string, string> = { ...chapterImageSources.value };
      const updatedTags: Record<string, ImageWikiTag[]> = { ...chapterImageTags.value };
      for (const image of newImages) {
        try {
          updatedSources[image.id] = await getImageSource(image);
        } catch (error) {
          console.warn("Failed to load preview for new illustration", error);
        }
        updatedTags[image.id] = [];
      }
      chapterImageSources.value = updatedSources;
      chapterImageTags.value = updatedTags;
    } catch (error) {
      chapterImageError.value =
        error instanceof Error ? error.message : "Failed to add illustrations";
    } finally {
      addingChapterImages.value = false;
    }
  };

  const requestDeleteIllustration = (imageId: string) => {
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
    const chapterId = chapterIdRef();
    if (!imageId) return;

    const target = chapterImages.value.find((image) => image.id === imageId);
    if (!target) return;

    deletingIllustration.value = true;
    try {
      await deleteChapterImageAsset(target);
      chapterImages.value = chapterImages.value.filter((image) => image.id !== imageId);
      const nextSources = { ...chapterImageSources.value };
      delete nextSources[imageId];
      chapterImageSources.value = nextSources;
      const nextTags = { ...chapterImageTags.value };
      delete nextTags[imageId];
      chapterImageTags.value = nextTags;
      if (activeImageId.value === imageId) {
        showImageLightbox.value = false;
        activeImageId.value = null;
      }
      if (chapterCoverImageId.value === imageId && chapterId) {
        await setChapterCoverImageId(chapterId, null);
        chapterCoverImageId.value = null;
      }
      showDeleteIllustrationModal.value = false;
      illustrationToDelete.value = null;
    } catch (error) {
      chapterImageError.value =
        error instanceof Error ? error.message : "Failed to delete illustration";
    } finally {
      deletingIllustration.value = false;
    }
  };

  const openImageModal = (imageId: string) => {
    if (!chapterImageSources.value[imageId]) return;
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
      chapterImages.value = chapterImages.value.map((item) =>
        item.id === image.id ? updatedImage : item
      );
    } catch (error) {
      chapterImageError.value =
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
      chapterImageTags.value = {
        ...chapterImageTags.value,
        [image.id]: await getImageWikiTags(image.id),
      };
    } catch (error) {
      chapterImageError.value =
        error instanceof Error ? error.message : "Failed to save image tags";
    } finally {
      savingImageTags.value = false;
    }
  };

  const goToNextImage = () => {
    if (!hasNextImage.value) return;
    const nextIndex = currentImageIndex.value + 1;
    const nextImage = chapterImages.value[nextIndex];
    if (nextImage && chapterImageSources.value[nextImage.id]) {
      activeImageId.value = nextImage.id;
    }
  };

  const goToPrevImage = () => {
    if (!hasPrevImage.value) return;
    const prevIndex = currentImageIndex.value - 1;
    const prevImage = chapterImages.value[prevIndex];
    if (prevImage && chapterImageSources.value[prevImage.id]) {
      activeImageId.value = prevImage.id;
    }
  };

  const handleSetAsCover = async (imageId: string) => {
    const chapterId = chapterIdRef();
    if (!chapterId) return;

    settingCoverId.value = imageId;
    try {
      await setChapterCoverImageId(chapterId, imageId);
      chapterCoverImageId.value = imageId;
    } catch (error) {
      chapterImageError.value =
        error instanceof Error ? error.message : "Failed to set cover image";
    } finally {
      settingCoverId.value = null;
    }
  };

  const handleDownloadImage = (imageId: string) => {
    const imageSrc = chapterImageSources.value[imageId];
    if (!imageSrc) return;

    const image = chapterImages.value.find((img) => img.id === imageId);
    const fileName = image?.file_name || `illustration-${imageId}.jpg`;

    const link = document.createElement("a");
    link.href = imageSrc;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openHeroLightbox = () => {
    const hero = heroImage.value;
    if (hero && chapterImageSources.value[hero.id]) {
      activeImageId.value = hero.id;
      showImageLightbox.value = true;
    }
  };

  // Set up watchers
  watch(() => desktopImagesAvailable.value, () => {
    refreshChapterImages();
  });

  return {
    // State
    desktopImagesAvailable,
    chapterImageUploadAvailable,
    chapterImages,
    chapterImagesLoading,
    addingChapterImages,
    chapterImageSources,
    chapterImageTags,
    bookWikiPages,
    chapterImageError,
    showImageLightbox,
    activeImageId,
    savingImageNotes,
    savingImageTags,
    showDeleteIllustrationModal,
    deletingIllustration,
    illustrationToDelete,
    chapterCoverImageId,
    settingCoverId,

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

    // Methods
    refreshChapterImages,
    handleAddIllustrations,
    requestDeleteIllustration,
    cancelDeleteIllustration,
    handleDeleteIllustration,
    openImageModal,
    closeImageModal,
    handleSaveActiveImageNotes,
    handleSaveActiveImageTags,
    goToNextImage,
    goToPrevImage,
    handleSetAsCover,
    handleDownloadImage,
    openHeroLightbox,
  };
}
