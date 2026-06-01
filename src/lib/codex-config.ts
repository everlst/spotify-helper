import { chmodSync, writeFileSync } from "node:fs";
import { codexPath } from "@/lib/paths";

export type CodexConfigInput = {
  baseUrl: string;
  bearerToken: string;
  model: string;
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
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const model = input.model.trim();
  const bearerToken = input.bearerToken.trim();

  if (!model) {
    throw new Error("model 不能为空");
  }
  if (!bearerToken) {
    throw new Error("experimental_bearer_token 不能为空");
  }

  return [
    `model_provider = "custom"`,
    `model = ${tomlString(model)}`,
    `personality = "pragmatic"`,
    ``,
    `[model_providers]`,
    `[model_providers.custom]`,
    `name = "custom"`,
    `wire_api = "responses"`,
    `requires_openai_auth = true`,
    `base_url = ${tomlString(baseUrl)}`,
    `experimental_bearer_token = ${tomlString(bearerToken)}`,
    ``
  ].join("\n");
}

export function writeCodexConfig(input: CodexConfigInput) {
  const configPath = codexPath("config.toml");
  writeFileSync(configPath, renderCodexConfig(input), { mode: 0o600 });
  chmodSync(configPath, 0o600);
  return configPath;
}
