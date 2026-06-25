# 模块使用说明

## 什么是 Surge 模块？

Surge 模块（`.sgmodule` 文件）是一种可以独立安装和启用的配置补丁。模块会"覆盖"主配置中的对应设置，可以随时开关而不影响主配置。

## 安装模块

### 方式 1: 本地文件导入

1. 将 `.sgmodule` 文件放入 Surge 的配置目录：
   - 通过文件 App → 我的 iPhone → Surge → Profiles → 粘贴
   - 或通过 AirDrop 发送到 Surge

2. 在 Surge 中：**配置 → 模块 → 安装模块** → 选择文件

### 方式 2: 通过 URL 安装

如果模块托管在 GitHub 上：
1. **配置 → 模块 → 安装模块 → 从 URL 安装**
2. 输入文件的原始 URL
3. Surge 会自动保持更新

## 模块列表详解

### 🚀 Anti-Splash-Ad（开屏广告拦截）

**功能**：拦截 App 启动时的全屏广告

**原理**：
- 规则层：直接拒绝广告 SDK 域名的连接
- 脚本层：MITM 解密后去除 JSON/HTML 中的开屏广告数据
- 双保险：即使规则被绕过，脚本仍能处理

**适用 App**：抖音、微博、知乎、小红书、百度、今日头条、网易新闻等

### 🛡️ Anti-InApp-Ad（应用内广告拦截）

**功能**：拦截 App 使用过程中的：
- Banner 横幅广告
- 插屏广告
- 信息流广告
- 奖励视频广告

**原理**：通过规则拒绝 + 脚本清除 API 返回中的广告数据

### 🔒 Anti-Tracking（隐私追踪拦截）

**功能**：拦截以下追踪行为：
- 第三方统计 SDK（友盟、TalkingData、GrowingIO）
- 广告归因（AppsFlyer、Adjust）
- 推送 SDK（个推、极光）
- 浏览器追踪参数（utm_*，fbclid、gclid 等）
- 请求 Header 中的设备 ID

**注意**：部分 App 的统计 SDK 被拦截后可能影响某些功能（如推荐算法），如发现问题可只启用 Anti-Splash-Ad。

### 🔥 Ad-Block-All（全能广告合辑）

**功能**：整合以上三个模块的所有能力

**优势**：
- 一站式启用，无需逐个开关
- 使用 `ad-block-all.js` 统一脚本，性能更优
- 脚本逻辑覆盖更全面

**注意事项**：
- MITM hostname 列表较长，对性能有轻微影响
- 如遇到兼容性问题，建议切换到独立模块排查

### ⚡ Stable-Optimization（稳定性优化）

**功能**：解决以下常见问题：
| 问题 | 解决方式 |
|------|---------|
| Surge 断网 | 优化 bypass/skip-proxy 参数 |
| iCloud 同步失败 | always-real-ip 确保 Apple 服务直连 |
| 耗电快 | enhanced-mode-by-rule + loglevel=error |
| DNS 解析慢 | 并发 DNS + 国内 DNS 优先 |
| 兼容性差 | 跳过证书验证 + 排除局域网 |

## 模块优先级

多个模块同时启用时，按以下优先级处理：

1. 主配置文件
2. 后启用的模块（后安装的模块覆盖先安装的）

建议启用顺序：
1. `Stable-Optimization.sgmodule`（基础）
2. `Anti-Splash-Ad.sgmodule` 或 `Ad-Block-All.sgmodule`（广告）
3. `Anti-Tracking.sgmodule`（追踪，可选）
