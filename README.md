# Proxy Tuner — 跨平台代理配置自动生成 & 去广告工具包

> 🚀 **根据用户导入的机场地址，自动解析节点、按地区分组、匹配境外服务，一键生成优化配置**

---

## 🌟 项目愿景

**Proxy Tuner** 是一个纯 AI Agent 驱动的配置生成器，致力于解决代理配置中的两大痛点：

1. **配置繁琐** — 机场订阅节点多，手动分不清地区，策略组配到手软
2. **广告困扰** — 去广告规则分散，集成困难

我们通过一个 **交互式 Agent**（Skill 文件），让 AI 帮你完成所有工作。

---

## 🎯 核心能力

| 能力 | 说明 | 对应工作流 |
|------|------|-----------|
| 🔗 **订阅解析** | 自动拉取机场订阅，识别每个节点的协议、地区、线路类型 | 工作流 1 |
| 🌍 **节点分类** | 通过节点名称中的 Emoji/中文/英文，自动分配到对应地区组 | 工作流 1 |
| 🧠 **智能策略** | 为每个服务推荐最优策略类型（URL-Test/Smart/Select） | 工作流 2 |
| 📋 **配置生成** | 生成完整的 Surge 配置，含 General/Proxy/Proxy Group/Rule/MITM | 工作流 2 |
| 🛡️ **去广告集成** | 集成 surge-tuner 本地规则 + anti-ad 在线规则 + kelee.one 插件 | 工作流 3 |
| 🔄 **跨平台转换** | Surge ↔ Loon ↔ Quantumult X ↔ Clash 配置互转 | 工作流 4 |
| ⚡ **配置优化** | 诊断卡顿/断网/耗电问题，提供优化建议 | 工作流 5 |

---

## 🚀 快速开始

### 方式一：交互式 Agent（推荐）

直接与 Agent 对话，输入你的需求：

```
"帮我根据这个订阅链接生成 Surge 配置：https://example.com/sub?token=xxx"
"给我的节点按香港/日本/美国分类"
"帮我集成去广告规则到现有配置"
"把这份 Surge 配置转成 Loon 的"
```

Agent 会自动执行对应工作流，与你交互确认后生成配置。

### 方式二：直接使用模板

如果你已经熟悉配置，可以直接使用 `templates/` 目录下的模板：

- `templates/surge-subscription-template.conf` — 订阅 + 智能分流模板（**推荐**）
- `templates/base.conf` — 基础稳定版
- `templates/surge-ios-base.conf` — iOS 省电版

### 方式三：使用去广告模块（原有功能）

将 `modules/` 下的 `.sgmodule` 文件放入 Surge 配置目录即可启用。

---

## 📁 项目结构

```
surge-tuner/
├── proxy-tuner.skill.md      # 🔥 主 Agent 技能文件（核心！）
├── surge-tuner.skill.md      # 旧技能文件（向后兼容）
├── configs/                  # 完整配置示例
│   ├── full-adblock.conf     # 全量去广告配置
│   ├── stable-only.conf      # 仅稳定性优化
│   ├── user-original.conf    # 真实用户配置示例（含三机场+智能分流）
│   ├── user-optimized.conf   # 优化后的用户配置
│   └── user-optimized.conf.example # 优化版（脱敏）
├── templates/                # 配置模板
│   ├── surge-subscription-template.conf  # 🔥 订阅+智能分流模板
│   ├── base.conf             # 通用稳定版
│   └── surge-ios-base.conf   # iOS 专用版
├── modules/                  # Surge 模块 (.sgmodule)
│   ├── Anti-Splash-Ad.sgmodule     # 开屏广告拦截
│   ├── Anti-InApp-Ad.sgmodule      # 应用内广告拦截
│   ├── Anti-Tracking.sgmodule      # 隐私追踪拦截
│   ├── Ad-Block-All.sgmodule       # 全能广告合辑
│   └── Stable-Optimization.sgmodule # 稳定性优化
├── scripts/                  # Surge JavaScript 脚本
│   ├── ad-block-all.js       # 全能广告拦截
│   ├── anti-tracking.js      # 隐私追踪拦截
│   └── ...                   # 更多脚本
├── rulesets/                 # 规则集（广告域名列表）
│   ├── AdDomains.list        # 广告域名
│   ├── SplashAd.list         # 开屏广告
│   ├── InAppAd.list          # 应用内广告
│   ├── Tracking.list         # 追踪域名
│   ├── ChinaApps.list        # 国内 App
│   ├── Apple.list            # Apple 服务
│   ├── ChinaIP.list          # 国内 IP
│   └── LAN.list              # 局域网
├── rules/                    # 🔥 规则注册表（Agent 核心参考）
│   ├── services/README.md    # 服务→区域策略映射
│   ├── regions/detection-rules.md  # 节点区域检测规则
│   └── protocols/protocols.md      # 代理协议解析规则
├── kelee/                    # 🔥 kelee.one 去广告插件集成
│   ├── fetch-plugins.sh      # 获取插件列表脚本
│   └── list.json             # 插件目录缓存（运行 fetch-plugins.sh 后生成）
└── docs/                     # 文档
    ├── quick-start.md        # 快速开始
    ├── module-usage.md       # 模块使用指南
    ├── custom-ads.md         # 自定义广告过滤
    ├── troubleshooting.md    # 故障排除
    ├── testing-guide.md      # 测试指南
    └── cross-platform-conversion.md  # 🔥 跨平台转换指南
```

