/**
 * Smart Search utility for flexible, typo-tolerant, multi-term matching
 * Works across product name, SKU, brand, model, specifications, categories, etc.
 */

// Normalizes text by lowercasing, removing special characters/punctuation, and collapsing whitespace
export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, " ")       // replace symbols/punctuation with spaces
    .replace(/\s+/g, " ")             // collapse multiple spaces
    .trim();
}

/**
 * Returns true if the haystack contains the needle, allowing for:
 * 1. Direct substring match (case-insensitive)
 * 2. Normalized alphanumeric match (ignoring dashes, slashes, punctuation, e.g. "950-115L" matches "950115L" or "950 115L")
 * 3. Prefix/sub-token matches
 */
function tokenMatches(haystackNormalized: string, token: string): boolean {
  if (!token) return true;
  const tokenNorm = normalizeSearchText(token);
  if (!tokenNorm) return true;

  // Check direct inclusion in normalized string
  if (haystackNormalized.includes(tokenNorm)) {
    return true;
  }

  // Also check without any spaces (e.g., "ag950115l" inside "ag 950 115l")
  const compactHaystack = haystackNormalized.replace(/\s+/g, "");
  const compactToken = tokenNorm.replace(/\s+/g, "");
  if (compactToken && compactHaystack.includes(compactToken)) {
    return true;
  }

  return false;
}

/**
 * Smart match function:
 * Checks whether ALL tokens in user query match somewhere in target strings.
 *
 * Example:
 * query: "AG 950-115L 950W"
 * tokens: ["AG", "950-115L", "950W"] -> also matches model "AG 950-115L", name "Angle grinder", specs "950W", etc.
 */
export function smartSearchMatch(
  targets: Array<string | number | null | undefined>,
  query: string
): boolean {
  if (!query || !query.trim()) return true;

  // Combine targets into both raw lowercase and normalized searchable text
  const combinedRaw = targets.filter(Boolean).map(t => String(t).toLowerCase()).join(" ");
  const combinedNorm = normalizeSearchText(combinedRaw);
  const compactTarget = combinedNorm.replace(/\s+/g, "");

  // Split query into individual words/tokens
  const rawTokens = query.trim().split(/\s+/).filter(Boolean);

  return rawTokens.every((rawToken) => {
    const rawLower = rawToken.toLowerCase();
    // 1. Direct raw match (e.g. exact punctuation like "950-115L")
    if (combinedRaw.includes(rawLower)) {
      return true;
    }

    // 2. Normalized token match (e.g. "950115l" or "950 115l")
    if (tokenMatches(combinedNorm, rawToken)) {
      return true;
    }

    // 3. Compact token match
    const compactToken = rawLower.replace(/[^a-z0-9]/g, "");
    if (compactToken && compactTarget.includes(compactToken)) {
      return true;
    }

    return false;
  });
}
