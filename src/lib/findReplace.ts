export type FindReplaceField = 'title' | 'text' | 'page_name' | 'summary' | 'content'
export type FindReplaceTargetType = 'chapter' | 'wikiPage'
export type FindReplaceScope = 'book' | 'chapter' | 'wikiPage'
export type FindReplaceFieldValues = Partial<Record<FindReplaceField, string>>

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

export interface FindReplaceDocument {
  targetType: FindReplaceTargetType
  targetId: string
  displayName: string
  pageType?: string
  wordCount?: number
  fields: FindReplaceFieldValues
  matches: TextMatch[]
}

export interface FindReplaceSearchRequest {
  bookId: string
  searchTerm: string
  scope?: FindReplaceScope
  targetId?: string
}

export interface ReplaceFindReplaceMatchesRequest {
  targetType: FindReplaceTargetType
  targetId: string
  replacement: string
  expectedFields: FindReplaceFieldValues
  matches: TextMatch[]
}

export interface ReplaceFindReplaceMatchesResult {
  replacedCount: number
  fields: FindReplaceFieldValues
}

export interface RestoreFindReplaceFieldsRequest {
  targetType: FindReplaceTargetType
  targetId: string
  expectedFields: FindReplaceFieldValues
  fields: FindReplaceFieldValues
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

export function createFindReplaceDocument({
  targetType,
  targetId,
  displayName,
  pageType,
  wordCount,
  fields,
  searchTerm,
}: Omit<FindReplaceDocument, 'matches'> & { searchTerm: string }): FindReplaceDocument {
  const matches = (Object.entries(fields) as Array<[FindReplaceField, string]>).flatMap(
    ([field, text]) =>
      findTextMatches(text, searchTerm, field).map((match) => ({
        ...match,
        id: `${targetType}:${targetId}:${match.id}`,
      })),
  )

  return {
    targetType,
    targetId,
    displayName,
    pageType,
    wordCount,
    fields,
    matches,
  }
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

export function replaceFindReplaceFields(
  currentFields: FindReplaceFieldValues,
  expectedFields: FindReplaceFieldValues,
  matches: readonly TextMatch[],
  replacement: string,
): ReplaceFindReplaceMatchesResult {
  const matchesByField = new Map<FindReplaceField, TextMatch[]>()

  for (const match of matches) {
    const fieldMatches = matchesByField.get(match.field) ?? []
    fieldMatches.push(match)
    matchesByField.set(match.field, fieldMatches)
  }

  const fields = { ...currentFields }

  for (const [field, fieldMatches] of matchesByField) {
    const currentValue = currentFields[field]
    const expectedValue = expectedFields[field]

    if (currentValue === undefined || expectedValue === undefined || currentValue !== expectedValue) {
      throw new Error(`The ${field} field changed after searching and must be refreshed`)
    }

    fields[field] = replaceSelectedTextMatches(currentValue, fieldMatches, replacement)
  }

  return { replacedCount: matches.length, fields }
}

export function assertFindReplaceFieldsCurrent(
  currentFields: FindReplaceFieldValues,
  expectedFields: FindReplaceFieldValues,
  action: string,
): void {
  for (const [field, expectedValue] of Object.entries(expectedFields)) {
    if (currentFields[field as FindReplaceField] !== expectedValue) {
      throw new Error(`The ${field} field changed after ${action} and must be refreshed`)
    }
  }
}
