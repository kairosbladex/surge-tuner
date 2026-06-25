# kelee.one 去广告插件集成指南

> [hub.kelee.one](https://hub.kelee.one/) — 可莉的 Loon 插件中心
> 上游资源库: [luestr/ProxyResource](https://github.com/luestr/ProxyResource)

## 概述

kelee.one 是一个专注于 **Loon** 平台的插件中心，提供丰富的去广告、隐私保护等功能插件。
虽然其核心是 Loon 生态，但其规则列表可作为跨平台去广告的参考来源。

## 获取插件目录

```bash
# 运行获取脚本（需要 curl 和代理环境）
bash kelee/fetch-plugins.sh

# 或直接获取最新目录
curl -sL https://hub.kelee.one/list.json -o kelee/list.json
```

## 推荐的去广告插件

从 `list.json` 中可以提取以下去广告相关插件：

| 插件名 | 功能 | 适用平台 |
|--------|------|---------|
| 广告平台拦截器 | 广告域名过滤 | Loon |
| 去广告合集 | 综合性去广告方案 | Loon |
| 隐私保护 | 追踪参数拦截 | Loon |

## Surge 替代方案

kelee.one 的插件主要为 Loon 设计（.lpx 格式），Surge 用户请使用本项目自带的去广告方案：

### 方案一：本地模块（推荐）

```
modules/Ad-Block-All.sgmodule  →  全能去广告模块
modules/Anti-Splash-Ad.sgmodule →  开屏广告拦截
modules/Anti-InApp-Ad.sgmodule   →  应用内广告拦截
modules/Anti-Tracking.sgmodule   →  隐私追踪拦截
```

### 方案二：在线规则集（跨平台通用）

```ini
# anti-ad — 中文环境最优
RULE-SET,https://anti-ad.net/surge.txt,REJECT

# blackmatrix7 通用去广告
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Advertising/Advertising.list,REJECT

# 隐私保护
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Privacy/Privacy.list,REJECT

# 防劫持
RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Hijacking/Hijacking.list,REJECT
```

## 跨平台参考

| 平台 | kelee.one 支持 | 说明 |
|------|---------------|------|
| Loon | ✅ 原生支持 | 直接通过插件中心安装 .lpx 插件 |
| Surge | ⚠️ 间接参考 | 规则列表可参考，格式需转换 |
| Quantumult X | ⚠️ 少量 | GitHub 仓库有部分 snippet |
| Clash | ⚠️ 少量 | GitHub 仓库有示例 YAML 配置 |

## 相关链接

- [kelee.one 插件中心](https://hub.kelee.one/)
- [luestr/ProxyResource GitHub](https://github.com/luestr/ProxyResource)
- [kelee.one list.json 源](https://hub.kelee.one/list.json)
