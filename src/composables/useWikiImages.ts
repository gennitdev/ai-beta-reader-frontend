import { ref, computed, watch } from 'vue';
import { useImageLibrary } from '@/composables/useImageLibrary';
import { useDatabase } from '@/composables/useDatabase';
import type { ImageAsset, ImageWikiTag } from '@/lib/database';

export function useWikiImages(wikiPageIdRef: () => string | undefined, bookIdRef: () => string | undefined) {
  const {
    desktopImagesAvailable,
    getImageSource,
  } = useImageLibrary();
  const {
    getWikiPageImageAssets,
    getWikiPageCoverImageAsset,
    setWikiPageCoverImageId,
    getImageWikiTags,
  } = useDatabase();

  const wikiImages = ref<ImageAsset[]>([]);
  const wikiImagesLoading = ref(false);
  const wikiImageSources = ref<Record<string, string>>({});
  const wikiImageTags = ref<Record<string, ImageWikiTag[]>>({});
  const wikiImageError = ref<string | null>(null);
  const showImageLightbox = ref(false);
  const activeImageId = ref<string | null>(null);
  const wikiCoverImageId = ref<string | null>(null);
  const settingCoverId = ref<string | null>(null);
  const heroLightboxOpen = ref(false);

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

  const refreshWikiImages = async () => {
    const wikiPageId = wikiPageIdRef();
    if (!wikiPageId) {
      wikiImages.value = [];
      wikiImageSources.value = {};
      wikiImageTags.value = {};
      wikiCoverImageId.value = null;
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
    } catch (error) {
      wikiImageError.value =
        error instanceof Error ? error.message : "Failed to load wiki illustrations";
    } finally {
      wikiImagesLoading.value = false;
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

  const handleDownloadImage = (imageId: string) => {
    const imageSrc = wikiImageSources.value[imageId];
    if (!imageSrc) return;

    const image = wikiImages.value.find((img) => img.id === imageId);
    const fileName = image?.file_name || `illustration-${imageId}.jpg`;

    const link = document.createElement("a");
    link.href = imageSrc;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openHeroLightbox = () => {
    if (heroImageSrc.value) {
      heroLightboxOpen.value = true;
    }
  };

  const closeHeroLightbox = () => {
    heroLightboxOpen.value = false;
  };

  // Set up watchers
  watch(() => desktopImagesAvailable.value, () => {
    refreshWikiImages();
  });

  return {
    // State
    desktopImagesAvailable,
    wikiImages,
    wikiImagesLoading,
    wikiImageSources,
    wikiImageTags,
    wikiImageError,
    showImageLightbox,
    activeImageId,
    wikiCoverImageId,
    settingCoverId,
    heroLightboxOpen,

    // Computed
    activeImageSource,
    activeImage,
    activeImageTags,
    activeImageLabel,
    heroImage,
    heroImageSrc,
    hasNextImage,
    hasPrevImage,

    // Methods
    refreshWikiImages,
    openImageModal,
    closeImageModal,
    goToNextImage,
    goToPrevImage,
    handleSetAsCover,
    handleDownloadImage,
    openHeroLightbox,
    closeHeroLightbox,
  };
}
