# Surge Tuner (Legacy) — Surge iOS 配置调优 & 去广告工具包

> ⚠️ **此技能已升级为 [Proxy Tuner](../proxy-tuner.skill.md)**
> 本文件保留作为向后兼容入口。新用户请使用 Proxy Tuner。

## Description

Surge iOS 配置调优与广告拦截助手。帮助用户生成稳定的 Surge 配置、去除国内 App 的开屏广告和应用内广告。

> **新功能提示**: 现在你可以通过 [Proxy Tuner](../proxy-tuner.skill.md) 实现：
> - 🔗 自动解析机场订阅链接，按地区分组节点
> - 🧠 智能策略推荐（URL-Test / Smart / Select）
> - 🌐 跨平台配置生成（Surge / Loon / QX / Clash）
> - 🛡️ 集成 kelee.one 去广告插件
> - 💬 交互式配置调优对话

## Use Cases

- "帮我生成 Surge 去广告配置"
- "我的 Surge 最近总断网，帮我看看怎么优化"
- "抖音和微博的开屏广告怎么去掉？"

## 快速引导 → Proxy Tuner

如需使用完整功能（订阅解析、多平台支持、智能策略），请参考：

```
proxy-tuner.skill.md — 主技能文件（所有功能入口）
```

---

### 原有功能（向后兼容）

以下功能仍直接可用：

| 场景 | 推荐方案 |
|------|---------|
| 仅去开屏广告 | 使用 `Anti-Splash-Ad.sgmodule` |
| 去开屏+应用内广告 | 使用 `Anti-Splash-Ad.sgmodule` + `Anti-InApp-Ad.sgmodule` |
| 全量去广告+追踪 | 使用 `Ad-Block-All.sgmodule` |
| Surge 不稳定/断网 | 使用 `Stable-Optimization.sgmodule` |
| 首次完整配置 | 使用 `configs/full-adblock.conf` |

### 关键检查点

1. **MITM hostname** 中 Apple 域名以 `-` 开头排除
2. **skip-proxy / bypass-tun** 包含内网段
3. **always-real-ip** 包含 Apple 服务域名
4. **enhanced-mode-by-rule** = `true`（iOS 省电关键）
5. **loglevel** 建议 `warning` 或 `error`

### 项目文件结构

```
surge-tuner/
├── proxy-tuner.skill.md    # 🔥 新主技能文件
├── surge-tuner.skill.md    # 此文件（向后兼容）
├── configs/                # 完整配置示例
├── templates/              # 配置模板
├── modules/                # Surge 模块 (.sgmodule)
├── scripts/                # Surge JavaScript 脚本
├── rulesets/               # 规则集（广告域名列表）
├── rules/                  # 🔥 新规则注册表
│   ├── services/           # 服务→区域映射
│   ├── regions/            # 区域检测规则
│   └── protocols/          # 协议解析规则
├── kelee/                  # 🔥 kelee.one 集成
├── docs/                   # 文档
└── README.md               # 🔥 已更新项目说明
```
