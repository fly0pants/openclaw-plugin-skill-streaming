import type { StreamingConfig, StreamingStepDecl } from "./types.js";

export function parseStreamingConfig(content: string): StreamingConfig | null {
  if (!content) return null;

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const yaml = fmMatch[1];
  if (!yaml.includes("streaming:")) return null;

  const streamingMatch = yaml.match(/streaming:\n((?:[ ]{6,}.*\n?)*)/);
  if (!streamingMatch) return null;

  const streamBlock = streamingMatch[1];

  const steps: StreamingStepDecl[] = [];
  const stepMatches = streamBlock.matchAll(/-\s*match:\s*"?([^"\n]+)"?\n\s+label:\s*"?([^"\n]+)"?(?:\n\s+long_running:\s*(true|false))?(?:\n\s+poll_interval:\s*(\d+))?/g);

  for (const m of stepMatches) {
    steps.push({
      match: m[1].trim(),
      label: m[2].trim(),
      long_running: m[3] === "true" ? true : undefined,
      poll_interval: m[4] ? Number(m[4]) : undefined,
    });
  }

  const summaryMatch = streamBlock.match(/summary:\s*(true|false)/);
  const summary = summaryMatch?.[1] === "true";

  const localeMatch = streamBlock.match(/locale:\s*"?(\w+)"?/);
  const locale = localeMatch?.[1];

  if (steps.length === 0 && !summary && !locale) return null;

  return {
    steps: steps.length > 0 ? steps : undefined,
    summary,
    locale,
  };
}
