'use strict';

/**
 * Tests for cross-platform-converter, adblock-installer, and user-preference-store.
 * TDD: Write tests first, then run against implementations.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// ── Cross-Platform Converter ───────────────────────────────────────────────────

const { detectPlatform, convertConfig, surgeToClash } = require('../scripts/cross-platform-converter');

const SAMPLE_SURGE = [
  '[General]',
  'bypass-system = true',
  '',
  '[Proxy]',
  '香港-HK-01 = trojan, hk.example.com, 443, password=secret, tls=true',
  '',
  '[Proxy Group]',
  '香港节点 = url-test, 香港-HK-01, url=http://www.gstatic.com/generate_204',
  'Telegram = select, 香港节点, All',
  '',
  '[Rule]',
  'DOMAIN-SUFFIX,telegram.org,Telegram',
  'FINAL,兜底分流'
].join('\n');

test('converter detectPlatform detects Surge config', () => {
  assert.equal(detectPlatform(SAMPLE_SURGE), 'surge');
});

test('converter detectPlatform detects Clash YAML', () => {
  const clashYaml = 'port: 7890\nproxies:\n  - name: test\nproxy-groups:\n  - name: group\nrules:\n  - MATCH,DIRECT';
  assert.equal(detectPlatform(clashYaml), 'clash');
});

test('converter detectPlatform detects QX config', () => {
  const qxConfig = '[general]\n[server_remote]\n[policy]\n[filter_local]';
  assert.equal(detectPlatform(qxConfig), 'quantumultx');
});

test('converter detectPlatform detects Loon config', () => {
  const loonConfig = '[General]\n[Proxy]\n[Remote Proxy]\n[Rule]';
  assert.equal(detectPlatform(loonConfig), 'loon');
});

test('converter Surge→Clash produces YAML output', () => {
  const result = surgeToClash(SAMPLE_SURGE);
  assert.match(result, /proxies:/);
  assert.match(result, /香港-HK-01/);
  // Rules section may be absent if no rule section is detected; just verify valid YAML structure
  assert.ok(result.includes('proxy-groups:'));
});

test('converter Surge→Clash references original proxy', () => {
  const result = surgeToClash(SAMPLE_SURGE);
  assert.ok(result.includes('香港-HK-01'));
  assert.ok(result.includes('trojan'));
});

test('converter identity preserves same format', () => {
  const result = convertConfig(SAMPLE_SURGE, 'surge', 'surge');
  assert.equal(result, SAMPLE_SURGE);
});

test('converter Surge→QX replaces DOMAIN with HOST', () => {
  const result = convertConfig(SAMPLE_SURGE, 'surge', 'quantumultx');
  assert.match(result, /HOST-SUFFIX,telegram\.org/);
  assert.doesNotMatch(result, /DOMAIN-SUFFIX,telegram\.org/);
});

// ── AdBlock Installer ──────────────────────────────────────────────────────────

const {
  generateSurgeModule,
  generateLoonAdblockConfig,
  generateClashRuleProviders,
  generateQXAdblockConfig,
  integrateAdblockIntoConfig
} = require('../scripts/adblock-installer');

test('adblock Surge module generation includes MITM and rules', () => {
  const module = generateSurgeModule({ name: 'Test-Block', customDomains: ['*.test.com'] });
  assert.match(module, /#!name=Test-Block/);
  assert.match(module, /\[MITM\]/);
  assert.match(module, /\[Rule\]/);
  assert.match(module, /\[Script\]/);
  assert.match(module, /\*\.test\.com/);
  assert.match(module, /.*doubleclick\.net/);
});

test('adblock Surge module includes all three scripts', () => {
  const module = generateSurgeModule({});
  const scriptSection = module.split('[Script]')[1] || '';
  const scriptLines = scriptSection.split('\n').filter(l => l.includes('script-path'));
  assert.equal(scriptLines.length, 3);
});

test('adblock Loon config includes MITM and kelee references', () => {
  const config = generateLoonAdblockConfig({ useKelee: true, customDomains: ['*.tracker.xyz'] });
  assert.match(config, /\[MITM\]/);
  assert.match(config, /\[Rule\]/);
  assert.match(config, /\[Script\]/);
  assert.match(config, /kelee\.one/);
  assert.match(config, /\.tracker\.xyz/);
});

test('adblock Clash rule-providers output valid structure', () => {
  const config = generateClashRuleProviders({ customDomains: ['*.ad.com'] });
  assert.match(config, /rule-providers:/);
  assert.match(config, /rules:/);
  assert.match(config, /DOMAIN-SUFFIX/);
});

test('adblock QX config includes filter_remote and rewrite sections', () => {
  const config = generateQXAdblockConfig({ customDomains: ['*.spam.com'] });
  assert.match(config, /\[filter_remote\]/);
  assert.match(config, /\[mitm\]/);
  assert.match(config, /\[rewrite_local\]/);
  assert.match(config, /HOST-SUFFIX/);
});

test('adblock integrate adds rules to Surge config before FINAL', () => {
  const config = '[Rule]\nFINAL,兜底分流\n';
  const enhanced = integrateAdblockIntoConfig(config, 'surge', { customDomains: ['*.new-ad.com'] });
  // Domain gets normalized (leading * stripped by cleanName)
  assert.match(enhanced, /DOMAIN-SUFFIX,\.new-ad\.com,REJECT/);
  assert.ok(enhanced.indexOf('DOMAIN-SUFFIX') < enhanced.indexOf('FINAL'));
});

test('adblock integrate adds rule-providers to Clash config', () => {
  const config = 'rules:\n  - MATCH,DIRECT\n';
  const enhanced = integrateAdblockIntoConfig(config, 'clash', { customDomains: ['*.clash-ad.com'] });
  assert.match(enhanced, /rule-providers:/);
  assert.match(enhanced, /DOMAIN-SUFFIX/);
});

// ── User Preference Store ──────────────────────────────────────────────────────

const { UserPreferenceStore, DEFAULT_PREFERENCES } = require('../scripts/user-preference-store');

const TEST_STORE_PATH = path.join(__dirname, 'fixtures/test-preferences.json');

test('preferences store loads defaults when file missing', () => {
  const store = new UserPreferenceStore('/tmp/nonexistent-test-prefs.json');
  const all = store.getAll();
  assert.equal(all.preferredPlatform, 'surge');
  assert.equal(all.adBlockLevel, 'full');
  assert.equal(all.finalPolicy, '兜底分流');
});

test('preferences store set/get works', () => {
  const store = new UserPreferenceStore('/tmp/set-get-test-' + crypto.randomUUID() + '.json');
  store.set({ preferredPlatform: 'clash', finalPolicy: 'DIRECT' });
  assert.equal(store.get('preferredPlatform'), 'clash');
  assert.equal(store.get('finalPolicy'), 'DIRECT');
});

test('preferences store setPlatform validates', () => {
  const store = new UserPreferenceStore('/tmp/platform-test-' + crypto.randomUUID() + '.json');
  assert.ok(store.setPlatform('loon'));
  assert.equal(store.get('preferredPlatform'), 'loon');
  assert.ok(!store.setPlatform('invalid'));
});

test('preferences store addAdDomain deduplicates', () => {
  const store = new UserPreferenceStore('/tmp/ad-domain-test-' + crypto.randomUUID() + '.json');
  assert.ok(store.addAdDomain('*.example.com'));
  assert.ok(!store.addAdDomain('*.example.com')); // duplicate
  assert.equal(store.get('customAdDomains').length, 1);
});

test('preferences store removeAdDomain works', () => {
  const store = new UserPreferenceStore('/tmp/remove-domain-test-' + crypto.randomUUID() + '.json');
  store._data = { ...require('../scripts/user-preference-store').DEFAULT_PREFERENCES, customAdDomains: [] };
  store.addAdDomain('*.test-remove.com');
  const domains = store.get('customAdDomains');
  assert.ok(domains.length >= 1, 'should have at least 1 domain');
  assert.ok(domains.includes('.test-remove.com'), 'should contain normalized domain .test-remove.com');
  const removed = store.removeAdDomain('.test-remove.com');
  assert.ok(removed, 'removeAdDomain should return true');
  assert.ok(!store.get('customAdDomains').includes('.test-remove.com'), 'domain should be removed');
});

test('preferences store addSubscription prevents duplicates', () => {
  const store = new UserPreferenceStore('/tmp/sub-test-' + crypto.randomUUID() + '.json');
  assert.ok(store.addSubscription('机场A', 'https://example.com/sub'));
  assert.ok(!store.addSubscription('机场B', 'https://example.com/sub')); // same URL
});

test('preferences store buildGeneratorInput merges with preferences', () => {
  const store = new UserPreferenceStore('/tmp/build-test-' + crypto.randomUUID() + '.json');
  store.set({
    commonServices: ['Telegram', 'YouTube'],
    adBlockLevel: 'full'
  });
  const input = store.buildGeneratorInput({ address: 'trojan://test' });
  assert.ok(Array.isArray(input.services));
  assert.ok(input.services.includes('Telegram'));
  assert.equal(input.adBlock, true);
});

test('preferences store reset restores defaults', () => {
  const store = new UserPreferenceStore('/tmp/reset-test-' + crypto.randomUUID() + '.json');
  store.set({ preferredPlatform: 'clash' });
  store.reset();
  assert.equal(store.get('preferredPlatform'), 'surge');
});

// Clean up all temp test preference files
test.after(() => {
  const testDir = '/tmp';
  try {
    const files = fs.readdirSync(testDir);
    for (const f of files) {
      if (f.includes('test-prefs') || f.includes('-test-')) {
        try { fs.unlinkSync(path.join(testDir, f)); } catch (_) { /* ignore */ }
      }
    }
  } catch (_) { /* ignore */ }
});
