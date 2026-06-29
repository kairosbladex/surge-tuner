'use strict';

/**
 * Tests for platform-base shared logic.
 * TDD: Write tests first, then verify modules pass.
 */

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_REGIONS,
  loadCatalog,
  normalizeSubscriptions,
  normalizeProxies,
  normalizeRegions,
  normalizeAdBlock,
  resolveServices,
  classifyProxiesByRegion,
  platformValidate
} = require('../scripts/platform-base');

test('platform-base DEFAULT_REGIONS has 6 regions', () => {
  assert.equal(DEFAULT_REGIONS.length, 6);
  assert.equal(DEFAULT_REGIONS[0].name, '香港节点');
  assert.equal(DEFAULT_REGIONS[3].name, '美国节点');
});

test('platform-base loadCatalog returns canonical and aliases maps', () => {
  const catalog = loadCatalog();
  assert.ok(catalog.canonical instanceof Map);
  assert.ok(catalog.aliases instanceof Map);

  const telegram = catalog.aliases.get('telegram');
  assert.ok(telegram);
  assert.equal(telegram.name, 'Telegram');
  assert.equal(telegram.group, 'Telegram');
  assert.ok(Array.isArray(telegram.rules));
  assert.ok(telegram.rules.length > 0);
});

test('platform-base normalizeSubscriptions handles empty and valid input', () => {
  assert.deepEqual(normalizeSubscriptions({}), []);
  assert.deepEqual(normalizeSubscriptions({ subscriptions: [] }), []);

  const result = normalizeSubscriptions({
    subscriptions: [{ name: '机场A', url: 'https://example.com/sub' }]
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, '机场A');
  assert.equal(result[0].url, 'https://example.com/sub');
  assert.equal(result[0].updateInterval, 86400);
});

test('platform-base normalizeProxies deduplicates names', () => {
  const proxies = normalizeProxies({
    proxies: [
      { name: 'Node1', type: 'trojan', host: 'a.com', port: 443, line: 'Node1 = trojan, a.com, 443' },
      { name: 'Node1', type: 'trojan', host: 'b.com', port: 443, line: 'Node1 = trojan, b.com, 443' }
    ]
  });
  assert.equal(proxies.length, 2);
  assert.notEqual(proxies[0].name, proxies[1].name);
});

test('platform-base normalizeAdBlock handles boolean and object', () => {
  assert.deepEqual(normalizeAdBlock({ adBlock: true }), { enabled: true, mitm: true });
  assert.deepEqual(normalizeAdBlock({ adBlock: false }), { enabled: false, mitm: false });
  assert.deepEqual(normalizeAdBlock({ adBlock: { enabled: true, mitm: false } }), { enabled: true, mitm: false });
  assert.deepEqual(normalizeAdBlock({}), { enabled: false, mitm: false });
});

test('platform-base resolveServices returns groups and rules', () => {
  const catalog = loadCatalog();
  const result = resolveServices(['Telegram', 'ChatGPT'], catalog);

  assert.ok(result.groups instanceof Map);
  assert.ok(result.groups.has('Telegram'));
  assert.ok(result.groups.has('AI服务'));
  assert.ok(Array.isArray(result.rules));
  assert.ok(result.rules.length >= 2);
});

test('platform-base classifyProxiesByRegion classifies correctly', () => {
  const proxies = [
    { name: '香港-HK-01', type: 'trojan', host: 'hk.com', port: 443, line: '' },
    { name: '美国-US-01', type: 'trojan', host: 'us.com', port: 443, line: '' },
    { name: 'Unknown-01', type: 'trojan', host: 'x.com', port: 443, line: '' }
  ];
  const { classified, unclassified } = classifyProxiesByRegion(proxies, DEFAULT_REGIONS);

  assert.ok(classified.has('香港节点'));
  assert.ok(classified.has('美国节点'));
  assert.equal(unclassified.length, 1);
  assert.equal(unclassified[0].name, 'Unknown-01');
});

test('platform-base platformValidate checks empty config', () => {
  const issues = platformValidate('', 'surge');
  assert.ok(issues.length > 0);
  assert.equal(issues[0].severity, 'error');
});

test('platform-base platformValidate accepts valid INI config', () => {
  const issues = platformValidate('[General]\nkey=value\n[Proxy]\np = ss', 'surge');
  assert.equal(issues.length, 0);
});
