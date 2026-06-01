import type { NextRequest } from "next/server";
import { getAppStatus, getCodexPublicSettings, markCodexHealth, saveCodexSettings } from "@/lib/app-state";
import { fail, ok, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { testCodexWebSearch } from "@/lib/codex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) {
    return authError;
  }

  return ok(getCodexPublicSettings());
}

export async function POST(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJson<{ baseUrl?: string; bearerToken?: string; model?: string }>(request);
    const configPath = saveCodexSettings(body.baseUrl ?? "", body.bearerToken ?? "", body.model ?? "");
    try {
      const canary = await testCodexWebSearch();
      const healthy = canary.data.ok && canary.data.web_search_observed && canary.data.citations.length > 0;
      markCodexHealth(healthy);
      return ok({
        ok: true,
        configPath,
        canary: canary.data,
        durationMs: canary.durationMs,
        status: getAppStatus()
      });
    } catch (error) {
      markCodexHealth(false);
      return ok({
        ok: true,
        configPath,
        canary: null,
        warning: error instanceof Error ? error.message : String(error),
        status: getAppStatus()
      });
    }
  } catch (error) {
    return fail(error);
  }
}
