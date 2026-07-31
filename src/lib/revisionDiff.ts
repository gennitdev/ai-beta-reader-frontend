export interface RevisionDiffSegment {
  type: 'same' | 'added' | 'removed'
  text: string
}

export interface RevisionDiffStats {
  added: number
  removed: number
}

function tokenize(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}_’'-]+|[^\s]/gu) ?? []
}

function mergeSegments(segments: RevisionDiffSegment[]): RevisionDiffSegment[] {
  return segments.reduce<RevisionDiffSegment[]>((merged, segment) => {
    const last = merged.at(-1)
    if (last?.type === segment.type) last.text += segment.text
    else merged.push({ ...segment })
    return merged
  }, [])
}

export function createRevisionDiff(previousText: string, nextText: string): RevisionDiffSegment[] {
  const previous = tokenize(previousText)
  const next = tokenize(nextText)
  let prefix = 0
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1

  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) suffix += 1

  const beforeMiddle = previous.slice(prefix, previous.length - suffix || undefined)
  const afterMiddle = next.slice(prefix, next.length - suffix || undefined)
  const segments: RevisionDiffSegment[] = []
  if (prefix) segments.push({ type: 'same', text: previous.slice(0, prefix).join('') })

  // Bound memory for sweeping rewrites while retaining a readable before/after block.
  if (beforeMiddle.length * afterMiddle.length > 160_000) {
    if (beforeMiddle.length) segments.push({ type: 'removed', text: beforeMiddle.join('') })
    if (afterMiddle.length) segments.push({ type: 'added', text: afterMiddle.join('') })
  } else {
    const table = Array.from({ length: beforeMiddle.length + 1 }, () =>
      new Uint32Array(afterMiddle.length + 1),
    )
    for (let i = beforeMiddle.length - 1; i >= 0; i -= 1) {
      for (let j = afterMiddle.length - 1; j >= 0; j -= 1) {
        table[i][j] = beforeMiddle[i] === afterMiddle[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
      }
    }

    let i = 0
    let j = 0
    while (i < beforeMiddle.length || j < afterMiddle.length) {
      if (i < beforeMiddle.length && j < afterMiddle.length && beforeMiddle[i] === afterMiddle[j]) {
        segments.push({ type: 'same', text: beforeMiddle[i] })
        i += 1
        j += 1
      } else if (j < afterMiddle.length && (i === beforeMiddle.length || table[i][j + 1] > table[i + 1][j])) {
        segments.push({ type: 'added', text: afterMiddle[j] })
        j += 1
      } else {
        segments.push({ type: 'removed', text: beforeMiddle[i] })
        i += 1
      }
    }
  }

  if (suffix) segments.push({ type: 'same', text: previous.slice(previous.length - suffix).join('') })
  return mergeSegments(segments)
}

export function getRevisionDiffStats(diff: RevisionDiffSegment[]): RevisionDiffStats {
  const countWords = (text: string) => text.match(/[\p{L}\p{N}_’'-]+/gu)?.length ?? 0

  return diff.reduce<RevisionDiffStats>((stats, segment) => {
    if (segment.type === 'added') stats.added += countWords(segment.text)
    if (segment.type === 'removed') stats.removed += countWords(segment.text)
    return stats
  }, { added: 0, removed: 0 })
}

export function countRevisionChanges(previousText: string, nextText: string): RevisionDiffStats {
  return getRevisionDiffStats(createRevisionDiff(previousText, nextText))
}
