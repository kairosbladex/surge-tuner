# Surge Tuner A2A 调用说明

本仓库提供一个最小 A2A HTTP+JSON 服务，让其他 agent 可以发现并调用 Surge 配置生成能力。

## 启动

```bash
npm run start:a2a
```

默认监听 `http://127.0.0.1:8787`。可用环境变量：

- `A2A_PORT=8788`：修改端口
- `A2A_BASE_URL=https://example.com`：覆盖 Agent Card 里的公开地址
- `A2A_ALLOW_LOCAL_FILES=1`：允许 `addressFile` 读取本机文件，默认关闭

## Agent Card

```bash
curl -H 'A2A-Version: 1.0' http://127.0.0.1:8787/.well-known/agent-card.json
```

兼容路径：

- `/.well-known/agent-card.json`
- `/agent-card.json`

## 发送生成任务

```bash
curl -sS -X POST http://127.0.0.1:8787/message:send \
  -H 'content-type: application/a2a+json' \
  -H 'A2A-Version: 1.0' \
  --data '{
    "message": {
      "messageId": "msg-1",
      "role": "ROLE_USER",
      "parts": [
        {
          "data": {
            "address": "trojan://secret@example.com:443?sni=example.com#US-01",
            "services": ["Telegram", "ChatGPT"],
            "adBlock": true,
            "profileName": "surge-profile.conf"
          }
        }
      ]
    }
  }'
```

也可以直接传结构化生成器输入：

```json
{
  "message": {
    "messageId": "msg-2",
    "role": "ROLE_USER",
    "parts": [
      {
        "data": {
          "subscriptions": [
            {
              "name": "AirportA",
              "url": "https://example.com/sub?token=xxx"
            }
          ],
          "services": ["Telegram", "YouTube", "ChatGPT"],
          "adBlock": true
        }
      }
    ]
  }
}
```

返回值是 A2A task：

- `task.status.state = TASK_STATE_COMPLETED`：生成成功
- `task.status.state = TASK_STATE_FAILED`：生成器或校验器失败
- `task.status.state = TASK_STATE_INPUT_REQUIRED`：缺少 `address`、`subscriptions` 或 `proxies`

成功任务包含两个 artifact：

- `surge-profile`：`profile.conf` 文本
- `generation-result`：机器可读摘要，包含 warning、输入摘要和输出大小

## 查询任务

```bash
curl -H 'A2A-Version: 1.0' http://127.0.0.1:8787/tasks/<task-id>
```

列出任务：

```bash
curl -H 'A2A-Version: 1.0' http://127.0.0.1:8787/tasks
```

## 当前 MVP 边界

- 支持 HTTP+JSON `POST /message:send`
- 支持轮询 `GET /tasks/{id}` 和 `GET /tasks`
- 不支持 streaming、push notification、OAuth
- 默认不允许通过 A2A 请求读取本机 `addressFile`
- 不记录请求正文，避免订阅 token 和节点密码进入日志
