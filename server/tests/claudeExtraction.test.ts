import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("claudeExtraction", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reports not configured when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { isClaudeConfigured } = await import("../src/lib/claudeExtraction.js");
    expect(isClaudeConfigured()).toBe(false);
  });

  it("reports configured once ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const { isClaudeConfigured } = await import("../src/lib/claudeExtraction.js");
    expect(isClaudeConfigured()).toBe(true);
  });

  it("extractExpenseFromDocument rejects unsupported file types before ever calling the API", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const { extractExpenseFromDocument } = await import("../src/lib/claudeExtraction.js");
    await expect(extractExpenseFromDocument(Buffer.from("not a real file"), "text/plain")).rejects.toThrow(
      "Unsupported file type"
    );
  });

  it("extractExpenseFromText throws a clear error when the API key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { extractExpenseFromText } = await import("../src/lib/claudeExtraction.js");
    await expect(extractExpenseFromText("Bought diesel for R450")).rejects.toThrow(
      "ANTHROPIC_API_KEY is not configured"
    );
  });
});
