import { describe, expect, it } from "vitest";
import { renderCodexConfig } from "@/lib/codex-config";

describe("renderCodexConfig", () => {
  it("renders a Responses custom provider config", () => {
    const config = renderCodexConfig({
      providerMode: "custom",
      baseUrl: "https://example.com/v1/",
      bearerToken: "sk-test",
      model: "gpt-test",
      reasoningEffort: "high",
      fastMode: true
    });

    expect(config).toContain('model = "gpt-test"');
    expect(config).toContain('model_reasoning_effort = "high"');
    expect(config).toContain('service_tier = "fast"');
    expect(config).toContain('model_provider = "custom"');
    expect(config).toContain('wire_api = "responses"');
    expect(config).toContain("requires_openai_auth = true");
    expect(config).toContain('base_url = "https://example.com/v1"');
    expect(config).toContain('experimental_bearer_token = "sk-test"');
    expect(config).toContain("[features]");
    expect(config).toContain("fast_mode = true");
    expect(config).toContain("plugins = true");
  });

  it("renders an official Codex login config without custom provider credentials", () => {
    const config = renderCodexConfig({
      providerMode: "official",
      model: "gpt-5.5",
      reasoningEffort: "medium",
      fastMode: false
    });

    expect(config).toContain('model = "gpt-5.5"');
    expect(config).toContain('model_reasoning_effort = "medium"');
    expect(config).toContain('personality = "pragmatic"');
    expect(config).not.toContain('service_tier = "fast"');
    expect(config).toContain("[features]");
    expect(config).toContain("fast_mode = false");
    expect(config).not.toContain("base_url");
    expect(config).not.toContain("experimental_bearer_token");
    expect(config).not.toContain("[model_providers.custom]");
  });
});
