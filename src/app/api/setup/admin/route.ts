import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { attachSessionCookie, isAdminConfigured, requireAuth, setAdminPassword } from "@/lib/auth";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  password?: string;
};

export async function POST(request: NextRequest) {
  const authError = isAdminConfigured() ? requireAuth(request) : null;
  if (authError) {
    return authError;
  }

  try {
    const body = await readJson<Body>(request);
    setAdminPassword(body.password ?? "");
    return attachSessionCookie(NextResponse.json({ ok: true }), request);
  } catch (error) {
    return fail(error);
  }
}
