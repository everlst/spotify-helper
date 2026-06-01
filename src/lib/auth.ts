import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { decryptString, encryptString } from "@/lib/secrets";
import { getSecureSetting, getSetting, setSecureSetting, setSetting } from "@/lib/db";

export const SESSION_COOKIE = "spotify_helper_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export function isAdminConfigured() {
  return Boolean(getSecureSetting("admin.passwordHash"));
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function setAdminPassword(password: string) {
  if (password.length < 10) {
    throw new Error("管理员密码至少需要 10 个字符");
  }
  setSecureSetting("admin.passwordHash", encryptString(hashPassword(password)));
}

export function validateAdminPassword(password: string) {
  const encrypted = getSecureSetting("admin.passwordHash");
  if (!encrypted) {
    return false;
  }
  return verifyPassword(password, decryptString(encrypted));
}

function getSigningSecret() {
  const configured = getSetting("session.secret");
  if (configured) {
    return configured;
  }
  const secret = randomBytes(32).toString("base64url");
  // Stored as a regular setting because it is only useful with access to DATA_DIR.
  setSetting("session.secret", secret);
  return secret;
}

export function createSessionCookie() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${nonce}.${expiresAt}`;
  const signature = createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function isValidSession(value: string | undefined) {
  if (!value) {
    return false;
  }

  const [nonce, expiresRaw, signature] = value.split(".");
  if (!nonce || !expiresRaw || !signature) {
    return false;
  }

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false;
  }

  const payload = `${nonce}.${expiresRaw}`;
  const expected = createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");
  if (signature.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function isAuthenticated(request: NextRequest) {
  return isValidSession(request.cookies.get(SESSION_COOKIE)?.value);
}

export function shouldUseSecureCookie(request: NextRequest) {
  if (process.env.SESSION_COOKIE_SECURE === "true") {
    return true;
  }
  if (process.env.SESSION_COOKIE_SECURE === "false") {
    return false;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProto) {
    return forwardedProto === "https";
  }

  return request.nextUrl.protocol === "https:";
}

export function requireAuth(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Admin setup is required" }, { status: 428 });
  }
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }
  return null;
}

export function attachSessionCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set(SESSION_COOKIE, createSessionCookie(), {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    maxAge: SESSION_TTL_MS / 1000,
    path: "/"
  });
  return response;
}

export function clearSessionCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    maxAge: 0,
    path: "/"
  });
  return response;
}
