// ---- OpenClaw SDK types (subset we depend on) ----

export type PluginHookBeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

export type PluginHookAfterToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
};

export type PluginHookToolContext = {
  agentId?: string;
  sessionKey?: string;
  toolName: string;
};

export type PluginHookLlmInputEvent = {
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  prompt: string;
  historyMessages: unknown[];
  imagesCount: number;
};

export type PluginHookAgentContext = {
  sessionKey?: string;
};

// ---- Plugin's own types ----

export type StepRecord = {
  index: number;
  label: string;
  startedAt: number;
  finishedAt?: number;
  status: "running" | "done" | "error";
  longRunning?: boolean;
  pollInterval?: number;
  timer?: ReturnType<typeof setInterval>;
};

export type RunState = {
  sessionKey: string;
  skillName: string | null;    // null = regular chat, skip progress
  totalSteps: number | null;   // from declarative config, null = unknown
  steps: StepRecord[];
  currentStep: number;
  startedAt: number;
  lastActivityAt: number;
  skillConfig?: StreamingConfig;
};

export type StreamingStepDecl = {
  match: string;
  label: string;
  long_running?: boolean;
  poll_interval?: number;
};

export type StreamingConfig = {
  steps?: StreamingStepDecl[];
  summary?: boolean;
  locale?: string;
};

export type SendTarget = {
  channel: string;
  peerId: string;
  accountId: string;
};

export type Locale = "en" | "zh" | "auto";
