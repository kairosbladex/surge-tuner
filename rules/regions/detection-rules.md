# 节点区域检测规则

Agent 在解析机场订阅后，需要通过节点名称中的关键词自动判断节点所属地区。
本文件定义了完整的正则匹配规则。

## 匹配优先级

1. **Emoji 国旗**（最可靠） → 🇭🇰 🇯🇵 🇺🇸 🇸🇬 🇰🇷 🇹🇼
2. **中文地区名** → 香港、日本、美国...
3. **英文地区名/缩写** → Hong Kong, Japan, US, SG...
4. **城市名** → Tokyo, Seoul, Singapore, Los Angeles...
5. **三字机场码** → HKG, NRT, LAX, SFO...

## 地区匹配规则

### 🇭🇰 香港 (Hong Kong)

```regex
香港|Hong Kong|HK|HKG|🇭🇰
```

### 🇯🇵 日本 (Japan)

```regex
日本|Japan|Tokyo|TYO|NRT|JP|🇯🇵
```

### 🇺🇸 美国 (United States)

```regex
美国|United States|USA|US|🇺🇸|Los Angeles|LAX|San Francisco|SFO|Seattle|Seat|Silicon|California|硅谷|西雅图|洛杉矶
```

### 🇸🇬 新加坡 (Singapore)

```regex
新加坡|Singapore|SG|SGP|🇸🇬
```

### 🇰🇷 韩国 (South Korea)

```regex
韩国|Korea|KR|KOR|🇰🇷|Seoul
```

### 🇹🇼 台湾 (Taiwan)

```regex
台湾|Taiwan|TW|TWN|🇹🇼|Taipei|TPE
```

### 🇬🇧 英国 (United Kingdom)

```regex
英国|United Kingdom|UK|GB|🇬🇧|London
```

### 🇩🇪 德国 (Germany)

```regex
德国|Germany|DE|DEU|🇩🇪|Frankfurt
```

### 🇫🇷 法国 (France)

```regex
法国|France|FR|FRA|🇫🇷|Paris
```

### 🇦🇺 澳大利亚 (Australia)

```regex
澳大利亚|Australia|AU|AUS|🇦🇺|Sydney
```

### 🇨🇦 加拿大 (Canada)

```regex
加拿大|Canada|CA|CAN|🇨🇦
```

### 🇮🇳 印度 (India)

```regex
印度|India|IN|IND|🇮🇳|Mumbai
```

### 🇦🇪 阿联酋/迪拜 (UAE/Dubai)

```regex
阿联酋|UAE|迪拜|Dubai|🇦🇪
```

### 🇷🇺 俄罗斯 (Russia)

```regex
俄罗斯|Russia|RU|RUS|🇷🇺|Moscow|Moskova
```

## 特殊线路标签

某些节点名称中含有特殊标签，表示更优的线路质量：

| 标签 | 含义 | 推荐策略 |
|------|------|---------|
| `HY2` / `Hysteria2` / `hy2` | Hysteria2 协议（高速 UDP） | 流媒体/视频 |
| `优化` | 优化线路 (CN2/GIA/CMI) | 流媒体/游戏 |
| `IEPL` / `IPLC` | 国际私线（低延迟） | 游戏/实时通讯 |
| `中转` | 国内中转 | 通用 |
| `直连` | 直接连接 | 通用 |

## 默认匹配

无法匹配任何地区的节点归入 `🚩 未识别` 组，用户可手动分配。
