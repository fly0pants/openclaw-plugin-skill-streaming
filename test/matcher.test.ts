import { describe, it, expect } from "vitest";
import { matchStep, detectSkillFromPrompt } from "../src/matcher.js";
import type { StreamingConfig, PluginHookBeforeToolCallEvent } from "../src/types.js";

describe("matchStep", () => {
  const config: StreamingConfig = {
    steps: [
      { match: "api.admapix.com/api/data/search", label: "搜索广告素材" },
      { match: "api.admapix.com/api/data/product", label: "获取应用详情" },
      { match: "research/async", label: "深度分析", long_running: true, poll_interval: 15000 },
    ],
  };

  it("matches a declared step by URL includes", () => {
    const event: PluginHookBeforeToolCallEvent = {
      toolName: "bash",
      params: { command: 'curl -s -X POST "https://api.admapix.com/api/data/search"' },
    };
    const result = matchStep(event, config);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("搜索广告素材");
    expect(result!.totalSteps).toBe(3);
  });

  it("matches long_running step", () => {
    const event: PluginHookBeforeToolCallEvent = {
      toolName: "bash",
      params: { command: 'curl "http://47.236.184.176:8100/research/async"' },
    };
    const result = matchStep(event, config);
    expect(result!.label).toBe("深度分析");
    expect(result!.longRunning).toBe(true);
    expect(result!.pollInterval).toBe(15000);
  });

  it("returns null when no match", () => {
    const event: PluginHookBeforeToolCallEvent = {
      toolName: "bash",
      params: { command: "echo hello" },
    };
    expect(matchStep(event, config)).toBeNull();
  });

  it("returns null when config has no steps", () => {
    expect(matchStep({ toolName: "bash", params: { command: "curl https://example.com" } }, {})).toBeNull();
  });

  it("returns null when config is undefined", () => {
    expect(matchStep({ toolName: "bash", params: { command: "curl https://example.com" } }, undefined)).toBeNull();
  });
});

describe("detectSkillFromPrompt", () => {
  it("detects skill name from # Skill: header", () => {
    const prompt = "You are an assistant.\n\n# Skill: admapix\nprimaryEnv: ADMAPIX_API_KEY\n...";
    expect(detectSkillFromPrompt(prompt)).toBe("admapix");
  });

  it("detects skill name from YAML frontmatter name field", () => {
    const prompt = "Some system prompt.\n---\nname: weather\ndescription: Get weather info\n---";
    expect(detectSkillFromPrompt(prompt)).toBe("weather");
  });

  it("detects skill from primaryEnv alone", () => {
    const prompt = "System prompt with primaryEnv: SOME_KEY embedded somewhere";
    expect(detectSkillFromPrompt(prompt)).not.toBeNull();
  });

  it("returns null for prompts without skill markers", () => {
    expect(detectSkillFromPrompt("You are a helpful assistant.")).toBeNull();
  });

  it("returns null for undefined prompt", () => {
    expect(detectSkillFromPrompt(undefined)).toBeNull();
  });
});
