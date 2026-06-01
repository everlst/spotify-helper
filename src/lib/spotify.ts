import { createHash, randomBytes } from "node:crypto";
import { decryptString, encryptString } from "@/lib/secrets";
import { deleteSecureSetting, getDb, getSecureSetting, setSecureSetting } from "@/lib/db";
import { getSpotifySettings, getTargetPlaylist } from "@/lib/app-state";
import type { CodexSearchCandidate, CodexSearchEnhancement } from "@/lib/codex";
import { scoreSpotifyResult } from "@/lib/scoring";

export const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-private"
];

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  scope?: string;
  expires_in: number;
  refresh_token?: string;
};

type SpotifyPaging<T> = {
  items: T[];
  next: string | null;
};

export type SpotifyImage = {
  url: string;
  width: number | null;
  height: number | null;
};

export type SpotifyArtist = {
  id: string;
  uri: string;
  name: string;
  external_urls: { spotify?: string };
  images?: SpotifyImage[];
  genres?: string[];
  popularity?: number;
  followers?: { total: number };
};

export type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  external_urls: { spotify?: string };
  album: {
    id: string;
    name: string;
    images?: SpotifyImage[];
    release_date?: string;
  };
  artists: Array<{
    id: string;
    uri: string;
    name: string;
    external_urls: { spotify?: string };
  }>;
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  public: boolean | null;
  collaborative: boolean;
  tracks?: { total?: number };
  items?: { total?: number };
};

export type RankedTrack = {
  kind: "track";
  item: SpotifyTrack;
  score: number;
  matchedCandidate: CodexSearchCandidate | null;
};

export type RankedArtist = {
  kind: "artist";
  item: SpotifyArtist;
  score: number;
  matchedCandidate: CodexSearchCandidate | null;
};

export type SpotifySearchResults = {
  tracks: RankedTrack[];
  artists: RankedArtist[];
};

function base64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

export function createCodeVerifier() {
  return base64Url(randomBytes(48));
}

export function createCodeChallenge(verifier: string) {
  return base64Url(createHash("sha256").update(verifier).digest());
}

export function createSpotifyLoginUrl() {
  const { clientId, redirectUri } = getSpotifySettings();
  const state = base64Url(randomBytes(24));
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);

  getDb()
    .prepare(`
      INSERT INTO oauth_states (state, code_verifier, created_at)
      VALUES (?, ?, ?)
    `)
    .run(state, codeVerifier, Date.now());

  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", codeChallenge);
  return url.toString();
}

function storeTokenResponse(response: SpotifyTokenResponse) {
  setSecureSetting("spotify.accessToken", encryptString(response.access_token));
  if (response.refresh_token) {
    setSecureSetting("spotify.refreshToken", encryptString(response.refresh_token));
  }
  setSecureSetting("spotify.tokenType", encryptString(response.token_type));
  setSecureSetting("spotify.scope", encryptString(response.scope ?? ""));
  setSecureSetting("spotify.expiresAt", encryptString(String(Date.now() + response.expires_in * 1000 - 60_000)));
}

function clearSpotifyTokens() {
  for (const key of [
    "spotify.accessToken",
    "spotify.refreshToken",
    "spotify.tokenType",
    "spotify.scope",
    "spotify.expiresAt"
  ]) {
    deleteSecureSetting(key);
  }
}

async function parseSpotifyResponse<T>(response: Response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const message = body?.error?.message ?? body?.error_description ?? response.statusText;
    const error = new Error(`Spotify API ${response.status}: ${message}${retryAfter ? ` (retry-after ${retryAfter}s)` : ""}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body as T;
}

export async function handleSpotifyCallback(code: string, state: string) {
  const row = getDb()
    .prepare("SELECT code_verifier FROM oauth_states WHERE state = ? AND created_at > ?")
    .get(state, Date.now() - 10 * 60 * 1000) as { code_verifier: string } | undefined;

  if (!row) {
    throw new Error("Spotify OAuth state 无效或已过期");
  }

  getDb().prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  const { clientId, redirectUri } = getSpotifySettings();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: row.code_verifier
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const token = await parseSpotifyResponse<SpotifyTokenResponse>(response);
  storeTokenResponse(token);
}

async function refreshSpotifyToken() {
  const encryptedRefreshToken = getSecureSetting("spotify.refreshToken");
  if (!encryptedRefreshToken) {
    throw new Error("Spotify 尚未登录");
  }

  const { clientId } = getSpotifySettings();
  let refreshToken: string;
  try {
    refreshToken = decryptString(encryptedRefreshToken);
  } catch {
    clearSpotifyTokens();
    throw new Error("Spotify 登录凭证已失效，请重新登录 Spotify");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId
    })
  });
  let token: SpotifyTokenResponse;
  try {
    token = await parseSpotifyResponse<SpotifyTokenResponse>(response);
  } catch (error) {
    if (response.status === 400 || response.status === 401) {
      clearSpotifyTokens();
      throw new Error("Spotify 授权已失效，请重新登录 Spotify");
    }
    throw error;
  }
  storeTokenResponse({ ...token, refresh_token: token.refresh_token ?? refreshToken });
  return token.access_token;
}

async function getValidAccessToken() {
  const encryptedToken = getSecureSetting("spotify.accessToken");
  const encryptedExpiresAt = getSecureSetting("spotify.expiresAt");
  if (!encryptedToken || !encryptedExpiresAt) {
    return refreshSpotifyToken();
  }

  let expiresAt: number;
  try {
    expiresAt = Number(decryptString(encryptedExpiresAt));
  } catch {
    return refreshSpotifyToken();
  }

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return refreshSpotifyToken();
  }

  try {
    return decryptString(encryptedToken);
  } catch {
    return refreshSpotifyToken();
  }
}

async function spotifyFetch<T>(pathOrUrl: string, init: RequestInit = {}, retry = true): Promise<T> {
  const accessToken = await getValidAccessToken();
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `https://api.spotify.com/v1${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 401 && retry) {
    await refreshSpotifyToken();
    return spotifyFetch<T>(pathOrUrl, init, false);
  }

  return parseSpotifyResponse<T>(response);
}

