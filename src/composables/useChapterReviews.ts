import { ref, type Ref } from "vue";
import type { ChapterReview } from "@/lib/database";
import type { Chapter, Review, CustomReviewerProfile } from "@/types/chapterView";

interface UseChapterReviewsDeps {
  chapter: Ref<Chapter | null>;
  getReviews: (chapterId: string) => Promise<ChapterReview[]>;
  deleteReviewFromDb: (reviewId: string) => Promise<void>;
  getCustomProfiles: () => Promise<CustomReviewerProfile[]>;
}

/**
 * Saved AI reviews for a chapter: loading, deleting, the reviewer-profile list,
 * the review-generation tone, and per-review expand/collapse UI state.
 */
export function useChapterReviews(deps: UseChapterReviewsDeps) {
  const { chapter, getReviews, deleteReviewFromDb, getCustomProfiles } = deps;

  const savedReviews = ref<Review[]>([]);
  const loadingReviews = ref(false);
  const deletingReviewId = ref<string | null>(null);
  const customProfiles = ref<CustomReviewerProfile[]>([]);
  const reviewTone = ref<string>("editorial");
  const expandedReviews = ref<Set<string>>(new Set());
  const expandedPrompts = ref<Set<string>>(new Set());

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
      await deleteReviewFromDb(reviewId);
      await loadSavedReviews();
    } catch (error) {
      console.error("Failed to delete review:", error);
      alert("Failed to delete review");
    } finally {
      deletingReviewId.value = null;
    }
  };

  const loadCustomProfiles = async () => {
    try {
      customProfiles.value = await getCustomProfiles();
    } catch (error) {
      console.error("Failed to load custom profiles:", error);
      customProfiles.value = [];
    }
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

  return {
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
  };
}
