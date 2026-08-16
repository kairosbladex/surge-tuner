'use strict';

/**
 * Tests for user-preference-store persistence hardening (refactor Step 5):
 *   - 交叉写不丢更新（CLI 与长驻 A2A 进程并存场景）
 *   - 外部直接改文件后 set 不覆盖外部修改
 *   - getAll 返回深拷贝
 *   - 非字符串输入抛友好 Error 而非 TypeError
 *   - 原子写：同目录临时文件 + rename，中断不损坏原文件
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { UserPreferenceStore } = require('../scripts/user-preference-store');

const createdFiles = [];

function tmpStorePath(tag) {
  const file = '/tmp/prefs-step5-' + tag + '-' + crypto.randomUUID() + '.json';
  createdFiles.push(file);
  return file;
}

// ── 陈旧缓存修复 ─────────────────────────────────────────────────────────────

test('两个实例交替写不丢更新（模拟 CLI 与长驻进程并存）', () => {
  const file = tmpStorePath('interleaved');
  const a = new UserPreferenceStore(file);
  const b = new UserPreferenceStore(file);
  // 双方都先读一次：旧实现会在此刻固化内存缓存，之后互相覆盖
  a.getAll();
  b.getAll();

  a.set({ preferredPlatform: 'clash' });
  b.set({ finalPolicy: 'DIRECT' });
  a.addAdDomain('*.ads-a.example');
  b.addSubscription('机场B', 'https://b.example/sub');

  // 用全新实例读盘验证最终结果：两边的修改都应在
  const final = new UserPreferenceStore(file).getAll();
  assert.equal(final.preferredPlatform, 'clash');
  assert.equal(final.finalPolicy, 'DIRECT');
  assert.ok(final.customAdDomains.includes('.ads-a.example'));
  assert.ok(final.subscriptions.some((s) => s.url === 'https://b.example/sub'));
});

test('外部直接改文件后 set 不覆盖外部修改', () => {
  const file = tmpStorePath('external');
  const store = new UserPreferenceStore(file);
  store.set({ preferredPlatform: 'surge' });
  store.getAll(); // 长驻实例建立（旧实现的）缓存

  // 外部进程（如 CLI）直接改写同一文件
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  onDisk.finalPolicy = '外部策略';
  onDisk.customAdDomains = ['.external-ads.example'];
  fs.writeFileSync(file, JSON.stringify(onDisk, null, 2), 'utf8');

  // 长驻实例再 set 别的 key，不应把外部修改冲掉
  store.set({ preferredPlatform: 'loon' });
  const final = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(final.preferredPlatform, 'loon');
  assert.equal(final.finalPolicy, '外部策略');
  assert.deepEqual(final.customAdDomains, ['.external-ads.example']);

  // 长驻实例的读路径也能看到外部修改
  assert.equal(store.get('finalPolicy'), '外部策略');
});

// ── getAll 深拷贝 ────────────────────────────────────────────────────────────

test('getAll 返回深拷贝，修改返回值不污染 store', () => {
  const store = new UserPreferenceStore(tmpStorePath('deepcopy'));
  store.addAdDomain('*.keep.example');

  const all = store.getAll();
  all.customAdDomains.push('.polluted.example');
  all.mitm.extraHostnames.push('polluted.example.com');
  all.regionOrder[0] = 'POLLUTED';

  const fresh = store.getAll();
  assert.ok(!fresh.customAdDomains.includes('.polluted.example'));
  assert.ok(!fresh.mitm.extraHostnames.includes('polluted.example.com'));
  assert.equal(fresh.regionOrder[0], '香港节点');
});

// ── 入参校验 ─────────────────────────────────────────────────────────────────

test('非字符串输入抛友好 Error 而非 TypeError', () => {
  const store = new UserPreferenceStore(tmpStorePath('friendly-error'));
  const expectFriendlyError = (fn, pattern) => {
    assert.throws(fn, (err) => {
      assert.ok(err instanceof Error);
      assert.ok(!(err instanceof TypeError), `应为友好 Error 而非 TypeError: ${err}`);
      assert.match(err.message, pattern);
      return true;
    });
  };
  expectFriendlyError(() => store.addAdDomain(123), /addAdDomain.*string/);
  expectFriendlyError(() => store.addAdDomain(null), /addAdDomain/);
  expectFriendlyError(() => store.removeAdDomain(undefined), /removeAdDomain/);
  expectFriendlyError(() => store.addSubscription('name', 42), /addSubscription/);
  expectFriendlyError(() => store.addSubscription(42, 'https://x.example'), /addSubscription/);
  expectFriendlyError(() => store.removeSubscription({}), /removeSubscription/);
  expectFriendlyError(() => store.addCustomRule('DOMAIN', 'x.example', null), /addCustomRule/);
});

// ── 原子写 ───────────────────────────────────────────────────────────────────

test('原子写：保存经同目录临时文件 + rename 完成，最终文件完整', () => {
  const file = tmpStorePath('atomic');
  const store = new UserPreferenceStore(file);
  const renameCalls = [];
  const origRename = fs.renameSync;
  fs.renameSync = (from, to) => { renameCalls.push([from, to]); return origRename(from, to); };
  try {
    store.set({ preferredPlatform: 'clash' });
  } finally {
    fs.renameSync = origRename;
  }

  assert.equal(renameCalls.length, 1);
  const [from, to] = renameCalls[0];
  assert.equal(to, file);
  assert.equal(path.dirname(from), path.dirname(file)); // 同目录 = 同盘，rename 才原子
  assert.ok(from.endsWith('.tmp'));
  assert.ok(!fs.existsSync(from), '临时文件应已被 rename 走');

  const final = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(final.preferredPlatform, 'clash');
});

test('原子写：写入中断不损坏原文件且不残留临时文件', () => {
  const file = tmpStorePath('interrupted');
  const store = new UserPreferenceStore(file);
  store.set({ preferredPlatform: 'clash' });
  const before = fs.readFileSync(file, 'utf8');

  const renameCalls = [];
  const origWrite = fs.writeFileSync;
  const origRename = fs.renameSync;
  fs.writeFileSync = (target, ...rest) => {
    if (String(target).endsWith('.tmp')) throw new Error('simulated write crash');
    return origWrite(target, ...rest);
  };
  fs.renameSync = (from, to) => { renameCalls.push([from, to]); return origRename(from, to); };
  try {
    assert.throws(() => store.set({ preferredPlatform: 'loon' }), /simulated write crash/);
  } finally {
    fs.writeFileSync = origWrite;
    fs.renameSync = origRename;
  }

  assert.equal(renameCalls.length, 0, '写失败不应走到 rename');
  assert.equal(fs.readFileSync(file, 'utf8'), before, '原文件内容应保持不变');
  const leftovers = fs.readdirSync(path.dirname(file))
    .filter((f) => f.startsWith(path.basename(file)) && f.endsWith('.tmp'));
  assert.deepEqual(leftovers, [], '不应残留临时文件');
});

// Clean up temp preference files created by this suite
test.after(() => {
  for (const f of createdFiles) {
    try { fs.unlinkSync(f); } catch (_) { /* ignore */ }
  }
});
