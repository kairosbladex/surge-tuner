'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { execFileSync } = require('node:child_process');
const os = require('node:os');
const { buildInputFromArgs, generateSurgeConfig, parseArgs, validateGeneratedConfig } = require('../scripts/surge-config-generator');
const { validateText } = require('../scripts/surge-config-validator');
const { parseProxyContent } = require('../scripts/surge-proxy-parser');

const repoRoot = path.resolve(__dirname, '..');

test('generator creates a valid Surge profile from structured input', () => {
  const input = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/sample-generator-input.json'), 'utf8'));
  const output = generateSurgeConfig(input);

  assert.match(output, /\[General\]/);
  assert.match(output, /机场A = select, policy-path=https:\/\/example\.com\/sub\?token=token-a/);
  assert.match(output, /香港节点 = url-test/);
  assert.doesNotMatch(output, / = smart,/);
  assert.match(output, /RULE-SET,rulesets\/LAN\.list,DIRECT/);
  assert.match(output, /RULE-SET,https:\/\/raw\.githubusercontent\.com\/blackmatrix7\/ios_rule_script\/master\/rule\/Surge\/Telegram\/Telegram\.list,Telegram/);
  assert.match(output, /RULE-SET,https:\/\/raw\.githubusercontent\.com\/blackmatrix7\/ios_rule_script\/master\/rule\/Surge\/OpenAI\/OpenAI\.list,AI服务/);

  const issues = validateText(output, {
    repoRoot,
    filePath: path.join(repoRoot, 'configs/generated/sample.conf')
  });
  assert.deepEqual(issues, []);
});

test('generator rejects unknown services instead of guessing rules', () => {
  assert.throws(
    () => generateSurgeConfig({
      subscriptions: [{ name: '机场A', url: 'https://example.com/sub' }],
      services: ['UnknownService']
    }),
    /Unknown service/
  );
});

test('generator does not duplicate built-in service groups', () => {
  const output = generateSurgeConfig({
    subscriptions: [{ name: '机场A', url: 'https://example.com/sub' }],
    services: ['Microsoft', 'OneDrive']
  });

  const microsoftGroupLines = output.split(/\r?\n/).filter((line) => line.startsWith('微软服务 = '));
  assert.equal(microsoftGroupLines.length, 1);
});

test('generator creates a valid full profile from parsed proxy addresses', () => {
  const proxies = parseProxyContent([
    'trojan://secret@hk.example.com:443?sni=hk.example.com#香港-HK-01',
    'trojan://secret@us.example.com:443?sni=us.example.com#美国-US-01'
  ].join('\n'));

  const output = generateSurgeConfig({
    proxies,
    services: ['Telegram', 'ChatGPT'],
    adBlock: true
  });

  assert.match(output, /\[Proxy\]\n香港-HK-01 = trojan/);
  assert.match(output, /香港节点 = url-test, 香港-HK-01/);
  assert.match(output, /美国节点 = url-test, 美国-US-01/);
  assert.match(output, /Telegram = select, 香港节点, 美国节点, 新加坡节点, All/);

  const issues = validateText(output, {
    repoRoot,
    filePath: path.join(repoRoot, 'configs/generated/from-address.conf')
  });
  assert.deepEqual(issues, []);
});

test('generator CLI input builder parses address-file subscriptions', async () => {
  const input = await buildInputFromArgs({
    input: null,
    address: null,
    addressFile: path.join(__dirname, 'fixtures/sample-subscription.txt'),
    services: ['Telegram'],
    adBlock: false
  });

  assert.equal(input.proxies.length, 2);
  assert.equal(input.services[0], 'Telegram');
});

test('generator CLI input builder parses addresses array and common preset', async () => {
  const args = parseArgs([
    '--addresses',
    JSON.stringify([
      'trojan://secret@hk.example.com:443?sni=hk.example.com#香港-HK-01',
      'trojan://secret@us.example.com:443?sni=us.example.com#美国-US-01'
    ]),
    '--preset',
    'common',
    '--adblock'
  ]);
  const input = await buildInputFromArgs(args);

  assert.equal(input.proxies.length, 2);
  assert.ok(input.services.includes('Telegram'));
  assert.ok(input.services.includes('GitHub'));
  assert.equal(input.adBlock, true);
});

test('generator CLI writes adblock sidecar when adblock output is enabled', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-tuner-sidecar-'));
  const output = path.join(dir, 'surge.conf');

  execFileSync(process.execPath, [
    'scripts/surge-config-generator.js',
    '--address',
    'trojan://secret@hk.example.com:443?sni=hk.example.com#香港-HK-01',
    '--preset',
    'common',
    '--adblock',
    '--output',
    output
  ], { cwd: path.join(__dirname, '..') });

  const sidecar = path.join(dir, 'surge.proxy-tuner-adblock.sgmodule');
  assert.ok(fs.existsSync(output));
  assert.ok(fs.existsSync(sidecar));
  assert.match(fs.readFileSync(sidecar, 'utf8'), /\[MITM\]/);
});

