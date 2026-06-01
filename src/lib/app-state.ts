import { decryptString, encryptString } from "@/lib/secrets";
import {
  deleteSecureSetting,
  deleteSetting,
  getSecureSetting,
  getSetting,
  setSecureSetting,
  setSetting
} from "@/lib/db";
import { isAdminConfigured } from "@/lib/auth";
import { writeCodexConfig } from "@/lib/codex-config";

export type AppStatus = {
  adminConfigured: boolean;
  spotifyConfigured: boolean;
  spotifyConnected: boolean;
  codexConfigured: boolean;
  codexHealthy: boolean;
  codexLastTestAt: string | null;
  targetPlaylist: {
    id: string;
    name: string;
  } | null;
};

export type CodexProviderMode = "official" | "custom";
const DEFAULT_CODEX_MODEL = "gpt-5.5";
const DEFAULT_CODEX_REASONING_EFFORT = "medium";
const DEFAULT_CODEX_FAST_MODE = true;

export function getCodexProviderMode(): CodexProviderMode {
  const savedMode = getSetting("codex.providerMode");
  if (savedMode === "official" || savedMode === "custom") {
    return savedMode;
  }
  if (getSetting("codex.baseUrl") && getSecureSetting("codex.bearerToken")) {
    return "custom";
  }
  return "official";
}

function canDecryptSecureSetting(key: string) {
  const encrypted = getSecureSetting(key);
  if (!encrypted) {
    return false;
  }

  try {
    decryptString(encrypted);
    return true;
  } catch {
    return false;
  }
}

export function getAppStatus(): AppStatus {
  const codexProviderMode = getCodexProviderMode();
  const codexModel = getSetting("codex.model");
  const codexReasoningEffort = getSetting("codex.reasoningEffort");

  return {
    adminConfigured: isAdminConfigured(),
    spotifyConfigured: Boolean(getSetting("spotify.clientId") && getSetting("spotify.redirectUri")),
    spotifyConnected: canDecryptSecureSetting("spotify.refreshToken"),
    codexConfigured:
      codexProviderMode === "official"
        ? Boolean(codexModel && codexReasoningEffort)
        : Boolean(getSetting("codex.baseUrl") && codexModel && codexReasoningEffort && getSecureSetting("codex.bearerToken")),
    codexHealthy: getSetting("codex.healthy") === "true",
    codexLastTestAt: getSetting("codex.lastTestAt"),
    targetPlaylist: getSetting("spotify.targetPlaylistId")
      ? {
          id: getSetting("spotify.targetPlaylistId") ?? "",
          name: getSetting("spotify.targetPlaylistName") ?? "目标歌单"
        }
      : null
  };
}

export function saveSpotifySettings(clientId: string, redirectUri: string) {
  const normalizedClientId = clientId.trim();
  const normalizedRedirectUri = redirectUri.trim();
  if (!normalizedClientId) {
    throw new Error("Spotify Client ID 不能为空");
  }
  let parsedRedirectUri: URL;
  try {
    parsedRedirectUri = new URL(normalizedRedirectUri);
  } catch {
    throw new Error("Redirect URI 格式不正确");
  }
  if (parsedRedirectUri.protocol !== "http:" && parsedRedirectUri.protocol !== "https:") {
    throw new Error("Redirect URI 必须以 http:// 或 https:// 开头");
  }
  if (parsedRedirectUri.protocol === "http:") {
    const isLoopback =
      parsedRedirectUri.hostname === "127.0.0.1" ||
      parsedRedirectUri.hostname === "::1" ||
      parsedRedirectUri.hostname === "[::1]";
    if (!isLoopback) {
      throw new Error("Spotify 只允许 HTTPS 回调；HTTP 仅限 127.0.0.1 或 [::1] 本机调试");
    }
  }
  setSetting("spotify.clientId", normalizedClientId);
  setSetting("spotify.redirectUri", normalizedRedirectUri);
}

