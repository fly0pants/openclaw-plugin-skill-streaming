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

```bash
npm install openclaw-plugin-skill-streaming
```

Then register it in your OpenClaw configuration:

```json
{
  "plugins": [
    {
      "id": "skill-streaming",
      "path": "node_modules/openclaw-plugin-skill-streaming"
    }
  ]
}
```

---

## Quick Start (Zero-Config)

The plugin works immediately with no configuration. It:

- Detects the active skill from the system prompt automatically
- Extracts human-readable labels from tool calls (curl URLs, bash commands, tool names)
- Sends `⏳ starting` and `✅ done (Xs)` messages for every tool call

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

Set these in your plugin config block:

```json
{
  "plugins": [
    {
      "id": "skill-streaming",
      "path": "node_modules/openclaw-plugin-skill-streaming",
      "config": {
        "enabled": true,
        "locale": "auto",
        "summaryEnabled": true,
        "longRunningMs": 15000
      }
    }
  ]
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Enable or disable the plugin |
| `locale` | `"en"` \| `"zh"` \| `"auto"` | `"auto"` | Language for progress messages |
| `summaryEnabled` | boolean | `true` | Show summary after multi-step runs |
| `longRunningMs` | number | `15000` | Interval (ms) for "still working" messages |

When `locale` is `"auto"`, the plugin defaults to English.

---

## Supported Channels

Progress messages are sent as standalone messages to the user's active messaging channel. Supported platforms:

- Telegram
- Discord
- Slack
- WhatsApp
- Signal
- LINE
- Feishu (飞书)

---

## Architecture

The plugin registers four hooks in the OpenClaw plugin lifecycle:

| Hook | Action |
|---|---|
| `llm_input` | Detects the active skill name from the system prompt |
| `before_tool_call` | Sends a `⏳ starting` progress message |
| `after_tool_call` | Sends a `✅ done (Xs)` completion message |
| `agent_end` | Sends optional summary, cleans up state |

Labels are resolved in order:
1. Declarative match from `SKILL.md` frontmatter (if configured)
2. Auto-extracted from the tool call: curl URL, bash command, or tool name

State is scoped per session key and cleaned up after each agent run.

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
