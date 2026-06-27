'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { listDefaultFiles, validateFile, validateText } = require('../scripts/surge-config-validator');

const repoRoot = path.resolve(__dirname, '..');

test('current checked-in profiles have no hard validation errors', () => {
  const results = listDefaultFiles(repoRoot).map((file) => validateFile(file, { repoRoot }));
  const errors = results.flatMap((result) => result.issues.filter((issue) => issue.severity === 'error'));
  assert.deepEqual(errors, []);
});

test('validator reports missing local rulesets', () => {
  const issues = validateText([
    '[Proxy Group]',
    'Proxy = select, DIRECT',
    '',
    '[Rule]',
    'RULE-SET,rulesets/Missing.list,Proxy',
    'FINAL,DIRECT'
  ].join('\n'), {
    repoRoot,
    filePath: path.join(repoRoot, 'configs/test.conf')
  });

  assert.equal(issues.some((issue) => issue.code === 'LOCAL_RULESET_NOT_FOUND'), true);
});

test('validator reports undefined rule policies', () => {
  const issues = validateText([
    '[Proxy Group]',
    'Proxy = select, DIRECT',
    '',
    '[Rule]',
    'DOMAIN-SUFFIX,example.com,MissingPolicy',
    'FINAL,Proxy'
  ].join('\n'), {
    repoRoot,
    filePath: path.join(repoRoot, 'configs/test.conf')
  });

  assert.equal(issues.some((issue) => issue.code === 'RULE_POLICY_UNDEFINED'), true);
});

test('validator warns for bare local ruleset paths', () => {
  const issues = validateText([
    '[Rule]',
    'RULE-SET,LAN.list,DIRECT',
    'FINAL,DIRECT'
  ].join('\n'), {
    repoRoot,
    filePath: path.join(repoRoot, 'configs/test.conf')
  });

  assert.equal(issues.some((issue) => issue.code === 'LOCAL_RULESET_BARE_PATH'), true);
});

test('validator reports undefined proxy group members', () => {
  const issues = validateText([
    '[Proxy]',
    '香港-HK-01 = trojan, hk.example.com, 443, password=secret, tls=true',
    '',
    '[Proxy Group]',
    'All = select, 香港-HK-01, 不存在节点, include-other-group="机场A, 机场B"',
    '机场A = select, policy-path=https://example.com/a, update-interval=86400',
    '机场B = select, policy-path=https://example.com/b, update-interval=86400',
    '',
    '[Rule]',
    'FINAL,All'
  ].join('\n'), {
    repoRoot,
    filePath: path.join(repoRoot, 'configs/test.conf')
  });

  assert.equal(issues.some((issue) => issue.code === 'GROUP_POLICY_UNDEFINED' && issue.message.includes('不存在节点')), true);
  assert.equal(issues.some((issue) => issue.message.includes('机场B')), false);
});
