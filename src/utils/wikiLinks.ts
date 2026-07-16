// Utility functions for processing wiki links in markdown content

interface Character {
  id: string
  character_name: string
  wiki_page_id: string | null
  has_wiki_page: boolean
  aliases?: string[]
}

function characterNames(character: Character): string[] {
  const seen = new Set<string>()
  return [character.character_name, ...(character.aliases ?? [])].filter((name) => {
    const key = name.trim().toLocaleLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Post-processes markdown content to automatically convert character mentions
 * into links to their wiki pages
 */
export function processWikiLinks(content: string, characters: Character[], bookId: string): string {
  if (!content || !characters.length) {
    return content
  }

  // Create a list of characters that have wiki pages, sorted by name length (longest first)
  // This prevents partial matches (e.g., "Al" matching inside "Alice")
  const linkableCharacters = characters
    .filter(char => char.has_wiki_page && char.wiki_page_id)
    .flatMap((character) => characterNames(character).map((name) => ({ character, name })))
    .sort((a, b) => b.name.length - a.name.length)
  if (linkableCharacters.length === 0) return content

  const targetByName = new Map<string, Character>()
  for (const target of linkableCharacters) {
    const key = target.name.toLocaleLowerCase()
    if (!targetByName.has(key)) targetByName.set(key, target.character)
  }
  const namesPattern = linkableCharacters.map(({ name }) => escapeRegex(name)).join('|')
  const regex = new RegExp(
    `(?<!\\[)\\b(${namesPattern})\\b(?![^\\[]*\\])(?![^<]*>)`,
    'gi',
  )

  // Replace all names in one pass so newly generated link URLs cannot be linked again.
  return content.replace(regex, (matchedName) => {
    const character = targetByName.get(matchedName.toLocaleLowerCase())
    return character?.wiki_page_id
      ? `[${matchedName}](/books/${bookId}/wiki/${character.wiki_page_id})`
      : matchedName
  })
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
    if (characterNames(character).some((name) =>
      new RegExp(`\\b${escapeRegex(name)}\\b`, 'i').test(content),
    )) {
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
    mentions[character.character_name] = characterNames(character).reduce((count, name) => {
      const matches = content.match(new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi'))
      return count + (matches?.length ?? 0)
    }, 0)
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
