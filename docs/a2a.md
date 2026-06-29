# Proxy Tuner A2A — Agent-to-Agent 协议支持

> **让 AI Agent 可以自动发现并调用 Proxy Tuner 的全部能力：解析节点、生成配置、跨平台转换、安装去广告插件、记忆用户偏好。**

---

## 🚀 快速启动

```bash
# 启动 A2A 服务（默认端口 8787）
npm run start:a2a

# 环境变量
A2A_PORT=8788                    # 修改端口
A2A_BASE_URL=https://example.com  # 覆盖 Agent Card 中的公开地址
A2A_ALLOW_LOCAL_FILES=1           # 允许 A2A 请求读取 addressFile/configPath
```

---

## 📋 注册的 Skills（8 个）

启动后 Agent 会自动注册以下 8 个 A2A Skill：

| Skill ID | 功能 | 输入示例 |
|----------|------|---------|
| `generate-surge-profile` | 生成 Surge 配置 | `{"address":"trojan://...","services":["Telegram"]}` |
| `generate-loon-profile` | 生成 Loon 配置 | `{"address":"...","platform":"loon","adBlock":true}` |
| `generate-quantumultx-profile` | 生成 Quantumult X 配置 | `{"address":"...","platform":"quantumultx"}` |
| `generate-clash-profile` | 生成 Clash YAML 配置 | `{"address":"...","platform":"clash"}` |
| `convert-config` | 跨平台配置转换 | `{"config":"...","from":"surge","to":"clash"}` |
| `install-adblock` | 安装去广告插件 | `{"platform":"surge","action":"generate","customDomains":["*.ad.com"]}` |
| `manage-preferences` | 管理用户偏好 | `{"action":"set","preferredPlatform":"clash"}` |
| `parse-proxies` | 解析代理节点 | `{"address":"vmess://..."}` |

---

## 🔌 协议端点

### Agent Card （发现能力）

```bash
curl -H 'A2A-Version: 1.0' http://127.0.0.1:8787/.well-known/agent-card.json
```

返回 JSON 包含所有 8 个 skills 的描述、输入输出格式、示例。

### 提交任务（HTTP+JSON 同步）

```bash
curl -sS -X POST http://127.0.0.1:8787/message:send \
  -H 'content-type: application/a2a+json' \
  -H 'A2A-Version: 1.0' \
  --data '{
    "message": {
      "messageId": "msg-1",
      "role": "ROLE_USER",
      "parts": [{
        "data": {
          "address": "trojan://secret@hk.example.com:443?sni=hk.example.com#香港-HK-01",
          "services": ["Telegram", "YouTube"],
          "adBlock": true,
          "platform": "surge"
        }
      }]
    }
  }'
```

### 提交任务（SSE 事件流）

```bash
curl -sS -N -X POST http://127.0.0.1:8787/message:stream \
  -H 'content-type: application/a2a+json' \
  -H 'A2A-Version: 1.0' \
  --data '{
    "message": {
      "parts": [{"data": {"address": "trojan://...", "platform": "clash"}}]
    }
  }'
```

返回 Server-Sent Events。当前实现会创建并执行同一个内存任务，把创建和终态结果写入 SSE 响应；不提供后台队列、跨进程恢复或外部 webhook push。

### 查询任务

```bash
curl -H 'A2A-Version: 1.0' http://127.0.0.1:8787/tasks/<task-id>

# 列出所有任务
curl -H 'A2A-Version: 1.0' http://127.0.0.1:8787/tasks
```

### 订阅任务状态（SSE）

```bash
curl -sS -N http://127.0.0.1:8787/tasks/<task-id>:subscribe
```

订阅当前进程内存中的任务状态。已完成任务会立即返回终态事件并关闭连接；未终态任务会在状态变化时收到事件。

### 取消任务

```bash
curl -X POST http://127.0.0.1:8787/tasks/<task-id>:cancel \
  -H 'A2A-Version: 1.0'
```

只能取消尚未进入 `TASK_STATE_COMPLETED`、`TASK_STATE_FAILED` 或 `TASK_STATE_CANCELED` 的任务。

### 健康检查

```bash
curl http://127.0.0.1:8787/healthz
```

返回服务状态和注册的 skills 列表。

---

## 🧩 用例示例

### 用例 1：只需一个订阅链接，四平台齐出

```json
{
  "message": {
    "parts": [{
      "data": {
        "address": "https://example.com/sub?token=xxx",
        "services": ["Telegram", "YouTube", "ChatGPT"],
        "adBlock": true,
        "platforms": ["surge", "loon", "quantumultx", "clash"]
      }
    }]
  }
}
```
注意：如果要同时生成多平台，建议分别调用各平台的 skill。

### 用例 2：从 Surge 转换到 Clash

```json
{
  "message": {
    "parts": [{
      "data": {
        "skillId": "convert-config",
        "config": "[General]\n...\n[Proxy]\n...",
        "from": "surge",
        "to": "clash"
      }
    }]
  }
}
```

