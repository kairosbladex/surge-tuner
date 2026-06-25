# MITM 中间人攻击证书配置指南

> ⚠️ **重要安全提示：MITM 证书是私密的，必须用户自己生成和安装**
> ca-p12 包含你的私钥，绝不能分享或提交到代码仓库

## 什么是 MITM

MITM (Man-in-the-Middle) 中间人攻击，在代理工具中用于解密 HTTPS 流量，以便：
- 移除网页和应用中的广告
- 拦截隐私追踪器
- 修改 HTTP 响应内容

## 步骤 1：生成 CA 证书

在 Surge iOS App 中：

1. 打开 **Surge App**
2. 进入 **配置** → **MITM**
3. 点击 **生成 CA 证书**
4. 设置一个 **证书密码**（ca-passphrase），记住它

## 步骤 2：安装并信任证书

```
1. Surge → 配置 → MITM → 安装 CA 证书
   → 会提示下载描述文件
2. 打开 iPhone 设置 → 通用 → VPN 与设备管理
   → 找到 Surge CA 描述文件 → 安装
3. 设置 → 通用 → 关于 → 证书信任设置
   → 找到 Surge CA → 开启开关（绿色）
```

## 步骤 3：配置 MITM 域名

```ini
[MITM]
# 启用 MITM
enable = true

# 启用 HTTP/2 抓包支持
h2 = true

# 跳过服务端证书验证
skip-server-cert-verify = true

# MITM 目标域名
# 规则：- 开头的域名表示排除（Apple 系列必须排除）
# 只列你需要解密的域名
hostname = -*.apple.com, -*.icloud.com, -*.mzstatic.com, -*.crashlytics.com, -*.digicert.com, -*.apple-dns.net, -*.aaplimg.com, *.pangle.io, *.pangleglobal.com, *.gdt.qq.com, *.ad.qq.com, *.doubleclick.net, *.googlesyndication.com, *.googleadservices.com, *.appsflyer.com, *.adjust.com

# 你的 CA 证书密码（步骤 1 设置的）
ca-passphrase = 【你的CA密码】

# 你的 CA 证书（在 Surge 中导出 p12 并转 Base64）
ca-p12 = 【你的CA证书Base64】
```

## 如何导出 ca-p12

```
1. Surge → 配置 → MITM → 导出 CA 证书
2. 选择导出为 .p12 格式，输入密码
3. 将 .p12 文件转换为 Base64：
   macOS/Linux:  base64 -i 证书.p12 | pbcopy
   Windows:      certutil -encode 证书.p12 证书.txt 然后打开 txt 文件复制内容
4. 将 Base64 字符串粘贴到 ca-p12 字段
```

## MITM 最佳实践

| 原则 | 说明 |
|------|------|
| **最少化原则** | 只 MITM 必要的广告域名，不要用 `*` 全量解密 |
| **Apple 必须排除** | 所有 `*.apple.com`、`*.icloud.com` 等前面加 `-` 排除 |
| **银行/支付排除** | 建议排除银行、支付类域名，防止安全问题 |
| **证书安全** | ca-p12 = 你的数字身份，切勿泄露给他人 |
| **如不用去广告** | 可以不启用 MITM，完全不影响代理和分流功能 |
| **耗电注意** | MITM 会增加 CPU 负载，iOS 上建议仅对必要域名启用 |

## 验证 MITM 是否生效

1. 启用 MITM 后，打开任意被 MITM 的网站
2. 在 Surge 的 **最近请求** 中查看
3. 如果看到 `HTTPS` 标记且内容被解密，说明 MITM 生效

## 常见问题

**Q: 启用 MITM 后 iMessage/FaceTime 断了？**
A: 你没有排除 Apple 域名。在 hostname 中加入 `-*.apple.com, -*.icloud.com`

**Q: 安装证书后提示"未信任"？**
A: 必须在 **设置 → 通用 → 关于 → 证书信任设置** 中手动开启信任开关

**Q: MITM 耗电严重？**
A: 缩小 hostname 范围，只 MITM 必要的广告域名

**Q: 不想用 MITM 了怎么办？**
A: 将 `enable = true` 改为 `enable = false` 即可。代理分流功能完全不受影响
