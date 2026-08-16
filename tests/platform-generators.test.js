'use strict';

/**
 * Tests for Loon, Quantumult X, and Clash config generators.
 * TDD: Write tests first, then run against implementations.
 */

const assert = require('node:assert/strict');
const test = require('node:test');

const { generateLoonConfig } = require('../scripts/loon-config-generator');
const { generateQuantumultXConfig } = require('../scripts/quantumultx-config-generator');
const { generateClashConfig } = require('../scripts/clash-config-generator');

const sampleProxies = [
  { name: '香港-HK-01', type: 'trojan', host: 'hk.example.com', port: 443,
    line: '香港-HK-01 = trojan, hk.example.com, 443, password=secret, tls=true, udp-relay=true' },
  { name: '美国-US-01', type: 'trojan', host: 'us.example.com', port: 443,
    line: '美国-US-01 = trojan, us.example.com, 443, password=secret, tls=true, udp-relay=true' }
];

// ── Loon ────────────────────────────────────────────────────────────────────────

test('loon generator creates valid config with proxies', () => {
  const output = generateLoonConfig({
    proxies: sampleProxies,
    services: ['Telegram'],
    adBlock: false
  });

  assert.match(output, /\[General\]/);
  assert.match(output, /\[Proxy\]/);
  assert.match(output, /\[Remote Proxy\]/);
  assert.match(output, /\[Proxy Group\]/);
  assert.match(output, /\[Rule\]/);
  assert.match(output, /香港-HK-01 = trojan/);
  assert.match(output, /Telegram = select/);
  assert.match(output, /FINAL,兜底分流/);
});

test('loon generator includes ad-block sections when enabled', () => {
  const output = generateLoonConfig({
    proxies: sampleProxies,
    services: [],
    adBlock: true
  });

  assert.match(output, /\[MITM\]/);
  assert.match(output, /\[Script\]/);
  assert.match(output, /hostname = .*\*\.doubleclick\.net/);
  assert.match(output, /ad-block-all\.js/);
});

test('loon generator throws without proxies or subscriptions', () => {
  assert.throws(
    () => generateLoonConfig({ services: ['Telegram'] }),
    /subscriptions or proxies must contain at least one entry/
  );
});

test('loon generator accepts subscriptions', () => {
  const output = generateLoonConfig({
    subscriptions: [{ name: '机场A', url: 'https://example.com/sub' }],
    services: ['YouTube'],
    adBlock: false
  });

  assert.match(output, /机场A/);
  assert.match(output, /include-all-proxies=true/);
});

// ── Quantumult X ────────────────────────────────────────────────────────────────

test('qx generator creates valid config with proxies', () => {
  const output = generateQuantumultXConfig({
    proxies: sampleProxies,
    services: ['Telegram'],
    adBlock: false
  });

  assert.match(output, /\[general\]/);
  assert.match(output, /\[server_local\]/);
  assert.match(output, /\[server_remote\]/);
  assert.match(output, /\[policy\]/);
  assert.match(output, /\[filter_remote\]/);
  assert.match(output, /\[filter_local\]/);
  assert.match(output, /香港-HK-01/);
  assert.match(output, /static=Telegram/);
  assert.match(output, /FINAL, 兜底分流/);
});

test('qx generator includes ad-block rewrite rules', () => {
  const output = generateQuantumultXConfig({
    proxies: sampleProxies,
    services: [],
    adBlock: true
  });

  assert.match(output, /\[rewrite_remote\]/);
  assert.match(output, /\[rewrite_local\]/);
  assert.match(output, /\[mitm\]/);
  assert.match(output, /ad-block-all\.js/);
});

test('qx generator throws without proxies or subscriptions', () => {
  assert.throws(
    () => generateQuantumultXConfig({ services: ['YouTube'] }),
    /subscriptions or proxies must contain at least one entry/
  );
});

// ── Clash ───────────────────────────────────────────────────────────────────────

test('clash generator creates valid YAML with proxies', () => {
  const output = generateClashConfig({
    proxies: sampleProxies,
    services: ['Telegram'],
    adBlock: false
  });

  assert.match(output, /port: 7890/);
  assert.match(output, /mode: Rule/);
  assert.match(output, /proxies:/);
  assert.match(output, /proxy-groups:/);
  assert.match(output, /rules:/);
  assert.match(output, /香港-HK-01/);
  assert.match(output, /美国-US-01/);
  // 节点凭证必须保留（曾丢失 cipher/password/uuid 导致配置不可用）
  assert.match(output, /password: secret/);
  assert.match(output, /MATCH,兜底分流/);
});

test('clash generator keeps credentials for every supported protocol', () => {
  const proxies = [
    { name: 'SS', type: 'ss', host: 'ss.example.com', port: 8388,
      line: 'SS = ss, ss.example.com, 8388, encrypt-method=aes-256-gcm, password=sspass, udp-relay=true' },
    { name: 'VM', type: 'vmess', host: 'vm.example.com', port: 443,
      line: 'VM = vmess, vm.example.com, 443, username=uuid-1234, tls=true, sni=vm.example.com, ws=true, ws-path=/ray, ws-headers=Host:cdn.example.com, vmess-aead=true' },
    { name: 'HY2', type: 'hysteria2', host: 'hy.example.com', port: 8443,
      line: 'HY2 = hysteria2, hy.example.com, 8443, password=hypass, sni=hy.example.com, skip-cert-verify=true' },
    { name: 'TUIC', type: 'tuic', host: 'tu.example.com', port: 10443,
      line: 'TUIC = tuic, tu.example.com, 10443, token=tuicpass, uuid=tuic-uuid, sni=tu.example.com, alpn=h3' }
  ];
  const output = generateClashConfig({ proxies, services: [], adBlock: false });

  assert.match(output, /cipher: aes-256-gcm/);
  assert.match(output, /password: sspass/);
  assert.match(output, /uuid: uuid-1234/);
  assert.match(output, /network: ws/);
  assert.match(output, /Host: cdn\.example\.com/);
  assert.match(output, /password: hypass/);
  assert.match(output, /skip-cert-verify: true/);
  assert.match(output, /uuid: tuic-uuid/);
  assert.match(output, /password: tuicpass/);
});

