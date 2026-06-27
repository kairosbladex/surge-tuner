#!/usr/bin/env node
'use strict';

const fs = require('fs');

const SUPPORTED_SCHEMES = ['ss://', 'trojan://', 'vmess://', 'hy2://', 'hysteria2://', 'tuic://'];

function parseProxyAddress(address) {
  const value = String(address || '').trim();
  if (!value) {
    throw new Error('proxy address is empty');
  }

  if (value.startsWith('ss://')) return parseShadowsocks(value);
  if (value.startsWith('trojan://')) return parseTrojan(value);
  if (value.startsWith('vmess://')) return parseVMess(value);
  if (value.startsWith('hy2://') || value.startsWith('hysteria2://')) return parseHysteria2(value);
  if (value.startsWith('tuic://')) return parseTuic(value);

  throw new Error(`unsupported proxy scheme: ${value.slice(0, 16)}`);
}

function parseProxyContent(content) {
  const normalized = normalizeSubscriptionContent(content);
  const entries = [];

  for (const rawLine of normalized.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (!SUPPORTED_SCHEMES.some((scheme) => line.startsWith(scheme))) continue;
    entries.push(parseProxyAddress(line));
  }

  if (entries.length === 0) {
    throw new Error('no supported proxy addresses found');
  }

  return dedupeProxyNames(entries);
}

async function loadProxySource(options) {
  if (options.addressFile) {
    return parseProxyContent(fs.readFileSync(options.addressFile, 'utf8'));
  }

  if (!options.address) {
    throw new Error('address or addressFile is required');
  }

  const address = String(options.address).trim();
  if (/^https?:\/\//i.test(address)) {
    const response = await fetch(address, {
      headers: {
        'user-agent': 'surge-tuner/0.1'
      }
    });
    if (!response.ok) {
      throw new Error(`failed to fetch subscription: HTTP ${response.status}`);
    }
    return parseProxyContent(await response.text());
  }

  if (SUPPORTED_SCHEMES.some((scheme) => address.startsWith(scheme))) {
    return dedupeProxyNames([parseProxyAddress(address)]);
  }

  return parseProxyContent(address);
}

function parseShadowsocks(uri) {
  const { body, name } = splitFragment(uri.slice('ss://'.length));
  const main = body.split('?')[0];
  let userInfo;
  let serverPart;

  if (main.includes('@')) {
    const atIndex = main.lastIndexOf('@');
    userInfo = main.slice(0, atIndex);
    serverPart = main.slice(atIndex + 1);
    if (!userInfo.includes(':')) {
      userInfo = decodeBase64(userInfo);
    } else {
      userInfo = decodeURIComponentSafe(userInfo);
    }
  } else {
    const decoded = decodeBase64(main);
    const atIndex = decoded.lastIndexOf('@');
    if (atIndex < 0) {
      throw new Error('invalid shadowsocks URI: missing server');
    }
    userInfo = decoded.slice(0, atIndex);
    serverPart = decoded.slice(atIndex + 1);
  }

  const colonIndex = userInfo.indexOf(':');
  if (colonIndex < 1) {
    throw new Error('invalid shadowsocks URI: missing method/password');
  }

  const method = userInfo.slice(0, colonIndex);
  const password = userInfo.slice(colonIndex + 1);
  const { host, port } = parseHostPort(serverPart, 'shadowsocks');
  const proxyName = sanitizeName(name || host);
  return {
    name: proxyName,
    type: 'ss',
    host,
    port,
    line: `${proxyName} = ss, ${host}, ${port}, encrypt-method=${method}, password=${password}, udp-relay=true`
  };
}

function parseTrojan(uri) {
  const url = parseUrl(uri, 'trojan');
  const name = sanitizeName(decodeURIComponentSafe(url.hash.slice(1)) || url.hostname);
  const port = requirePort(url, 'trojan');
  const params = [`password=${decodeURIComponentSafe(url.username)}`, 'tls=true'];
  appendCommonTlsParams(params, url.searchParams);
  params.push('udp-relay=true');
  return {
    name,
    type: 'trojan',
    host: url.hostname,
    port,
    line: `${name} = trojan, ${url.hostname}, ${port}, ${params.join(', ')}`
  };
}

function parseVMess(uri) {
  const payload = decodeBase64(uri.slice('vmess://'.length));
  const data = JSON.parse(payload);
  const name = sanitizeName(data.ps || data.name || data.add);
  const host = requireField(data.add, 'vmess.add');
  const port = Number(requireField(data.port, 'vmess.port'));
  const params = [`username=${requireField(data.id, 'vmess.id')}`];

  if (data.tls === 'tls' || data.tls === true) params.push('tls=true');
  if (data.sni) params.push(`sni=${data.sni}`);
  if (data.net === 'ws') {
    params.push('ws=true');
    if (data.path) params.push(`ws-path=${data.path}`);
    if (data.host) params.push(`ws-headers=Host:${data.host}`);
  }
  if (data.scy) {
    params.push(`encrypt-method=${data.scy}`);
  }
  params.push('vmess-aead=true');

  return {
    name,
    type: 'vmess',
    host,
    port,
    line: `${name} = vmess, ${host}, ${port}, ${params.join(', ')}`
  };
}