---

## 🧠 Agent 工作流总览

```
用户输入
  │
  ▼
┌─────────────────────────────────────────────┐
│         识别用户场景（工作流 0）                │
│  订阅链接 / 生成配置 / 去广告 / 转换 / 优化      │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────┼──────────┬──────────┐
        ▼          ▼          ▼          ▼
    ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
    │工作流1│  │工作流2│  │工作流3│  │工作流4│
    │订阅解│  │配置生│  │去广告│  │跨平台│
    │  析  │  │  成  │  │集 成│  │转 换│
    └──────┘  └──────┘  └──────┘  └──────┘
       │          │         │         │
       ▼          ▼         ▼         ▼
    ┌─────────────────────────────────────┐
    │           工作流 5：配置优化           │
    │       诊断卡顿/断网/耗电问题           │
    └─────────────────────────────────────┘
       │
       ▼
    ┌─────────────────────────────────────┐
    │           输出完整配置                │
    │    + 安装指导 + 注意事项              │
    └─────────────────────────────────────┘
```

---

## 🛡️ 去广告体系（四层拦截）

```
用户请求 → Surge 接管
  ├─ L1 规则拦截: 广告域名 → REJECT（直接拒绝）
  │   ├─ surge-tuner 本地规则集（精准拦截广告 SDK）
  │   ├─ anti-ad 在线规则集（~2.5万条，自动更新）
  │   └─ blackmatrix7 规则集（国际补充）
  ├─ L2 MITM解密: HTTPS 流量解密
  ├─ L3 脚本清洗: JavaScript 移除响应中的广告数据
  └─ L4 Header清洗: 移除追踪参数和 Header
```

### 覆盖的广告 SDK

| SDK | 拦截方式 | 说明 |
|-----|---------|------|
| 穿山甲 (Pangle) | 规则+脚本 | 字节系，国内占有率最高 |
| 广点通 (GDT) | 规则+脚本 | 腾讯系 |
| 百度广告 | 规则+脚本 | 百度系 |
| 快手广告 | 规则 | 快手系 |
| Admob/DoubleClick | 规则+脚本 | Google 系 |
| AppLovin/Vungle/Unity | 规则 | 国际广告平台 |
| AppsFlyer/Adjust | 规则 | 归因追踪 |

---

## 🔧 配置示例预览

生成后的 Surge 配置结构：

```ini
[General]
# 通用设置：内网直连、Apple 直连、DNS、日志等

[Proxy]
# 所有代理节点（由订阅自动填充）
# 🇭🇰 香港-01 = ss, server, port, ...
# 🇯🇵 东京-01 = trojan, server, port, ...

[Proxy Group]
# 区域策略组（URL-Test 自动测速）
# 🇭🇰 香港节点 = url-test, regex=🇭🇰|香港|HK, ...
# 🇯🇵 日本节点 = url-test, regex=🇯🇵|日本|JP, ...
# 服务策略组
# Telegram = url-test, ...
# YouTube = url-test, ...
# Netflix = select, ...

[Rule]
# 规则匹配（从上到下）
# Apple 直连 → 广告拦截 → 国内直连 → 国际服务 → 兜底

[MITM]
# HTTPS 解密配置（去广告必须）

[Script]
# JavaScript 广告清洗脚本
```

---

## 📚 参考文档

| 文档 | 说明 |
|------|------|
| `proxy-tuner.skill.md` | **主技能文件** — 完整的 Agent 工作流定义（必读） |
| `rules/services/README.md` | 服务→区域策略映射表 |
| `rules/regions/detection-rules.md` | 节点按名称检测地区的正则规则 |
| `rules/protocols/protocols.md` | 代理协议 URI 解析和格式转换 |
| `docs/cross-platform-conversion.md` | Surge↔Loon↔QX↔Clash 格式转换 |
| `docs/kelee-integration.md` | kelee.one 去广告插件集成指南 |
| `docs/quick-start.md` | 快速开始指南 |
| `docs/module-usage.md` | 模块使用说明 |
| `docs/troubleshooting.md` | 常见问题排查 |

---

## 📄 许可

本项目仅供学习研究使用，请遵守相关法律法规。
