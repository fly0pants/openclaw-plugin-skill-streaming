import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRunState, pushStep, finishCurrentStep, clearAllTimers, createCleanupInterval } from "../src/state.js";

describe("createRunState", () => {
  it("creates a new RunState with correct defaults", () => {
    const state = createRunState("session:123", "admapix");
    expect(state.sessionKey).toBe("session:123");
    expect(state.skillName).toBe("admapix");
    expect(state.steps).toEqual([]);
    expect(state.currentStep).toBe(0);
    expect(state.startedAt).toBeGreaterThan(0);
    expect(state.lastActivityAt).toBeGreaterThan(0);
  });
});

describe("pushStep", () => {
  it("adds a step and increments currentStep", () => {
    const state = createRunState("s1", "skill1");
    const step = pushStep(state, "Querying API");
    expect(step.index).toBe(1);
    expect(step.label).toBe("Querying API");
    expect(step.status).toBe("running");
    expect(state.currentStep).toBe(1);
    expect(state.steps).toHaveLength(1);
  });

  it("adds multiple steps sequentially", () => {
    const state = createRunState("s1", "skill1");
    pushStep(state, "Step 1");
    const step2 = pushStep(state, "Step 2");
    expect(step2.index).toBe(2);
    expect(state.currentStep).toBe(2);
    expect(state.steps).toHaveLength(2);
  });

  it("supports longRunning flag", () => {
    const state = createRunState("s1", "skill1");
    const step = pushStep(state, "Deep analysis", { longRunning: true, pollInterval: 20000 });
    expect(step.longRunning).toBe(true);
    expect(step.pollInterval).toBe(20000);
  });
});

describe("finishCurrentStep", () => {
  it("marks current step as done", () => {
    const state = createRunState("s1", "skill1");
    pushStep(state, "Test step");
    const step = finishCurrentStep(state, undefined);
    expect(step.status).toBe("done");
    expect(step.finishedAt).toBeGreaterThan(0);
  });

  it("marks step as error when error is provided", () => {
    const state = createRunState("s1", "skill1");
    pushStep(state, "Failing step");
    const step = finishCurrentStep(state, "timeout");
    expect(step.status).toBe("error");
  });

  it("returns phantom step if no steps exist (defensive)", () => {
    const state = createRunState("s1", "skill1");
    const step = finishCurrentStep(state, undefined);
    expect(step).toBeDefined();
    expect(step.status).toBe("done");
  });
});

describe("clearAllTimers", () => {
  it("clears all step timers", () => {
    vi.useFakeTimers();
    const state = createRunState("s1", "skill1");
    const step = pushStep(state, "Test");
    step.timer = setInterval(() => {}, 1000);
    clearAllTimers(state);
    expect(step.timer).toBeUndefined();
    vi.useRealTimers();
  });
});

describe("createCleanupInterval", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("removes stale entries after TTL", () => {
    const map = new Map();
    const state = createRunState("stale", "skill");
    state.lastActivityAt = Date.now() - 700_000;
    map.set("stale", state);
    const cleanup = createCleanupInterval(map, 60_000, 600_000);
    vi.advanceTimersByTime(60_000);
    expect(map.has("stale")).toBe(false);
    clearInterval(cleanup);
  });

  it("keeps fresh entries", () => {
    const map = new Map();
    const state = createRunState("fresh", "skill");
    map.set("fresh", state);
    const cleanup = createCleanupInterval(map, 60_000, 600_000);
    vi.advanceTimersByTime(60_000);
    expect(map.has("fresh")).toBe(true);
    clearInterval(cleanup);
  });
});