export async function listPlaylists() {
  const playlists: SpotifyPlaylist[] = [];
  let url: string | null = "/me/playlists?limit=50";

  while (url) {
    const page: SpotifyPaging<SpotifyPlaylist> = await spotifyFetch(url);
    playlists.push(
      ...page.items.map((playlist) => ({
        ...playlist,
        tracks: { total: playlist.tracks?.total ?? playlist.items?.total ?? 0 }
      }))
    );
    url = page.next;
  }

  return playlists.sort((a, b) => a.name.localeCompare(b.name));
}

function uniqueCandidates(enhancement: CodexSearchEnhancement | null, originalQuery: string) {
  const source = enhancement?.candidates?.length
    ? enhancement.candidates
    : [
        {
          kind: "track" as const,
          spotify_query: originalQuery,
          display_name_guess: originalQuery,
          aliases: [],
          related_works: [],
          confidence: 0.2,
          reason_zh: "未启用增强搜索，使用原始查询。",
          citations: []
        },
        {
          kind: "artist" as const,
          spotify_query: originalQuery,
          display_name_guess: originalQuery,
          aliases: [],
          related_works: [],
          confidence: 0.2,
          reason_zh: "未启用增强搜索，使用原始查询。",
          citations: []
        }
      ];

  const seen = new Set<string>();
  return source.filter((candidate) => {
    const key = `${candidate.kind}:${candidate.spotify_query.toLocaleLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return Boolean(candidate.spotify_query.trim());
  });
}

export async function searchSpotify(enhancement: CodexSearchEnhancement | null, originalQuery: string) {
  const tracks = new Map<string, RankedTrack>();
  const artists = new Map<string, RankedArtist>();
  const candidates = uniqueCandidates(enhancement, originalQuery).slice(0, 8);

  await Promise.all(
    candidates.map(async (candidate) => {
      const type = candidate.kind;
      const url = new URL("https://api.spotify.com/v1/search");
      url.searchParams.set("q", candidate.spotify_query);
      url.searchParams.set("type", type);
      url.searchParams.set("limit", "8");

      const result = await spotifyFetch<{
        tracks?: SpotifyPaging<SpotifyTrack>;
        artists?: SpotifyPaging<SpotifyArtist>;
      }>(url.toString());

      if (type === "track") {
        for (const item of result.tracks?.items ?? []) {
          const score = scoreSpotifyResult(
            item.name,
            `${item.artists.map((artist) => artist.name).join(" ")} ${item.album.name}`,
            candidate,
            originalQuery
          );
          const existing = tracks.get(item.id);
          if (!existing || existing.score < score) {
            tracks.set(item.id, { kind: "track", item, score, matchedCandidate: candidate });
          }
        }
      }

      if (type === "artist") {
        for (const item of result.artists?.items ?? []) {
          const score = scoreSpotifyResult(item.name, `${item.genres?.join(" ") ?? ""}`, candidate, originalQuery);
          const existing = artists.get(item.id);
          if (!existing || existing.score < score) {
            artists.set(item.id, { kind: "artist", item, score, matchedCandidate: candidate });
          }
        }
      }
    })
  );

  return {
    tracks: [...tracks.values()].sort((a, b) => b.score - a.score),
    artists: [...artists.values()].sort((a, b) => b.score - a.score)
  } satisfies SpotifySearchResults;
}

async function playlistContainsTrack(playlistId: string, trackUri: string) {
  let url: string | null = `/playlists/${encodeURIComponent(playlistId)}/items?fields=items(item(uri)),next&limit=100`;

  while (url) {
    const page: SpotifyPaging<{ item: { uri?: string } | null }> = await spotifyFetch(url);
    if (page.items.some((entry) => entry.item?.uri === trackUri)) {
      return true;
    }
    url = page.next;
  }

  return false;
}

export async function addTrackToTargetPlaylist(
  trackUri: string,
  playlistOverride?: { id?: string | null; name?: string | null }
) {
  if (!trackUri.startsWith("spotify:track:")) {
    throw new Error("只支持添加 Spotify track URI");
  }

  const playlist = playlistOverride?.id?.trim()
    ? {
        id: playlistOverride.id.trim(),
        name: playlistOverride.name?.trim() || playlistOverride.id.trim()
      }
    : getTargetPlaylist();
  if (await playlistContainsTrack(playlist.id, trackUri)) {
    return {
      added: false,
      duplicate: true,
      playlist,
      snapshotId: null
    };
  }

  const response = await spotifyFetch<{ snapshot_id: string }>(`/playlists/${encodeURIComponent(playlist.id)}/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uris: [trackUri] })
  });

  getDb()
    .prepare(`
      INSERT INTO playlist_additions (spotify_uri, playlist_id, snapshot_id, added_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(spotify_uri, playlist_id) DO UPDATE
      SET snapshot_id = excluded.snapshot_id, added_at = excluded.added_at
    `)
    .run(trackUri, playlist.id, response.snapshot_id, Date.now());

  return {
    added: true,
    duplicate: false,
    playlist,
    snapshotId: response.snapshot_id
  };
}

export async function getArtist(artistId: string) {
  return spotifyFetch<SpotifyArtist>(`/artists/${encodeURIComponent(artistId)}`);
}

export function hasSpotifyRefreshToken() {
  return Boolean(getSecureSetting("spotify.refreshToken"));
}
