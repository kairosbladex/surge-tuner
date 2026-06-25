# 流行软件→规则路径映射注册表

> 基于 [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script) 仓库的 Surge 规则集
> Agent 根据用户选择的软件，自动查找对应规则路径并生成服务组

## 使用方式

Agent 首先生成以下列表让用户勾选，用户确认后自动查表生成配置。

---

## 🌏 国际社交/通讯

| 软件 | 规则路径（Surge） | 推荐策略 |
|------|-------------------|---------|
| Telegram | Telegram/Telegram.list | Telegram |
| Twitter / X | Twitter/Twitter.list | Twitter |
| Instagram | Instagram/Instagram.list | Instagram |
| Facebook | Facebook/Facebook.list | Facebook |
| Discord | Discord/Discord.list | Discord |
| Reddit | Reddit/Reddit.list | Reddit |
| WhatsApp | WhatsApp/WhatsApp.list | WhatsApp |
| Signal | (建议 DOMAIN-KEYWORD) | Proxy |
| Line | Line/Line.list | Proxy |
| KakaoTalk | KakaoTalk/KakaoTalk.list | Proxy |
| Snapchat | Snap/Snap.list | Proxy |
| TikTok | TikTok/TikTok.list | TikTok |
| Clubhouse | Clubhouse/Clubhouse.list | Proxy |
| Threads | Threads/Threads.list | Proxy |
| TruthSocial | TruthSocial/TruthSocial.list | Proxy |
| Skype | (部分在 Microsoft 内) | 微软服务 |

## 🔍 搜索引擎/科技

| 软件 | 规则路径（Surge） | 推荐策略 |
|------|-------------------|---------|
| Google | Google/Google.list | Google |
| Google Drive | GoogleDrive/GoogleDrive.list | Google |
| YouTube | YouTube/YouTube.list | Youtube |
| YouTube Music | YouTubeMusic/YouTubeMusic.list | Youtube |
| GitHub | GitHub/GitHub.list | GitHub |
| GitLab | GitLab/GitLab.list | GitHub |
| Stackoverflow | Stackexchange/Stackexchange.list | Google |
| Wikipedia | Wikimedia/Wikimedia.list | Google |
| DuckDuckGo | Duckduckgo/Duckduckgo.list | Google |
| Cloudflare | Cloudflare/Cloudflare.list | Proxy |

## 🎬 流媒体

| 软件 | 规则路径（Surge） | 推荐策略 |
|------|-------------------|---------|
| Netflix | Netflix/Netflix.list | 奈飞 |
| Spotify | Spotify/Spotify.list | Spotify |
| Disney+ | Disney/Disney.list | Disney+ |
| HBO | HBO/HBO.list | 流媒体高速 |
| Hulu | Hulu/Hulu.list | 流媒体高速 |
| Amazon Prime Video | AmazonPrimeVideo/AmazonPrimeVideo.list | 流媒体高速 |
| BBC | BBC/BBC.list | 流媒体高速 |
| Apple TV | AppleTV/AppleTV.list | DIRECT |
| Apple Music | AppleMusic/AppleMusic.list | DIRECT |
| Apple News | AppleNews/AppleNews.list | DIRECT |
| Pandora | Pandora/Pandora.list | Spotify |
| SoundCloud | SoundCloud/SoundCloud.list | Spotify |
| TIDAL | TIDAL/TIDAL.list | Spotify |
| Dailymotion | Dailymotion/Dailymotion.list | Youtube |
| Twitch | Twitch/Twitch.list | 流媒体高速 |
| Vimeo | Vimeo/Vimeo.list | Youtube |
| Pornhub | (DOMAIN-SUFFIX 自定义) | Pornhub加速 |
| AbemaTV | AbemaTV/AbemaTV.list | 流媒体高速 |
| Bahamut | Bahamut/Bahamut.list | 流媒体高速 |

## 🤖 AI 服务

| 软件 | 规则路径（Surge） | 推荐策略 |
|------|-------------------|---------|
| ChatGPT / OpenAI | OpenAI/OpenAI.list | AI服务 |
| Claude | Claude/Claude.list | AI服务 |
| Gemini | Gemini/Gemini.list | AI服务 |
| GitHub Copilot | Copilot/Copilot.list | AI服务 |
| Anthropic | Anthropic/Anthropic.list | AI服务 |
| Perplexity | (建议 DOMAIN-KEYWORD) | AI服务 |

## 🗄️ 微软服务

| 软件 | 规则路径（Surge） | 推荐策略 |
|------|-------------------|---------|
| Microsoft | Microsoft/Microsoft.list | 微软服务 |
| OneDrive | OneDrive/OneDrive.list | 微软服务 |
| Teams | Teams/Teams.list | 微软服务 |
| Microsoft Edge | MicrosoftEdge/MicrosoftEdge.list | 微软服务 |
| Bing / Copilot | Copilot/Copilot.list | AI服务 |
| Outlook | (部分在 Microsoft 内) | 微软服务 |

## 🎮 游戏

