# Spotify Helper

一个单用户、自托管的 Spotify 辅助搜索工具。它运行在 NAS/Docker 中，用 Spotify Web API 管理搜索与歌单写入，并通过 Codex CLI + Responses 原生 `web_search` 做译名、别名、影视作品关联和歌手中文资料增强。

## 功能范围

- Spotify OAuth PKCE 登录，不需要 Client Secret。
- 搜索歌曲和歌手，支持 Codex web_search 先判断原名、译名、别名和作品关联。
- 歌曲一键加入指定 Spotify 歌单，添加前检查重复。
- 歌手页展示 Spotify 元数据，并单独展示外部网页来源的中文简介和引用。
- SQLite 持久化管理员密码 hash、Spotify token、目标歌单、搜索缓存和歌手资料缓存。
- Codex 配置写入容器专用 `/data/codex/config.toml`，不修改宿主机 `~/.codex`。

## 本地开发

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`，首次访问会进入管理员设置。

常用检查：

```bash
npm run typecheck
npm run test
npm run build
```

## Docker 部署

```bash
docker compose up --build
```

默认监听 `3000`，持久化目录为仓库下的 `./data`，容器内路径为 `/data`。

NAS 上建议把 `PUID`/`PGID` 改成拥有 `./data` 目录写权限的用户和用户组。常见 Linux/NAS 可以用 `id` 查看：

```bash
id
```

如果日志出现 `SQLITE_CANTOPEN` 或 `unable to open database file`，通常是宿主机挂载目录不可写。先在 compose 文件所在目录执行：

```bash
mkdir -p data
chown -R 1000:1000 data
```

如果你的 NAS 使用的不是 UID/GID `1000`，把命令和 `docker-compose.yml` 里的 `PUID`/`PGID` 改成实际值。镜像启动时会尽量自动修正 `/data` 权限；如果 NAS 文件系统不支持 `chown`，会检测写入能力并在必要时以 root fallback 启动。

手动构建 x86 镜像：

```bash
docker buildx build --platform linux/amd64 -t spotify-helper:local .
```

## Spotify 设置

在 Spotify Developer Dashboard 创建应用后，把 Redirect URI 设置为：

```text
http://你的NAS地址:3000/api/auth/spotify/callback
```

应用内填写 Client ID 和同一个 Redirect URI，然后点击登录 Spotify。

使用的 scopes：

- `playlist-read-private`
- `playlist-read-collaborative`
- `playlist-modify-private`
- `playlist-modify-public`
- `user-read-private`

## Codex / Responses 设置

应用设置页支持两种模式：

- 官方登录：使用容器内 `CODEX_HOME=/data/codex` 的 `auth.json`，保存后写入 Codex `config.toml`，请求时直接调用 `codex --search exec ...`。
- 第三方 API：写入 OpenAI Responses 兼容 provider 配置，请求路径与官方登录模式一致，仍由 Codex CLI 发起。

第三方 API 模式会写入：

```toml
model = "你的模型名"
model_reasoning_effort = "medium"
personality = "pragmatic"
service_tier = "fast"

model_provider = "custom"

[model_providers]
[model_providers.custom]
name = "custom"
wire_api = "responses"
requires_openai_auth = true
base_url = "https://xxx.com/v1"
experimental_bearer_token = "sk-..."

[features]
fast_mode = true
plugins = true
apps = true
hooks = true
terminal_resize_reflow = true
goals = true
js_repl = false
```

保存配置后会自动运行 canary；通过后增强搜索才会启用。

## 数据与安全

- 管理员会话使用 HttpOnly cookie。
- 会话 cookie 默认按实际访问协议自动设置 `Secure`：HTTP 可登录，HTTPS 或带 `x-forwarded-proto: https` 的反代会启用 Secure。需要强制覆盖时可设置 `SESSION_COOKIE_SECURE=true` 或 `SESSION_COOKIE_SECURE=false`。
- 敏感值在 SQLite 中加密保存；第三方 API 模式下 Codex CLI 所需 token 同时写入 `/data/codex/config.toml`，文件权限为 `0600`。
- Spotify API 返回的目录数据只用于展示、排序和歌单写入，不作为模型输入。
