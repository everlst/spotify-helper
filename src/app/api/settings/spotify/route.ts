import type { NextRequest } from "next/server";
import { getAppStatus, getSpotifyPublicSettings, saveSpotifySettings } from "@/lib/app-state";
import { fail, ok, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) {
    return authError;
  }

  return ok(getSpotifyPublicSettings());
}

export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJson<{ clientId?: string; redirectUri?: string }>(request);
    saveSpotifySettings(body.clientId ?? "", body.redirectUri ?? "");
    return ok({ ok: true, status: getAppStatus() });
  } catch (error) {
    return fail(error);
  }
}
