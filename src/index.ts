import type { RunState, Locale } from "./types.js";
import { createRunState, pushStep, finishCurrentStep, clearAllTimers, createCleanupInterval } from "./state.js";
import { extractLabel } from "./label.js";
import { matchStep, detectSkillFromPrompt } from "./matcher.js";
import { parseStreamingConfig } from "./config-loader.js";
import { formatStepStart, formatStepDone, formatStillWorking, formatSummary } from "./formatter.js";
import { sendProgress } from "./sender.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// OpenClaw Plugin SDK types — minimal subset for type safety
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

/**
 * Load streaming config for a skill by reading its SKILL.md from the
 * installed skills directory (~/.openclaw/skills/<name>/SKILL.md).
 * Returns null if not found or no streaming config declared.
 * Results are cached in skillConfigCache.
 */
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

const plugin: OpenClawPluginDefinition = {
  register(api) {
    const runtime = api.runtime;
    const pluginConfig = api.pluginConfig;
    const runStates = new Map<string, RunState>();
    const activeSkills = new Map<string, string | null>();
    const locale = resolveLocale(pluginConfig);

    const enabled = pluginConfig?.enabled !== false;
    if (!enabled) return;

    // TTL cleanup
    createCleanupInterval(runStates, 60_000, 600_000);

    // Hook 0: detect active skill from system prompt
    api.on("llm_input", (event: any, ctx: any) => {
      const skillName = detectSkillFromPrompt(event.systemPrompt);
      const key = ctx?.sessionKey;
      if (key) activeSkills.set(key, skillName);
    });

    // Hook 1: tool call starts — send progress message
    api.on("before_tool_call", (event: any, ctx: any) => {
      const key = ctx?.sessionKey ?? "";
      const skillName = activeSkills.get(key);
      if (!skillName) return;

      let state = runStates.get(key);
      if (!state) {
        const skillConfig = loadSkillConfig(skillName, api.resolvePath) ?? undefined;
        state = createRunState(key, skillName, skillConfig);
        runStates.set(key, state);
      }

      // Try declarative match first, fall back to auto extraction
      const match = matchStep(event, state.skillConfig);
      const label = match?.label ?? extractLabel(event);
      const step = pushStep(state, label, {
        longRunning: match?.longRunning,
        pollInterval: match?.pollInterval,
      });

      // Use totalSteps from match (declarative) or state (cached)
      const totalSteps = match?.totalSteps ?? state.totalSteps;
      const eff = resolveEffectiveLocale(locale);
      sendProgress(runtime, key, formatStepStart(step, totalSteps, eff));

      if (step.longRunning) {
        const longRunningMs = Number(pluginConfig?.longRunningMs) || 15_000;
        step.timer = setInterval(() => {
          sendProgress(runtime, key, formatStillWorking(step, eff));
        }, step.pollInterval ?? longRunningMs);
      }
    });

    // Hook 2: tool call ends — send completion message
    api.on("after_tool_call", (event: any, ctx: any) => {
      const key = ctx?.sessionKey ?? "";
      const state = runStates.get(key);
      if (!state) return;

      const step = finishCurrentStep(state, event.error);
      if (step.timer) clearInterval(step.timer);

      // Reuse totalSteps from state (set during createRunState) — no need to re-match
      const eff = resolveEffectiveLocale(locale);
      sendProgress(runtime, key, formatStepDone(step, state.totalSteps, event.durationMs, eff));
    });

    // Hook 3: agent run ends — cleanup + optional summary
    api.on("agent_end", (_event: any, ctx: any) => {
      const key = ctx?.sessionKey ?? "";
      const state = runStates.get(key);
      if (!state) return;

      const summaryEnabled = pluginConfig?.summaryEnabled !== false;
      if (summaryEnabled && state.steps.length > 1) {
        const eff = resolveEffectiveLocale(locale);
        sendProgress(runtime, key, formatSummary(state, eff));
      }
      clearAllTimers(state);
      runStates.delete(key);
      activeSkills.delete(key);
    });
  },
};

export default plugin;
