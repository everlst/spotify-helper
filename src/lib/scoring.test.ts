import { describe, expect, it } from "vitest";
import { normalizeSearchText, scoreSpotifyResult } from "@/lib/scoring";
import type { CodexSearchCandidate } from "@/lib/codex";

describe("normalizeSearchText", () => {
  it("normalizes width, case, and separators", () => {
    expect(normalizeSearchText("ＫＡＦ / 花 譜")).toBe("kaf 花 譜");
  });
});

describe("scoreSpotifyResult", () => {
  it("prioritizes alias and candidate confidence", () => {
    const candidate: CodexSearchCandidate = {
      kind: "artist",
      spotify_query: "花譜",
      display_name_guess: "花譜",
      aliases: ["花谱", "KAF"],
      related_works: [],
      confidence: 0.95,
      reason_zh: "test",
      citations: []
    };

    expect(scoreSpotifyResult("花譜", "KAF", candidate, "花谱")).toBeGreaterThan(0.85);
  });
});
