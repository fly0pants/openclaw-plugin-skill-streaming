import type { RunState, Locale } from "./types.js";
import { createRunState, pushStep, finishCurrentStep, clearAllTimers, createCleanupInterval } from "./state.js";
import { extractLabel } from "./label.js";
import { matchStep } from "./matcher.js";
import { parseStreamingConfig } from "./config-loader.js";
import { formatStepStart, formatStepDone, formatStillWorking, formatSummary } from "./formatter.js";
import { readFileSync } from "node:fs";

type OpenClawPluginApi = {
  runtime: any;
  config: any;
  pluginConfig?: Record<string, unknown>;
  resolvePath: (input: string) => string;
  on: (hookName: string, handler: (...args: any[]) => any, opts?: { priority?: number }) => void;
};

type OpenClawPluginDefinition = {
  register?: (api: OpenClawPluginApi) => void | Promise<void>;
};

function resolveLocale(pluginConfig?: Record<string, unknown>): Locale {
  const val = pluginConfig?.locale;
  if (val === "zh" || val === "en") return val;
  return "auto";
}

function resolveEffectiveLocale(locale: Locale): "en" | "zh" {
  if (locale === "zh" || locale === "en") return locale;
  return "en";
}

const skillConfigCache = new Map<string, ReturnType<typeof parseStreamingConfig>>();

function loadSkillConfig(skillName: string, resolvePath: (s: string) => string) {
  if (skillConfigCache.has(skillName)) return skillConfigCache.get(skillName)!;
  try {
    const skillDir = resolvePath(`~/.openclaw/skills/${skillName}/SKILL.md`);
    const content = readFileSync(skillDir, "utf-8");
    const config = parseStreamingConfig(content);
    skillConfigCache.set(skillName, config);
    return config;
  } catch {
    skillConfigCache.set(skillName, null);
    return null;
  }
}

type InboundCtx = {
  channelId: string;
  accountId: string;
  conversationId: string;
  senderId: string;
};

// Feishu direct API sender (since feishu plugin doesn't register on runtime.channel)
let feishuTokenCache: { token: string; expiresAt: number } | null = null;

async function getFeishuToken(appId: string, appSecret: string): Promise<string | null> {
  if (feishuTokenCache && Date.now() < feishuTokenCache.expiresAt) {
    return feishuTokenCache.token;
  }
  try {
    const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const data = await res.json() as any;
    if (data.tenant_access_token) {
      feishuTokenCache = {
        token: data.tenant_access_token,
        expiresAt: Date.now() + (data.expire - 300) * 1000, // refresh 5 min early
      };
      return data.tenant_access_token;
    }
  } catch (err: any) {
    console.log("[skill-streaming] feishu token error:", err?.message);
  }
  return null;
}

async function sendFeishuDirect(
  config: any,
  conversationId: string,
  text: string,
  accountId: string,
): Promise<void> {
  const feishuCfg = config?.channels?.feishu;
  const account = feishuCfg?.accounts?.[accountId] ?? feishuCfg?.accounts?.main;
  if (!account?.appId || !account?.appSecret) {
    console.log("[skill-streaming] feishu: no app credentials found");
    return;
  }

  const token = await getFeishuToken(account.appId, account.appSecret);
  if (!token) return;

  // Parse conversationId to determine target type
  let receiveId: string;
  let receiveIdType: string;
  if (conversationId.startsWith("user:")) {
    receiveId = conversationId.slice(5);
    receiveIdType = "open_id";
  } else if (conversationId.startsWith("group:")) {
    receiveId = conversationId.slice(6);
    receiveIdType = "chat_id";
  } else {
    receiveId = conversationId;
    receiveIdType = conversationId.startsWith("oc_") ? "chat_id" : "open_id";
  }

  const content = JSON.stringify({ text });
  try {
    const res = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: receiveId,
          content,
          msg_type: "text",
        }),
      },
    );
    const result = await res.json() as any;
    if (result.code !== 0) {
      console.log("[skill-streaming] feishu send error:", result.code, result.msg);
    }
  } catch (err: any) {
    console.log("[skill-streaming] feishu send fetch error:", err?.message);
  }
}

