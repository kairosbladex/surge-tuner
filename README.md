# Surge Tuner — Surge iOS 配置调优 & 去广告工具包

> 让 Surge 稳定运行，同时告别流氓软件的广告骚扰

## 📋 项目概述

本项目提供了一个完整的 **Surge iOS 配置调优 + 广告拦截解决方案**，包含：

| 组件 | 说明 |
|------|------|
| **配置模板** | 经过优化的基础配置，保障 Surge 稳定运行 |
| **规则集** | 涵盖主流国内 App 广告 SDK 的域名列表 |
| **JavaScript 脚本** | MITM 解密后深度清洗广告内容 |
| **Surge 模块 (.sgmodule)** | 可独立开关的功能模块，即装即用 |

## 🚀 快速开始

### 方式一：使用模块（推荐）

1. 将 `modules/` 目录下的 `.sgmodule` 文件放入 Surge 的配置文件目录：
   - iOS: Surge App → 配置 → 编辑配置 → 找到 Modules 目录
   - 或通过文件 App 复制到 `Surge/Profiles/` 目录

2. 在 Surge App 中：**配置 → 模块**，点击启用对应模块

3. **关键步骤 — 安装 MITM 证书**：
   - Surge → 配置 → MITM → 生成 CA 证书
   - 安装描述文件 → 设置 → 通用 → VPN 与设备管理 → 安装
   - 设置 → 通用 → 关于 → 证书信任设置 → 开启 Surge CA 开关

### 方式二：使用完整配置

1. 将 `configs/full-adblock.conf` 导入 Surge
2. 将 `rulesets/` 和 `scripts/` 目录放在 Surge 配置文件目录下
3. 启用 MITM 并安装证书

## 📦 模块一览

| 模块 | 文件名 | 功能 |
|------|--------|------|
| 🚀 **开屏广告拦截** | `Anti-Splash-Ad.sgmodule` | 拦截开屏广告 |
| 🛡️ **应用内广告拦截** | `Anti-InApp-Ad.sgmodule` | 拦截 Banner/插屏/视频广告 |
| 🔒 **隐私追踪拦截** | `Anti-Tracking.sgmodule` | 拦截统计/追踪 SDK |
| 🔥 **全能广告合辑** | `Ad-Block-All.sgmodule` | 以上全部合辑 |
| ⚡ **稳定性优化** | `Stable-Optimization.sgmodule` | 解决断网/耗电/兼容问题 |

## 🎯 覆盖 App

初始版本覆盖以下核心 App 的去广告能力：

- **字节跳动系**: 抖音、今日头条、西瓜视频
- **腾讯系**: 微信（朋友圈广告）、QQ
- **微博**: 开屏广告、信息流广告
- **知乎**: 开屏广告、信息流广告
- **小红书**: 开屏广告、信息流广告
- **百度系**: 百度 App、贴吧
- **网易**: 网易新闻
- **快手**: 开屏广告、信息流广告
- 以及更多使用上述广告 SDK 的 App

## 🔧 工作原理

```
用户请求 → Surge 接管
  ├─ L1 规则拦截: 广告域名 → REJECT（直接拒绝）
  ├─ L2 MITM解密: HTTPS 流量解密
  ├─ L3 脚本清洗: JavaScript 移除响应中的广告数据
  └─ L4 Header清洗: 移除追踪参数和 Header
```

### 广告 SDK 覆盖

| SDK | 拦截方式 | 说明 |
|-----|---------|------|
| 穿山甲 (Pangle) | 规则+脚本 | 字节系，国内占率最高 |
| 广点通 (GDT) | 规则+脚本 | 腾讯系 |
| 百度广告 | 规则+脚本 | 百度系 |
| 快手广告 | 规则 | 快手系 |
| 华为/小米/VIVO/OPPO 广告 | 规则 | 厂商广告 |
| AppsFlyer/Adjust | 规则 | 归因追踪 |
| 友盟/热云/TalkingData | 规则+脚本 | 数据统计 |

## 📁 项目结构

```
surge-tuner/
├── configs/           # 完整配置示例
│   ├── full-adblock.conf
│   └── stable-only.conf
├── templates/         # 配置模板
│   ├── base.conf
│   └── surge-ios-base.conf
├── modules/           # Surge 模块 (.sgmodule)
│   ├── Anti-Splash-Ad.sgmodule
│   ├── Anti-InApp-Ad.sgmodule
│   ├── Anti-Tracking.sgmodule
│   ├── Ad-Block-All.sgmodule
│   └── Stable-Optimization.sgmodule
├── scripts/           # Surge JavaScript 脚本
│   ├── remove-splash-ad.js
│   ├── remove-banner-ad.js
│   ├── remove-popup-ad.js
│   ├── anti-tracking.js
│   └── ad-block-all.js
├── rulesets/          # 规则集
│   ├── AdDomains.list
│   ├── SplashAd.list
│   ├── InAppAd.list
│   ├── Tracking.list
│   ├── ChinaApps.list
│   ├── Apple.list
│   ├── ChinaIP.list
│   ├── AntiAd-Script.list
│   └── LAN.list
└── docs/              # 文档
    ├── quick-start.md
    ├── module-usage.md
    ├── custom-ads.md
    └── troubleshooting.md
```

## 📄 许可

本项目仅供学习研究使用，请遵守相关法律法规。
