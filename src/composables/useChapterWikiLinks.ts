import { computed, ref, watch, type Ref } from "vue";
import type { ChapterWikiLink } from "@/lib/database";
import { type AutocompleteOption } from "@/components/links/AutocompleteMultiSelect.vue";
import type { Chapter } from "@/types/chapterView";

/** Minimal wiki-page shape needed to build the link autocomplete options. */
interface WikiPageLinkOption {
  id: string;
  page_name: string;
  page_type?: string | null;
}

interface UseChapterWikiLinksDeps {
  chapter: Ref<Chapter | null>;
  chapterId: Ref<string>;
  bookWikiPages: Ref<WikiPageLinkOption[]>;
  getChapterWikiLinks: (chapterId: string) => Promise<ChapterWikiLink[]>;
  setChapterWikiLinks: (
    chapterId: string,
    wikiPageIds: string[],
    source: "manual",
  ) => Promise<void>;
  reloadCharacters: () => Promise<void>;
}

/**
 * The set of wiki pages manually linked to a chapter: loading, the edit buffer,
 * saving, and the autocomplete options derived from the book's wiki pages.
 */
export function useChapterWikiLinks(deps: UseChapterWikiLinksDeps) {
  const {
    chapter,
    chapterId,
    bookWikiPages,
    getChapterWikiLinks,
    setChapterWikiLinks,
    reloadCharacters,
  } = deps;

  const linkedWikiPages = ref<ChapterWikiLink[]>([]);
  const loadingLinkedWikiPages = ref(false);
  const isEditingLinkedWikiPages = ref(false);
  const savingLinkedWikiPages = ref(false);
  const selectedLinkedWikiPageIds = ref<string[]>([]);

  const linkedWikiPageOptions = computed<AutocompleteOption[]>(() =>
    bookWikiPages.value.map((page) => ({
      id: page.id,
      label: page.page_name,
      detail: page.page_type ?? undefined,
    })),
  );

  const loadLinkedWikiPages = async () => {
    if (!chapterId.value) {
      linkedWikiPages.value = [];
      selectedLinkedWikiPageIds.value = [];
      return;
    }

    loadingLinkedWikiPages.value = true;
    try {
      const links = await getChapterWikiLinks(chapterId.value);
      linkedWikiPages.value = links;
      selectedLinkedWikiPageIds.value = links.map((link) => link.wiki_page_id);
    } catch (error) {
      console.error("Failed to load chapter wiki links:", error);
      linkedWikiPages.value = [];
      selectedLinkedWikiPageIds.value = [];
    } finally {
      loadingLinkedWikiPages.value = false;
    }
  };

  const startEditingLinkedWikiPages = () => {
    selectedLinkedWikiPageIds.value = linkedWikiPages.value.map((link) => link.wiki_page_id);
    isEditingLinkedWikiPages.value = true;
  };

  const cancelEditingLinkedWikiPages = () => {
    selectedLinkedWikiPageIds.value = linkedWikiPages.value.map((link) => link.wiki_page_id);
    isEditingLinkedWikiPages.value = false;
  };

  const saveLinkedWikiPages = async () => {
    if (!chapter.value) return;

    savingLinkedWikiPages.value = true;
    try {
      await setChapterWikiLinks(chapter.value.id, selectedLinkedWikiPageIds.value, "manual");
      await loadLinkedWikiPages();
      await reloadCharacters();
      isEditingLinkedWikiPages.value = false;
    } catch (error) {
      console.error("Failed to save chapter wiki links:", error);
      alert("Failed to save linked wiki pages");
    } finally {
      savingLinkedWikiPages.value = false;
    }
  };

  // Reset edit state and reload whenever the route points at a different chapter.
  watch(
    () => chapterId.value,
    () => {
      isEditingLinkedWikiPages.value = false;
      loadLinkedWikiPages();
    },
  );

  return {
    linkedWikiPages,
    loadingLinkedWikiPages,
    isEditingLinkedWikiPages,
    savingLinkedWikiPages,
    selectedLinkedWikiPageIds,
    linkedWikiPageOptions,
    loadLinkedWikiPages,
    startEditingLinkedWikiPages,
    cancelEditingLinkedWikiPages,
    saveLinkedWikiPages,
  };
}
