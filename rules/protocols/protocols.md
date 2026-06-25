# 代理协议解析规则

Agent 在解析机场订阅（Base64/Clash/普通格式）时，需要识别各代理协议并正确生成配置。

## 常见协议格式

### Shadowsocks (SS)

```
ss://BASE64(method:password)@server:port#Name
ss://BASE64(method:password@server:port)#Name
```

**Surge 格式：**
```
name = ss, server, port, encrypt-method=chacha20-ietf-poly1305, password=xxx, udp-relay=true
```

### ShadowsocksR (SSR)

```
ssr://BASE64(server:port:protocol:method:obfs:BASE64(password)/?obfsparam=BASE64(xxx)&protoparam=BASE64(xxx)&remarks=BASE64(name))
```

**Surge 格式：** Surge 不支持原生 SSR，需转换或使用外部代理程序。

### VMess

```
vmess://BASE64({
  "v": "2",
  "ps": "name",
  "add": "server",
  "port": "port",
  "id": "uuid",
  "aid": "alterId",
  "net": "tcp/ws/h2/quic/grpc",
  "type": "none/http/socks",
  "host": "host",
  "path": "path",
  "tls": "tls",
  "sni": "sni"
})
```

**Surge 格式：**
```
name = vmess, server, port, encrypt-method=chacha20-poly1305, username=uuid, vmess-aead=true, tls=true, sni=sni, ws=true, ws-path=/path, ws-headers=Host:host
```

### VLESS

```
vless://uuid@server:port?type=tcp/ws/grpc&encryption=none&host=host&path=path&sni=sni&flow=xtls-rprx-vision#name
```

**Surge 格式：** Surge 不支持原生 VLESS，需使用外部代理程序。

### Trojan

```
trojan://password@server:port#name
trojan://password@server:port?security=tls&sni=sni#name
```

**Surge 格式：**
```
name = trojan, server, port, password=xxx, tls=true, sni=sni, udp-relay=true
```

### Hysteria2 (HY2)

```
hy2://password@server:port#name
hy2://password@server:port?insecure=1&sni=sni#name
```

**Surge 格式：**
```
name = hysteria2, server, port, password=xxx, sni=sni, download-bandwidth=100
```

### TUIC

```
tuic://uuid:password@server:port?congestion_control=bbr&udp_relay_mode=native&sni=sni#name
```

**Surge 格式：**
```
name = tuic, server, port, token=xxx, uuid=xxx, quic-disabled=0, congestion-control=bbr, udp-relay-mode=native, sni=sni
```

## 订阅格式自动识别

| 特征 | 格式 | 处理方式 |
|------|------|---------|
| 以 `ss://` 开头（单行） | 单节点 SS | 直接解析 Base64 |
| 以 `ssr://` 开头（单行） | 单节点 SSR | 需 SSR→SS 转换或使用外部程序 |
| 以 `vmess://` 开头（单行） | 单节点 VMess | JSON 解码后转换 |
| 以 `trojan://` 开头（单行） | 单节点 Trojan | 直接解析 |
| 以 `hy2://` 开头（单行） | 单节点 Hysteria2 | 直接解析 |
| Base64 编码（多行/整段） | 订阅链接 | Base64 解码→按行解析 |
| JSON 格式 | Clash 订阅 | 直接 JSON 解析 |
| YAML 格式 | Clash Meta 订阅 | YAML 解析 |
| SIP002 (SS URI 多行) | SIP002 订阅 | 按行解析 URI |

## Surge 外部代理支持

对于 Surge 不原生支持的协议（SSR、VLESS、TUIC 等）：

```ini
# 使用 Surge External 代理程序
name = external, exec=/usr/local/bin/v2ray, args=--config=/path/to/config.json
```