export function getSpotifySettings() {
  const clientId = getSetting("spotify.clientId");
  const redirectUri = getSetting("spotify.redirectUri");
  if (!clientId || !redirectUri) {
    throw new Error("Spotify 尚未配置");
  }
  return { clientId, redirectUri };
}

export function getSpotifyPublicSettings() {
  return {
    clientId: getSetting("spotify.clientId") ?? "",
    redirectUri: getSetting("spotify.redirectUri") ?? ""
  };
}

export function saveCodexSettings(
  providerMode: CodexProviderMode,
  baseUrl: string,
  bearerToken: string,
  model: string,
  reasoningEffort: string,
  fastMode: boolean
) {
  if (providerMode === "official") {
    const configPath = writeCodexConfig({ providerMode, model, reasoningEffort, fastMode });
    setSetting("codex.providerMode", providerMode);
    setSetting("codex.model", model.trim());
    setSetting("codex.reasoningEffort", reasoningEffort.trim());
    setSetting("codex.fastMode", fastMode ? "true" : "false");
    deleteSetting("codex.baseUrl");
    deleteSecureSetting("codex.bearerToken");
    setSetting("codex.healthy", "false");
    return configPath;
  }

  const encryptedToken = getSecureSetting("codex.bearerToken");
  const effectiveToken = bearerToken.trim() || (encryptedToken ? decryptString(encryptedToken) : "");
  const configPath = writeCodexConfig({ providerMode, baseUrl, bearerToken: effectiveToken, model, reasoningEffort, fastMode });
  setSetting("codex.providerMode", providerMode);
  setSetting("codex.baseUrl", baseUrl.trim().replace(/\/+$/, ""));
  setSetting("codex.model", model.trim());
  setSetting("codex.reasoningEffort", reasoningEffort.trim());
  setSetting("codex.fastMode", fastMode ? "true" : "false");
  setSecureSetting("codex.bearerToken", encryptString(effectiveToken));
  setSetting("codex.healthy", "false");
  return configPath;
}

export function getCodexSettings() {
  const providerMode = getCodexProviderMode();
  if (providerMode !== "custom") {
    throw new Error("当前 Codex 使用官方登录模式，不需要第三方 API 配置");
  }
  const baseUrl = getSetting("codex.baseUrl");
  const model = getSetting("codex.model");
  const encryptedToken = getSecureSetting("codex.bearerToken");
  if (!baseUrl || !model || !encryptedToken) {
    throw new Error("Codex 尚未配置");
  }
  return {
    providerMode,
    baseUrl,
    model,
    bearerToken: decryptString(encryptedToken)
  };
}

export function getCodexPublicSettings() {
  return {
    providerMode: getCodexProviderMode(),
    baseUrl: getSetting("codex.baseUrl") ?? "",
    model: getSetting("codex.model") ?? DEFAULT_CODEX_MODEL,
    reasoningEffort: getSetting("codex.reasoningEffort") ?? DEFAULT_CODEX_REASONING_EFFORT,
    fastMode: (getSetting("codex.fastMode") ?? (DEFAULT_CODEX_FAST_MODE ? "true" : "false")) === "true",
    hasBearerToken: Boolean(getSecureSetting("codex.bearerToken"))
  };
}

export function markCodexHealth(healthy: boolean) {
  setSetting("codex.healthy", healthy ? "true" : "false");
  setSetting("codex.lastTestAt", new Date().toISOString());
}

export function saveTargetPlaylist(id: string, name: string) {
  if (!id.trim()) {
    throw new Error("playlist_id 不能为空");
  }
  setSetting("spotify.targetPlaylistId", id.trim());
  setSetting("spotify.targetPlaylistName", name.trim() || id.trim());
}

export function getTargetPlaylist() {
  const id = getSetting("spotify.targetPlaylistId");
  if (!id) {
    throw new Error("尚未选择目标歌单");
  }
  return {
    id,
    name: getSetting("spotify.targetPlaylistName") ?? id
  };
}
