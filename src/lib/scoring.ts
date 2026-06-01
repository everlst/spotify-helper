import type { CodexSearchCandidate } from "@/lib/codex";

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function tokenScore(haystack: string, needle: string) {
  const normalizedHaystack = normalizeSearchText(haystack);
  const normalizedNeedle = normalizeSearchText(needle);
  if (!normalizedHaystack || !normalizedNeedle) {
    return 0;
  }
  if (normalizedHaystack === normalizedNeedle) {
    return 1;
  }
  if (normalizedHaystack.includes(normalizedNeedle) || normalizedNeedle.includes(normalizedHaystack)) {
    const haystackTokens = new Set(normalizedHaystack.split(/\s+/));
    if (haystackTokens.has(normalizedNeedle)) {
      return 0.92;
    }
    return 0.72;
  }

  const haystackTokens = new Set(normalizedHaystack.split(/\s+/));
  const needleTokens = normalizedNeedle.split(/\s+/);
  const hits = needleTokens.filter((token) => haystackTokens.has(token)).length;
  return hits / Math.max(needleTokens.length, 1);
}

export function scoreSpotifyResult(
  resultName: string,
  extraText: string,
  candidate: CodexSearchCandidate | null,
  originalQuery: string
) {
  const names = [
    originalQuery,
    candidate?.spotify_query,
    candidate?.display_name_guess,
    ...(candidate?.aliases ?? []),
    ...(candidate?.related_works ?? [])
  ].filter(Boolean) as string[];

  const text = `${resultName} ${extraText}`;
  const bestTextScore = Math.max(...names.map((name) => tokenScore(text, name)), 0);
  const modelScore = candidate?.confidence ?? 0.2;
  return Math.min(1, 0.62 * bestTextScore + 0.38 * modelScore);
}
