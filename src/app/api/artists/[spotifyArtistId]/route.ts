import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getArtist } from "@/lib/spotify";

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
    return ok({ artist: await getArtist(spotifyArtistId) });
  } catch (error) {
    return fail(error, 502);
  }
}
