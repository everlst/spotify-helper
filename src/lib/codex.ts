import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CODEX_HOME } from "@/lib/paths";
import { getCodexProviderMode } from "@/lib/app-state";
import {
  codexArtistEnrichmentSchema,
  codexCanarySchema,
  codexSearchSchema
} from "@/lib/codex-schemas";

export type Citation = {
  title: string;
  url: string;
};

export type CodexSearchCandidate = {
  kind: "artist" | "track";
  spotify_query: string;
  display_name_guess: string;
  aliases: string[];
  related_works: string[];
  confidence: number;
  reason_zh: string;
  citations: Citation[];
};

export type CodexSearchEnhancement = {
  intent: "artist" | "track" | "mixed" | "unknown";
  target_language: string;
  normalized_query: string;
  summary_zh: string;
  citations: Citation[];
  candidates: CodexSearchCandidate[];
};

export type ArtistEnrichment = {
  artist_name: string;
  summary_zh: string;
  aliases: string[];
  source_language: string;
  citations: Citation[];
};

export type CodexCanary = {
  ok: boolean;
  web_search_observed: boolean;
  note_zh: string;
  citations: Citation[];
};

type RunOptions<T> = {
  prompt: string;
  schema: object;
  timeoutMs?: number;
  label: string;
  fallback?: T;
};

const DEFAULT_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS ?? 300_000);

function stripCodexNoise(output: string) {
  return output
    .split("\n")
    .filter((line) => {
      if (line.includes("codex_core_plugins")) {
        return false;
      }
      if (line.includes("startup_remote_sync")) {
        return false;
      }
      if (line.includes("chatgpt authentication required")) {
        return false;
      }
      if (line.includes("plugins/featured failed with status 401")) {
        return false;
      }
      return true;
    })
    .join("\n")
    .trim();
}

function formatCodexFailure(label: string, code: number | null, stdout: string, stderr: string) {
  const diagnostics = stripCodexNoise(stderr || stdout);
  const normalizedDiagnostics = diagnostics.toLowerCase();
  if (
    getCodexProviderMode() === "official" &&
    (normalizedDiagnostics.includes("authentication") ||
      normalizedDiagnostics.includes("unauthorized") ||
      normalizedDiagnostics.includes("login"))
  ) {
    return `Codex ${label} 需要先完成官方登录。请确认容器内 CODEX_HOME 已有有效 Codex 登录态，然后重新测试。`;
  }
  if (diagnostics.includes("stream disconnected")) {
    return `Codex ${label} 连接 Responses provider 时流式响应中断。请确认 base_url 指向 OpenAI 兼容 API 根路径（通常需要包含 /v1），model 在该 provider 中可用，并且 provider 支持 Responses API 的流式输出与原生 web_search。`;
  }
  return `Codex ${label} exited with ${code}: ${diagnostics || "没有可用诊断输出"}`;
}

function parseJsonMessage<T>(message: string): T {
  const trimmed = message.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const raw = fenced ? fenced[1] : trimmed;
  return JSON.parse(raw) as T;
}

function observedWebSearch(stdout: string) {
  return stdout.split("\n").some((line) => {
    if (!line.trim()) {
      return false;
    }

    try {
      const event = JSON.parse(line) as { type?: string; item?: { type?: string; action?: { type?: string } } };
      return event.item?.type === "web_search" && event.item.action?.type === "search";
    } catch {
      return false;
    }
  });
}

async function runCodexStructured<T>({ prompt, schema, timeoutMs = DEFAULT_TIMEOUT_MS, label }: RunOptions<T>) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `spotify-helper-${label}-`));
  const outputPath = path.join(tempDir, "last-message.json");
  const structuredPrompt = `
${prompt}

输出要求：
- 只返回一个 JSON 对象，不要 Markdown，不要代码块，不要额外解释。
- JSON 必须匹配下面的 JSON Schema：
${JSON.stringify(schema, null, 2)}
`.trim();

  const args = [
    "--search",
    "--ask-for-approval",
    "never",
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--ignore-rules",
    "--sandbox",
    "read-only",
    "--json",
    "--output-last-message",
    outputPath,
    "-C",
    tempDir,
    "-"
  ];

  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("codex", args, {
        env: {
          ...process.env,
          CODEX_HOME,
          NO_COLOR: "1"
        },
        stdio: ["pipe", "pipe", "pipe"]
      });

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Codex ${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        if (stdout.length > 100_000) {
          stdout = stdout.slice(-100_000);
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 20_000) {
          stderr = stderr.slice(-20_000);
        }
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(formatCodexFailure(label, code, stdout, stderr)));
        }
      });

      child.stdin.end(structuredPrompt);
    });

    const finalMessage = await readFile(outputPath, "utf8");
    return {
      data: parseJsonMessage<T>(finalMessage),
      durationMs: Date.now() - startedAt,
      webSearchObserved: observedWebSearch(stdout)
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function enhanceSearchQuery(query: string) {
  const prompt = `
你是 Spotify 搜索辅助工具的查询解析器。必须使用 Responses 原生 web_search 查证用户输入可能对应的歌曲、歌手、译名、别名、日文/中文繁简写法、罗马音、影视/动画/游戏作品关联。

约束：
- 目标语言为简体中文。
- 只根据用户输入和公开网页来源推断，不要假装访问 Spotify 内部数据。
- 输出给 Spotify Web API 的查询词应尽量使用 Spotify 可能收录的原名或常见正式名。
- 如果不确定，给出多个候选并降低 confidence。
- citations 只放真实网页 URL。

用户输入：${JSON.stringify(query)}
`.trim();

  return runCodexStructured<CodexSearchEnhancement>({
    prompt,
    schema: codexSearchSchema,
    label: "search"
  });
}

export async function enrichArtist(artistName: string) {
  const prompt = `
你是音乐资料翻译与摘要助手。必须使用 Responses 原生 web_search 查证歌手资料，然后用简体中文输出简介。

约束：
- 只总结公开网页来源，不要声称内容来自 Spotify。
- 关注：艺名原文、常见中文译名/别名、国家/地区、音乐风格、代表性关联作品或项目。
- 保持简洁，避免无来源的传闻。
- citations 只放真实网页 URL。

歌手名称：${JSON.stringify(artistName)}
`.trim();

  return runCodexStructured<ArtistEnrichment>({
    prompt,
    schema: codexArtistEnrichmentSchema,
    label: "artist"
  });
}

export async function testCodexWebSearch() {
  const prompt = `
请使用 web_search 查询 Spotify Web API 官方文档首页。
如果查询成功，ok=true 且 web_search_observed=true。
citations 必须包含 Spotify Web API 官方文档首页 URL。
note_zh 用一句简体中文说明结果。
`.trim();

  const result = await runCodexStructured<CodexCanary>({
    prompt,
    schema: codexCanarySchema,
    timeoutMs: Number(process.env.CODEX_CANARY_TIMEOUT_MS ?? 300_000),
    label: "canary"
  });

  if (result.webSearchObserved) {
    result.data.web_search_observed = true;
    if (result.data.citations.length > 0) {
      result.data.ok = true;
      if (/无法调用|未观察到|不能调用/.test(result.data.note_zh)) {
        result.data.note_zh = "已通过 Codex 事件流观测到 web_search 调用，并返回了公开网页引用。";
      }
    }
  }

  return result;
}
