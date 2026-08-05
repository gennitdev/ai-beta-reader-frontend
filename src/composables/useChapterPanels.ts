import { onMounted, ref, watch, type Ref } from "vue";
import type { Chapter } from "@/types/chapterView";

const CHAPTER_SUMMARY_WIKI_UPDATES_KEY = "chapter_summary_update_wiki_enabled";

interface UseChapterPanelsDeps {
  chapter: Ref<Chapter | null>;
}

/**
 * UI state for the chapter side panels: which panels are open, the summary/notes
 * edit buffers and their open/cancel transitions, the "expand full text" toggle,
 * and the persisted "update wiki on summary" preference.
 *
 * The edit buffers (`editedSummary`, `editedNotes`) are shared with
 * useChapterMutationFlow, which performs the actual saves; this composable only
 * owns the buffers and the open/cancel lifecycle.
 */
export function useChapterPanels(deps: UseChapterPanelsDeps) {
  const { chapter } = deps;

  // Panel visibility
  const showSummaryPanel = ref(false);
  const showNotesPanel = ref(false);
  const showIllustrationsPanel = ref(false);
  const showFullChapterText = ref(false);

  // Summary editing state
  const isEditingSummary = ref(false);
  const editedSummary = ref("");
  const updateWikiOnSummary = ref(true);

  // Notes editing state
  const isEditingNotes = ref(false);
  const editedNotes = ref("");

  const startEditingSummary = () => {
    if (!chapter.value?.summary) return;
    editedSummary.value = chapter.value.summary;
    isEditingSummary.value = true;
  };

  const cancelEditingSummary = () => {
    isEditingSummary.value = false;
    editedSummary.value = "";
  };

  const startEditingNotes = () => {
    editedNotes.value = chapter.value?.notes || "";
    isEditingNotes.value = true;
  };

  const cancelEditingNotes = () => {
    isEditingNotes.value = false;
    editedNotes.value = chapter.value?.notes || "";
  };

  // Persist the "update wiki on summary" preference across sessions.
  onMounted(() => {
    const stored = localStorage.getItem(CHAPTER_SUMMARY_WIKI_UPDATES_KEY);
    if (stored !== null) {
      updateWikiOnSummary.value = stored === "true";
    }
  });

  watch(updateWikiOnSummary, (value) => {
    localStorage.setItem(CHAPTER_SUMMARY_WIKI_UPDATES_KEY, String(value));
  });

  return {
    showSummaryPanel,
    showNotesPanel,
    showIllustrationsPanel,
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
  };
}
