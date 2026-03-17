import { describe, it, expect } from "vitest";
import { extractLabel } from "../src/label.js";

describe("extractLabel", () => {
  it("extracts domain+path from curl command", () => {
    const result = extractLabel({
      toolName: "bash",
      params: { command: 'curl -s -X POST "https://api.admapix.com/api/data/search" -H "Content-Type: application/json"' },
    });
    expect(result).toBe("Querying api.admapix.com/api/data/search");
  });

  it("handles curl with single-quoted URL", () => {
    const result = extractLabel({
      toolName: "bash",
      params: { command: "curl -s 'https://example.com/api/v1/users'" },
    });
    expect(result).toBe("Querying example.com/api/v1/users");
  });

  it("falls back to truncated command for non-curl bash", () => {
    const result = extractLabel({
      toolName: "bash",
      params: { command: "python analyze.py --input data.json --output result.json --verbose" },
    });
    expect(result).toBe("Running: python analyze.py --input data.json --output ...");
  });

  it("handles curl with query parameters", () => {
    const result = extractLabel({
      toolName: "bash",
      params: { command: 'curl "https://api.example.com/search?q=test&page=1"' },
    });
    expect(result).toBe("Querying api.example.com/search");
  });

  it("handles short bash commands without truncation", () => {
    const result = extractLabel({
      toolName: "bash",
      params: { command: "ls -la" },
    });
    expect(result).toBe("Running: ls -la");
  });

  it("returns tool name for non-bash tools", () => {
    const result = extractLabel({
      toolName: "web_search",
      params: { query: "test" },
    });
    expect(result).toBe("Executing: web_search");
  });

  it("handles malformed URL in curl gracefully", () => {
    const result = extractLabel({
      toolName: "bash",
      params: { command: "curl http://not a valid url here" },
    });
    expect(result).toMatch(/^(Querying|Running:)/);
  });

  it("handles missing command param", () => {
    const result = extractLabel({
      toolName: "bash",
      params: {},
    });
    expect(result).toBe("Running: ");
  });

  it("handles shell tool name", () => {
    const result = extractLabel({
      toolName: "shell",
      params: { command: "echo hello" },
    });
    expect(result).toBe("Running: echo hello");
  });
});
