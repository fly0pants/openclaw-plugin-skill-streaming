import type { PluginHookBeforeToolCallEvent } from "./types.js";

export function extractLabel(event: PluginHookBeforeToolCallEvent): string {
  const { toolName, params } = event;

  if (toolName === "bash" || toolName === "shell") {
    const cmd = String(params.command ?? "");
    const curlMatch = cmd.match(/curl\s+.*?(https?:\/\/[^\s"']+)/);
    if (curlMatch) {
      try {
        const url = new URL(curlMatch[1]);
        return `Querying ${url.host}${url.pathname}`;
      } catch {
        return `Querying ${curlMatch[1].slice(0, 50)}`;
      }
    }
    const maxCmdLen = 45;
    if (cmd.length > maxCmdLen) {
      return `Running: ${cmd.slice(0, maxCmdLen)}...`;
    }
    return `Running: ${cmd}`;
  }

  return `Executing: ${toolName}`;
}
