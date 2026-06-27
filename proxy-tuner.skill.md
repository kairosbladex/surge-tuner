# Proxy Tuner — 跨平台代理配置自动生成 Agent

> 根据用户导入的机场地址，自动解析节点、按地区分组、匹配境外服务、生成优化配置（Surge/Loon/QX/Clash），并集成去广告规则。

## Description

Proxy Tuner 是一个纯交互式 Agent Skill，能根据用户提供的机场订阅链接，自动完成：订阅解析 → 节点分类 → 策略生成 → 配置输出，覆盖 Surge、Loon、Quantumult X、Clash 等主流代理工具。

## Use Cases

- "帮我根据这个订阅链接生成 Surge 配置：https://example.com/sub?token=xxx"
- "我有个机场订阅，帮我按地区分组节点"
- "给 Telegram/YouTube/GitHub 配置最优代理策略"
- "帮我集成 kelee.one 的去广告插件"
- "把我的 Surge 配置转换成 Loon 的"
- "帮我优化现有配置，加一些智能策略"

---

## 🧠 核心工作流

### 可执行 Module 优先

生成 Surge 配置时，优先调用仓库内可执行 Module，而不是只手写配置：

```bash
node scripts/surge-config-generator.js --address <uri-or-subscription-url> --services Telegram,ChatGPT --output <profile.conf>
node scripts/surge-config-generator.js --address-file <subscription.txt> --services Telegram,ChatGPT --adblock --output <profile.conf>
node scripts/surge-config-generator.js --input <input.json> --output <profile.conf>
node scripts/surge-config-validator.js <profile.conf>
```

约束：
- `surge-config-generator.js` 默认会在写出前自检；除非调试生成器本身，不要使用 `--skip-validate`
- 校验结果有 `error` 时，不要把配置作为可导入成品交付
- 校验结果有 `warning` 时，必须向用户说明风险，例如裸 `RULE-SET` 路径、非标准策略类型、模块 MITM 字段
- 严谨交付或发布示例配置时，生成命令加 `--strict`，把 warning 也当失败处理
- 只有生成器当前不覆盖的场景，才手工补配置；补完后仍必须运行校验器
- 地址解析当前覆盖 `ss://`、`trojan://`、`vmess://`、`hy2://`/`hysteria2://`、`tuic://`，以及明文/Base64 订阅内容

### A2A Remote Agent 入口

当调用方是另一个 agent，并且需要通过协议发现和任务结果获取，而不是直接执行本地 CLI 时，启动 A2A 服务：

```bash
npm run start:a2a
```

调用入口：

- `GET /.well-known/agent-card.json`：发现 agent 能力
- `POST /message:send`：提交 Surge 配置生成任务
- `GET /tasks/{id}`：查询 task/artifacts

请求正文优先使用 `parts[].data` 传结构化输入，例如：

```json
{
  "address": "trojan://secret@example.com:443?sni=example.com#US-01",
  "services": ["Telegram", "ChatGPT"],
  "adBlock": true
}
```

### 工作流 0：识别用户场景

当用户发起请求时，首先识别其意图：

| 关键词 | 场景 | 入口工作流 |
|--------|------|-----------|
| 订阅链接、机场、`http://`、`https://`、`ss://`、`vmess://` | 提供订阅链接 | 工作流 1 |
| 生成配置、帮我配置、自动配置 | 生成配置文件 | 工作流 2 |
| 去广告、拦截广告、kelee | 集成去广告能力 | 工作流 3 |
| 转换、转成、改成 Loon/QX/Clash | 跨平台转换 | 工作流 4 |
| 优化、卡顿、慢、策略调整 | 配置优化 | 工作流 5 |
| 添加节点、加个机场、新增订阅 | 增加/修改订阅 | 工作流 1 |

---

### 工作流 1：订阅解析与节点分类

当用户提供机场订阅链接时，执行以下步骤：

#### 步骤 1.1：获取订阅内容

```
用户提供 URL/节点 URI → Agent 调用 surge-config-generator 获取并解析
```

- 如果是 Base64 编码 → 先解码再解析
- 如果是 Clash YAML/JSON → 直接解析
- 如果是普通 URI 列表 → 逐行解析

优先执行：

```bash
node scripts/surge-config-generator.js --address <uri-or-subscription-url> --services <服务列表> --output <profile.conf>
node scripts/surge-config-validator.js <profile.conf> # 手工补配置后再跑
```

