import { describe, it, expect } from "vitest";
import { parseStreamingConfig } from "../src/config-loader.js";

describe("parseStreamingConfig", () => {
  it("extracts streaming config from SKILL.md frontmatter", () => {
    const content = `---
name: admapix
description: Ad creative search
metadata:
  openclaw:
    emoji: "\uD83C\uDFAF"
    primaryEnv: ADMAPIX_API_KEY
    streaming:
      steps:
        - match: "api.admapix.com/api/data/search"
          label: "搜索广告素材"
        - match: "research/async"
          label: "深度分析"
          long_running: true
          poll_interval: 15000
      summary: true
      locale: auto
---
# Admapix Skill`;
    const config = parseStreamingConfig(content);
    expect(config).not.toBeNull();
    expect(config!.steps).toHaveLength(2);
    expect(config!.steps![0].match).toBe("api.admapix.com/api/data/search");
    expect(config!.steps![0].label).toBe("搜索广告素材");
    expect(config!.steps![1].long_running).toBe(true);
    expect(config!.summary).toBe(true);
  });

  it("returns null when no streaming config", () => {
    const content = `---
name: weather
description: Get weather
metadata:
  openclaw:
    emoji: "\u2600\uFE0F"
---
# Weather`;
    expect(parseStreamingConfig(content)).toBeNull();
  });

  it("returns null for content without frontmatter", () => {
    expect(parseStreamingConfig("# Just a markdown file")).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(parseStreamingConfig("")).toBeNull();
  });
});
