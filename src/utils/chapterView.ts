// Pure formatting/parsing helpers used by ChapterView and its child components.

/** Coerce a stored characters value (array of strings or {name} objects) to trimmed names. */
export function normalizeCharacterList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (
        entry &&
        typeof entry === "object" &&
        "name" in entry &&
        typeof (entry as Record<string, unknown>).name === "string"
      ) {
        return String((entry as Record<string, unknown>).name).trim();
      }
      return "";
    })
    .filter((name): name is string => name.length > 0);
}

/** Parse a JSON string of ids into a string array, tolerating malformed input. */
export function parseIdArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string");
    }
  } catch {
    // Ignore parse errors and fall back to empty array
  }
  return [];
}

/** Format an ISO date string for display in review/version metadata. */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Truncate prose to a word limit, preserving whitespace, and report whether it was cut. */
export function getTruncatedText(
  text: string,
  wordLimit: number = 120,
): { truncated: string; needsTruncation: boolean } {
  if (!text || typeof text !== "string") return { truncated: "", needsTruncation: false };

  const words = text.split(/(\s+)/);
  let wordCount = 0;

  const truncatedParts = words.filter((part) => {
    if (/\S/.test(part)) {
      // If part contains non-whitespace characters
      wordCount++;
      return wordCount <= wordLimit;
    }
    return wordCount <= wordLimit; // Include whitespace if we haven't exceeded limit
  });

  const needsTruncation = wordCount > wordLimit;
  return {
    truncated: needsTruncation ? truncatedParts.join("") : text,
    needsTruncation,
  };
}
