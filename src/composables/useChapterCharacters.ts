import { ref, type Ref } from "vue";
import { useRouter } from "vue-router";
import type { WikiPage } from "@/lib/database";
import { parseWikiAliases, resolveWikiPageByName } from "@/lib/wikiAliases";
import type { Chapter, Character } from "@/types/chapterView";

interface UseChapterCharactersDeps {
  chapter: Ref<Chapter | null>;
  bookId: Ref<string>;
  chapterId: Ref<string>;
  routePrefix: Ref<string>;
  getWikiPages: (bookId: string) => Promise<WikiPage[]>;
}

/**
 * Resolves a chapter's summarized character names to their canonical wiki pages
 * and drives navigation from a character chip to its wiki page.
 */
export function useChapterCharacters(deps: UseChapterCharactersDeps) {
  const { chapter, bookId, chapterId, routePrefix, getWikiPages } = deps;
  const router = useRouter();

  const characters = ref<Character[]>([]);

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
        const wikiPage = resolveWikiPageByName(wikiPages, characterName, "character");
        return {
          id: wikiPage?.id || `char-${characterName}`,
          character_name: wikiPage?.page_name || characterName,
          wiki_page_id: wikiPage?.id || null,
          has_wiki_page: !!wikiPage,
          aliases: parseWikiAliases(wikiPage?.aliases),
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

  const getCharacterWikiInfo = (characterName: string) => {
    return characters.value.find((char) => char.character_name === characterName);
  };

  const navigateToWiki = (characterName: string) => {
    const character = getCharacterWikiInfo(characterName);
    if (character?.has_wiki_page && character.wiki_page_id) {
      router.push({
        path: `${routePrefix.value}/${bookId.value}/wiki/${character.wiki_page_id}`,
        query: { fromChapterId: chapterId.value },
      });
    }
  };

  return {
    characters,
    loadCharacters,
    getCharacterWikiInfo,
    navigateToWiki,
  };
}
