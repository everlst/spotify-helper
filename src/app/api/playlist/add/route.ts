import type { NextRequest } from "next/server";
import { fail, ok, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { addTrackToTargetPlaylist } from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJson<{ uri?: string; playlistId?: string; playlistName?: string }>(request);
    return ok(
      await addTrackToTargetPlaylist(body.uri ?? "", {
        id: body.playlistId,
        name: body.playlistName
      })
    );
  } catch (error) {
    return fail(error, 502);
  }
}
