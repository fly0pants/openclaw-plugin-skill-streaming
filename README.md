<p align="center">
  <h1 align="center">openclaw-plugin-skill-streaming</h1>
  <p align="center">
    <strong>Auto-inject streaming progress messages for <a href="https://openclaw.dev">OpenClaw</a> skill execution</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/openclaw-plugin-skill-streaming"><img src="https://img.shields.io/npm/v/openclaw-plugin-skill-streaming?style=flat-square&color=blue" alt="npm version"></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License: MIT"></a>
    <a href="#supported-channels"><img src="https://img.shields.io/badge/channels-7%2B-purple?style=flat-square" alt="Channels"></a>
    <a href="#"><img src="https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square" alt="Zero Dependencies"></a>
  </p>
  <p align="center">
    <a href="./README_CN.md">中文文档</a>
  </p>
</p>

---

## The Problem

When an OpenClaw skill runs, it executes tool calls in the background — fetching APIs, running commands, processing data. The user sees **nothing** until the final response arrives. For tasks that take 10–30+ seconds, this creates a frustrating "black box" experience.

## The Solution

This plugin hooks into OpenClaw's lifecycle and sends **real-time progress messages** to the user's chat as each step runs. Zero changes to your skills required.

```
User: Check the weather in Beijing

⏳ [1/?] Executing: web_fetch...
⏳ [2/?] Executing: web_search...
⏳ [3/?] Executing: exec...
📊 Done: 3 steps in 25.8s

Bot: Beijing current weather: ☀️ +4°C ...
```

---

## Quick Start

### Install

```bash
# From local path
openclaw plugins install -l /path/to/openclaw-plugin-skill-streaming

# Or from npm
npm install openclaw-plugin-skill-streaming
openclaw plugins install -l node_modules/openclaw-plugin-skill-streaming
```

### Enable

Add to `~/.openclaw/openclaw.json`:

```jsonc
{
  "plugins": {
    "entries": {
      "skill-streaming": { "enabled": true }
    }
  }
}
```

### Restart

```bash
openclaw gateway restart
```

**That's it.** The plugin works immediately — no skill modifications needed.

---

## How It Works

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│ message_received │────>│   llm_input  │────>│ before_tool_call │
│                  │     │              │     │                  │
│ Capture channel  │     │ Bridge to    │     │ Detect skill via │
│ context (feishu, │     │ session key  │     │ SKILL.md read    │
│ telegram, etc.)  │     │              │     │                  │
└─────────────────┘     │ Detect skill │     │ Send ⏳ progress │
                        │ capability   │     └────────┬─────────┘
                        └──────────────┘              │
                                                      v
┌─────────────────┐                        ┌──────────────────┐
│    agent_end    │<───────────────────────│ after_tool_call  │
│                 │                        │                  │
│ Send 📊 summary │                        │ Send ✅ done     │
│ Clean up state  │                        │                  │
└─────────────────┘                        └──────────────────┘
```

**5 hooks, zero dependencies, fully automatic.**

---

## Declarative Enhancement

For a richer experience, skills can declare streaming config in `SKILL.md` frontmatter:

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
```

This gives you:

| Feature | Without Config | With Config |
|---|:---:|:---:|
| Progress messages | `⏳ Executing: curl...` | `⏳ Querying external API...` |
| Step counting | `[1/?]` | `[1/3]` |
| Long-running alerts | - | `⚠️ Still working... (15s)` |
| Custom locale | - | Per-skill override |

<details>
<summary><strong>Frontmatter field reference</strong></summary>

| Field | Type | Description |
|---|---|---|
| `streaming.steps` | array | Step declarations |
| `steps[].match` | string | Substring to match against tool name/params |
| `steps[].label` | string | Human-readable label |
| `steps[].long_running` | boolean | Enable "still working" warnings |
| `steps[].poll_interval` | number | Warning interval in ms |
| `streaming.summary` | boolean | Show summary at end |
| `streaming.locale` | `"en"` \| `"zh"` | Override locale |

</details>

---

## Configuration

All options are optional — defaults work out of the box.

```jsonc
{
  "plugins": {
    "entries": {
      "skill-streaming": {
        "enabled": true,          // default: true
        "locale": "auto",         // "en" | "zh" | "auto" (default: "auto" → English)
        "summaryEnabled": true,   // default: true
        "longRunningMs": 15000    // default: 15000
      }
    }
  }
}
```

---

## Supported Channels

| Channel | Status | Method |
|:---|:---:|:---|
| **Feishu (飞书)** | Tested | Direct HTTP API |
| **Telegram** | Supported | `runtime.channel.telegram` |
| **Discord** | Supported | `runtime.channel.discord` |
| **Slack** | Supported | `runtime.channel.slack` |
| **WhatsApp** | Supported | `runtime.channel.whatsapp` |
| **LINE** | Supported | `runtime.channel.line` |
| **Signal** | Supported | `runtime.channel.signal` |
| **iMessage** | Supported | `runtime.channel.imessage` |

> **Why is Feishu special?** The Feishu plugin loads as an external extension and doesn't register on `runtime.channel`. This plugin sends Feishu messages directly via the [Feishu Open API](https://open.feishu.cn/document/server-docs/im-v1/message/create) using your existing app credentials — no extra setup needed.

---

## Development

```bash
git clone https://github.com/fly0pants/openclaw-plugin-skill-streaming.git
cd openclaw-plugin-skill-streaming
npm install
npm run build
npm test          # 51 tests across 6 modules
```

### Project Structure

```
src/
├── index.ts          # Plugin entry — hooks & message routing
├── label.ts          # Auto-extract labels from tool calls
├── state.ts          # Per-session run state management
├── matcher.ts        # Declarative step matching (SKILL.md)
├── formatter.ts      # i18n message formatting (en/zh)
├── config-loader.ts  # SKILL.md frontmatter parser
├── sender.ts         # Channel adapter map
└── types.ts          # Shared type definitions
```

---

## License

MIT
