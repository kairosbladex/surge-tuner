# Proxy Tuner 用户使用手册

本手册面向普通用户：你只需要准备一个或多个 VPN 节点地址，Proxy Tuner 会生成可导入的代理配置、常用应用路由规则和去广告配置片段。

## 1. 准备 VPN 地址

支持的地址格式：

- `ss://...`
- `trojan://...`
- `vmess://...`
- `hy2://...` 或 `hysteria2://...`
- `tuic://...`
- 订阅链接，例如 `https://example.com/sub?token=xxx`

如果有多个地址，建议写到一个文本文件，每行一个：

```text
trojan://secret@hk.example.com:443?sni=hk.example.com#香港-HK-01
trojan://secret@us.example.com:443?sni=us.example.com#美国-US-01
```

示例文件路径可以放在 `/tmp/my-vpn-addresses.txt`。

## 2. 选择平台

支持四个平台：

| 平台 | 生成命令 |
|------|----------|
| Surge | `npm run generate:surge` |
| Loon | `npm run generate:loon` |
| Quantumult X | `npm run generate:qx` |
| Clash/Stash | `npm run generate:clash` |

## 3. 生成常用应用路由

最简单的命令是使用 `--preset common`。它会自动生成 Telegram、YouTube、GitHub、ChatGPT、Google、Twitter、Instagram 的路由规则。

Surge 示例：

```bash
npm run generate:surge -- \
  --addresses /tmp/my-vpn-addresses.txt \
  --preset common \
  --adblock \
  --output /tmp/proxy-tuner-surge.conf
```

Loon 示例：

```bash
npm run generate:loon -- \
  --addresses /tmp/my-vpn-addresses.txt \
  --preset common \
  --adblock \
  --output /tmp/proxy-tuner-loon.conf
```

Quantumult X 示例：

```bash
npm run generate:qx -- \
  --addresses /tmp/my-vpn-addresses.txt \
  --preset common \
  --adblock \
  --output /tmp/proxy-tuner-qx.conf
```

Clash/Stash 示例：

```bash
npm run generate:clash -- \
  --addresses /tmp/my-vpn-addresses.txt \
  --preset common \
  --adblock \
  --output /tmp/proxy-tuner-clash.yaml
```

生成成功后，会得到主配置文件。开启 `--adblock` 时，还会生成一个同目录的去广告 sidecar 文件，例如 Surge 会生成 `.sgmodule`。

## 4. 指定自己的应用

如果你不想用默认常用应用，可以用 `--services` 指定：

```bash
npm run generate:surge -- \
  --addresses /tmp/my-vpn-addresses.txt \
  --services Telegram,YouTube,GitHub,ChatGPT,Discord,Reddit \
  --adblock \
  --output /tmp/proxy-tuner-surge.conf
```

## 5. 自动检索规则

如果某个应用不在本地规则表中，可以加 `--discover-rules`。Proxy Tuner 会先查本地规则表，找不到时再去 blackmatrix7 的 GitHub 规则目录检索。

```bash
npm run generate:surge -- \
  --addresses /tmp/my-vpn-addresses.txt \
  --services Telegram,GitHub,Notion \
  --discover-rules \
  --output /tmp/proxy-tuner-surge.conf
```

检索成功的结果会缓存到 `.cache/rule-discovery.json`，该文件不会提交到 Git。

如果 GitHub 限流，可以临时设置：

```bash
export GITHUB_TOKEN=你的GitHubToken
```

## 6. 导入到客户端

### Surge

1. 将 `/tmp/proxy-tuner-surge.conf` 导入 Surge 配置。
2. 将同目录生成的 `.sgmodule` 导入 Surge 模块。
3. 在 Surge 中开启 MITM。
4. 在系统设置中信任 Surge CA 证书。

### Loon

1. 将 `/tmp/proxy-tuner-loon.conf` 导入 Loon。
2. 将生成的 Loon 去广告片段导入插件或合并到配置。
3. 如需 kelee.one 插件，运行 `bash kelee/fetch-plugins.sh` 查看推荐项，再在 Loon App 插件中心安装。

### Quantumult X

1. 将 `/tmp/proxy-tuner-qx.conf` 导入 Quantumult X。
2. 将生成的去广告片段合并到 rewrite/filter/MITM 对应区段。
3. 开启 MITM 并信任证书。

### Clash/Stash

1. 将 `/tmp/proxy-tuner-clash.yaml` 导入 Clash 或 Stash。
2. 将生成的 rule-provider 片段合并到 YAML。
3. Clash 只做规则层拦截，不执行 MITM 脚本。

## 7. 验证是否生效

生成后先做配置验证：

```bash
npm run validate
```

Surge 单文件验证：

```bash
node scripts/surge-config-validator.js /tmp/proxy-tuner-surge.conf
```

使用体验验证：

1. 打开 Telegram、YouTube、GitHub 或 ChatGPT。
2. 查看客户端策略组是否命中对应应用分流。
3. 打开之前有广告的 App，观察开屏广告或信息流广告是否减少。

## 8. 常见问题

### 提示 unknown service

说明服务名不在本地规则表中。处理方式：

```bash
加 --discover-rules
```

或换成本地支持的服务名，例如 `ChatGPT`、`GitHub`、`Telegram`。

### 去广告不生效

检查三件事：

1. 是否开启了 `--adblock`。
2. 是否导入了生成的去广告 sidecar 文件。
3. Surge/Loon/Quantumult X 是否开启 MITM 并信任证书。

### 多个节点没有被识别

确认地址文件是一行一个地址，不要把多个地址写在同一行。

### 不想访问 GitHub

不要加 `--discover-rules`。Proxy Tuner 会只使用本地规则表。
