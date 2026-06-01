"use client";

import {
  Check,
  ExternalLink,
  Link as LinkIcon,
  ListMusic,
  Loader2,
  LogOut,
  Menu,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  Shield,
  Sparkles,
  TriangleAlert,
  UserRound,
  X
} from "lucide-react";
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";

type Status = {
  adminConfigured: boolean;
  authenticated: boolean;
  spotifyConfigured: boolean;
  spotifyConnected: boolean;
  codexConfigured: boolean;
  codexHealthy: boolean;
  codexLastTestAt: string | null;
  targetPlaylist: { id: string; name: string } | null;
};

type Citation = {
  title: string;
  url: string;
};

type Candidate = {
  kind: "artist" | "track";
  spotify_query: string;
  display_name_guess: string;
  aliases: string[];
  related_works: string[];
  confidence: number;
  reason_zh: string;
  citations: Citation[];
};

type Track = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  external_urls: { spotify?: string };
  album: {
    id: string;
    name: string;
    images?: Array<{ url: string }>;
    release_date?: string;
  };
  artists: Array<{
    id: string;
    uri?: string;
    name: string;
    external_urls: { spotify?: string };
  }>;
};

type Artist = {
  id: string;
  uri: string;
  name: string;
  external_urls: { spotify?: string };
  images?: Array<{ url: string }>;
  genres?: string[];
  popularity?: number;
  followers?: { total: number };
};

type RankedTrack = {
  kind: "track";
  item: Track;
  score: number;
  matchedCandidate: Candidate | null;
};

type RankedArtist = {
  kind: "artist";
  item: Artist;
  score: number;
  matchedCandidate: Candidate | null;
};

type SearchResponse = {
  query: string;
  enhancedAvailable: boolean;
  enhancement: {
    intent: string;
    normalized_query: string;
    summary_zh: string;
    citations: Citation[];
    candidates: Candidate[];
  } | null;
  spotify: {
    tracks: RankedTrack[];
    artists: RankedArtist[];
  };
  warning: string | null;
  cached: boolean;
};

type Playlist = {
  id: string;
  name: string;
  public: boolean | null;
  collaborative: boolean;
  tracks?: { total?: number };
};

type ArtistEnrichment = {
  artist_name: string;
  summary_zh: string;
  aliases: string[];
  source_language: string;
  citations: Citation[];
};

type SpotifySettings = {
  clientId: string;
  redirectUri: string;
};

type CodexSettings = {
  providerMode: "official" | "custom";
  baseUrl: string;
  model: string;
  reasoningEffort: string;
  fastMode: boolean;
  hasBearerToken: boolean;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {})
      }
    });
  } catch {
    throw new Error("无法连接到后端服务，请确认容器仍在运行并刷新页面。");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? response.statusText);
  }
  return payload as T;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function confidencePercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getDefaultRedirectUri() {
  const callbackPath = "/api/auth/spotify/callback";
  if (window.location.protocol === "http:" && window.location.hostname === "localhost") {
    return `http://127.0.0.1:${window.location.port || "80"}${callbackPath}`;
  }
  return `${window.location.origin}${callbackPath}`;
}

function StatusPill({
  ok,
  label,
  icon
}: {
  ok: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <span className={`status-pill ${ok ? "is-ok" : "is-warn"}`}>
      {icon}
      {label}
    </span>
  );
}

function CitationLinks({ citations }: { citations: Citation[] }) {
  if (!citations.length) {
    return null;
  }

  return (
    <div className="citation-row">
      {citations.slice(0, 4).map((citation) => (
        <a href={citation.url} target="_blank" rel="noreferrer" key={citation.url}>
          <LinkIcon size={13} />
          {citation.title || new URL(citation.url).hostname}
        </a>
      ))}
    </div>
  );
}

