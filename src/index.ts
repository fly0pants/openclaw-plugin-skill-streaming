import type { RunState, Locale } from "./types.js";
import { createRunState, pushStep, finishCurrentStep, clearAllTimers, createCleanupInterval } from "./state.js";
import { extractLabel } from "./label.js";
import { matchStep } from "./matcher.js";
import { parseStreamingConfig } from "./config-loader.js";
import { formatProgressView } from "./formatter.js";
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

// ---- Feishu direct API (feishu plugin doesn't register on runtime.channel) ----

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
        expiresAt: Date.now() + (data.expire - 300) * 1000,
      };
      return data.tenant_access_token;
    }
  } catch (err: any) {
    console.log("[skill-streaming] feishu token error:", err?.message);
  }
  return null;
}

function resolveFeishuTarget(conversationId: string): { receiveId: string; receiveIdType: string } {
  if (conversationId.startsWith("user:")) {
    return { receiveId: conversationId.slice(5), receiveIdType: "open_id" };
  }
  if (conversationId.startsWith("group:")) {
    return { receiveId: conversationId.slice(6), receiveIdType: "chat_id" };
  }
  return {
    receiveId: conversationId,
    receiveIdType: conversationId.startsWith("oc_") ? "chat_id" : "open_id",
  };
}

function buildFeishuCard(text: string): string {
  return JSON.stringify({
    config: { wide_screen_mode: true },
    elements: [
      { tag: "markdown", content: text },
    ],
  });
}

async function createFeishuMessage(
  config: any, conversationId: string, text: string, accountId: string,
): Promise<string | null> {
  const feishuCfg = config?.channels?.feishu;
  const account = feishuCfg?.accounts?.[accountId] ?? feishuCfg?.accounts?.main;
  if (!account?.appId || !account?.appSecret) return null;

  const token = await getFeishuToken(account.appId, account.appSecret);
  if (!token) return null;

  const { receiveId, receiveIdType } = resolveFeishuTarget(conversationId);
  try {
    const res = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          receive_id: receiveId,
          content: buildFeishuCard(text),
          msg_type: "interactive",
        }),
      },
    );
    const result = await res.json() as any;
    if (result.code === 0) return result.data?.message_id ?? null;
    console.log("[skill-streaming] feishu create error:", result.code, result.msg);
  } catch (err: any) {
    console.log("[skill-streaming] feishu create fetch error:", err?.message);
  }
  return null;
}

async function updateFeishuMessage(
  config: any, messageId: string, text: string, accountId: string,
): Promise<void> {
  const feishuCfg = config?.channels?.feishu;
  const account = feishuCfg?.accounts?.[accountId] ?? feishuCfg?.accounts?.main;
  if (!account?.appId || !account?.appSecret) return;

  const token = await getFeishuToken(account.appId, account.appSecret);
  if (!token) return;

  try {
    const res = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: buildFeishuCard(text), msg_type: "interactive" }),
      },
    );
    const result = await res.json() as any;
    if (result.code !== 0) {
      console.log("[skill-streaming] feishu update error:", result.code, result.msg);
    }
  } catch (err: any) {
    console.log("[skill-streaming] feishu update fetch error:", err?.message);
  }
}

// ---- Queued message sender to avoid race conditions ----

type MsgQueue = {
  messageId: string | null;  // null until first create resolves
  creating: boolean;         // true while waiting for create to return
  pending: string | null;    // latest text waiting to be sent after create
};

// ---- Plugin ----

