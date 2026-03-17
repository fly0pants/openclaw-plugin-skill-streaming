import type { SendTarget } from "./types.js";

export function parseSessionKey(sessionKey: string): { agentId: string; rest: string } | null {
  const raw = (sessionKey ?? "").trim();
  if (!raw) return null;
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "agent") return null;
  return { agentId: parts[1], rest: parts.slice(2).join(":") };
}

export function parseTarget(sessionKey: string): SendTarget | null {
  const parsed = parseSessionKey(sessionKey);
  if (!parsed) return null;

  const parts = parsed.rest.split(":").filter(Boolean);
  if (parts.length <= 1 && parts[0] === "main") return null;

  return {
    channel: parts[0],
    accountId: parts[1] ?? "default",
    peerId: parts[parts.length - 1],
  };
}

type ChannelSender = (runtime: any, target: SendTarget, message: string) => Promise<unknown>;

const channelAdapters: Record<string, ChannelSender> = {
  telegram: (rt, t, msg) =>
    rt.channel.telegram.sendMessageTelegram(t.peerId, msg, { accountId: t.accountId, textMode: "markdown" }),
  discord: (rt, t, msg) =>
    rt.channel.discord.sendMessageDiscord(t.peerId, msg, { accountId: t.accountId }),
  slack: (rt, t, msg) =>
    rt.channel.slack.sendMessageSlack(t.peerId, msg, { accountId: t.accountId }),
  whatsapp: (rt, t, msg) =>
    rt.channel.whatsapp.sendMessageWhatsApp(t.peerId, msg, { accountId: t.accountId }),
  signal: (rt, t, msg) =>
    rt.channel.signal.sendMessageSignal(t.peerId, msg, { accountId: t.accountId }),
  line: (rt, t, msg) =>
    rt.channel.line.sendMessageLine(t.peerId, msg, { accountId: t.accountId }),
  feishu: (rt, t, msg) => {
    const fn = rt.channel?.feishu?.sendMessageFeishu;
    return fn ? fn(t.peerId, msg, { accountId: t.accountId }) : Promise.resolve();
  },
};

export function sendProgress(runtime: any, sessionKey: string, message: string): void {
  const target = parseTarget(sessionKey);
  if (!target) return;

  const adapter = channelAdapters[target.channel];
  if (adapter) {
    adapter(runtime, target, message).catch(() => {});
  }
}
