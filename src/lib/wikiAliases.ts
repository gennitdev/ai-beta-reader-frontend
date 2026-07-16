export interface WikiIdentityPage {
  id: string
  page_name: string
  page_type?: string | null
  aliases?: string[] | string | null
}

export function normalizeWikiEntityName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
}

export function parseWikiAliases(value: WikiIdentityPage['aliases']): string[] {
  if (Array.isArray(value)) {
    return value.filter((alias): alias is string => typeof alias === 'string')
  }
  if (typeof value !== 'string' || !value.trim()) return []

  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((alias): alias is string => typeof alias === 'string')
      : []
  } catch {
    return []
  }
}

export function normalizeWikiAliases(aliases: string[], pageName = ''): string[] {
  const canonicalKey = normalizeWikiEntityName(pageName)
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const alias of aliases) {
    const trimmed = alias.normalize('NFKC').trim().replace(/\s+/g, ' ')
    const key = normalizeWikiEntityName(trimmed)
    if (!key || key === canonicalKey || seen.has(key)) continue
    seen.add(key)
    normalized.push(trimmed)
  }

  return normalized
}

export function resolveWikiPageByName<T extends WikiIdentityPage>(
  pages: T[],
  name: string,
  pageType?: string,
): T | null {
  const nameKey = normalizeWikiEntityName(name)
  if (!nameKey) return null

  const candidates = pageType
    ? pages.filter((page) => page.page_type === pageType)
    : pages

  return candidates.find((page) => normalizeWikiEntityName(page.page_name) === nameKey)
    ?? candidates.find((page) =>
      parseWikiAliases(page.aliases).some((alias) => normalizeWikiEntityName(alias) === nameKey),
    )
    ?? null
}

export function assertWikiIdentityAvailable(
  pages: WikiIdentityPage[],
  identity: { pageId?: string; pageName: string; aliases: string[] },
): void {
  const requestedNames = [identity.pageName, ...identity.aliases]
    .map((name) => ({ name, key: normalizeWikiEntityName(name) }))
    .filter(({ key }) => key.length > 0)

  for (const page of pages) {
    if (page.id === identity.pageId) continue

    const existingKeys = new Set(
      [page.page_name, ...parseWikiAliases(page.aliases)].map(normalizeWikiEntityName),
    )
    const conflict = requestedNames.find(({ key }) => existingKeys.has(key))
    if (conflict) {
      throw new Error(
        `“${conflict.name.trim()}” is already used by the wiki page “${page.page_name}”.`,
      )
    }
  }
}
