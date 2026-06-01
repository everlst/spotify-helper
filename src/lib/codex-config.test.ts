import { describe, expect, it } from "vitest";
import { renderCodexConfig } from "@/lib/codex-config";

describe("renderCodexConfig", () => {
  it("renders a Responses custom provider config", () => {
    const config = renderCodexConfig({
      baseUrl: "https://example.com/v1/",
      bearerToken: "sk-test",
      model: "gpt-test"
    });

    expect(config).toContain('model_provider = "custom"');
    expect(config).toContain('wire_api = "responses"');
    expect(config).toContain('base_url = "https://example.com/v1"');
    expect(config).toContain('experimental_bearer_token = "sk-test"');
    expect(config).toContain('model = "gpt-test"');
  });
});