### 用例 3：自动安装去广告插件 + 自定义域名

```json
{
  "message": {
    "parts": [{
      "data": {
        "skillId": "install-adblock",
        "platform": "surge",
        "action": "generate",
        "customDomains": ["*.my-new-ad.com", "*.tracker.xyz"],
        "useOnlineRules": true,
        "name": "My-Custom-AdBlock"
      }
    }]
  }
}
```

### 用例 4：保存用户偏好并一键生成

```json
// 第一步：设置偏好
{
  "message": {
    "parts": [{
      "data": {
        "skillId": "manage-preferences",
        "action": "set",
        "preferredPlatform": "clash",
        "adBlockLevel": "full",
        "commonServices": ["Telegram", "YouTube", "ChatGPT", "GitHub"],
        "customAdDomains": ["*.spam-tracker.com"]
      }
    }]
  }
}

// 第二步：基于偏好生成配置
{
  "message": {
    "parts": [{
      "data": {
        "skillId": "manage-preferences",
        "action": "build",
        "address": "trojan://secret@example.com:443#US-01"
      }
    }]
  }
}
// 返回包含 subscriptions、services、adBlock 等字段的 input，
// 可直接传给 generate-*-profile skill
```

### 用例 5：解析节点但不生成完整配置

```json
{
  "message": {
    "parts": [{
      "data": {
        "skillId": "parse-proxies",
        "address": "vmess://eyJhZGQiOiIxMjcuMC4wLjEiLCJ...base64..."
      }
    }]
  }
}
```

---

## 🧠 A2A Agent 工作流

当一个 AI Agent 调用 Proxy Tuner A2A 服务时，典型工作流如下：

```
调用方 Agent                          Proxy Tuner A2A 服务
     │                                      │
     │  1. GET /.well-known/agent-card.json  │
     │─────────────────────────────────────> │
     │  返回 8 个 skills 的能力描述          │
     │<───────────────────────────────────── │
     │                                      │
     │  2. POST /message:send               │
     │     { address, services, platform }   │
     │─────────────────────────────────────> │
     │                                      │
     │  3. 服务端:                           │
     │     - 创建 Task（状态: WORKING）      │
     │     - 解析代理地址/订阅                │
     │     - 加载用户偏好                     │
     │     - 生成配置 + 去广告                │
     │     - 校验配置                         │
     │     - 完成（状态: COMPLETED）          │
     │                                      │
     │  返回 { task, artifacts }             │
     │<───────────────────────────────────── │
     │                                      │
     │  4. (可选) GET /tasks/{id}:subscribe  │
     │     如果任务未完成，返回 SSE 状态事件  │
     │─────────────────────────────────────> │
     │<── event: task (progress updates) ──── │
     │<── event: task (completed/failed) ──── │
```

---

## 🔐 安全说明

- 默认不允许通过 A2A 读取本机文件；`addressFile` 和 `configPath` 都需要设置 `A2A_ALLOW_LOCAL_FILES=1`
- 不记录请求正文，避免订阅 token 和节点密码进入日志
- 服务本身不设置 CORS 响应头；浏览器跨域访问建议通过反向代理或上层 Agent 网关处理
- 当前不提供 OAuth、API Key、Webhook 或外部 push notification；需要鉴权和审计时放在反向代理或调用方 Agent 网关
- Task 存储在当前进程内存中，终态任务默认 1 小时后自动清理
- 默认偏好写入 `configs/user-preferences.json`；该文件应作为本地运行态文件保留在 `.gitignore` 中，不提交真实订阅 URL

---

## 🛠 扩展：注册自定义 Skill

在 `scripts/a2a-agent.js` 的 `registerSkills()` 函数中添加新的 handler：

```javascript
router.register('my-custom-skill', async (task, input, options) => {
  // ... 你的处理逻辑 ...
  return {
    state: TASK_STATE.COMPLETED,
    message: 'Done!',
    artifacts: [{ ... }]
  };
});
```

然后在 `buildAgentCard()` 的 `skills` 数组中添加描述即可。

---

## 📡 与其他 Agent 集成

Proxy Tuner A2A 提供 Agent Card、HTTP+JSON 任务提交和 SSE 任务事件，适合被其他 Agent 通过 HTTP 客户端包装调用。

推荐集成方式：
1. **自定义 Agent** — 通过 HTTP 请求直接调用上述端点
2. **MCP / 本地工具包装** — 把 `message:send` 封装成工具调用
3. **Agent 网关** — 在上层统一处理鉴权、审计、限流和远程部署

---

## 🔍 调试

```bash
# 查看所有注册的 skills
curl http://127.0.0.1:8787/healthz | jq .skills

# 查看 agent card（含每个 skill 的示例）
curl -H 'A2A-Version: 1.0' http://127.0.0.1:8787/.well-known/agent-card.json | jq .skills[].examples

# SSE 流式调试
curl -sS -N http://127.0.0.1:8787/tasks/<task-id>:subscribe
```
