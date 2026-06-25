# 故障排除指南

## 常见问题

### 1. Surge 开启后断网

**可能原因**：bypass 配置未覆盖你的网络环境

**解决**：
- 检查 `skip-proxy` 中是否包含你的内网网段
- 在 `always-real-ip` 中添加无法访问的域名
- 尝试启用 `Stable-Optimization.sgmodule`
- 检查是否开启了「增强模式」（建议设为按规则启用）

### 2. iCloud / iMessage 无法同步

**原因**：Apple 服务被 MITM 解密或走了代理

**解决**：
- 确认 MITM hostname 中 `*.apple.com`、`*.icloud.com` 等以 `-` 开头（表示排除）
- 确认 `always-real-ip` 包含 Apple 域名
- 确认规则中 Apple 域名走 DIRECT

标准配置：
```
always-real-ip = *.apple.com, *.icloud.com, *.icloud-content.com, *.mzstatic.com, *.crashlytics.com
```

### 3. 某些 App 打不开 / 加载慢

**可能原因**：
- 广告域名被 REJECT 后导致 App 等待超时
- MITM 导致 SSL 验证失败

**解决**：
1. 关闭所有模块，逐一开启以定位问题模块
2. 在 MITM hostname 中将问题 App 的域名加 `-` 排除
3. 将问题域名添加到 `skip-proxy`
4. 如果 App 使用了 SSL Pinning，无法通过 MITM 解密，只能跳过

### 4. 去广告没效果

**分层排查**：

| 检查项 | 方法 |
|--------|------|
| MITM 证书是否已安装并信任 | 设置 → 通用 → 关于 → 证书信任设置 |
| MITM 是否已开启 | Surge → 配置 → MITM 开关 |
| hostname 是否包含了广告域名 | Surge → 配置 → MITM → hostname |
| 脚本是否匹配到了 | Surge → 最近请求 → 查看脚本执行状态 |
| 广告是否在规则集中 | 检查 rulesets 中是否包含该域名 |

### 5. 电池耗电快

**优化措施**：
1. 启用 `enhanced-mode-by-rule = true`
2. 设置 `loglevel = error`（减少日志写入）
3. 避免启用过长的 MITM hostname 列表
4. 减少脚本数量，优先使用 `ad-block-all.js` 而非多个独立脚本
5. 不使用时暂停 Surge（建议通过自动化/快捷指令自动开关）

### 6. DNS 解析慢

**优化**：
1. 使用国内 DNS 优先：`223.5.5.5`（阿里）、`114.114.114.114`（114）
2. 添加备用 DNS：`119.29.29.29`（腾讯）
3. 关闭 IPv6：`dns-ipv6 = false`
4. 使用 `dns-server = system, 223.5.5.5, 114.114.114.114` 让 Surge 并发查询

### 7. 模块无法安装

- 确认 `.sgmodule` 文件放在 Surge 配置目录下
- 确认文件格式正确（首行以 `#!name=` 开头）
- 确认 CORE_VERSION 满足 requirement
- 重新启动 Surge App

### 8. CA 证书相关问题

**证书未信任**：
- 设置 → 通用 → 关于本机 → 证书信任设置 → 开启 Surge CA

**证书过期**：
- Surge → 配置 → MITM → 重新生成 CA 证书 → 重新安装

**重新安装证书**：
1. 删除旧描述文件：设置 → 通用 → VPN 与设备管理 → 移除
2. 在 Surge 中重新生成并安装

---

> 如果以上方法无法解决问题，建议：
> 1. 仅启用 `Stable-Optimization.sgmodule` 看是否稳定
> 2. 逐个启用其他模块排查问题模块
> 3. 检查 Surge 的「最近请求」或「日志」查看错误详情
