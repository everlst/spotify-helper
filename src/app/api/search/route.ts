import type { NextRequest } from "next/server";
import { getAppStatus } from "@/lib/app-state";
import { fail, ok, readJson } from "@/lib/api";
import { getJsonCache, setJsonCache, stableCacheKey } from "@/lib/cache";
import { enhanceSearchQuery, type CodexSearchEnhancement } from "@/lib/codex";
import { requireAuth } from "@/lib/auth";
import { searchSpotify, type SpotifySearchResults } from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchResponse = {
  query: string;
  enhancedAvailable: boolean;
  enhancement: CodexSearchEnhancement | null;
  spotify: SpotifySearchResults;
  warning: string | null;
};

export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJson<{ query?: string; force?: boolean }>(request);
    const query = (body.query ?? "").trim();
    if (!query) {
      throw new Error("搜索词不能为空");
    }

    const status = getAppStatus();
    const cacheKey = stableCacheKey("search", {
      query,
      codexHealthy: status.codexHealthy
    });
    const cached = body.force ? null : getJsonCache<SearchResponse>("search_cache", cacheKey);
    if (cached) {
      return ok({ ...cached, cached: true });
    }

    let enhancement: CodexSearchEnhancement | null = null;
    let warning: string | null = null;
    let enhancedAvailable = false;

    if (status.codexConfigured && status.codexHealthy) {
      try {
        enhancement = (await enhanceSearchQuery(query)).data;
        enhancedAvailable = true;
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error);
      }
    } else {
      warning = "Codex web_search 未配置或健康检查未通过，已使用 Spotify 原始搜索。";
    }

    const spotify = await searchSpotify(enhancement, query);
    const response: SearchResponse = {
      query,
      enhancedAvailable,
      enhancement,
      spotify,
      warning
    };
    setJsonCache("search_cache", cacheKey, response, 1000 * 60 * 60 * 24 * 3);
    return ok({ ...response, cached: false });
  } catch (error) {
    return fail(error, 502);
  }
}
