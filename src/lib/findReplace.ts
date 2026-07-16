export type FindReplaceField = 'title' | 'text' | 'page_name' | 'summary' | 'content'

export interface TextMatch {
  id: string
  field: FindReplaceField
  start: number
  end: number
  matchedText: string
  before: string
  after: string
  occurrence: number
}

export interface FindTextMatchesOptions {
  contextLength?: number
  caseSensitive?: boolean
}

const DEFAULT_CONTEXT_LENGTH = 60

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function findTextMatches(
  text: string,
  searchTerm: string,
  field: FindReplaceField,
  options: FindTextMatchesOptions = {},
): TextMatch[] {
  if (!searchTerm) return []

  const contextLength = Math.max(0, options.contextLength ?? DEFAULT_CONTEXT_LENGTH)
  const flags = options.caseSensitive ? 'g' : 'gi'
  const regex = new RegExp(escapeRegExp(searchTerm), flags)
  const matches: TextMatch[] = []

  for (const match of text.matchAll(regex)) {
    const start = match.index
    const matchedText = match[0]
    const end = start + matchedText.length
    const occurrence = matches.length

    matches.push({
      id: `${field}:${occurrence}:${start}:${end}`,
      field,
      start,
      end,
      matchedText,
      before: text.slice(Math.max(0, start - contextLength), start),
      after: text.slice(end, Math.min(text.length, end + contextLength)),
      occurrence,
    })
  }

  return matches
}

export function formatReplacement(matchedText: string, replacement: string): string {
  if (!replacement) return replacement

  if (matchedText.length > 1 && matchedText === matchedText.toUpperCase()) {
    return replacement.toUpperCase()
  }

  const firstCharacter = matchedText.charAt(0)
  if (firstCharacter && firstCharacter === firstCharacter.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }

  return replacement
}

function assertMatchIsCurrent(text: string, match: TextMatch): void {
  if (
    match.start < 0 ||
    match.end < match.start ||
    match.end > text.length ||
    text.slice(match.start, match.end) !== match.matchedText
  ) {
    throw new Error(`The selected match ${match.id} is stale and must be refreshed`)
  }
}

export function replaceTextMatch(text: string, match: TextMatch, replacement: string): string {
  assertMatchIsCurrent(text, match)

  return (
    text.slice(0, match.start) +
    formatReplacement(match.matchedText, replacement) +
    text.slice(match.end)
  )
}

export function replaceSelectedTextMatches(
  text: string,
  matches: readonly TextMatch[],
  replacement: string,
): string {
  if (matches.length === 0) return text

  const orderedMatches = [...matches].sort((left, right) => right.start - left.start)

  for (let index = 0; index < orderedMatches.length; index += 1) {
    const match = orderedMatches[index]
    assertMatchIsCurrent(text, match)

    const previousMatch = orderedMatches[index - 1]
    if (previousMatch && match.end > previousMatch.start) {
      throw new Error('Selected matches overlap and cannot be replaced together')
    }
  }

  return orderedMatches.reduce(
    (updatedText, match) => replaceTextMatch(updatedText, match, replacement),
    text,
  )
}
