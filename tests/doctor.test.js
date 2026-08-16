'use strict';

/**
 * Tests for scripts/doctor.js — 环境诊断。
 * 只跑 --offline 路径，保证不依赖网络、跨平台确定性。
 */

const assert = require('node:assert/strict');
const test = require('node:test');

const { runChecks } = require('../scripts/doctor');

test('doctor offline checks pass on a valid checkout', async () => {
  const results = await runChecks({ offline: true });

  const names = results.map((r) => r.name);
  for (const expected of ['Node.js 版本', '操作系统', 'git', '代理配置', '网络检查', '项目完整性', '输出目录', '默认端口']) {
    assert.ok(names.includes(expected), `缺少检查项: ${expected}`);
  }

  // 在合法的项目检出 + Node >= 20 环境下，本地检查不应出现 fail
  const fails = results.filter((r) => r.level === 'fail');
  assert.deepEqual(fails.map((f) => `${f.name}: ${f.message}`), []);
});

test('doctor offline reports network check as skipped', async () => {
  const results = await runChecks({ offline: true });
  const network = results.find((r) => r.name === '网络检查');
  assert.equal(network.level, 'warn');
  assert.match(network.message, /--offline/);
});

test('doctor result entries have valid levels', async () => {
  const results = await runChecks({ offline: true });
  for (const item of results) {
    assert.ok(['pass', 'warn', 'fail'].includes(item.level), `非法 level: ${item.level}`);
    assert.ok(item.name && item.message, '检查项必须有 name 与 message');
  }
});
