# openclaw-plugin-skill-streaming

[![npm version](https://img.shields.io/npm/v/openclaw-plugin-skill-streaming)](https://www.npmjs.com/package/openclaw-plugin-skill-streaming)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**为 [OpenClaw](https://openclaw.dev) skill 工具调用自动注入流式进度消息。**

---

## 背景问题

当 OpenClaw skill 运行时，它可能在后台执行多个工具调用——请求 API、执行命令、处理数据。但从用户角度来看，什么都没发生。没有任何反馈，也看不到进度。对于耗时较长的任务，这会带来很差的体验。

## 解决方案

`openclaw-plugin-skill-streaming` 接入 OpenClaw 的插件系统，在每次工具调用开始和结束时，自动向用户的消息渠道发送进度通知。无需对已有 skill 做任何改动。

```
⏳ [1/3] 正在查询 api.example.com/v1/search...
✅ [1/3] 查询 api.example.com/v1/search 完成（2.3s）
⏳ [2/3] 正在处理数据...
⚠️  处理数据仍在进行中...（15.0s）
✅ [2/3] 处理数据完成（18.5s）
⏳ [3/3] 正在运行：generate-report...
✅ [3/3] 运行 generate-report 完成（1.2s）
📊 完成：共 3 步，耗时 21.0s
```

---

## 安装

### 本地路径安装（开发）

```bash
openclaw plugins install -l /path/to/openclaw-plugin-skill-streaming
```

### 从 npm 安装

```bash
npm install openclaw-plugin-skill-streaming
openclaw plugins install -l node_modules/openclaw-plugin-skill-streaming
```

安装后，在 `~/.openclaw/openclaw.json` 中启用插件：

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

然后重启 gateway：

```bash
openclaw gateway restart
```

---

## 快速上手（零配置）

插件无需任何配置，开箱即用：

- 通过系统提示词中的 `<available_skills>` 自动检测 skill 是否激活
- 当 agent 读取 `SKILL.md` 时自动识别具体的 skill 名称
- 从工具调用中自动提取可读标签（curl URL、bash 命令、工具名称等）
- 每次工具调用都会发送 `⏳ 开始` 和 `✅ 完成（Xs）` 消息
- 自动跳过 `read`、`write`、`edit` 工具调用（内部操作，无需对用户可见）

无需修改任何已有 skill。

---

## 声明式增强（SKILL.md）

Skill 可以在 `SKILL.md` 的 frontmatter 中声明流式进度配置，以获得更好的体验：

- 自定义步骤标签，更加直观易读
- 精确的步骤计数（显示 `[1/3]` 而非 `[1/?]`）
- 长耗时步骤的周期性提醒
- 单个 skill 的语言覆盖

**`SKILL.md` 示例：**

```yaml
---
name: my-skill
streaming:
  steps:
    - match: "api.example.com"
      label: "查询外部 API"
    - match: "process-data"
      label: "处理数据"
      long_running: true
      poll_interval: 10000
    - match: "generate-report"
      label: "生成报告"
  summary: true
  locale: zh
---

你的 skill 指令内容...
```

**Frontmatter 字段说明：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `streaming.steps` | 数组 | 步骤声明列表 |
| `steps[].match` | string | 匹配工具名称或参数的子字符串 |
| `steps[].label` | string | 进度消息中显示的可读标签 |
| `steps[].long_running` | boolean | 为 true 时启用"仍在处理"提醒 |
| `steps[].poll_interval` | number | 长耗时步骤的提醒间隔（毫秒），默认使用 `longRunningMs` |
| `streaming.summary` | boolean | 是否在结束时显示汇总消息 |
| `streaming.locale` | `"en"` \| `"zh"` | 覆盖该 skill 的消息语言 |

---

## 配置项

| 选项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 启用或禁用插件 |
| `locale` | `"en"` \| `"zh"` \| `"auto"` | `"auto"` | 进度消息的语言 |
| `summaryEnabled` | boolean | `true` | 多步骤运行结束后是否显示汇总 |
| `longRunningMs` | number | `15000` | "仍在处理"提醒的间隔（毫秒） |

`locale` 设置为 `"auto"` 时，默认使用英文。

---

## 支持的消息渠道

进度消息以独立消息形式发送到用户当前使用的消息渠道：

| 渠道 | 发送方式 |
|---|---|
| Telegram | `runtime.channel.telegram.sendMessageTelegram` |
| Discord | `runtime.channel.discord.sendMessageDiscord` |
| Slack | `runtime.channel.slack.sendMessageSlack` |
| WhatsApp | `runtime.channel.whatsapp.sendMessageWhatsApp` |
| Signal | `runtime.channel.signal.sendMessageSignal` |
| LINE | `runtime.channel.line.sendMessageLine` |
| iMessage | `runtime.channel.imessage.sendMessageIMessage` |
| 飞书 | 直接 HTTP API（见下方说明） |

> **飞书说明：** 飞书插件作为外部插件加载，不在 `runtime.channel` 上注册发送函数。本插件通过[飞书开放平台 API](https://open.feishu.cn/document/server-docs/im-v1/message/create) 直接发送消息，使用 OpenClaw 配置中的飞书应用凭证，无需额外配置。

---

## 架构说明

插件在 OpenClaw 插件生命周期中注册了五个钩子：

| 钩子 | 行为 |
|---|---|
| `message_received` | 捕获入站消息上下文（channelId、conversationId、accountId），用于回复路由 |
| `llm_input` | 将入站上下文桥接到 sessionKey；通过 `<available_skills>` 标记或 `# Skill:` 头部检测 skill |
| `before_tool_call` | 拦截 SKILL.md 读取以识别具体 skill；对其他工具调用发送 `⏳ 开始` 进度消息 |
| `after_tool_call` | 发送 `✅ 完成（Xs）` 结束消息 |
| `agent_end` | 发送可选汇总，清理会话状态 |

**Skill 检测流程：**

1. `llm_input` 检测系统提示词中的 `<available_skills>` — 标记该会话为"具有 skill 能力"
2. `before_tool_call` 拦截对 `SKILL.md` 的 `read` 调用 — 识别具体的 skill 名称
3. 后续的工具调用（排除 `read`/`write`/`edit`）触发进度消息

**标签解析优先级：**
1. 从 `SKILL.md` frontmatter 中匹配的声明式标签（如已配置）
2. 从工具调用中自动提取：curl URL、bash 命令或工具名称

状态按 sessionKey 隔离，每次 agent 运行结束后自动清理。后台定时器清理过期会话（TTL：10 分钟）。

**零运行时依赖** — 插件无任何生产环境 npm 依赖。

---

## 参与贡献

1. 克隆仓库
2. 安装开发依赖：`npm install`
3. 构建：`npm run build`
4. 运行测试：`npm test`

欢迎提交 Pull Request，请保持改动聚焦，并为新行为添加测试用例。

---

## 许可证

MIT © openclaw-plugin-skill-streaming contributors
