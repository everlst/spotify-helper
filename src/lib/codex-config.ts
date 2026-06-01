import { chmodSync, writeFileSync } from "node:fs";
import { codexPath } from "@/lib/paths";

export type CodexConfigInput = {
  providerMode: "official" | "custom";
  baseUrl?: string;
  bearerToken?: string;
  model: string;
  reasoningEffort: string;
  fastMode: boolean;
};

function tomlString(value: string) {
  return JSON.stringify(value);
}

export function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed.startsWith("https://") && !trimmed.startsWith("http://")) {
    throw new Error("base_url 必须以 http:// 或 https:// 开头");
  }
  return trimmed;
}

export function renderCodexConfig(input: CodexConfigInput) {
  const providerMode = input.providerMode;
  const model = input.model.trim();
  const reasoningEffort = input.reasoningEffort.trim();

  if (!model) {
    throw new Error("model 不能为空");
  }
  if (!reasoningEffort) {
    throw new Error("model_reasoning_effort 不能为空");
  }

  const baseConfig = [
    `model = ${tomlString(model)}`,
    `model_reasoning_effort = ${tomlString(reasoningEffort)}`,
    `personality = "pragmatic"`,
    ...(input.fastMode ? [`service_tier = "fast"`] : []),
    ``
  ];
  const featuresConfig = [
    `[features]`,
    `fast_mode = ${input.fastMode ? "true" : "false"}`,
    `plugins = true`,
    `apps = true`,
    `hooks = true`,
    `terminal_resize_reflow = true`,
    `goals = true`,
    `js_repl = false`,
    ``
  ];

  if (providerMode === "official") {
    return [...baseConfig, ...featuresConfig].join("\n");
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl ?? "");
  const bearerToken = (input.bearerToken ?? "").trim();

  if (!bearerToken) {
    throw new Error("experimental_bearer_token 不能为空");
  }

  return [
    ...baseConfig,
    `model_provider = "custom"`,
    ``,
    `[model_providers]`,
    `[model_providers.custom]`,
    `name = "custom"`,
    `wire_api = "responses"`,
    `requires_openai_auth = true`,
    `base_url = ${tomlString(baseUrl)}`,
    `experimental_bearer_token = ${tomlString(bearerToken)}`,
    ``,
    ...featuresConfig
  ].join("\n");
}

export function writeCodexConfig(input: CodexConfigInput) {
  const configPath = codexPath("config.toml");
  writeFileSync(configPath, renderCodexConfig(input), { mode: 0o600 });
  chmodSync(configPath, 0o600);
  return configPath;
}
