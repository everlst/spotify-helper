import { NextResponse, type NextRequest } from "next/server";
import { getSpotifySettings } from "@/lib/app-state";
import { handleSpotifyCallback } from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRequestOrigin(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.split(",")[0]?.trim() ||
    request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

function getCallbackReturnUrl(path: string, request: NextRequest) {
  try {
    return new URL(path, new URL(getSpotifySettings().redirectUri).origin);
  } catch {
    return new URL(path, getRequestOrigin(request));
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(getCallbackReturnUrl("/?spotify=error", request));
  }

  try {
    await handleSpotifyCallback(code, state);
    return NextResponse.redirect(getCallbackReturnUrl("/?spotify=connected", request));
  } catch {
    return NextResponse.redirect(getCallbackReturnUrl("/?spotify=error", request));
  }
}