test('clash generator includes rule-providers with adblock', () => {
  const output = generateClashConfig({
    proxies: sampleProxies,
    services: ['Telegram'],
    adBlock: true
  });

  assert.match(output, /rule-providers:/);
  // 去广告清单内联展开为 REJECT 规则（本地 .list 上游无 Clash 版本）
  assert.match(output, /DOMAIN-SUFFIX,.+,REJECT/);
});

test('clash generator creates proxy-providers for subscriptions', () => {
  const output = generateClashConfig({
    subscriptions: [{ name: '机场A', url: 'https://example.com/sub' }],
    services: ['GitHub'],
    adBlock: false
  });

  assert.match(output, /proxy-providers:/);
  assert.match(output, /机场A/);
});

test('clash generator throws without proxies or subscriptions', () => {
  assert.throws(
    () => generateClashConfig({ services: ['Telegram'] }),
    /subscriptions or proxies must contain at least one entry/
  );
});

// ── Unified mode (--unified + --subscription) ────────────────────────────────────
// 一体化模式：主配置 + 去广告合并到一个文件，订阅用各平台原生引用，不生成 sidecar。
// 三个生成器的 generateXxxConfig 已内置 subscriptions 支持和 adblock 内联，
// unified 模式主要影响 CLI 层（--subscription 解析）和 main 层（跳过 sidecar）。

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runCli(script, args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-tuner-cli-'));
  const output = path.join(dir, 'config.conf');
  execFileSync(process.execPath, [script, ...args, '--output', output], {
    cwd: path.resolve(__dirname, '..')
  });
  return { dir, output, text: fs.readFileSync(output, 'utf8') };
}

test('loon unified mode: --subscription produces config with subscription ref and no sidecar', () => {
  const { dir, output, text } = runCli('scripts/loon-config-generator.js', [
    '--unified',
    '--subscription', '机场A|https://example.com/sub?token=a',
    '--preset', 'common',
    '--adblock'
  ]);

  // 订阅以 Remote Proxy 形式引用
  assert.match(text, /https:\/\/example\.com\/sub\?token=a/);
  // adblock 内联进主配置（不依赖 sidecar）
  assert.match(text, /\[MITM\]/);
  assert.match(text, /\[Script\]/);
  // 不应生成 sidecar
  const sidecar = path.join(dir, 'config.loon-adblock-config');
  assert.ok(!fs.existsSync(sidecar), '一体化模式不应生成 loon sidecar');
});

test('qx unified mode: --subscription produces config with server_remote and no sidecar', () => {
  const { dir, output, text } = runCli('scripts/quantumultx-config-generator.js', [
    '--unified',
    '--subscription', '机场A|https://example.com/sub?token=a',
    '--preset', 'common',
    '--adblock'
  ]);

  // 订阅以 server_remote 形式引用
  assert.match(text, /https:\/\/example\.com\/sub\?token=a/);
  // adblock 内联
  assert.match(text, /\[mitm\]/);
  assert.match(text, /\[rewrite_local\]/);
  // 不应生成 sidecar
  const sidecar = path.join(dir, 'config.quantumultx-adblock-snippet');
  assert.ok(!fs.existsSync(sidecar), '一体化模式不应生成 qx sidecar');
});

test('clash unified mode: --subscription produces YAML with proxy-providers and no sidecar', () => {
  const { dir, output, text } = runCli('scripts/clash-config-generator.js', [
    '--unified',
    '--subscription', '机场A|https://example.com/sub?token=a',
    '--preset', 'common',
    '--adblock'
  ]);

  // 订阅以 proxy-providers 形式引用
  assert.match(text, /proxy-providers:/);
  assert.match(text, /https:\/\/example\.com\/sub\?token=a/);
  // adblock 内联（rule-providers + 内联 REJECT 规则）
  assert.match(text, /rule-providers:/);
  assert.match(text, /DOMAIN-SUFFIX,.+,REJECT/);
  // 不应生成 sidecar
  const sidecar = path.join(dir, 'config.clash-adblock-rule-providers');
  assert.ok(!fs.existsSync(sidecar), '一体化模式不应生成 clash sidecar');
});

test('unified mode CLI accepts multiple --subscription flags', () => {
  const { text } = runCli('scripts/loon-config-generator.js', [
    '--unified',
    '--subscription', '机场A|https://a.example.com/sub',
    '--subscription', '机场B|https://b.example.com/sub',
    '--preset', 'common'
  ]);

  assert.match(text, /https:\/\/a\.example\.com\/sub/);
  assert.match(text, /https:\/\/b\.example\.com\/sub/);
});
