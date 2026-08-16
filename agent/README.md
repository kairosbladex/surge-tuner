# Surge 配置助手 —— DSH 智能体预设

> 一个通用的智能体：**根据 VPN 节点或订阅地址，自动解析节点、生成并校验可导入 Surge 的配置文件**。
> 基于 surge-tuner 引擎，安装后即可在 DeepSeek Harness（DSH）里用自然语言对话生成配置。

## 这是什么

本目录是 surge-tuner 的 **DSH 智能体预设**，安装后为你的 DSH 增加一个「Surge 配置助手」预设，包含三个结构化工具：

| 工具 | 功能 |
|------|------|
| `surge_generate_profile` | 输入订阅链接/节点链接（一行一个），生成可导入 Surge 的 `.conf`，支持 19 个常用服务的分流规则、去广告、strict 校验 |
| `surge_parse_addresses` | 生成前先预览节点（名称/协议/服务器/端口） |
| `surge_validate_profile` | 校验已有或手工修改过的 `.conf` |

支持的链接格式：`ss://`、`trojan://`、`vmess://`、`hy2://`、`hysteria2://`、`tuic://`，以及明文/Base64 订阅内容和订阅 URL（自动拉取）。

## 安装

需要：一台电脑、Node ≥ 20（仅引擎运行需要）、已部署 DeepSeek Harness。

**Windows（PowerShell）**：

```powershell
powershell -ExecutionPolicy Bypass -File agent\install.ps1
```

**macOS / Linux**：

```bash
bash agent/install.sh
```

脚本会把预设安装到 `${DSH_HOME:-~/.dsh}/.agent-presets/surge-tuner/`，并把引擎打包进预设目录的 `engine/`——预设**自包含**，安装后移动或删除 surge-tuner 仓库也不影响使用。

也可以完全手动：把本目录整个复制到 `${DSH_HOME}/.agent-presets/surge-tuner/`，再把仓库里的 `scripts/ rules/ rulesets/ templates/ modules/` 五个目录复制到该预设目录的 `engine/` 下。

## 使用

1. 在 DSH 里新建会话，预设选择 **Surge 配置助手**（工作目录任选）。
2. 直接说人话，例如：
   - 「用这个订阅链接生成 Surge 配置：`https://…/sub?token=…`」
   - 「把这几行节点链接做成配置，加上 Telegram、YouTube、ChatGPT 分流」
   - 「生成时带去广告」
   - 「帮我看看这个配置有没有问题」（对已有 `.conf` 使用校验工具）
3. 把生成的 `.conf` 发到手机，在 Surge 中「配置 → 从文件导入」即可。

## 更新引擎

引擎（生成器/校验器/规则表）随仓库更新：

1. 在仓库目录 `git pull`；
2. 重跑安装脚本（Windows 加 `-EngineOnly`、macOS/Linux 加 `--engine-only` 可只刷新引擎快照）；
3. 重启 DSH（预设插件按文件名缓存在进程内，重启后加载新引擎）。

如果希望智能体**始终使用你 git 仓库里的最新引擎**（开发者布局），把 surge-tuner 仓库放在会话工作目录下即可——预设会优先使用「工作目录/surge-tuner」，无需每次重装。

## 高级配置

- **显式指定引擎位置**：编辑预设目录下 `agent.cordis.yml`，取消 `surge-tools` 行的 `config.repoPath` 注释，填入 surge-tuner 仓库的绝对路径。
- **跨平台与 A2A**：surge-tuner 仓库自带 Loon / Quantumult X / Clash 生成器、Web 页面（`npm run quick-start`）和 A2A 服务（`npm run start:a2a`），可被其他 Agent 平台通过 HTTP 调用，详见仓库 `docs/a2a.md`。

## 安全提示

订阅链接、节点链接和生成的 `.conf` 都包含你的私密 token 或密码：

- 所有处理都在本机完成，不经过任何第三方服务；
- 不要把这些内容发到群聊、公开仓库或论坛；
- 本预设的提示词会要求智能体不在回复中回显完整链接与配置内容。

## 常见问题

| 现象 | 处理 |
|------|------|
| 提示「找不到 surge-tuner 引擎」 | 重跑 install 脚本打包 engine/；或在工作目录放 surge-tuner 仓库；或在 `agent.cordis.yml` 配置 `repoPath` |
| 生成失败（订阅过期/拉取失败） | 确认订阅链接完整复制、当前网络可访问、服务商账号有效 |
| 去广告不生效 | 需在 Surge 开启 MITM 并信任证书，详见仓库 `docs/mitm-setup.md` |
| 修改插件后不生效 | 插件按文件名缓存在 DSH 进程内：改文件名（并同步 `agent.cordis.yml`）或重启 DSH |
