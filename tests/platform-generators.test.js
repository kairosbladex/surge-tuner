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
  assert.match(output, /MATCH,兜底分流/);
});

test('clash generator includes rule-providers with adblock', () => {
  const output = generateClashConfig({
    proxies: sampleProxies,
    services: ['Telegram'],
    adBlock: true
  });

  assert.match(output, /rule-providers:/);
  assert.match(output, /RULE-SET.*REJECT/);
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
