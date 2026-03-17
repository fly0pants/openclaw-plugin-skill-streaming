import type { RunState, StepRecord, StreamingConfig } from "./types.js";

export function createRunState(
  sessionKey: string,
  skillName: string | null,
  skillConfig?: StreamingConfig,
): RunState {
  const now = Date.now();
  return {
    sessionKey,
    skillName,
    totalSteps: skillConfig?.steps?.length ?? null,
    steps: [],
    currentStep: 0,
    startedAt: now,
    lastActivityAt: now,
    skillConfig,
  };
}

export function pushStep(
  state: RunState,
  label: string,
  opts?: { longRunning?: boolean; pollInterval?: number },
): StepRecord {
  state.currentStep += 1;
  state.lastActivityAt = Date.now();
  const step: StepRecord = {
    index: state.currentStep,
    label,
    startedAt: Date.now(),
    status: "running",
    longRunning: opts?.longRunning,
    pollInterval: opts?.pollInterval,
  };
  state.steps.push(step);
  return step;
}

export function finishCurrentStep(
  state: RunState,
  error: string | undefined,
): StepRecord {
  state.lastActivityAt = Date.now();
  const step = state.steps[state.steps.length - 1];
  if (!step) {
    const phantom: StepRecord = {
      index: 0,
      label: "unknown",
      startedAt: Date.now(),
      finishedAt: Date.now(),
      status: error ? "error" : "done",
    };
    return phantom;
  }
  step.finishedAt = Date.now();
  step.status = error ? "error" : "done";
  return step;
}

export function clearAllTimers(state: RunState): void {
  for (const step of state.steps) {
    if (step.timer) {
      clearInterval(step.timer);
      step.timer = undefined;
    }
  }
}

export function createCleanupInterval(
  map: Map<string, RunState>,
  intervalMs: number,
  ttlMs: number,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const now = Date.now();
    for (const [key, state] of map) {
      if (now - state.lastActivityAt > ttlMs) {
        clearAllTimers(state);
        map.delete(key);
      }
    }
  }, intervalMs);
}
