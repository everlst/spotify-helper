import type { NextRequest } from "next/server";
import { getAppStatus } from "@/lib/app-state";
import { getArtistEnrichmentCache, setArtistEnrichmentCache } from "@/lib/artist-cache";
import { fail, ok } from "@/lib/api";
import { enrichArtist } from "@/lib/codex";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    spotifyArtistId: string;
  }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  const authError = requireAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const { spotifyArtistId } = await params;
    const artistName = new URL(request.url).searchParams.get("name")?.trim();
    if (!artistName) {
      throw new Error("artist name is required for enrichment");
    }

    const cached = getArtistEnrichmentCache(spotifyArtistId);
    if (cached) {
      return ok({ enrichment: cached, cached: true });
    }

    const status = getAppStatus();
    if (!status.codexConfigured || !status.codexHealthy) {
      throw new Error("Codex web_search 未配置或健康检查未通过");
    }

    const result = (await enrichArtist(artistName)).data;
    setArtistEnrichmentCache(spotifyArtistId, artistName, result);
    return ok({ enrichment: result, cached: false });
  } catch (error) {
    return fail(error, 502);
  }
}
