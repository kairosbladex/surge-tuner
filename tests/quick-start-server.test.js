'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createQuickStartServer,
  normalizePayload,
  buildCommandPreview
} = require('../scripts/quick-start-server');

async function withServer(options, fn) {
  const server = createQuickStartServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    error.message = `${error.message}\nBody:\n${text}`;
    throw error;
  }
}

test('quick-start.sh check-only validates Node without installing dependencies', () => {
  const output = execFileSync('bash', ['quick-start.sh', '--check-only'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  });
  assert.match(output, /Node v\d+\.\d+\.\d+ OK/);
  assert.match(output, /No npm install is required/);
});

test('quick-start page and health endpoint are served locally', async () => {
  await withServer({}, async (baseUrl) => {
    const page = await fetch(baseUrl);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Proxy Tuner Quick Start/);
    assert.match(html, /不需要 npm install/);

    const health = await fetch(`${baseUrl}/api/health`);
    const body = await readJson(health);
    assert.equal(health.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.platforms.surge, 'Surge');
  });
});

test('quick-start API generates config and adblock sidecar from multiline addresses', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-tuner-quick-start-'));
  await withServer({ outputDir }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: 'surge',
        addresses: [
          'trojan://secret@hk.example.com:443?sni=hk.example.com#香港-HK-01',
          'trojan://secret@us.example.com:443?sni=us.example.com#美国-US-01'
        ].join('\n'),
        common: true,
        adBlock: true,
        discoverRules: false
      })
    });
    const body = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.result.results.length, 1);
    const r = body.result.results[0];
    assert.equal(r.platform, 'surge');
    assert.ok(r.configPath.startsWith(outputDir));
    assert.ok(fs.existsSync(r.configPath));
    assert.ok(fs.existsSync(r.sidecarPath));
    assert.deepEqual(r.importSteps.length, 3);
    assert.ok(body.result.sessionDir.startsWith(outputDir));
    assert.match(fs.readFileSync(r.configPath, 'utf8'), /GitHub = select/);
    assert.match(r.command, /npm run generate:surge --/);
  });
});

test('quick-start API returns actionable errors for missing addresses', async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ platform: 'surge', addresses: '' })
    });
    const body = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.match(body.error, /至少需要一个 VPN 代理地址/);
  });
});

test('quick-start command preview maps supported platforms to existing npm scripts', () => {
  const samples = [
    ['surge', 'generate:surge'],
    ['loon', 'generate:loon'],
    ['quantumultx', 'generate:qx'],
    ['qx', 'generate:qx'],
    ['clash', 'generate:clash'],
    ['stash', 'generate:clash']
  ];

  for (const [platform, npmScript] of samples) {
    const input = normalizePayload({
      platforms: [platform],
      addresses: ['trojan://secret@example.com:443?sni=example.com#US-01'],
      common: true,
      adBlock: false
    });
    const perInput = { ...input, platform: input.platforms[0] };
    const command = buildCommandPreview(perInput, `/tmp/${perInput.platform}.conf`);
    assert.match(command, new RegExp(`npm run ${npmScript} --`));
  }
});

test('quick-start unified mode generates single .conf with MITM and no sidecar', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-tuner-quick-start-unified-'));
  await withServer({ outputDir }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platforms: ['surge'],
        addresses: 'https://example.com/sub?token=unified-test',
        unified: true,
        common: true,
        adBlock: true,
        discoverRules: false
      })
    });
    const body = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.result.results.length, 1);
    const r = body.result.results[0];
    assert.ok(r.configPath.startsWith(outputDir));
    assert.ok(fs.existsSync(r.configPath));

    const configText = fs.readFileSync(r.configPath, 'utf8');
    assert.match(configText, /\[MITM\]/);
    assert.match(configText, /policy-path=https:\/\/example\.com\/sub\?token=unified-test/);
    assert.equal(r.sidecarPath, null);
    assert.match(r.command, /--unified/);
  });
});

test('quick-start multi-platform generates all selected platforms in one timestamped folder', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-tuner-multi-'));
  await withServer({ outputDir }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platforms: ['surge', 'loon', 'clash'],
        addresses: 'https://example.com/sub?token=multi',
        unified: true,
        common: true,
        adBlock: true,
        discoverRules: false
      })
    });
    const body = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.result.results.length, 3);
    // 时间文件夹格式 YYYYMMDD-HHMMSS
    assert.match(body.result.timestamp, /^\d{8}-\d{6}$/);
    // 所有平台输出在同一个文件夹
    const dirs = new Set(body.result.results.map((r) => require('path').dirname(r.configPath)));
    assert.equal(dirs.size, 1, '所有平台应输出到同一个时间文件夹');
    // 每个平台都有配置文件
    for (const r of body.result.results) {
      assert.ok(fs.existsSync(r.configPath), `${r.platform} 配置应存在`);
      assert.equal(r.sidecarPath, null, `${r.platform} 一体化模式不应有 sidecar`);
    }
  });
});

test('quick-start page includes unified mode checkbox and multi-platform selection', async () => {
  await withServer({}, async (baseUrl) => {
    const page = await fetch(baseUrl);
    const html = await page.text();
    assert.match(html, /一体化|unified/i);
    // 平台选择改成 checkbox 多选
    assert.match(html, /type="checkbox" name="platform"/);
  });
});

test('README starts with zero-dependency user quick start', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const top = readme.split('\n').slice(0, 70).join('\n');
  assert.match(top, /零依赖快速开始/);
  assert.match(top, /git clone/);
  assert.match(top, /Node >= 20/);
  assert.match(top, /\.\/quick-start\.sh/);
  assert.doesNotMatch(top, /npm install/);
});
