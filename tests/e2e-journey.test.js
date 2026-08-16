'use strict';

/**
 * e2e-journey.test.js — 完整用户旅程的端到端测试。
 *
 * 与单元/端点测试的区别：这里把「粘贴节点 → 生成 → 校验产物可用」整条链路
 * 一次性走通，防止任何一环（解析、生成、序列化、校验、sidecar）单独正确但拼起来失效。
 */

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createQuickStartServer } = require('../scripts/quick-start-server');
const { validateText } = require('../scripts/surge-config-validator');

const REPO_ROOT = path.resolve(__dirname, '..');

// 覆盖全部 5 种支持协议的真实节点链接（example.com 为占位，不发起真实连接）
const VMESS_URI = `vmess://${Buffer.from(JSON.stringify({
  v: '2', ps: '新加坡-VM-01', add: 'sg.example.com', port: '443',
  id: 'uuid-1234', aid: '0', net: 'ws', type: 'none',
  host: 'cdn.example.com', path: '/ray', tls: 'tls'
})).toString('base64')}`;
const NODE_URIS = [
  'ss://YWVzLTI1Ni1nY206cGFzc3dvcmQxMjM=@hk.example.com:8388#香港-SS-01',
  'trojan://secret@us.example.com:443?sni=us.example.com#美国-T-01',
  VMESS_URI,
  'hy2://pass@hy.example.com:8443?sni=hy.example.com#欧洲-HY2-01',
  'tuic://uuid:pass@tu.example.com:10443?sni=tu.example.com&alpn=h3#日本-TUIC-01'
].join('\n');

async function withServer(options, fn) {
  const server = createQuickStartServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('journey: paste nodes -> generate all 4 platforms via HTTP -> artifacts are usable', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-tuner-e2e-'));
  await withServer({ outputDir }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platforms: ['surge', 'loon', 'quantumultx', 'clash'],
        addresses: NODE_URIS,
        common: true,
        adBlock: true,
        discoverRules: false
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.result.results.length, 4);

    const byPlatform = new Map(body.result.results.map((r) => [r.platform, r]));
    assert.deepEqual([...byPlatform.keys()].sort(), ['clash', 'loon', 'quantumultx', 'surge']);

    // 标准模式 + 去广告：每个平台都必须有配置文件和 sidecar
    for (const [platform, r] of byPlatform) {
      assert.ok(fs.existsSync(r.configPath), `${platform} 配置文件应存在`);
      assert.ok(r.sidecarPath && fs.existsSync(r.sidecarPath), `${platform} sidecar 应存在`);
    }

    // Surge：自家 validator 必须零 error（生成即可用）
    const surgeText = fs.readFileSync(byPlatform.get('surge').configPath, 'utf8');
    assert.match(surgeText, /香港-SS-01 = ss/);
    const issues = validateText(surgeText, { filePath: byPlatform.get('surge').configPath });
    assert.deepEqual(issues.filter((i) => i.severity === 'error'), []);

    // Clash：节点凭证必须完整（P0 修复的旅程级回归守卫）
    const clashText = fs.readFileSync(byPlatform.get('clash').configPath, 'utf8');
    assert.match(clashText, /cipher: aes-256-gcm/);
    assert.match(clashText, /password: secret/);
    assert.match(clashText, /uuid: uuid-1234/);
    assert.match(clashText, /type: hysteria2/);
    assert.match(clashText, /type: tuic/);
    // rule-providers 引用名与定义必须一一对应（P0 修复）
    const providerNames = [...clashText.matchAll(/^  ([A-Za-z0-9_]+):\n    type: http/gm)].map((m) => m[1]);
    for (const ref of clashText.matchAll(/RULE-SET,([A-Za-z0-9_]+),/g)) {
      assert.ok(providerNames.includes(ref[1]), `RULE-SET 引用了不存在的 provider: ${ref[1]}`);
    }

    // Loon / QX：关键段落存在
    const loonText = fs.readFileSync(byPlatform.get('loon').configPath, 'utf8');
    assert.match(loonText, /\[Proxy\]/);
    assert.match(loonText, /\[Script\]/);
    const qxText = fs.readFileSync(byPlatform.get('quantumultx').configPath, 'utf8');
    assert.match(qxText, /\[server_local\]/);
    assert.match(qxText, /\[mitm\]/);
  });
});

test('journey: surge CLI generate -> validator CLI accepts the output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-tuner-e2e-cli-'));
  const configPath = path.join(dir, 'surge.conf');

  execFileSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts/surge-config-generator.js'),
    '--addresses', JSON.stringify(['trojan://secret@hk.example.com:443?sni=hk.example.com#香港-HK-01']),
    '--services', 'Telegram,GitHub',
    '--adblock',
    '--output', configPath
  ], { cwd: REPO_ROOT });
  assert.ok(fs.existsSync(configPath));

  // validator 退出码必须为 0（execFileSync 在非零退出时抛错）
  const out = execFileSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts/surge-config-validator.js'), configPath
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.match(out, /ok/);
});

test('journey: doctor --offline exits 0 for a valid checkout', () => {
  const out = execFileSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts/doctor.js'), '--offline'
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.match(out, /项目完整性/);
  assert.match(out, /0 项失败/);
});
