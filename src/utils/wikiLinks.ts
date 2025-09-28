// Utility functions for processing wiki links in markdown content

interface Character {
  id: string
  character_name: string
  wiki_page_id: string | null
  has_wiki_page: boolean
}

/**
 * Post-processes markdown content to automatically convert character mentions
 * into links to their wiki pages
 */
export function processWikiLinks(content: string, characters: Character[], bookId: string): string {
  if (!content || !characters.length) {
    return content
  }

  let processedContent = content

  // Create a list of characters that have wiki pages, sorted by name length (longest first)
  // This prevents partial matches (e.g., "Al" matching inside "Alice")
  const linkableCharacters = characters
    .filter(char => char.has_wiki_page && char.wiki_page_id)
    .sort((a, b) => b.character_name.length - a.character_name.length)

  for (const character of linkableCharacters) {
    const characterName = character.character_name

    // Create a regex that matches the character name as a whole word
    // This prevents partial matches and avoids matching inside existing links
    const regex = new RegExp(
      `(?<!\\[)\\b(${escapeRegex(characterName)})\\b(?![^\\[]*\\])(?![^<]*>)`,
      'g'
    )

    // Replace character mentions with wiki links
    // Format: [Character Name](/books/bookId/wiki/wikiPageId)
    processedContent = processedContent.replace(
      regex,
      `[$1](/books/${bookId}/wiki/${character.wiki_page_id})`
    )
  }

  return processedContent
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extracts character names mentioned in text content
 * This can be used to suggest which characters to link
 */
export function extractMentionedCharacters(content: string, characters: Character[]): Character[] {
  const mentionedCharacters: Character[] = []

  for (const character of characters) {
    const regex = new RegExp(`\\b${escapeRegex(character.character_name)}\\b`, 'i')
    if (regex.test(content)) {
      mentionedCharacters.push(character)
    }
  }

  return mentionedCharacters
}

/**
 * Counts how many times each character is mentioned in the content
 */
export function countCharacterMentions(content: string, characters: Character[]): Record<string, number> {
  const mentions: Record<string, number> = {}

  for (const character of characters) {
    const regex = new RegExp(`\\b${escapeRegex(character.character_name)}\\b`, 'gi')
    const matches = content.match(regex)
    mentions[character.character_name] = matches ? matches.length : 0
  }

  return mentions
}

/**
 * Validates that a character name is safe for URL routing
 */
export function isValidCharacterName(name: string): boolean {
  // Character names should not contain special URL characters
  return !/[<>:"\/\\|?*\x00-\x1f]/.test(name) && name.trim().length > 0
}