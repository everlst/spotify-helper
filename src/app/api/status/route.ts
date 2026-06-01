import type { NextRequest } from "next/server";
import { getAppStatus } from "@/lib/app-state";
import { isAuthenticated } from "@/lib/auth";
import { deleteExpiredRows } from "@/lib/db";
import { ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  deleteExpiredRows();
  return ok({
    ...getAppStatus(),
    authenticated: isAuthenticated(request)
  });
}
