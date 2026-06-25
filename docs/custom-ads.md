# 自定义广告拦截

## 如何添加新的广告域名

如果你发现某个 App 的广告没有被拦截，可以通过以下步骤手动添加：

### 1. 查看网络请求

1. 打开 Surge → **最近请求**（Recent Requests）
2. 打开有广告的 App
3. 观察请求列表，寻找包含以下关键词的域名：
   - `ad`、`ads`、`advert`、`splash`、`banner`
   - `promot`、`marketing`、`track`、`stat`
   - 或者明显是广告 SDK 的域名

### 2. 广告 SDK 域名识别指南

| 特征 | 大概率是广告 |
|------|------------|
| 域名含 `.ad.` 或 `.ads.` | ✅ 广告 |
| 域名含 `/sdk/`、`/api/ad` | ✅ 广告 |
| 域名含 `google-analytics`、`doubleclick` | ✅ 追踪/广告 |
| 域名含 `cdn` 且引用了图片资源 | ❌ 可能是正常资源 |
| 域名含 `api` + `recommend` | ⚠️ 可能是广告接口 |

### 3. 添加到规则集

打开 `rulesets/AdDomains.list`，添加：

```
# 格式：DOMAIN-SUFFIX
*.new-ad-domain.com
# 或 DOMAIN-KEYWORD
DOMAIN-KEYWORD,newadsdk
```

### 4. 添加到 MITM hostname

如果该域名使用 HTTPS，需在 MITM hostname 中加入：

```
[MITM]
hostname = -*.apple.com, *.new-ad-domain.com, ...
```

## 自定义脚本规则

### 添加新的响应处理

编辑 `scripts/ad-block-all.js`，在应该处理的部分添加新的 URL 模式：

```javascript
// 在 shouldProcess 函数中添加
const patterns = [
  // 原有的...
  // 新增你的 URL 模式
  /new-ad-service/i,
  /new-sdk-domain/i,
];
```

### 添加新的广告字段

在 `AD_FIELDS` 的 `Set` 中添加新的字段名：

```javascript
const AD_FIELDS = new Set([
  // 原有的...
  // 新增字段
  'new_ad_field',
  'newAdData',
]);
```

## 创建自己的模块

你可以基于现有模块创建自定义模块：

```ini
#!name=My-Custom-Ad-Block
#!desc=我的自定义去广告模块

[MITM]
hostname = -*.apple.com, *.my-custom-ad.com
skip-server-cert-verify = true

[Rule]
DOMAIN-SUFFIX, my-custom-ad.com, REJECT

[Script]
http-response ^https?://my-api\.com/ad requires-body = true script-path = scripts/my-script.js
```