| 软件 | 规则路径（Surge） | 推荐策略 |
|------|-------------------|---------|
| Steam | Steam/Steam.list | 游戏 |
| Steam 国区 | SteamCN/SteamCN.list | DIRECT |
| Epic Games | Epic/Epic.list | 游戏 |
| PlayStation | PlayStation/PlayStation.list | 游戏 |
| Xbox | Xbox/Xbox.list | 游戏 |
| Nintendo | Nintendo/Nintendo.list | 游戏 |
| Rockstar (GTA) | Rockstar/Rockstar.list | 游戏 |
| Blizzard (暴雪) | Blizzard/Blizzard.list | 游戏 |
| Riot (LOL/Valorant) | Riot/Riot.list | 游戏 |
| Ubisoft | UBI/UBI.list | 游戏 |
| EA / Origin | EA/EA.list, Origin/Origin.list | 游戏 |
| 米哈游 (原神/星铁) | 米哈游HoYoverse/米哈游HoYoverse.list | 国产应用 |
| Roblox | Roblox/Roblox.list | 游戏 |

## 💳 支付/金融

| 软件 | 规则路径（Surge） | 推荐策略 |
|------|-------------------|---------|
| PayPal | PayPal/PayPal.list | Google |
| Stripe | Stripe/Stripe.list | Google |
| 币安 | 币安交易所/币安交易所.list | Proxy |

## 🛠️ 开发工具

| 软件 | 规则路径（Surge） | 推荐策略 |
|------|-------------------|---------|
| Docker | Docker/Docker.list | GitHub |
| Heroku | Heroku/Heroku.list | GitHub |
| Vercel | Vercel/Vercel.list | DIRECT |
| JetBrains | Jetbrains/Jetbrains.list | Proxy |
| Notion | Notion/Notion.list | Google |
| Figma | Figma/Figma.list | Proxy |
| npm | Npmjs/Npmjs.list | GitHub |
| DigitalOcean | DigitalOcean/DigitalOcean.list | Proxy |
| Oracle Cloud | Oracle/Oracle.list | Proxy |
| Linux | Linux/Linux.list | Proxy |
| Ubuntu | Ubuntu/Ubuntu.list | Proxy |

## 📸 图片/社交

| 软件 | 规则路径（Surge） | 推荐策略 |
|------|-------------------|---------|
| Pinterest | Pinterest/Pinterest.list | Instagram |
| Imgur | Imgur/Imgur.list | Instagram |
| Flickr | (DOMAIN-KEYWORD) | Instagram |
| LinkedIn | LinkedIn/LinkedIn.list | Google |
| Tumblr | Tumblr/Tumblr.list | Proxy |
| OnlyFans | (DOMAIN-SUFFIX 自定义) | Pornhub加速 |

## 🏪 电商

| 软件 | 规则路径（Surge） | 推荐策略 |
|------|-------------------|---------|
| Amazon | Amazon/Amazon.list | Google |
| eBay | eBay/eBay.list | Proxy |
| Shopify | Shopify/Shopify.list | Google |
| Shopee | Shopee/Shopee.list | 国产应用 |

## 🎵 音乐/播客

| 软件 | 规则路径（Surge） | 推荐策略 |
|------|-------------------|---------|
| Spotify | Spotify/Spotify.list | Spotify |
| Apple Music | AppleMusic/AppleMusic.list | DIRECT |
| YouTube Music | YouTubeMusic/YouTubeMusic.list | Youtube |
| SoundCloud | SoundCloud/SoundCloud.list | Spotify |
| Shazam | (Apple 旗下) | DIRECT |
| Deezer | Deezer/Deezer.list | Spotify |
| Pandora | Pandora/Pandora.list | Spotify |
| KKBOX | KKBOX/KKBOX.list | Spotify |
| JOOX | JOOX/JOOX.list | Spotify |

## 📧 邮件/生产力

| 软件 | 规则路径（Surge） | 推荐策略 |
|------|-------------------|---------|
| ProtonMail | Protonmail/Protonmail.list | Google |
| Spark | Spark/Spark.list | 微软服务 |
| Notion | Notion/Notion.list | Google |
| Evernote | (部分在 Google 内) | Google |

---

## Agent 工作流程

```
用户输入 → 工作流 0 识别场景
  │
  ▼
判断是否要生成新配置
  │
  ▼
展示流行软件分类列表（按上述类别分组）
  → 让用户勾选需要的软件
  → 用户也可以补充未列出的软件名称
  │
  ▼
Agent 根据选择查注册表 → 找到每个软件的规则路径
  → 没有注册的软件：Agent 去 GitHub 搜索确认
  → 合并同类策略（如 Telegram+WhatsApp 都用 Telegram 组）
  │
  ▼
动态生成：
  1. 服务策略组（每个分组一个 select）
  2. RULE-SET 引用（每个软件对应的规则路径）
  3. 输出完整配置
```

## GitHub 搜索备用方案

如果用户在注册表中没找到某软件，Agent 可以：

```
GitHub API 搜索: https://api.github.com/search/code?q={软件名}+repo:blackmatrix7/ios_rule_script+path:rule/Surge
或直接浏览: https://github.com/blackmatrix7/ios_rule_script/tree/master/rule/Surge
```

## 基础服务组（始终生成）

以下服务组无论用户选择什么软件，始终生成（来自黄金配置）：

- Apple 服务 → DIRECT
- 微软服务 → select
- 国产应用 → select
- 兜底分流 → select