function parseHysteria2(uri) {
  const normalized = uri.replace(/^hy2:\/\//, 'hysteria2://');
  const url = parseUrl(normalized, 'hysteria2');
  const name = sanitizeName(decodeURIComponentSafe(url.hash.slice(1)) || url.hostname);
  const port = requirePort(url, 'hysteria2');
  const params = [`password=${decodeURIComponentSafe(url.username)}`];
  appendCommonTlsParams(params, url.searchParams);
  const bandwidth = url.searchParams.get('download-bandwidth') || url.searchParams.get('down');
  if (bandwidth) params.push(`download-bandwidth=${bandwidth}`);

  return {
    name,
    type: 'hysteria2',
    host: url.hostname,
    port,
    line: `${name} = hysteria2, ${url.hostname}, ${port}, ${params.join(', ')}`
  };
}

function parseTuic(uri) {
  const url = parseUrl(uri, 'tuic');
  const name = sanitizeName(decodeURIComponentSafe(url.hash.slice(1)) || url.hostname);
  const port = requirePort(url, 'tuic');
  const uuid = decodeURIComponentSafe(url.username);
  const password = decodeURIComponentSafe(url.password);
  const params = [`token=${password || uuid}`];
  if (uuid && password) params.push(`uuid=${uuid}`);
  appendCommonTlsParams(params, url.searchParams);
  const alpn = url.searchParams.get('alpn');
  if (alpn) params.push(`alpn=${alpn}`);

  return {
    name,
    type: 'tuic',
    host: url.hostname,
    port,
    line: `${name} = tuic, ${url.hostname}, ${port}, ${params.join(', ')}`
  };
}

function normalizeSubscriptionContent(content) {
  const text = String(content || '').trim();
  if (!text) return '';
  if (SUPPORTED_SCHEMES.some((scheme) => text.includes(scheme))) {
    return text;
  }

  try {
    const decoded = decodeBase64(text);
    if (SUPPORTED_SCHEMES.some((scheme) => decoded.includes(scheme))) {
      return decoded;
    }
  } catch (_) {
    // Keep original text; the caller reports if no proxy address is found.
  }
  return text;
}

function splitFragment(value) {
  const index = value.indexOf('#');
  if (index < 0) {
    return { body: value, name: '' };
  }
  return {
    body: value.slice(0, index),
    name: decodeURIComponentSafe(value.slice(index + 1))
  };
}

function parseHostPort(value, protocol) {
  const decoded = decodeURIComponentSafe(value);
  const match = decoded.match(/^\[([^\]]+)\]:(\d+)$/) || decoded.match(/^([^:]+):(\d+)$/);
  if (!match) {
    throw new Error(`invalid ${protocol} URI: missing host/port`);
  }
  return {
    host: match[1],
    port: Number(match[2])
  };
}

function parseUrl(uri, protocol) {
  try {
    return new URL(uri);
  } catch (error) {
    throw new Error(`invalid ${protocol} URI: ${error.message}`);
  }
}

function requirePort(url, protocol) {
  if (!url.port) {
    throw new Error(`invalid ${protocol} URI: missing port`);
  }
  return Number(url.port);
}

function requireField(value, field) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`missing required field: ${field}`);
  }
  return value;
}

function appendCommonTlsParams(params, searchParams) {
  const sni = searchParams.get('sni') || searchParams.get('peer');
  if (sni) params.push(`sni=${sni}`);
  const insecure = searchParams.get('allowInsecure') || searchParams.get('insecure') || searchParams.get('skip-cert-verify');
  if (insecure === '1' || insecure === 'true') params.push('skip-cert-verify=true');
}

function decodeBase64(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch (_) {
    return String(value || '');
  }
}

function sanitizeName(value) {
  const name = decodeURIComponentSafe(value).trim() || 'Proxy';
  return name.replace(/[\r\n=,]/g, ' ').replace(/\s+/g, ' ').trim();
}

function dedupeProxyNames(proxies) {
  const seen = new Map();
  return proxies.map((proxy) => {
    const count = seen.get(proxy.name) || 0;
    seen.set(proxy.name, count + 1);
    if (count === 0) return proxy;

    const nextName = `${proxy.name} ${count + 1}`;
    return {
      ...proxy,
      name: nextName,
      line: proxy.line.replace(`${proxy.name} = `, `${nextName} = `)
    };
  });
}

module.exports = {
  parseProxyAddress,
  parseProxyContent,
  loadProxySource,
  normalizeSubscriptionContent
};
