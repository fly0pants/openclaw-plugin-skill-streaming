import type { RunState, StepRecord, Locale } from "./types.js";

function fmtDuration(ms: number): string {
  return (ms / 1000).toFixed(1) + "s";
}

function stepPrefix(index: number, total: number | null): string {
  return total ? `[${index}/${total}]` : `[${index}/?]`;
}

export function formatStepStart(
  step: StepRecord,
  totalSteps: number | null,
  locale: Locale,
): string {
  return `⏳ ${stepPrefix(step.index, totalSteps)} ${step.label}...`;
}

export function formatStepDone(
  step: StepRecord,
  totalSteps: number | null,
  durationMs: number | undefined,
  locale: Locale,
): string {
  const icon = step.status === "error" ? "❌" : "✅";
  const dur = durationMs != null ? ` (${fmtDuration(durationMs)})` : "";
  return `${icon} ${stepPrefix(step.index, totalSteps)} ${step.label}${dur}`;
}

export function formatStillWorking(step: StepRecord, locale: Locale): string {
  const elapsed = fmtDuration(Date.now() - step.startedAt);
  if (locale === "zh") {
    return `⚠️ 仍在执行 ${step.label}... (${elapsed})`;
  }
  return `⚠️ Still working on ${step.label}... (${elapsed})`;
}

export function formatSummary(state: RunState, locale: Locale): string {
  const elapsed = fmtDuration(Date.now() - state.startedAt);
  const count = state.steps.length;
  if (locale === "zh") {
    return `📊 完成: ${count} 步, 耗时 ${elapsed}`;
  }
  return `📊 Done: ${count} steps in ${elapsed}`;
}
