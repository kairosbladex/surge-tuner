# 跨平台配置转换参考

本文档提供了 Surge 配置转换为 Loon、Quantumult X、Clash/Stash 的完整语法对照。

## 📖 核心格式差异速查

| 概念 | Surge | Loon | Quantumult X | Clash/Stash |
|------|-------|------|-------------|-------------|
| 域名匹配 | `DOMAIN` | `DOMAIN` | `HOST` | `DOMAIN` |
| 域名后缀 | `DOMAIN-SUFFIX` | `DOMAIN-SUFFIX` | `HOST-SUFFIX` | `DOMAIN-SUFFIX` |
| 域名关键词 | `DOMAIN-KEYWORD` | `DOMAIN-KEYWORD` | `HOST-KEYWORD` | `DOMAIN-KEYWORD` |
| IP段 (v4) | `IP-CIDR,range,policy,no-resolve` | `IP-CIDR,range,policy,no-resolve` | `IP-CIDR,range,policy` | `IP-CIDR,range` |
| IP段 (v6) | `IP-CIDR6` | `IP-CIDR6` | `IP6-CIDR` | `IP-CIDR6` |
| 最终规则 | `FINAL,policy` | `FINAL,policy` | `FINAL,policy` | `MATCH,policy` |
| 配置文件格式 | INI `[Section]` | INI `[Section]` | INI `[Section]` | YAML |
| 策略组 | `[Proxy Group]` | `[Proxy Group]` | `[policy]` | `proxy-groups:` |
| 订阅管理 | 外部程序 或 policy-path | `[Remote Proxy]` | `[server_remote]` | `proxy-providers:` |
| 规则集引用 | `RULE-SET,url,policy` | `#include` / `RULE-SET` | `[filter_remote]` | `rule-providers:` |

---

## 🔄 从 Surge 转换到各平台

### 1️⃣ Surge → Loon

**配置段对照:**

| Surge | Loon | 说明 |
|-------|------|------|
| `[General]` | `[General]` | 基本相同 |
| `[Proxy]` | `[Proxy]` / `[Remote Proxy]` | Loon 支持远程订阅 |
| `[Proxy Group]` | `[Proxy Group]` | 语法几乎一致 |
| `[Rule]` | `[Rule]` / `[Remote Rule]` | Loon 支持远程规则 |
| `[MITM]` | `[MITM]` | 基本相同 |
| `[Script]` | `[Script]` | 语法略有差异 |
| `[URL Rewrite]` | `[URL Rewrite]` | 相同 |
| `[Host]` | `[Host]` | 相同 |

**Loon 订阅管理:**
```ini
; 在 Loon 配置中
[Remote Proxy]
https://example.com/sub, tag=机场A, enabled=true

[Proxy Group]
; 从远程订阅拉取节点
香港节点 = url-test, policy-regex=香港|Hong Kong|HK, include-all-proxies=true, url=http://www.gstatic.com/generate_204, interval=600
```

**Loon 规则引用:**
```ini
; Loon 使用 #include 引用本地规则集
#include "rulesets/Telegram.list"
; 注意: Loon 的 .list 文件中不包含策略名
; 策略在 #include 行的策略组上指定
```

---

### 2️⃣ Surge → Quantumult X

**语法替换:**

| Surge | Quantumult X |
|-------|-------------|
| `DOMAIN,xxx,policy` | `HOST,xxx,policy` |
| `DOMAIN-SUFFIX,xxx,policy` | `HOST-SUFFIX,xxx,policy` |
| `DOMAIN-KEYWORD,xxx,policy` | `HOST-KEYWORD,xxx,policy` |
| `IP-CIDR6,xxx,policy,no-resolve` | `IP6-CIDR,xxx,policy` |
| `GEOIP,CN,DIRECT` | `GEOIP,CN,DIRECT` |
| `FINAL,policy` | `FINAL,policy` |

**QX 配置结构:**
```ini
[server_remote]
https://example.com/sub, tag=机场A, enabled=true

[policy]
static=香港节点, url-test=香港节点池, direct=DIRECT
static=美国节点, url-test=美国节点池, direct=DIRECT

[filter_remote]
https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/QuantumultX/Telegram/Telegram.list, tag=Telegram, policy=香港节点, enabled=true

[rewrite_remote]
https://raw.githubusercontent.com/.../QX/广告去重.list, tag=去广告, enabled=true
```

---

### 3️⃣ Surge → Clash/Stash

**配置结构对比:**

| Surge | Clash/Stash (YAML) |
|-------|-------------------|
| `[General]` | `dns:`, `experimental:` |
| `[Proxy]` | `proxies:` |
| `[Proxy Group]` | `proxy-groups:` |
| `[Rule]` | `rules:` |
| 订阅/policy-path | `proxy-providers:` |
| RULE-SET 引用 | `rule-providers:` |

**Clash 订阅管理:**
```yaml
proxy-providers:
  机场A:
    type: http
    url: "https://example.com/sub"
    interval: 86400
    health-check:
      enable: true
      url: http://www.gstatic.com/generate_204
      interval: 300
```

**Clash 策略组:**
```yaml
proxy-groups:
  - name: 香港节点
    type: url-test
    use:
      - 机场A
    regex: 香港|Hong Kong|HK
    url: http://www.gstatic.com/generate_204
    interval: 600

  - name: Telegram
    type: select
    proxies:
      - 香港节点
      - 美国节点
      - DIRECT
```

**Clash 规则:**
```yaml
rules:
  - DOMAIN-SUFFIX,telegram.org,Telegram
  - DOMAIN-SUFFIX,t.me,Telegram
  - GEOIP,CN,DIRECT
  - MATCH,兜底分流
```

**Clash 规则集引用:**
```yaml
rule-providers:
  Telegram:
    type: http
    behavior: classical
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Telegram/Telegram.yaml"
    interval: 86400
    path: ./rules/Telegram.yaml
```

---

## 🧠 转换逻辑参考

Agent 进行跨平台转换时的核心步骤：

### 步骤 1: 解析源配置
```
读取 Surge .conf → 解析各段:
- [General] → 通用参数
- [Proxy] → 代理节点列表
- [Proxy Group] → 策略组定义
- [Rule] → 规则列表
- [MITM] → MITM 配置
- [Script] → 脚本配置
```

### 步骤 2: 语法转换
```
对每条规则进行语法映射:
DOMAIN → HOST (QX)
DOMAIN-SUFFIX → HOST-SUFFIX (QX)
FINAL → MATCH (Clash)
IP-CIDR6 → IP6-CIDR (QX)
```

### 步骤 3: 结构重组
```
根据目标平台重新组织配置结构:
- Surge/Loon: INI 格式，保持不变
- QX: 调整 [policy] 和 [filter_remote]
- Clash: 转换为 YAML
```

### 步骤 4: 生成目标配置
```
按目标平台语法输出完整配置
```
