import { describe, it, expect } from "vitest";
import { parseSessionKey, parseTarget } from "../src/sender.js";

describe("parseSessionKey", () => {
  it("parses standard session key", () => {
    const result = parseSessionKey("agent:main:telegram:default:direct:123456");
    expect(result).toEqual({ agentId: "main", rest: "telegram:default:direct:123456" });
  });

  it("parses webchat session key", () => {
    const result = parseSessionKey("agent:main:main");
    expect(result).toEqual({ agentId: "main", rest: "main" });
  });

  it("returns null for empty string", () => {
    expect(parseSessionKey("")).toBeNull();
  });

  it("returns null for non-agent prefix", () => {
    expect(parseSessionKey("cron:daily:task")).toBeNull();
  });

  it("returns null for too few parts", () => {
    expect(parseSessionKey("agent:main")).toBeNull();
  });
});

describe("parseTarget", () => {
  it("extracts Telegram DM target", () => {
    const result = parseTarget("agent:main:telegram:default:direct:123456");
    expect(result).toEqual({ channel: "telegram", accountId: "default", peerId: "123456" });
  });

  it("extracts Discord channel target", () => {
    const result = parseTarget("agent:main:discord:default:guild-abc:channel-def");
    expect(result).toEqual({ channel: "discord", accountId: "default", peerId: "channel-def" });
  });

  it("extracts Feishu DM target", () => {
    const result = parseTarget("agent:main:feishu:default:direct:user789");
    expect(result).toEqual({ channel: "feishu", accountId: "default", peerId: "user789" });
  });

  it("returns null for webchat session (main)", () => {
    expect(parseTarget("agent:main:main")).toBeNull();
  });

  it("returns null for empty/malformed key", () => {
    expect(parseTarget("")).toBeNull();
    expect(parseTarget("not-a-session-key")).toBeNull();
  });
});