const plugin: OpenClawPluginDefinition = {
  register(api) {
    const runtime = api.runtime;
    const pluginConfig = api.pluginConfig;
    const runStates = new Map<string, RunState>();
    const activeSkills = new Map<string, string | null>();
    const locale = resolveLocale(pluginConfig);

    let latestInbound: InboundCtx | null = null;
    const inboundBySession = new Map<string, InboundCtx>();

    const enabled = pluginConfig?.enabled !== false;
    if (!enabled) return;

    createCleanupInterval(runStates, 60_000, 600_000);

    // Capture inbound message context for reply routing
    api.on("message_received", (event: any, ctx: any) => {
      const channelId = ctx?.channelId ?? "";
      const accountId = ctx?.accountId ?? "main";
      const conversationId = ctx?.conversationId ?? "";
      const senderId = event?.metadata?.senderId ?? "";

      latestInbound = { channelId, accountId, conversationId, senderId };
    });

    // Detect skill from system prompt
    api.on("llm_input", (event: any, ctx: any) => {
      const key = ctx?.sessionKey;
      if (!key) return;

      if (latestInbound) {
        inboundBySession.set(key, latestInbound);
      }

      const sp = event.systemPrompt ?? "";
      const skillHeader = sp.match(/^#\s*Skill:\s*(\S+)/m);
      if (skillHeader) {
        activeSkills.set(key, skillHeader[1].toLowerCase());
        return;
      }
      if (sp.includes("<available_skills>")) {
        if (!activeSkills.has(key)) {
          activeSkills.set(key, "__has_skills__");
        }
      }
    });

    // Send progress message using captured channel context
    function sendProgressMsg(sessionKey: string, message: string) {
      const ib = inboundBySession.get(sessionKey);
      if (!ib) return;

      const ch = ib.channelId;
      const target = ib.conversationId;

      // For feishu: use direct HTTP API (feishu plugin doesn't register on runtime.channel)
      if (ch === "feishu") {
        sendFeishuDirect(api.config, target, message, ib.accountId).catch(() => {});
        return;
      }

      // For other channels: use runtime.channel send functions
      const sender = runtime.channel?.[ch];
      const sendFnName = `sendMessage${ch.charAt(0).toUpperCase()}${ch.slice(1)}`;
      const sendFn = sender?.[sendFnName];

      if (typeof sendFn === "function") {
        sendFn(target, message, { accountId: ib.accountId }).catch(() => {});
      }
    }

    // Before tool call — detect skill + send progress
    api.on("before_tool_call", (event: any, ctx: any) => {
      const key = ctx?.sessionKey ?? "";

      if (event.toolName === "read" && typeof event.params?.path === "string" && event.params.path.includes("SKILL.md")) {
        const pathMatch = event.params.path.match(/skills\/([^/]+)\/SKILL\.md/);
        if (pathMatch) {
          activeSkills.set(key, pathMatch[1].toLowerCase());
        }
        return;
      }

      const skillMarker = activeSkills.get(key);
      if (!skillMarker) return;
      if (event.toolName === "read" || event.toolName === "write" || event.toolName === "edit") return;

      const skillName = skillMarker === "__has_skills__" ? "unknown" : skillMarker;

      let state = runStates.get(key);
      if (!state) {
        const skillConfig = (skillName !== "unknown" ? loadSkillConfig(skillName, api.resolvePath) : null) ?? undefined;
        state = createRunState(key, skillName, skillConfig);
        runStates.set(key, state);
      }

      const match = matchStep(event, state.skillConfig);
      const label = match?.label ?? extractLabel(event);
      const step = pushStep(state, label, {
        longRunning: match?.longRunning,
        pollInterval: match?.pollInterval,
      });

      const totalSteps = match?.totalSteps ?? state.totalSteps;
      const eff = resolveEffectiveLocale(locale);
      sendProgressMsg(key, formatStepStart(step, totalSteps, eff));

      if (step.longRunning) {
        const longRunningMs = Number(pluginConfig?.longRunningMs) || 15_000;
        step.timer = setInterval(() => {
          sendProgressMsg(key, formatStillWorking(step, eff));
        }, step.pollInterval ?? longRunningMs);
      }
    });

    // After tool call
    api.on("after_tool_call", (event: any, ctx: any) => {
      const key = ctx?.sessionKey ?? "";
      const state = runStates.get(key);
      if (!state) return;

      const step = finishCurrentStep(state, event.error);
      if (step.timer) clearInterval(step.timer);

      const eff = resolveEffectiveLocale(locale);
      sendProgressMsg(key, formatStepDone(step, state.totalSteps, event.durationMs, eff));
    });

    // Agent end
    api.on("agent_end", (_event: any, ctx: any) => {
      const key = ctx?.sessionKey ?? "";
      const state = runStates.get(key);
      if (!state) return;

      const summaryEnabled = pluginConfig?.summaryEnabled !== false;
      if (summaryEnabled && state.steps.length > 1) {
        const eff = resolveEffectiveLocale(locale);
        sendProgressMsg(key, formatSummary(state, eff));
      }
      clearAllTimers(state);
      runStates.delete(key);
      activeSkills.delete(key);
    });
  },
};

export default plugin;
