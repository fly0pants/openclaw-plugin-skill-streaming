<p align="center">
  <h1 align="center">openclaw-plugin-skill-streaming</h1>
  <p align="center">
    <strong>为 <a href="https://openclaw.dev">OpenClaw</a> skill 执行自动注入流式进度消息</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/openclaw-plugin-skill-streaming"><img src="https://img.shields.io/npm/v/openclaw-plugin-skill-streaming?style=flat-square&color=blue" alt="npm version"></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License: MIT"></a>
    <a href="#支持的消息渠道"><img src="https://img.shields.io/badge/渠道-7%2B-purple?style=flat-square" alt="Channels"></a>
    <a href="#"><img src="https://img.shields.io/badge/依赖-0-brightgreen?style=flat-square" alt="Zero Dependencies"></a>
  </p>
  <p align="center">
    <a href="./README.md">English</a>
  </p>
</p>

---

## 背景问题

当 OpenClaw skill 运行时，它在后台执行多个工具调用——请求 API、执行命令、处理数据。用户在最终回复到达之前**什么都看不到**。对于耗时 10-30 秒以上的任务，这会造成令人沮丧的"黑盒"体验。

## 解决方案

本插件接入 OpenClaw 生命周期，在每个步骤执行时向用户的聊天窗口发送**实时进度消息**。无需对已有 skill 做任何改动。

```
用户：帮我查一下北京天气

⏳ [1/?] Executing: web_fetch...
⏳ [2/?] Executing: web_search...
⏳ [3/?] Executing: exec...
📊 Done: 3 steps in 25.8s

Bot：北京当前天气：☀️ +4°C ...
```

---

## 快速上手

### 安装

```bash
# 本地路径安装
openclaw plugins install -l /path/to/openclaw-plugin-skill-streaming

# 或从 npm 安装
npm install openclaw-plugin-skill-streaming
openclaw plugins install -l node_modules/openclaw-plugin-skill-streaming
```

### 启用

在 `~/.openclaw/openclaw.json` 中添加：

```jsonc
{
  "plugins": {
    "entries": {
      "skill-streaming": { "enabled": true }
    }
  }
}
```

### 重启

```bash
openclaw gateway restart
```

**搞定。** 插件开箱即用——无需修改任何 skill。

---

## 工作原理

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│ message_received │────>│   llm_input  │────>│ before_tool_call │
│                  │     │              │     │                  │
│ 捕获渠道上下文    │     │ 桥接到        │     │ 通过 SKILL.md   │
│ (飞书、Telegram  │     │ sessionKey   │     │ 读取识别 skill   │
│  等)             │     │              │     │                  │
└─────────────────┘     │ 检测 skill   │     │ 发送 ⏳ 进度消息 │
                        │ 能力标记      │     └────────┬─────────┘
                        └──────────────┘              │
                                                      v
┌─────────────────┐                        ┌──────────────────┐
│    agent_end    │<───────────────────────│ after_tool_call  │
│                 │                        │                  │
│ 发送 📊 汇总    │                        │ 发送 ✅ 完成     │
│ 清理会话状态     │                        │                  │
└─────────────────┘                        └──────────────────┘
```

**5 个钩子，零依赖，全自动。**

---

## 声明式增强

为了更好的体验，skill 可以在 `SKILL.md` frontmatter 中声明进度配置：

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
```

效果对比：

| 功能 | 无配置 | 有配置 |
|---|:---:|:---:|
| 进度消息 | `⏳ Executing: curl...` | `⏳ 查询外部 API...` |
| 步骤计数 | `[1/?]` | `[1/3]` |
| 长耗时提醒 | - | `⚠️ 仍在处理...（15s）` |
| 自定义语言 | - | 按 skill 覆盖 |

<details>
<summary><strong>Frontmatter 字段参考</strong></summary>

| 字段 | 类型 | 说明 |
|---|---|---|
| `streaming.steps` | 数组 | 步骤声明列表 |
| `steps[].match` | string | 匹配工具名称或参数的子字符串 |
| `steps[].label` | string | 可读标签 |
| `steps[].long_running` | boolean | 启用"仍在处理"提醒 |
| `steps[].poll_interval` | number | 提醒间隔（毫秒） |
| `streaming.summary` | boolean | 结束时显示汇总 |
| `streaming.locale` | `"en"` \| `"zh"` | 覆盖语言 |

</details>

---

## 配置项

所有选项均可选——默认值开箱即用。

```jsonc
{
  "plugins": {
    "entries": {
      "skill-streaming": {
        "enabled": true,          // 默认: true
        "locale": "auto",         // "en" | "zh" | "auto"（默认: "auto" → 英文）
        "summaryEnabled": true,   // 默认: true
        "longRunningMs": 15000    // 默认: 15000
      }
    }
  }
}
```

---

## 支持的消息渠道

| 渠道 | 状态 | 发送方式 |
|:---|:---:|:---|
| **飞书** | 已测试 | 直接 HTTP API |
| **Telegram** | 支持 | `runtime.channel.telegram` |
| **Discord** | 支持 | `runtime.channel.discord` |
| **Slack** | 支持 | `runtime.channel.slack` |
| **WhatsApp** | 支持 | `runtime.channel.whatsapp` |
| **LINE** | 支持 | `runtime.channel.line` |
| **Signal** | 支持 | `runtime.channel.signal` |
| **iMessage** | 支持 | `runtime.channel.imessage` |

> **为什么飞书比较特殊？** 飞书插件作为外部扩展加载，不在 `runtime.channel` 上注册发送函数。本插件通过[飞书开放平台 API](https://open.feishu.cn/document/server-docs/im-v1/message/create) 直接发送消息，使用已有的应用凭证——无需额外配置。

---

## 开发

```bash
git clone https://github.com/fly0pants/openclaw-plugin-skill-streaming.git
cd openclaw-plugin-skill-streaming
npm install
npm run build
npm test          # 51 个测试，覆盖 6 个模块
```

### 项目结构

```
src/
├── index.ts          # 插件入口 — hooks & 消息路由
├── label.ts          # 从工具调用中自动提取标签
├── state.ts          # 按会话管理运行状态
├── matcher.ts        # 声明式步骤匹配（SKILL.md）
├── formatter.ts      # i18n 消息格式化（中/英）
├── config-loader.ts  # SKILL.md frontmatter 解析器
├── sender.ts         # 渠道适配器
└── types.ts          # 共享类型定义
```

---

## 许可证

MIT