const plugin: OpenClawPluginDefinition = {
  register(api) {
    const runtime = api.runtime;
    const pluginConfig = api.pluginConfig;
    const runStates = new Map<string, RunState>();
    const activeSkills = new Map<string, string | null>();
    const locale = resolveLocale(pluginConfig);

    let latestInbound: InboundCtx | null = null;
    const inboundBySession = new Map<string, InboundCtx>();
    const msgQueues = new Map<string, MsgQueue>();

    const enabled = pluginConfig?.enabled !== false;
    if (!enabled) return;

    createCleanupInterval(runStates, 60_000, 600_000);

    api.on("message_received", (event: any, ctx: any) => {
      const channelId = ctx?.channelId ?? "";
      const accountId = ctx?.accountId ?? "main";
      const conversationId = ctx?.conversationId ?? "";
      const senderId = event?.metadata?.senderId ?? "";
      latestInbound = { channelId, accountId, conversationId, senderId };
    });

    api.on("llm_input", (event: any, ctx: any) => {
      const key = ctx?.sessionKey;
      if (!key) return;
      if (latestInbound) inboundBySession.set(key, latestInbound);

      const sp = event.systemPrompt ?? "";
      const skillHeader = sp.match(/^#\s*Skill:\s*(\S+)/m);
      if (skillHeader) {
        activeSkills.set(key, skillHeader[1].toLowerCase());
        return;
      }
      if (sp.includes("<available_skills>") && !activeSkills.has(key)) {
        activeSkills.set(key, "__has_skills__");
      }
    });

    /**
     * Queue-based upsert: ensures create completes before any updates,
     * and coalesces rapid updates (only the latest text is sent).
     */
    function upsertProgress(sessionKey: string, text: string) {
      const ib = inboundBySession.get(sessionKey);
      if (!ib) return;
      const ch = ib.channelId;

      if (ch === "feishu") {
        let q = msgQueues.get(sessionKey);

        // First call: create
        if (!q) {
          q = { messageId: null, creating: true, pending: null };
          msgQueues.set(sessionKey, q);
          createFeishuMessage(api.config, ib.conversationId, text, ib.accountId)
            .then(msgId => {
              q!.messageId = msgId;
              q!.creating = false;
              // Flush any pending update that arrived while creating
              if (q!.pending && msgId) {
                const pendingText = q!.pending;
                q!.pending = null;
                updateFeishuMessage(api.config, msgId, pendingText, ib.accountId).catch(() => {});
              }
            })
            .catch(() => { q!.creating = false; });
          return;
        }

        // Still creating: just save the latest text
        if (q.creating) {
          q.pending = text;
          return;
        }

        // Already created: update directly
        if (q.messageId) {
          updateFeishuMessage(api.config, q.messageId, text, ib.accountId).catch(() => {});
        }
        return;
      }

      // Other channels: send new messages
      const sender = runtime.channel?.[ch];
      const sendFnName = `sendMessage${ch.charAt(0).toUpperCase()}${ch.slice(1)}`;
      const sendFn = sender?.[sendFnName];
      if (typeof sendFn === "function") {
        sendFn(ib.conversationId, text, { accountId: ib.accountId }).catch(() => {});
      }
    }

    function refreshProgress(sessionKey: string, final?: boolean) {
      const state = runStates.get(sessionKey);
      if (!state) return;

      // On final: force-complete any still-running steps (race condition guard)
      if (final) {
        for (const step of state.steps) {
          if (step.status === "running") {
            step.status = "done";
            step.finishedAt = step.finishedAt ?? Date.now();
          }
        }
      }

      const totalSteps = state.skillConfig?.steps?.length ?? state.totalSteps;
      const eff = resolveEffectiveLocale(locale);
      const text = formatProgressView(state, totalSteps, eff, final);
      upsertProgress(sessionKey, text);
    }

    api.on("before_tool_call", (event: any, ctx: any) => {
      const key = ctx?.sessionKey ?? "";

      if (event.toolName === "read" && typeof event.params?.path === "string" && event.params.path.includes("SKILL.md")) {
        const pathMatch = event.params.path.match(/skills\/([^/]+)\/SKILL\.md/);
        if (pathMatch) activeSkills.set(key, pathMatch[1].toLowerCase());
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

      refreshProgress(key);

      if (step.longRunning) {
        const longRunningMs = Number(pluginConfig?.longRunningMs) || 15_000;
        step.timer = setInterval(() => {
          refreshProgress(key);
        }, step.pollInterval ?? longRunningMs);
      }
    });

    api.on("after_tool_call", (event: any, ctx: any) => {
      const key = ctx?.sessionKey ?? "";
      const state = runStates.get(key);
      if (!state) return;

      const step = finishCurrentStep(state, event.error);
      if (step.timer) clearInterval(step.timer);

      refreshProgress(key);
    });

    api.on("agent_end", (_event: any, ctx: any) => {
      const key = ctx?.sessionKey ?? "";
      const state = runStates.get(key);
      if (!state) return;

      if (state.steps.length > 0) {
        refreshProgress(key, true);
      }
      clearAllTimers(state);
      runStates.delete(key);
      activeSkills.delete(key);
      // Don't delete msgQueue immediately — let pending updates flush
      setTimeout(() => msgQueues.delete(key), 5000);
    });
  },
};

export default plugin;
