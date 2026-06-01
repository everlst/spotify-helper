import type { NextRequest } from "next/server";
import { getAppStatus, markCodexHealth } from "@/lib/app-state";
import { fail, ok } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { testCodexWebSearch } from "@/lib/codex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const result = await testCodexWebSearch();
    const healthy = result.data.ok && result.data.web_search_observed && result.data.citations.length > 0;
    markCodexHealth(healthy);
    return ok({ ok: healthy, result: result.data, durationMs: result.durationMs, status: getAppStatus() });
  } catch (error) {
    markCodexHealth(false);
    return fail(error, 502);
  }
}
