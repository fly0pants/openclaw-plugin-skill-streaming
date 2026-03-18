# openclaw-plugin-skill-streaming

[![npm version](https://img.shields.io/npm/v/openclaw-plugin-skill-streaming)](https://www.npmjs.com/package/openclaw-plugin-skill-streaming)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Auto-inject streaming progress messages during skill tool call execution for [OpenClaw](https://openclaw.dev).**

---

## The Problem

When an OpenClaw skill runs, it may execute multiple tool calls in the background — fetching APIs, running commands, processing data. From the user's perspective, nothing happens. No feedback, no indication of progress. For long-running tasks this creates a poor experience.

## The Solution

`openclaw-plugin-skill-streaming` hooks into OpenClaw's plugin system and automatically sends progress messages to the user's messaging channel as each tool call begins and completes. No changes to your skills are required.

```
⏳ [1/3] Querying api.example.com/v1/search...
✅ [1/3] Querying api.example.com/v1/search (2.3s)
⏳ [2/3] Processing data...
⚠️  Still working on Processing data... (15.0s)
✅ [2/3] Processing data (18.5s)
⏳ [3/3] Running: generate-report...
✅ [3/3] Running: generate-report (1.2s)
📊 Done: 3 steps in 21.0s
```

---

## Installation

### From local path (development)

```bash
openclaw plugins install -l /path/to/openclaw-plugin-skill-streaming
```

### From npm

```bash
npm install openclaw-plugin-skill-streaming
openclaw plugins install -l node_modules/openclaw-plugin-skill-streaming
```

After installation, enable the plugin in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "skill-streaming": {
        "enabled": true,
        "locale": "auto",
        "summaryEnabled": true,
        "longRunningMs": 15000
      }
    }
  }
}
```

Then restart the gateway:

```bash
openclaw gateway restart
```

---

## Quick Start (Zero-Config)

The plugin works immediately with no configuration. It:

- Detects when a skill is active via `<available_skills>` in the system prompt
- Identifies the specific skill when the agent reads its `SKILL.md`
- Extracts human-readable labels from tool calls (curl URLs, bash commands, tool names)
- Sends `⏳ starting` and `✅ done (Xs)` messages for every tool call
- Skips `read`, `write`, and `edit` tool calls (internal operations, not user-visible)

No changes to your skills are needed.

---

## Declarative Enhancement (SKILL.md)

Skills can optionally declare streaming metadata in their `SKILL.md` frontmatter. This enables:

- Custom human-readable step labels
- Accurate step counting (`[1/3]` instead of `[1/?]`)
- Long-running step warnings with configurable poll intervals
- Per-skill locale override

**Example `SKILL.md`:**

```yaml
---
name: my-skill
streaming:
  steps:
    - match: "api.example.com"
      label: "Querying external API"
    - match: "process-data"
      label: "Processing data"
      long_running: true
      poll_interval: 10000
    - match: "generate-report"
      label: "Generating report"
  summary: true
  locale: zh
---

Your skill instructions here...
```

**Frontmatter fields:**

| Field | Type | Description |
|---|---|---|
| `streaming.steps` | array | List of step declarations |
| `steps[].match` | string | Substring matched against tool name or params |
| `steps[].label` | string | Human-readable label shown in progress messages |
| `steps[].long_running` | boolean | If true, sends "still working" warnings |
| `steps[].poll_interval` | number | Interval (ms) for long-running warnings (default: uses `longRunningMs`) |
| `streaming.summary` | boolean | Show summary message at the end |
| `streaming.locale` | `"en"` \| `"zh"` | Override locale for this skill |

---

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Enable or disable the plugin |
| `locale` | `"en"` \| `"zh"` \| `"auto"` | `"auto"` | Language for progress messages |
| `summaryEnabled` | boolean | `true` | Show summary after multi-step runs |
| `longRunningMs` | number | `15000` | Interval (ms) for "still working" messages |

When `locale` is `"auto"`, the plugin defaults to English.

---

## Supported Channels

Progress messages are sent as standalone messages to the user's active messaging channel:

| Channel | Method |
|---|---|
| Telegram | `runtime.channel.telegram.sendMessageTelegram` |
| Discord | `runtime.channel.discord.sendMessageDiscord` |
| Slack | `runtime.channel.slack.sendMessageSlack` |
| WhatsApp | `runtime.channel.whatsapp.sendMessageWhatsApp` |
| Signal | `runtime.channel.signal.sendMessageSignal` |
| LINE | `runtime.channel.line.sendMessageLine` |
| iMessage | `runtime.channel.imessage.sendMessageIMessage` |
| Feishu | Direct HTTP API (see note below) |

> **Feishu note:** The Feishu plugin is loaded as an external plugin and does not register send functions on `runtime.channel`. This plugin sends Feishu messages directly via the [Feishu Open API](https://open.feishu.cn/document/server-docs/im-v1/message/create), using the app credentials from your OpenClaw configuration. No additional setup is required.

---

## Architecture

The plugin registers five hooks in the OpenClaw plugin lifecycle:

| Hook | Action |
|---|---|
| `message_received` | Captures inbound context (channelId, conversationId, accountId) for reply routing |
| `llm_input` | Bridges inbound context to session key; detects skill via `<available_skills>` marker or `# Skill:` header |
| `before_tool_call` | Identifies specific skill from SKILL.md reads; sends `⏳ starting` progress message |
| `after_tool_call` | Sends `✅ done (Xs)` completion message |
| `agent_end` | Sends optional summary, cleans up state |

**Skill detection flow:**

1. `llm_input` detects `<available_skills>` in the system prompt — marks session as "skill-capable"
2. `before_tool_call` intercepts `read` calls to `SKILL.md` — identifies the exact skill name
3. Subsequent tool calls (excluding `read`/`write`/`edit`) trigger progress messages

**Label resolution order:**
1. Declarative match from `SKILL.md` frontmatter (if configured)
2. Auto-extracted from the tool call: curl URL, bash command, or tool name

State is scoped per session key and cleaned up after each agent run. A background interval cleans up stale sessions (TTL: 10 minutes).

**Zero runtime dependencies** — the plugin has no production npm dependencies.

---

## Contributing

1. Clone the repository
2. Install dev dependencies: `npm install`
3. Build: `npm run build`
4. Run tests: `npm test`

Pull requests are welcome. Please keep changes focused and include tests for new behavior.

---

## License

MIT © openclaw-plugin-skill-streaming contributors
