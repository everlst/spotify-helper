import type { NextRequest } from "next/server";
import { getAppStatus, saveTargetPlaylist } from "@/lib/app-state";
import { fail, ok, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJson<{ id?: string; name?: string }>(request);
    saveTargetPlaylist(body.id ?? "", body.name ?? "");
    return ok({ ok: true, status: getAppStatus() });
  } catch (error) {
    return fail(error);
  }
}