test('generator validation rejects profiles with broken group references', () => {
  const output = generateSurgeConfig({
    proxies: [{
      name: '香港-HK-01',
      line: '实际节点名 = trojan, hk.example.com, 443, password=secret, tls=true'
    }],
    services: ['Telegram']
  });

  assert.throws(
    () => validateGeneratedConfig(output, path.join(repoRoot, 'configs/generated/broken.conf')),
    /GROUP_POLICY_UNDEFINED/
  );
});

// ── 一体化模式（--unified）──────────────────────────────────────────────────────
// 把主配置 + 去广告 + MITM 合并到一个 .conf 文件，订阅用 policy-path 引用。
// 参考用户本机 Surge 配置风格（emoji 策略组 + smart 类型 + ACL4SSR 规则集）。

test('unified mode produces a single config with [General]/[Proxy Group]/[Rule]/[MITM]/[Script] sections', () => {
  const output = generateSurgeConfig({
    unified: true,
    subscriptions: [{ name: '机场A', url: 'https://example.com/sub?token=a' }],
    services: ['Telegram', 'ChatGPT'],
    adBlock: true
  });

  assert.match(output, /\[General\]/);
  assert.match(output, /\[Proxy Group\]/);
  assert.match(output, /\[Rule\]/);
  assert.match(output, /\[MITM\]/);
  assert.match(output, /\[Script\]/);
});

test('unified mode references subscription via policy-path, without inlining [Proxy] nodes', () => {
  const output = generateSurgeConfig({
    unified: true,
    subscriptions: [{ name: '机场A', url: 'https://example.com/sub?token=a' }]
  });

  // 订阅以 policy-path 形式出现在 Proxy Group
  assert.match(output, /policy-path=https:\/\/example\.com\/sub\?token=a/);
  // 不应该出现 [Proxy] 区段（节点不本地解析）
  assert.doesNotMatch(output, /\[Proxy\]/);
});

test('unified mode uses emoji smart groups with include-other-group referencing subscriptions', () => {
  const output = generateSurgeConfig({
    unified: true,
    subscriptions: [{ name: '机场A', url: 'https://example.com/sub?token=a' }]
  });

  assert.match(output, /🚀 节点选择 = select/);
  assert.match(output, /♻️ 自动选择 = smart,/);
  assert.match(output, /🇭🇰 香港节点 = smart, include-other-group="🚀 手动切换,🔗 备用订阅,🧩 新订阅"/);
});

test('unified mode merges adblock rules into [Rule] instead of separate sgmodule', () => {
  const output = generateSurgeConfig({
    unified: true,
    subscriptions: [{ name: '机场A', url: 'https://example.com/sub?token=a' }],
    adBlock: true
  });

  // 去广告规则直接进 [Rule]，含 REJECT
  assert.match(output, /RULE-SET,https:\/\/raw\.githubusercontent\.com\/ACL4SSR\/ACL4SSR\/master\/Clash\/BanAD\.list,🛑 广告拦截/);
});

test('unified mode includes ACL4SSR remote rule-sets for selected services', () => {
  const output = generateSurgeConfig({
    unified: true,
    subscriptions: [{ name: '机场A', url: 'https://example.com/sub?token=a' }],
    services: ['Telegram', 'YouTube']
  });

  assert.match(output, /ACL4SSR\/master\/Clash\/Telegram\.list.*♻️ 自动选择/);
  assert.match(output, /ACL4SSR\/master\/Clash\/Ruleset\/YouTube\.list.*📹 油管视频/);
});

test('unified mode MITM section contains hostname but no ca-p12, with install guide comments', () => {
  const output = generateSurgeConfig({
    unified: true,
    subscriptions: [{ name: '机场A', url: 'https://example.com/sub?token=a' }],
    adBlock: true
  });

  const mitmMatch = output.match(/\[MITM\]([\s\S]*?)(\n\[|$)/);
  assert.ok(mitmMatch, '应包含 [MITM] 区段');
  const mitmBody = mitmMatch[1];
  assert.match(mitmBody, /hostname\s*=/);
  // 不应包含 ca-p12（用户自己生成证书）
  assert.doesNotMatch(mitmBody, /ca-p12\s*=/);
  // 应有引导注释
  assert.match(mitmBody, /MITM|证书|Surge/);
});

test('unified mode CLI --unified flag produces single .conf without .sgmodule sidecar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-tuner-unified-'));
  const output = path.join(dir, 'surge-unified.conf');

  execFileSync(process.execPath, [
    'scripts/surge-config-generator.js',
    '--unified',
    '--subscription',
    '机场A|https://example.com/sub?token=a',
    '--preset', 'common',
    '--adblock',
    '--output', output
  ], { cwd: path.join(__dirname, '..') });

  assert.ok(fs.existsSync(output));
  const text = fs.readFileSync(output, 'utf8');
  assert.match(text, /\[MITM\]/);
  assert.match(text, /policy-path=https:\/\/example\.com\/sub\?token=a/);

  // 不应该生成 .sgmodule sidecar
  const sidecar = path.join(dir, 'surge-unified.proxy-tuner-adblock.sgmodule');
  assert.ok(!fs.existsSync(sidecar), '一体化模式不应生成 .sgmodule sidecar');
});
