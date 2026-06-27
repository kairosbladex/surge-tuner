# 模块测试指南 — 在 iPhone 上验证去广告是否生效

## 自动化检查（导入前必须做）

在把配置放到 iPhone 前，先在仓库根目录运行：

```bash
npm run check
npm test
npm run validate
```

生成新配置时先跑：

```bash
npm run generate -- --input tests/fixtures/sample-generator-input.json --output configs/generated/sample.conf
npm run generate -- --address-file tests/fixtures/sample-subscription.txt --services Telegram,ChatGPT --adblock --output configs/generated/from-subscription.conf
node scripts/surge-config-validator.js configs/generated/sample.conf
```

`surge-config-generator.js` 默认会在写出前自检，发现 error 会直接失败。需要让 warning 也失败时加 `--strict`；只有调试生成器本身时才加 `--skip-validate`。

校验器会检查：

- 本地 `RULE-SET` 文件是否存在
- `script-path` 文件是否存在
- 规则引用的策略组是否已定义
- 策略组引用的节点或其他策略组是否已定义
- 是否使用了需要复核的非标准策略类型
- 模块中是否包含需要复核的 MITM/Body Rewrite 写法

地址解析链路支持：

- 单节点 URI：`ss://`、`trojan://`、`vmess://`、`hy2://`/`hysteria2://`、`tuic://`
- 明文订阅文件：每行一个节点 URI
- Base64 订阅文件：解码后每行一个节点 URI
- HTTP(S) 订阅 URL：由生成器拉取内容后按上述规则解析

## 方法一：观察法（最直观）

1. **开屏广告测试**
   - 打开「微博」「知乎」「百度」「抖音」等 App
   - 如果以前有 3-5 秒开屏广告，现在直接进入首页 → ✅ 有效
   - 如果仍然有开屏广告但变成白屏几秒后进入 → ⚠️ 部分有效（域名 REJECT 成功了，但 App 在等待超时）
   - 如果和以前一样 → ❌ 未生效

2. **应用内广告测试**
   - 进入微博/知乎的信息流，向下滑动
   - 观察是否还有标注「广告」「推荐」「推广」的内容
   - 打开免费游戏/工具 App，观察 Banner 和插屏广告

## 方法二：Surge 最近请求（最精确）

这是最可靠的验证方式，可以看到流量是否被拦截：

1. Surge 保持启动状态
2. 打开有广告的 App
3. 切回 Surge → 底部 **"最近请求"** (Recent Requests) 标签
4. 查看请求列表：

### 如何判断广告是否被拦截

**✅ 拦截成功的标志**：看到以下任意一种

```
www.pangle.io          REJECT     [AdDomains]   ← 域名被规则拒绝
www.gdt.qq.com          REJECT     [AdDomains]   ← 广告 SDK 连接被切断
api.snssdk.com/splash  REJECT-TG  [AntiAd-Script] ← 开屏广告接口被拦截
```

关键：状态列显示 `REJECT` 或 `REJECT-TINYGIF`

**❌ 未拦截的标志**

```
www.pangle.io          DIRECT     [Rule]        ← 广告域名走了直连（规则没匹配）
www.gdt.qq.com         Proxy      [Proxy Group] ← 广告域名走了代理
api.snssdk.com/splash  DIRECT     [Rule]        ← 没被识别为广告
```

### 如何找到广告请求

方法：打开 App，在最近请求列表中搜索关键词：

```
搜索: ad, ads, pangle, gdt, splash, banner, sdk, tracking, stat
```

- 如果看到上述域名且状态为 `REJECT` → ✅ 模块生效
- 如果看到上述域名状态为 `DIRECT` → ❌ 规则未匹配，需检查模块是否正确加载

## 方法三：Surge 日志（排查问题）

1. Surge → **底部设置** → **日志** (Log)
2. 设置 `loglevel = info` 获取详细日志
3. 打开有广告的 App
4. 查看日志中是否出现：

```
[Rule] DOMAIN-SUFFIX,pangle.io matched AdDomains.list → REJECT ✓
[Script] Running http-response script: remove-splash-ad.js ✓
[MITM] Decrypting https://api.snssdk.com ✓
```

## 方法四：对照测试（最严谨）

### 步骤

1. **保持静置 30 秒** — 关掉所有后台 App
2. **关闭 Surge** → 打开目标 App → 录屏 30 秒（保留广告证据）
3. **开启 Surge** → 重新打开同一 App → 再次录屏 30 秒
4. 对比两次录屏，看广告是否消失

### 测试清单

| App | 开屏广告 | 信息流广告 | 备注 |
|-----|---------|-----------|------|
| 微博 | ✅/❌ | ✅/❌ | 开屏 + 信息流 |
| 知乎 | ✅/❌ | ✅/❌ | 开屏 + 问答间广告 |
| 抖音 | ✅/❌ | ✅/❌ | 开屏 + 视频间插 |
| 百度 | ✅/❌ | ✅/❌ | 开屏 + 搜索广告 |
| 小红书 | ✅/❌ | ✅/❌ | 开屏 + 信息流 |
| 网易新闻 | ✅/❌ | ✅/❌ | 开屏 + 新闻间插 |
| 快手 | ✅/❌ | ✅/❌ | 开屏 + 视频广告 |

## ⚠️ 常见问题排查

### 模块已启用但无效果

| 检查项 | 操作 |
|--------|------|
| MITM 证书是否安装？ | 设置 → 通用 → 关于 → 证书信任设置 → 开启 Surge CA |
| MITM 是否开启？ | Surge → 配置 → MITM → 开关打开 |
| 模块是否在列表中？ | Surge → 配置 → 模块 → 确认开关已打开 |
| 最近请求中是否有广告域名？ | 如有但为 DIRECT → 规则没加载；如无 → 广告走的是其他域名 |
| 是否开启了多个冲突模块？ | 只保留 Ad-Block-All + Stable-Optimization 试试 |

### 重要提示

> ⚡ Surge 的「最近请求」只显示**当前连接发起后**的新请求。启动 Surge 后需要重新打开 App 才能看到新的请求记录。
> 
> 🔍 如果怀疑某个模块无效，可以只**保留该模块**，关闭其他所有模块后单独测试。
