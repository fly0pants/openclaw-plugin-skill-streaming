import { describe, it, expect } from "vitest";
import { formatStepStart, formatStepDone, formatStillWorking, formatSummary } from "../src/formatter.js";
import type { RunState, StepRecord } from "../src/types.js";

function makeState(overrides?: Partial<RunState>): RunState {
  return {
    sessionKey: "s1",
    skillName: "test-skill",
    totalSteps: null,
    steps: [],
    currentStep: 0,
    startedAt: Date.now(),
    lastActivityAt: Date.now(),
    ...overrides,
  };
}

function makeStep(overrides?: Partial<StepRecord>): StepRecord {
  return {
    index: 1,
    label: "Test step",
    startedAt: Date.now(),
    status: "running",
    ...overrides,
  };
}

describe("formatStepStart", () => {
  it("formats with known total steps", () => {
    const result = formatStepStart(makeStep({ index: 2, label: "搜索广告素材" }), 3, "en");
    expect(result).toContain("[2/3]");
    expect(result).toContain("搜索广告素材");
  });

  it("formats with unknown total steps", () => {
    const result = formatStepStart(makeStep({ index: 1, label: "Querying api.com" }), null, "en");
    expect(result).toContain("[1/?]");
  });
});

describe("formatStepDone", () => {
  it("formats completed step with duration", () => {
    const step = makeStep({ index: 1, status: "done" });
    const result = formatStepDone(step, 3, 2100, "en");
    expect(result).toContain("[1/3]");
    expect(result).toContain("2.1s");
    expect(result).toContain("✅");
  });

  it("formats error step with error icon", () => {
    const step = makeStep({ index: 1, status: "error" });
    const result = formatStepDone(step, null, 500, "en");
    expect(result).toContain("❌");
    expect(result).toContain("0.5s");
  });
});

describe("formatStillWorking", () => {
  it("shows elapsed time in English", () => {
    const step = makeStep({ startedAt: Date.now() - 18000 });
    const result = formatStillWorking(step, "en");
    expect(result).toMatch(/Still working/);
  });

  it("uses Chinese for zh locale", () => {
    const step = makeStep({ startedAt: Date.now() - 5000 });
    const result = formatStillWorking(step, "zh");
    expect(result).toMatch(/仍在执行/);
  });
});

describe("formatSummary", () => {
  it("formats multi-step summary in English", () => {
    const state = makeState({
      startedAt: Date.now() - 28700,
      steps: [makeStep({ index: 1 }), makeStep({ index: 2 }), makeStep({ index: 3 })],
    });
    const result = formatSummary(state, "en");
    expect(result).toContain("3 steps");
  });

  it("uses Chinese for zh locale", () => {
    const state = makeState({
      startedAt: Date.now() - 5000,
      steps: [makeStep(), makeStep()],
    });
    const result = formatSummary(state, "zh");
    expect(result).toMatch(/完成.*2.*步/);
  });
});