export function SpotifyHelperApp() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [spotifyClientId, setSpotifyClientId] = useState("");
  const [spotifyRedirectUri, setSpotifyRedirectUri] = useState("");
  const [codexProviderMode, setCodexProviderMode] = useState<"official" | "custom">("official");
  const [codexBaseUrl, setCodexBaseUrl] = useState("");
  const [codexToken, setCodexToken] = useState("");
  const [codexModel, setCodexModel] = useState("gpt-5.5");
  const [codexReasoningEffort, setCodexReasoningEffort] = useState("medium");
  const [codexFastMode, setCodexFastMode] = useState(true);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [artistEnrichment, setArtistEnrichment] = useState<ArtistEnrichment | null>(null);
  const [artistLoading, setArtistLoading] = useState(false);
  const [testingCodex, setTestingCodex] = useState(false);
  const [addingTrackUri, setAddingTrackUri] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [activeView, setActiveView] = useState<"home" | "settings">("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingAddTrack, setPendingAddTrack] = useState<Track | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [addPlaylistSearch, setAddPlaylistSearch] = useState("");

  const requiredSettingsComplete = Boolean(
    status?.spotifyConfigured && status.spotifyConnected && status.codexConfigured && status.targetPlaylist
  );

  const setupComplete = Boolean(
    status?.adminConfigured &&
      status.authenticated &&
      status.spotifyConfigured &&
      status.spotifyConnected &&
      status.codexConfigured &&
      status.codexHealthy &&
      status.targetPlaylist
  );
  const showSettingsView = Boolean(status?.authenticated && (!requiredSettingsComplete || activeView === "settings"));
  const showSearchView = Boolean(status?.authenticated && requiredSettingsComplete && activeView !== "settings");
  const showStatusStack = Boolean(status && (!requiredSettingsComplete || activeView === "settings"));
  async function refreshStatus() {
    const next = await api<Status>("/api/status");
    setStatus(next);
  }

  function navigateTo(view: "home" | "settings") {
    setActiveView(view);
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}${view === "settings" ? "#settings" : ""}`);
    }
  }

  async function loadSavedSettings() {
    const [spotify, codex] = await Promise.all([
      api<SpotifySettings>("/api/settings/spotify"),
      api<CodexSettings>("/api/settings/codex")
    ]);

    setSpotifyClientId(spotify.clientId);
    if (spotify.redirectUri) {
      setSpotifyRedirectUri(spotify.redirectUri);
    }
    setCodexProviderMode(codex.providerMode);
    setCodexBaseUrl(codex.baseUrl);
    if (codex.model) {
      setCodexModel(codex.model);
    }
    if (codex.reasoningEffort) {
      setCodexReasoningEffort(codex.reasoningEffort);
    }
    setCodexFastMode(codex.fastMode);
    setSettingsLoaded(true);
  }

  useEffect(() => {
    refreshStatus().catch((error) => setMessage(error.message));
    if (typeof window !== "undefined") {
      setSpotifyRedirectUri(getDefaultRedirectUri());
      setActiveView(window.location.hash === "#settings" ? "settings" : "home");
      const spotifyResult = new URLSearchParams(window.location.search).get("spotify");
      if (spotifyResult === "connected") {
        setMessage("Spotify 登录成功，可以刷新歌单。");
        window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      }
      if (spotifyResult === "error") {
        setMessage("Spotify 登录失败，请检查 Redirect URI 是否与 Spotify Dashboard 完全一致。");
        window.history.replaceState({}, "", window.location.pathname + window.location.hash);
      }
    }
  }, []);

  useEffect(() => {
    function syncViewFromHash() {
      setActiveView(window.location.hash === "#settings" ? "settings" : "home");
    }

    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  useEffect(() => {
    if (!status?.authenticated || settingsLoaded) {
      return;
    }

    loadSavedSettings().catch((error) => setMessage(error.message));
  }, [status?.authenticated, settingsLoaded]);

  useEffect(() => {
    if (status?.spotifyConnected && status.authenticated && !playlists.length && !playlistLoading) {
      void loadPlaylists();
    }
  }, [status?.spotifyConnected, status?.authenticated]);

  useEffect(() => {
    if (status?.authenticated && !requiredSettingsComplete) {
      setActiveView("settings");
    }
  }, [status?.authenticated, requiredSettingsComplete]);

  const visiblePlaylists = useMemo(() => {
    const term = playlistSearch.trim().toLocaleLowerCase();
    if (!term) {
      return playlists;
    }
    return playlists.filter((playlist) => playlist.name.toLocaleLowerCase().includes(term));
  }, [playlists, playlistSearch]);
  const visibleAddPlaylists = useMemo(() => {
    const term = addPlaylistSearch.trim().toLocaleLowerCase();
    if (!term) {
      return playlists;
    }
    return playlists.filter((playlist) => playlist.name.toLocaleLowerCase().includes(term));
  }, [playlists, addPlaylistSearch]);
  const selectedAddPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null;
  const hasSearchResults = Boolean(
    (searchResult?.spotify.tracks.length ?? 0) > 0 || (searchResult?.spotify.artists.length ?? 0) > 0
  );

  async function submitAdmin(event: FormEvent) {
    event.preventDefault();
    await api("/api/setup/admin", {
      method: "POST",
      body: JSON.stringify({ password: adminPassword })
    });
    setAdminPassword("");
    await refreshStatus();
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: loginPassword })
    });
    setLoginPassword("");
    await refreshStatus();
  }

  async function saveSpotify(event: FormEvent) {
    event.preventDefault();
    await api("/api/settings/spotify", {
      method: "POST",
      body: JSON.stringify({ clientId: spotifyClientId, redirectUri: spotifyRedirectUri })
    });
    setMessage("Spotify 设置已保存。下一步点击登录 Spotify 完成授权。");
    await refreshStatus();
  }

  async function saveCodex(event: FormEvent) {
    event.preventDefault();
    setTestingCodex(true);
    try {
      const result = await api<{ canary: { note_zh: string } | null; warning?: string }>("/api/settings/codex", {
        method: "POST",
        body: JSON.stringify({
          providerMode: codexProviderMode,
          baseUrl: codexBaseUrl,
          bearerToken: codexToken,
          model: codexModel,
          reasoningEffort: codexReasoningEffort,
          fastMode: codexFastMode
        })
      });
      setCodexToken("");
      setMessage(result.canary?.note_zh ?? result.warning ?? "Codex 配置已写入，但 canary 未通过。");
      await refreshStatus();
    } finally {
      setTestingCodex(false);
    }
  }

  async function runCodexTest() {
    setTestingCodex(true);
    setMessage(null);
    try {
      const result = await api<{ ok: boolean; result: { note_zh: string } }>("/api/settings/codex/test", {
        method: "POST"
      });
      setMessage(result.result.note_zh);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setTestingCodex(false);
      await refreshStatus();
    }
  }

  async function loadPlaylists() {
    setPlaylistLoading(true);
    try {
      const result = await api<{ playlists: Playlist[] }>("/api/playlists");
      setPlaylists(result.playlists);
      return result.playlists;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      await refreshStatus().catch(() => undefined);
      return [];
    } finally {
      setPlaylistLoading(false);
    }
  }

  function handleSpotifyLoginClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!status?.spotifyConfigured) {
      event.preventDefault();
      setMessage("请先保存 Spotify Client ID 和 Redirect URI。");
      return;
    }
    setMessage("正在跳转到 Spotify 授权页面...");
  }

  async function savePlaylist(playlist: Playlist) {
    await api("/api/playlists/target", {
      method: "POST",
      body: JSON.stringify({ id: playlist.id, name: playlist.name })
    });
    setMessage(`默认歌单已设置为 ${playlist.name}。`);
    await refreshStatus();
  }

  async function runSearch(force = false) {
    setSearching(true);
    setMessage(null);
    setSelectedArtist(null);
    setArtistEnrichment(null);
    setArtistLoading(false);
    try {
      const result = await api<SearchResponse>("/api/search", {
        method: "POST",
        body: JSON.stringify({ query, force })
      });
      setSearchResult(result);
      const topTrackArtist = result.spotify.tracks[0]?.item.artists[0];
      if (topTrackArtist) {
        void selectArtist({
          id: topTrackArtist.id,
          uri: topTrackArtist.uri ?? `spotify:artist:${topTrackArtist.id}`,
          name: topTrackArtist.name,
          external_urls: topTrackArtist.external_urls
        });
      } else if (result.spotify.artists[0]) {
        void selectArtist(result.spotify.artists[0].item);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    await runSearch(false);
  }

  async function selectArtist(artist: Artist) {
    setSelectedArtist(artist);
    setArtistEnrichment(null);
    setArtistLoading(true);
    try {
      const detail = await api<{ artist: Artist }>(`/api/artists/${encodeURIComponent(artist.id)}`);
      setSelectedArtist(detail.artist);
    } catch {
      setSelectedArtist(artist);
    }

    try {
      const result = await api<{ enrichment: ArtistEnrichment }>(
        `/api/artists/${encodeURIComponent(artist.id)}/enrichment?name=${encodeURIComponent(artist.name)}`
      );
      setArtistEnrichment(result.enrichment);
    } catch (error) {
      setArtistEnrichment({
        artist_name: artist.name,
        summary_zh: error instanceof Error ? error.message : String(error),
        aliases: [],
        source_language: "unknown",
        citations: []
      });
    } finally {
      setArtistLoading(false);
    }
  }

  function scrollToArtistPane() {
    requestAnimationFrame(() => {
      document.getElementById("artist-pane")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  function selectTrackArtist(artist: Track["artists"][number]) {
    void selectArtist({
      id: artist.id,
      uri: artist.uri ?? `spotify:artist:${artist.id}`,
      name: artist.name,
      external_urls: artist.external_urls
    });
    scrollToArtistPane();
  }

  async function openAddTrackDialog(track: Track) {
    setPendingAddTrack(track);
    setMessage(null);
    setAddPlaylistSearch("");
    setSelectedPlaylistId(status?.targetPlaylist?.id ?? playlists[0]?.id ?? "");

    if (!playlists.length && status?.spotifyConnected) {
      const loaded = await loadPlaylists();
      setSelectedPlaylistId(status?.targetPlaylist?.id ?? loaded[0]?.id ?? "");
    }
  }

  async function addPendingTrack() {
    if (!pendingAddTrack || !selectedPlaylistId) {
      return;
    }

    const playlist =
      playlists.find((item) => item.id === selectedPlaylistId) ??
      (status?.targetPlaylist?.id === selectedPlaylistId ? status.targetPlaylist : null);
    setAddingTrackUri(pendingAddTrack.uri);
    try {
      const result = await api<{ added: boolean; duplicate: boolean; playlist: { name: string } }>("/api/playlist/add", {
        method: "POST",
        body: JSON.stringify({
          uri: pendingAddTrack.uri,
          playlistId: selectedPlaylistId,
          playlistName: playlist?.name
        })
      });
      setMessage(result.duplicate ? `已在 ${result.playlist.name} 中，未重复添加。` : `已加入 ${result.playlist.name}。`);
      setPendingAddTrack(null);
      if (result.added) {
        await loadPlaylists();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAddingTrackUri(null);
    }
  }

  function openTrackInSpotify(track: Track) {
    if (track.uri) {
      window.location.href = track.uri;
      return;
    }
    if (track.external_urls.spotify) {
      window.open(track.external_urls.spotify, "_blank", "noopener,noreferrer");
    }
  }

  function openArtistInSpotify(artist: Artist) {
    if (artist.uri) {
      window.location.href = artist.uri;
      return;
    }
    if (artist.external_urls.spotify) {
      window.open(artist.external_urls.spotify, "_blank", "noopener,noreferrer");
    }
  }

  async function logout() {
    await api("/api/logout", { method: "POST" });
    setSettingsLoaded(false);
    setStatus((previous) => (previous ? { ...previous, authenticated: false } : previous));
  }

  if (!status) {
    return (
      <main className="loading-screen">
        <Loader2 className="spin" />
      </main>
    );
  }

  return (
    <main className={`app-frame ${menuOpen ? "menu-open" : "menu-collapsed"}`}>
      <aside className={`sidebar ${menuOpen ? "is-open" : "is-collapsed"}`}>
        <div className="brand-row">
          <div className="brand-mark">
            <ListMusic size={22} />
          </div>
          <div>
            <h1>Spotify Helper</h1>
            <p>NAS / Docker</p>
          </div>
          <button className="menu-toggle" type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label="菜单">
            <Menu size={18} />
          </button>
        </div>

        {menuOpen && showStatusStack && (
          <nav className="status-stack">
            <StatusPill ok={status.adminConfigured && status.authenticated} label="管理员" icon={<Shield size={14} />} />
            <StatusPill ok={status.spotifyConnected} label="Spotify" icon={<Check size={14} />} />
            <StatusPill ok={status.codexHealthy} label="web_search" icon={<Sparkles size={14} />} />
            <StatusPill ok={Boolean(status.targetPlaylist)} label={status.targetPlaylist?.name ?? "默认歌单"} icon={<ListMusic size={14} />} />
          </nav>
        )}

        {menuOpen && <div className="sidebar-actions">
          {requiredSettingsComplete && (
            <button className={`text-button ${activeView === "home" ? "is-active" : ""}`} type="button" onClick={() => navigateTo("home")}>
              <Search size={15} />
              搜索
            </button>
          )}
          <button className={`text-button ${activeView === "settings" ? "is-active" : ""}`} type="button" onClick={() => navigateTo("settings")}>
            <Settings size={15} />
            设置
          </button>
          {status.authenticated && (
            <button className="text-button" onClick={logout}>
              <LogOut size={15} />
              退出
            </button>
          )}
        </div>}
      </aside>

      <section className="main-surface">
        {message && (
          <div className="notice">
            <TriangleAlert size={16} />
            {message}
          </div>
        )}

        {!status.adminConfigured && (
          <section className="setup-panel">
            <h2>首次设置</h2>
            <form onSubmit={submitAdmin} className="form-grid">
              <label>
                管理员密码
                <input
                  type="password"
                  value={adminPassword}
                  minLength={10}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  autoFocus
                />
              </label>
              <button className="primary-button" type="submit">
                <Check size={16} />
                保存
              </button>
            </form>
          </section>
        )}

        {status.adminConfigured && !status.authenticated && (
          <section className="setup-panel compact-auth">
            <h2>登录</h2>
            <form onSubmit={submitLogin} className="inline-form">
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                autoFocus
              />
              <button className="primary-button" type="submit">
                <Shield size={16} />
                进入
              </button>
            </form>
          </section>
        )}

        {showSearchView && (
          <>
            <section className="search-command">
              <form onSubmit={submitSearch}>
                <Search size={20} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入歌曲或歌手名称" />
                <button className="primary-button" type="submit" disabled={searching || !status.spotifyConnected}>
                  {searching ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
                  搜索
                </button>
              </form>
            </section>

            <section className="workspace-grid">
              <div className="results-pane">
                <div className="section-heading">
                  <div>
                    <h2>搜索结果</h2>
                    <p>{setupComplete ? "增强搜索可用" : "完成设置后启用完整流程"}</p>
                  </div>
                  <div className="result-heading-actions">
                    {searchResult?.cached && <span className="soft-tag">缓存</span>}
                    {searchResult && (
                      <button className="secondary-button" type="button" onClick={() => runSearch(true)} disabled={searching}>
                        {searching ? <Loader2 className="spin" size={15} /> : <RefreshCcw size={15} />}
                        重新搜索
                      </button>
                    )}
                  </div>
                </div>

                {searchResult?.warning && <div className="warning-line">{searchResult.warning}</div>}
                {searchResult && !hasSearchResults && (
                  <div className="empty-search-state">
                    <Search size={24} />
                    <strong>没有找到匹配结果</strong>
                    <span>可以调整关键词，或绕过缓存重新搜索。</span>
                    <button className="secondary-button" type="button" onClick={() => runSearch(true)} disabled={searching}>
                      {searching ? <Loader2 className="spin" size={15} /> : <RefreshCcw size={15} />}
                      重新搜索
                    </button>
                  </div>
                )}

                <div className="result-section">
                  <h3>歌曲</h3>
                  <div className="result-list">
                    {(searchResult?.spotify.tracks ?? []).map(({ item, score }) => (
                      <article className="result-row" key={item.id}>
                        <img src={item.album.images?.[0]?.url ?? "/icon.svg"} alt="" />
                        <div className="result-main">
                          <div className="row-title">{item.name}</div>
                          <div className="row-meta">
                            {item.artists.map((artist, index) => (
                              <span key={artist.id}>
                                {index > 0 && ", "}
                                <button className="inline-artist-button" type="button" onClick={() => selectTrackArtist(artist)}>
                                  {artist.name}
                                </button>
                              </span>
                            ))}
                            <span> · {item.album.name}</span>
                          </div>
                        </div>
                        <div className="result-stats">
                          <span className="score">{confidencePercent(score)}</span>
                          <span className="track-duration">{formatDuration(item.duration_ms)}</span>
                        </div>
                        <div className="result-actions">
                          <button
                            className="icon-button"
                            onClick={() => openAddTrackDialog(item)}
                            disabled={addingTrackUri === item.uri || !status.spotifyConnected}
                            title="添加到歌单"
                          >
                            {addingTrackUri === item.uri ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                          </button>
                          <button className="icon-link" type="button" onClick={() => openTrackInSpotify(item)} title="在 Spotify 应用中打开">
                            <ExternalLink size={16} />
                          </button>
                        </div>
                      </article>
                    ))}
                    {searchResult && !searchResult.spotify.tracks.length && <div className="empty-compact">没有歌曲结果</div>}
                  </div>
                </div>

                <div className="result-section">
                  <h3>歌手</h3>
                  <div className="artist-list">
                    {(searchResult?.spotify.artists ?? []).map(({ item, score }) => (
                      <button className={`artist-row ${selectedArtist?.id === item.id ? "is-selected" : ""}`} key={item.id} onClick={() => selectArtist(item)}>
                        <img src={item.images?.[0]?.url ?? "/icon.svg"} alt="" />
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.genres?.slice(0, 3).join(", ") || "Spotify Artist"}</small>
                        </span>
                        <b>{confidencePercent(score)}</b>
                      </button>
                    ))}
                    {searchResult && !searchResult.spotify.artists.length && <div className="empty-compact">没有歌手结果</div>}
                  </div>
                </div>
              </div>

              <aside className="artist-pane" id="artist-pane">
                <div className="section-heading">
                  <div>
                    <h2>歌手页</h2>
                    <p>Spotify 元数据 / 外部中文资料</p>
                  </div>
                  {artistLoading && <Loader2 className="spin" size={18} />}
                </div>

                {selectedArtist ? (
                  <>
                    <div className="artist-hero">
                      <img src={selectedArtist.images?.[0]?.url ?? "/icon.svg"} alt="" />
                      <div className="artist-hero-main">
                        <div className="artist-title-row">
                          <h3>{selectedArtist.name}</h3>
                          <button className="icon-link" type="button" onClick={() => openArtistInSpotify(selectedArtist)} title="在 Spotify 应用中打开歌手">
                            <ExternalLink size={16} />
                          </button>
                        </div>
                        <p>{selectedArtist.genres?.slice(0, 4).join(" / ") || "Spotify Artist"}</p>
                      </div>
                    </div>
                    {(selectedArtist.popularity !== undefined || selectedArtist.followers?.total !== undefined) && (
                      <dl className="metric-list">
                        {selectedArtist.popularity !== undefined && (
                          <div>
                            <dt>热度</dt>
                            <dd>{selectedArtist.popularity}</dd>
                          </div>
                        )}
                        {selectedArtist.followers?.total !== undefined && (
                          <div>
                            <dt>关注者</dt>
                            <dd>{selectedArtist.followers.total.toLocaleString()}</dd>
                          </div>
                        )}
                      </dl>
                    )}

                    <div className="bio-block">
                      <h3>中文资料</h3>
                      <p>{artistEnrichment?.summary_zh ?? "加载中..."}</p>
                      {artistEnrichment?.aliases.length ? <div className="alias-line">{artistEnrichment.aliases.join(" / ")}</div> : null}
                      <CitationLinks citations={artistEnrichment?.citations ?? []} />
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <UserRound size={28} />
                    <span>选择歌手</span>
                  </div>
                )}
              </aside>
            </section>
          </>
        )}

        {showSettingsView && (
            <section className="settings-panel" id="settings">
              <div className="section-heading">
                <div>
                  <h2>设置</h2>
                  <p>凭证写入本地持久化目录</p>
                </div>
              </div>

              <div className="settings-grid">
                <form className="config-panel" onSubmit={saveSpotify}>
                  <h3>Spotify PKCE</h3>
                  <label>
                    Client ID
                    <input value={spotifyClientId} onChange={(event) => setSpotifyClientId(event.target.value)} />
                  </label>
                  <label>
                    Redirect URI
                    <input value={spotifyRedirectUri} onChange={(event) => setSpotifyRedirectUri(event.target.value)} />
                  </label>
                  <div className="button-row">
                    <button className="secondary-button" type="submit">
                      <Check size={15} />
                      保存
                    </button>
                    <a
                      className={`secondary-button ${status.spotifyConfigured ? "" : "is-disabled"}`}
                      href="/api/auth/spotify/login"
                      onClick={handleSpotifyLoginClick}
                    >
                      <ExternalLink size={15} />
                      {status.spotifyConnected ? "重新授权 Spotify" : "登录 Spotify"}
                    </a>
                  </div>
                </form>

                <form className="config-panel" onSubmit={saveCodex}>
                  <h3>Codex Responses</h3>
                  <div className="segmented-control" role="radiogroup" aria-label="Codex 调用方式">
                    <button
                      type="button"
                      className={codexProviderMode === "official" ? "is-selected" : ""}
                      aria-pressed={codexProviderMode === "official"}
                      onClick={() => setCodexProviderMode("official")}
                    >
                      官方登录
                    </button>
                    <button
                      type="button"
                      className={codexProviderMode === "custom" ? "is-selected" : ""}
                      aria-pressed={codexProviderMode === "custom"}
                      onClick={() => setCodexProviderMode("custom")}
                    >
                      第三方 API
                    </button>
                  </div>
                  {codexProviderMode === "official" && (
                    <p className="field-hint">使用容器内 Codex 官方登录状态发起请求，不写入 base_url 和 token。</p>
                  )}
                  <label>
                    model
                    <input value={codexModel} onChange={(event) => setCodexModel(event.target.value)} />
                  </label>
                  <label>
                    model_reasoning_effort
                    <select value={codexReasoningEffort} onChange={(event) => setCodexReasoningEffort(event.target.value)}>
                      <option value="minimal">minimal</option>
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                      <option value="xhigh">xhigh</option>
                    </select>
                  </label>
                  <label className="toggle-row">
                    <input type="checkbox" checked={codexFastMode} onChange={(event) => setCodexFastMode(event.target.checked)} />
                    <span>fast mode</span>
                  </label>
                  {codexProviderMode === "custom" && (
                    <>
                      <label>
                        base_url
                        <input
                          value={codexBaseUrl}
                          onChange={(event) => setCodexBaseUrl(event.target.value)}
                          placeholder="https://xxx.com/v1"
                        />
                      </label>
                      <label>
                        experimental_bearer_token
                        <input type="password" value={codexToken} onChange={(event) => setCodexToken(event.target.value)} />
                      </label>
                    </>
                  )}
                  <div className="button-row">
                    <button className="secondary-button" type="submit">
                      <Check size={15} />
                      保存
                    </button>
                    <button className="secondary-button" type="button" onClick={runCodexTest} disabled={testingCodex || !status.codexConfigured}>
                      {testingCodex ? <Loader2 className="spin" size={15} /> : <RefreshCcw size={15} />}
                      测试
                    </button>
                  </div>
                </form>

                <div className="config-panel playlist-panel">
                  <h3>默认歌单</h3>
                  <div className="playlist-toolbar">
                    <div className="compact-search">
                      <Search size={15} />
                      <input value={playlistSearch} onChange={(event) => setPlaylistSearch(event.target.value)} placeholder="搜索歌单" />
                    </div>
                    <button className="secondary-button" type="button" onClick={loadPlaylists} disabled={!status.spotifyConnected || playlistLoading}>
                      {playlistLoading ? <Loader2 className="spin" size={15} /> : <RefreshCcw size={15} />}
                      刷新
                    </button>
                  </div>
                  <div className="playlist-list">
                    {visiblePlaylists.map((playlist) => (
                      <button
                        key={playlist.id}
                        onClick={() => savePlaylist(playlist)}
                        className={status.targetPlaylist?.id === playlist.id ? "is-selected" : ""}
                        title={playlist.name}
                      >
                        <span>{playlist.name}</span>
                        <small>{playlist.tracks?.total ?? 0} 首</small>
                      </button>
                    ))}
                    {!visiblePlaylists.length && <div className="empty-compact">没有匹配的歌单</div>}
                  </div>
                </div>
              </div>
            </section>
        )}
      </section>

      {pendingAddTrack && (
        <div className="modal-backdrop" role="presentation">
          <section className="playlist-dialog" role="dialog" aria-modal="true" aria-labelledby="playlist-dialog-title">
            <div className="dialog-heading">
              <div>
                <h2 id="playlist-dialog-title">添加到歌单</h2>
                <p>{pendingAddTrack.name}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setPendingAddTrack(null)} aria-label="关闭">
                <X size={16} />
              </button>
            </div>

            <div className="compact-search">
              <Search size={15} />
              <input
                value={addPlaylistSearch}
                onChange={(event) => setAddPlaylistSearch(event.target.value)}
                placeholder="搜索歌单"
                autoFocus
              />
            </div>

            <div className="playlist-list dialog-playlist-list">
              {visibleAddPlaylists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  onClick={() => setSelectedPlaylistId(playlist.id)}
                  className={selectedPlaylistId === playlist.id ? "is-selected" : ""}
                  title={playlist.name}
                >
                  <span>
                    {playlist.name}
                    {status.targetPlaylist?.id === playlist.id && <b>默认</b>}
                  </span>
                  <small>{playlist.tracks?.total ?? 0} 首</small>
                </button>
              ))}
              {!visibleAddPlaylists.length && <div className="empty-compact">没有匹配的歌单</div>}
            </div>

            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setPendingAddTrack(null)}>
                取消
              </button>
              <button className="primary-button" type="button" onClick={addPendingTrack} disabled={!selectedAddPlaylist || addingTrackUri === pendingAddTrack.uri}>
                {addingTrackUri === pendingAddTrack.uri ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
                添加
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
