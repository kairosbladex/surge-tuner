'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { buildInputFromArgs, generateSurgeConfig, validateGeneratedConfig } = require('../scripts/surge-config-generator');
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
