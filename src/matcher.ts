import type { PluginHookBeforeToolCallEvent, StreamingConfig } from "./types.js";

export type MatchResult = {
  label: string;
  totalSteps: number;
  longRunning?: boolean;
  pollInterval?: number;
};

export function matchStep(
  event: PluginHookBeforeToolCallEvent,
  config: StreamingConfig | undefined,
): MatchResult | null {
  if (!config?.steps?.length) return null;

  const cmd = String(event.params.command ?? event.params.url ?? "");

  for (const decl of config.steps) {
    if (cmd.includes(decl.match)) {
      return {
        label: decl.label,
        totalSteps: config.steps.length,
        longRunning: decl.long_running,
        pollInterval: decl.poll_interval,
      };
    }
  }

  return null;
}

export function detectSkillFromPrompt(prompt: string | undefined): string | null {
  if (!prompt) return null;

  const skillHeader = prompt.match(/^#\s*Skill:\s*(\S+)/m);
  if (skillHeader) return skillHeader[1].toLowerCase();

  const yamlName = prompt.match(/^---[\s\S]*?^name:\s*(\S+)[\s\S]*?^---/m);
  if (yamlName) return yamlName[1].toLowerCase();

  const primaryEnv = prompt.match(/primaryEnv:\s*\S+/);
  if (primaryEnv) {
    const nameNearby = prompt.match(/(?:skill|name)[\s:]+(\w[\w-]*)/i);
    if (nameNearby) return nameNearby[1].toLowerCase();
    return "unknown-skill";
  }

  return null;
}
