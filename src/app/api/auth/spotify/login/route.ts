import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createSpotifyLoginUrl } from "@/lib/spotify";
import { fail } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) {
    return authError;
  }

  try {
    return NextResponse.redirect(createSpotifyLoginUrl());
  } catch (error) {
    return fail(error);
  }
}
