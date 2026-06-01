import { NextResponse, type NextRequest } from "next/server";
import { attachSessionCookie, validateAdminPassword } from "@/lib/auth";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{ password?: string }>(request);
    if (!validateAdminPassword(body.password ?? "")) {
      return fail(new Error("密码不正确"), 401);
    }
    return attachSessionCookie(NextResponse.json({ ok: true }), request);
  } catch (error) {
    return fail(error);
  }
}