只有当前生成器不支持的格式（例如复杂 Clash provider YAML）才手工解析。

#### 步骤 1.2：解析节点列表

从订阅中提取每个节点的关键信息：

```
节点名 | 协议 | 服务器 | 端口 | 密码/密钥 | 额外参数
```

**支持的协议（参考 rules/protocols/protocols.md）：**
- Shadowsocks (ss://)
- ShadowsocksR (ssr://)
- VMess (vmess://)
- VLESS (vless://)
- Trojan (trojan://)
- Hysteria2 (hy2://)
- TUIC (tuic://)

#### 步骤 1.3：节点区域分类

使用 `rules/regions/detection-rules.md` 中的正则规则，对每个节点按名称匹配地区。

**匹配优先级（从高到低）：**
1. Emoji 国旗（🇭🇰 🇯🇵 🇺🇸 🇸🇬 等）
2. 中文地区名
3. 英文地区名/缩写
4. 城市名/机场码

**分类结果示例：**
```
未分类节点 → 遍历每个节点名称
  ├─ 匹配「香港|Hong Kong|HK|🇭🇰」→ 🇭🇰 香港组
  ├─ 匹配「日本|Japan|Tokyo|🇯🇵」→ 🇯🇵 日本组
  ├─ 匹配「美国|United States|USA|🇺🇸」→ 🇺🇸 美国组
  ├─ 匹配「新加坡|Singapore|SG|🇸🇬」→ 🇸🇬 新加坡组
  ├─ 匹配「韩国|Korea|KR|🇰🇷」→ 🇰🇷 韩国组
  ├─ 匹配「台湾|Taiwan|TW|🇹🇼」→ 🇹🇼 台湾组
  └─ 无匹配 → 🚩 未识别组（提示用户手动分类）
```

#### 步骤 1.4：展示分类结果给用户

```json
{
  "机场名称": "用户订阅",
  "节点总数": 25,
  "分类结果": {
    "🇭🇰 香港": ["HK-01", "HK-02", "香港BGP-01", ...],
    "🇯🇵 日本": ["Tokyo-01", "日本大阪-01", ...],
    "🇺🇸 美国": ["US-LA-01", "硅谷节点", ...],
    "🇸🇬 新加坡": ["SG-01", ...],
    "🇰🇷 韩国": ["KR-01", ...],
    "🚩 未识别": ["未知节点-01"]
  }
}
```

向用户确认分类结果，对未识别节点由用户决定归属。

---

### 工作流 1.5：询问用户使用的软件（动态服务发现）

在生成配置前，Agent 必须询问用户常用的境外软件/服务，以便动态生成对应的策略组。

#### 步骤：展示流行软件列表让用户勾选

参考 `rules/services/popular-apps-registry.md`，按分类展示：

```
🌏 国际社交: Telegram, Twitter/X, Instagram, Facebook, Discord, Reddit, WhatsApp, Snapchat, Threads
🔍 搜索引擎: Google, YouTube, GitHub, Wikipedia, Cloudflare
🎬 流媒体: Netflix, Spotify, Disney+, HBO, Hulu, Amazon Prime, BBC, Twitch
🤖 AI 服务: ChatGPT, Claude, Gemini, Copilot
🎮 游戏: Steam, Epic, PlayStation, Xbox, Nintendo, Riot, 米哈游
🛠️ 开发工具: Docker, Vercel, Notion, Figma, JetBrains
📧 其他: ProtonMail, Pinterest, LinkedIn, Tumblr, OnlyFans
```

**Agent 的话术：**
```
"我看到你的订阅已解析完成。现在请告诉我你常用的境外服务，
我会为每个服务生成独立的策略组，方便你手动切换最优节点。

以下是我推荐的常用服务列表，请勾选你需要的（多选）：
☐ Telegram    ☐ Twitter/X    ☐ YouTube    ☐ GitHub
☐ Google      ☐ Netflix      ☐ Spotify    ☐ Instagram
☐ Facebook    ☐ Discord      ☐ Reddit     ☐ TikTok
☐ ChatGPT     ☐ Claude       ☐ Disney+    ☐ Steam
☐ 其他（请写出具体名称）

你也可以全选，我会为每个服务生成策略组。
```

#### 步骤：查注册表匹配规则路径

用户确认后，Agent 执行：

1. 打开 `rules/services/popular-apps-registry.md`
2. 查找每个软件对应的 Surge 规则路径
3. 如果软件不在注册表中：
   - 用 GitHub API 搜索 blackmatrix7 仓库确认
   - 格式: `https://github.com/blackmatrix7/ios_rule_script/tree/master/rule/Surge/{软件名}`
   - 如果找不到，使用 DOMAIN-KEYWORD 或 DOMAIN-SUFFIX 手动添加
4. 将相同策略组的软件合并（如 Telegram + WhatsApp → Telegram 组）

#### 步骤：生成服务→策略映射表

输出给用户确认：

```json
{
  "Telegram → Telegram组": ["Telegram.list"],
  "Twitter, Facebook → 社交组": ["Twitter.list", "Facebook.list"],
  "YouTube → Youtube组": ["YouTube.list", "YouTubeMusic.list"],
  "Netflix, Disney+ → 流媒体组": ["Netflix.list", "Disney.list"],
  "ChatGPT, Claude → AI服务组": ["OpenAI.list", "Claude.list"]
}
```

用户确认后进入 Workflow 2 生成完整配置。

---

当用户要求生成配置文件时，按以下步骤生成完整的 Surge 配置。

> 优先路径：将用户确认后的订阅和服务选择整理为 JSON，调用 `scripts/surge-config-generator.js` 生成，再调用 `scripts/surge-config-validator.js` 校验。

#### 步骤 2.1：获取基础模板

从以下模板中选择基础：
- `templates/base.conf` — 通用稳定版
- `templates/surge-ios-base.conf` — iOS 专用省电版
- 或用 `configs/user-optimized.conf.example` 作为参考

#### 步骤 2.2：生成代理节点（[Proxy] 段）

将分类后的节点转换为 Surge 格式（参考 rules/protocols/protocols.md）：

```ini
[Proxy]
# ===== 机场订阅节点 =====
# 🇭🇰 香港
🇭🇰 HK-01 = ss, server.com, 443, encrypt-method=chacha20-ietf-poly1305, password=xxx, udp-relay=true
🇭🇰 HK-02 = trojan, server2.com, 443, password=xxx, tls=true, udp-relay=true
# 🇯🇵 日本
🇯🇵 Tokyo-01 = hysteria2, server3.com, 8443, password=xxx, sni=sni
# ... 以此类推
```

**重要：** 节点名建议加上 Emoji 国旗前缀，方便后续在策略组中识别。

#### 步骤 2.3：生成策略组（[Proxy Group] 段）

**参考黄金配置的模式（推荐 — 已验证的 Surge iOS 配置）：**

默认使用 `url-test` 策略（自动测速，兼容性更稳）+ 多机场聚合：

```ini
[Proxy Group]
# ===== 机场订阅 — 用户可添加 1~3 个 =====
机场A = select, policy-path=【你的订阅链接1】, update-interval=86400
机场B = select, policy-path=【你的订阅链接2】, update-interval=86400
机场C = select, policy-path=【你的订阅链接3】, update-interval=86400

# 全局节点池 — 聚合所有订阅，供手动选节点兜底
All = select, include-other-group="机场A, 机场B, 机场C"

# ===== 区域策略组 - url-test 自动测速 =====
# 直接从三家机场筛选，避免 All 中转确保节点名能被识别
# 正则匹配中文名 + emoji 国旗 + 英文缩写 + 城市名
🇭🇰 香港节点 = url-test, policy-regex-filter=香港|Hong Kong|HK|🇭🇰, include-other-group="机场A, 机场B, 机场C", url=http://www.gstatic.com/generate_204, interval=600, tolerance=50
🇯🇵 日本节点 = url-test, policy-regex-filter=日本|Japan|Tokyo|🇯🇵, include-other-group="机场A, 机场B, 机场C", url=http://www.gstatic.com/generate_204, interval=600, tolerance=50
🇸🇬 新加坡节点 = url-test, policy-regex-filter=新加坡|Singapore|SG|🇸🇬, include-other-group="机场A, 机场B, 机场C", url=http://www.gstatic.com/generate_204, interval=600, tolerance=50
🇺🇸 美国节点 = url-test, policy-regex-filter=美国|United States|USA|🇺🇸, include-other-group="机场A, 机场B, 机场C", url=http://www.gstatic.com/generate_204, interval=600, tolerance=50
🇰🇷 韩国节点 = url-test, policy-regex-filter=韩国|Korea|KR|🇰🇷, include-other-group="机场A, 机场B, 机场C", url=http://www.gstatic.com/generate_204, interval=600, tolerance=50
🇹🇼 台湾节点 = url-test, policy-regex-filter=台湾|Taiwan|TW|🇹🇼, include-other-group="机场A, 机场B, 机场C", url=http://www.gstatic.com/generate_204, interval=600, tolerance=50

# ===== 流媒体加速 — 优先 HY2/优化线路及亚洲近端流媒体地区 =====
流媒体高速 = url-test, policy-regex-filter=🇭🇰|香港|Hong Kong|HK|🇯🇵|日本|Japan|Tokyo|JP|🇸🇬|新加坡|Singapore|SG|🇹🇼|台湾|Taiwan|TW|🇺🇸|美国|United States|USA|US|🇩🇪|德国|Germany|DE|HY2|优化, include-other-group="机场A, 机场B, 机场C", url=http://www.gstatic.com/generate_204, interval=600, tolerance=50
```

**备选方案：**
- 单机场用户 → 将 `机场A, 机场B, 机场C` 替换为单个订阅名
- 如明确确认 Surge 版本支持 `smart` → 可把区域组类型从 `url-test` 改为 `smart`
- 如需手动选择 → 将 `url-test` 改为 `select`

#### 步骤 2.4：生成服务策略组（动态）

根据 **工作流 1.5** 用户勾选的软件，从 `rules/services/popular-apps-registry.md` 查找对应的规则路径：

**Agent 逻辑：**
```
FOR 每个用户选择的软件:
  查注册表 → 找到规则路径
  IF 已有同策略组（如多个社交软件）:
    合并到已有组
  ELSE:
    创建新策略组
    生成规则引用: RULE-SET, {路径}, {组名}
```

**示例**（用户选择了 Telegram、YouTube、GitHub、Netflix、ChatGPT）：

```ini
# ===== 国际服务分流组（参考 rules/services/README.md）=====
Instagram = select, 香港节点, 美国节点, 日本节点, All
Google = select, 香港节点, 美国节点, 日本节点, All
Youtube = select, 香港节点, 美国节点, 新加坡节点, All
奈飞 = select, 美国节点, 香港节点, 新加坡节点, All
Disney+ = select, 美国节点, 新加坡节点, 日本节点, All
# AI 服务必须避开香港/中国大陆 IP，否则被 OpenAI/Claude/Gemini 直接拒绝
AI服务 = select, 美国节点, 日本节点, 新加坡节点, All
TikTok = select, 美国节点, 日本节点, 台湾节点, All
Telegram = select, 香港节点, 美国节点, 新加坡节点, All
GitHub = select, 香港节点, 美国节点, 日本节点, All
Spotify = select, 香港节点, 美国节点, 新加坡节点, All
Twitter = select, 香港节点, 美国节点, All
Facebook = select, 香港节点, 美国节点, All
Discord = select, 美国节点, 日本节点, 新加坡节点, 香港节点, All
Reddit = select, 美国节点, 日本节点, 新加坡节点, 香港节点, All

# ===== 流媒体加速组（Pornhub 等视频站点专用）=====
Pornhub加速 = select, 流媒体高速, 香港节点, 日本节点, 新加坡节点, 台湾节点, 美国节点, All

# ===== 微软服务 - 国内通常有 CDN 直连快，海外可切代理 =====
微软服务 = select, DIRECT, 香港节点, 美国节点, All

# ===== 国产应用 - 默认直连，国外漫游或被风控时手动切代理 =====
国产应用 = select, DIRECT, 香港节点, 美国节点, 日本节点

# ===== 兜底策略 - 默认直连 =====
兜底分流 = select, DIRECT, 香港节点, 美国节点, 新加坡节点, 日本节点
```

#### 步骤 2.5：生成规则（[Rule] 段）

规则顺序至关重要（从上到下匹配）：

```ini
[Rule]
# ===== L0: 自定义直接拒绝/直连（最先匹配）=====
# DOMAIN,msmp.abchina.com.cn,REJECT

# ===== L1: 兼容性/特殊接口直连（避免被广告规则误伤）=====
DOMAIN-SUFFIX,pinduoduo.com,DIRECT
DOMAIN-SUFFIX,yangkeduo.com,DIRECT
DOMAIN-SUFFIX,pinduoduo.net,DIRECT
DOMAIN-SUFFIX,pddpic.com,DIRECT
DOMAIN-SUFFIX,pddcdn.com,DIRECT
DOMAIN-SUFFIX,pddugc.com,DIRECT

# 抖音系 — 走 国产应用 组（国外可手动切代理）
DOMAIN-SUFFIX,douyin.com,国产应用
DOMAIN-SUFFIX,douyincdn.com,国产应用
DOMAIN-SUFFIX,douyinpic.com,国产应用
DOMAIN-SUFFIX,iesdouyin.com,国产应用
DOMAIN-SUFFIX,amemv.com,国产应用
DOMAIN-SUFFIX,zijieapi.com,国产应用
DOMAIN-SUFFIX,snssdk.com,国产应用
DOMAIN-SUFFIX,byteimg.com,国产应用
DOMAIN-SUFFIX,bytedance.com,国产应用
DOMAIN-SUFFIX,volccdn.com,国产应用

# ===== L2: 自定义域名规则 =====
DOMAIN-SUFFIX,vercel.app,DIRECT
DOMAIN-SUFFIX,v2ex.com,Google
DOMAIN,www.v2ex.com,Google
DOMAIN,cdn.v2ex.com,GitHub
DOMAIN,youtubei.googleapis.com,Youtube
DOMAIN,app-analytics-services.com,Youtube

# ===== L3: 成人站点 → Pornhub 专用加速组 =====
DOMAIN-SUFFIX,pornhub.com,Pornhub加速
DOMAIN-SUFFIX,pornhub.org,Pornhub加速
DOMAIN-SUFFIX,pornhubpremium.com,Pornhub加速
DOMAIN-SUFFIX,phncdn.com,Pornhub加速
DOMAIN-SUFFIX,phprcdn.com,Pornhub加速
DOMAIN-SUFFIX,ypncdn.com,Pornhub加速
DOMAIN-SUFFIX,t8cdn.com,Pornhub加速
DOMAIN-SUFFIX,trafficjunky.net,REJECT
DOMAIN-SUFFIX,trafficjunky.com,REJECT

# ===== L4: Discord/Reddit — 先于广告规则匹配，避免落到 DIRECT 兜底 =====
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Discord/Discord.list,Discord
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Reddit/Reddit.list,Reddit
DOMAIN-SUFFIX,hcaptcha.com,Discord
DOMAIN-SUFFIX,hcaptcha.net,Discord

# ===== L5: 广告/隐私/防劫持 - 在线规则集（自动更新）=====
# anti-AD：国内最权威的去广告规则集
RULE-SET,https://anti-ad.net/surge.txt,REJECT
# blackmatrix7 通用广告/隐私/防劫持
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Advertising/Advertising.list,REJECT
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Privacy/Privacy.list,REJECT
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Hijacking/Hijacking.list,REJECT
# EasyPrivacy：国际隐私追踪拦截
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/EasyPrivacy/EasyPrivacy_All_No_Resolve.list,REJECT
# 知乎专用广告拦截
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/ZhihuAds/ZhihuAds.list,REJECT

# ===== L6: Apple 系服务（全部直连）=====
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Apple/Apple.list,DIRECT
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/iCloud/iCloud.list,DIRECT
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/AppStore/AppStore.list,DIRECT

# ===== L7: 微软服务 + PayPal =====
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Microsoft/Microsoft.list,微软服务
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/OneDrive/OneDrive.list,微软服务
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/PayPal/PayPal.list,Google

# ===== L8: 国产应用规则集 =====
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/WeChat/WeChat.list,国产应用
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Weibo/Weibo.list,国产应用
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/BiliBili/BiliBili.list,国产应用
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/XiaoHongShu/XiaoHongShu.list,国产应用
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/SteamCN/SteamCN.list,DIRECT

# ===== L9: 国际服务规则集 =====
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Google/Google.list,Google
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/YouTube/YouTube.list,Youtube
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Instagram/Instagram.list,Instagram
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Facebook/Facebook.list,Facebook
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Twitter/Twitter.list,Twitter
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Telegram/Telegram.list,Telegram
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/GitHub/GitHub.list,GitHub
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Spotify/Spotify.list,Spotify
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/TikTok/TikTok.list,TikTok
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Netflix/Netflix.list,奈飞

# ===== L10: AI 服务规则集 =====
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/OpenAI/OpenAI.list,AI服务
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Claude/Claude.list,AI服务
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Gemini/Gemini.list,AI服务
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Copilot/Copilot.list,AI服务

# ===== L11: 最终规则 =====
GEOIP,CN,DIRECT
FINAL,兜底分流,dns-failed
```

#### 步骤 2.6：生成 General 段和其他配置

```ini
[General]
# 启用 IPv6（自动判断，避免影响国内 IPv6 服务）
ipv6 = true
ipv6-vif = automatic

# WiFi 共享 - 让局域网其他设备走 iPhone 代理
allow-wifi-access = true
wifi-access-http-port = 6152
wifi-access-socks5-port = 6153

# 直连地址（不走代理）
skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, 17.0.0.0/8, localhost, *.local, *.crashlytics.com

# Apple 服务走真实 IP
always-real-ip = *.apple.com, *.icloud.com, *.icloud-content.com, *.mzstatic.com, *.crashlytics.com, *.apple-cloudkit.com, *.push.apple.com

exclude-simple-hostnames = true
enhanced-mode-by-rule = true

# DNS - 阿里 + 腾讯 公共 DNS，配合 DoH 加密查询防污染
dns-server = 223.5.5.5, 119.29.29.29
encrypted-dns-server = https://dns.alidns.com/dns-query, https://doh.pub/dns-query
dns-ipv6 = false

# 劫持系统 DNS 请求（防止 App 用 Google/CF DNS 绕过策略）
hijack-dns = 8.8.8.8:53, 8.8.4.4:53, 1.1.1.1:53

# 连通性测试
internet-test-url = http://www.qualcomm.cn/generate_204
proxy-test-url = http://www.gstatic.com/generate_204
test-timeout = 3

# 体验优化
show-error-page-for-reject = true
loglevel = warning
```

#### 步骤 2.7：输出完整配置

将生成的完整配置展示给用户，并提示：
1. 替换订阅 token 为真实值
2. 安装并信任 MITM CA 证书（如使用去广告功能）
3. 将 rulesets/ 和 scripts/ 目录复制到 Surge 配置目录

---

### 工作流 3：集成去广告能力

#### 方案 A：使用 surge-tuner 本地去广告（推荐）

本项目的 `modules/`、`rulesets/`、`scripts/` 已提供完整的去广告能力。

在配置中集成：

```ini
[Rule]
# 引入 surge-tuner 的规则集
RULE-SET,rulesets/SplashAd.list, REJECT
RULE-SET,rulesets/InAppAd.list, REJECT
RULE-SET,rulesets/Tracking.list, REJECT
RULE-SET,rulesets/AntiAd-Script.list, REJECT-TINYGIF
# 在线 anti-ad 规则集
RULE-SET,https://anti-ad.net/surge.txt,REJECT
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Hijacking/Hijacking.list,REJECT
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Privacy/Privacy.list,REJECT

[MITM]
enable = true
hostname = -*.apple.com, -*.icloud.com, -*.mzstatic.com, -*.crashlytics.com, *.pangle.io, *.pangleglobal.com, *.gdt.qq.com, *.ad.qq.com, *.doubleclick.net, *.googlesyndication.com, *.googleadservices.com, *.applovin.com, *.vungle.com, *.mintegral.com, *.appsflyer.com, *.adjust.com
skip-server-cert-verify = true

[Script]
http-response ^https?://.* requires-body = true script-path = scripts/ad-block-all.js
http-request ^https?://.* script-path = scripts/anti-tracking.js
http-response ^https?://.* script-path = scripts/anti-tracking.js
```

#### 方案 B：集成 kelee.one 规则（Loon 用户）

参考 `kelee/fetch-plugins.sh` 和 `docs/kelee-integration.md`：

```bash
# 获取插件目录
bash kelee/fetch-plugins.sh

# 查看去广告插件列表，通过 Loon App 安装
```

#### 方案 C：在线规则集（跨平台通用）

```ini
# 跨平台通用广告拦截规则集
# anti-ad（中文环境最优）
RULE-SET,https://anti-ad.net/surge.txt,REJECT
# blackmatrix7 广告
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Advertising/Advertising.list,REJECT
# EasyPrivacy（国际追踪）
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/EasyPrivacy/EasyPrivacy_All_No_Resolve.list,REJECT
```

---

### 工作流 4：跨平台配置转换

当用户需要将 Surge 配置转换为其他平台时：

#### 步骤 4.1：解析源配置
读取 Surge 配置的各段

#### 步骤 4.2：语法转换（参考 docs/cross-platform-conversion.md）

| 转换方向 | 主要变化 |
|---------|---------|
| Surge → Loon | 基本一致，调整 Remote Proxy |
| Surge → Quantumult X | DOMAIN→HOST, IP-CIDR6→IP6-CIDR, 调整 [policy]/[filter_remote] |
| Surge → Clash | INI→YAML, FINAL→MATCH, 重写 providers |

#### 步骤 4.3：输出目标平台配置

向用户展示转换后的配置，并提示各平台的特定注意事项。

---

### 工作流 5：配置优化与调优

#### 场景 5.1：节点速度慢/卡顿

```
诊断 → 检查策略类型
  ├─ 当前是 select → 建议改用 url-test 自动选择
  ├─ 当前是 url-test → 调整 tolerance 值（默认100，可调低到50）
  └─ tolerance 已优化 → 建议增加同区域节点数量

检查代理协议
  ├─ 优先使用 Hysteria2 / TUIC（UDP 协议，弱网环境下表现好）
  └─ 避免使用 SSR（Surge 不支持，需外部代理）
```

#### 场景 5.2：特定服务无法访问

```
诊断 → 检查规则顺序
  ├─ 规则是否在广告拦截之上被误杀？
  ├─ 是否需要添加 DOMAIN 规则直接指定策略？
  └─ 是否因区域 IP 被目标服务封锁？

解决方案
  ├─ 添加 DOMAIN-KEYWORD 规则提前匹配
  ├─ 对风控严格的服务（AI 等）改用 select 手动换节点
  └─ 添加 no-resolve 避免 IP 规则触发 DNS 解析
```

#### 场景 5.3：电池消耗快（iOS）

```
检查项：
  ├─ enhanced-mode-by-rule = true（iOS 省电关键）
  ├─ loglevel = error 或 warning（不要用 info）
  ├─ dns-server 优先用系统 DNS（system, 223.5.5.5）
  └─ 减少不必要的 MITM 域名
```

---

## 📋 关键参考资源

| 资源 | 路径 | 说明 |
|------|------|------|
| 流行软件规则注册表 | `rules/services/popular-apps-registry.md` | **主注册表**，80+ 流行软件的规则路径映射 |
| 服务→区域映射 | `rules/services/README.md` | 各服务的最优区域分配原则 |
| 区域检测规则 | `rules/regions/detection-rules.md` | 节点名称→地区的正则 |
| 协议解析规则 | `rules/protocols/protocols.md` | 各协议的 URI 解析和 Surge 格式 |
| 跨平台转换 | `docs/cross-platform-conversion.md` | Surge→Loon/QX/Clash 转换参考 |
| kelee.one 集成 | `kelee/fetch-plugins.sh` | 获取去广告插件目录 |
| 配置模板 | `templates/` | Surge 基础配置模板 |
| 黄金参考配置 | `configs/reference-golden.conf` | 已验证的完整 Surge for iOS 配置 |

## ⚠️ 重要约束

1. **不要生成包含真实代理服务器地址的配置** — 使用占位符 token
2. **MITM 必须排除 Apple 域名** — `-*.apple.com`, `-*.icloud.com` 等以 `-` 开头
3. **规则顺序敏感** — LAN/Apple 直连 > 广告拦截 > 国内直连 > 国际服务 > 兜底
4. **策略类型选择原则**：
   - 延迟敏感（浏览/社交/代码）→ `url-test`
   - 解锁需求（流媒体/AI）→ `select`
   - Surge 专属 → `smart`（仅在明确确认目标 Surge 版本支持时使用）
5. **subscription token 必须由用户替换** — 配置中使用 `【你的Token】` 占位
6. **纯 Agent Skill** — 所有逻辑通过 Agent 交互完成，不依赖外部程序
