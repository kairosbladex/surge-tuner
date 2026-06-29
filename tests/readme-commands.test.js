'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');
const FIXTURE_SAMPLE = path.join(REPO_ROOT, 'tests/fixtures/sample-subscription.txt');

// ── helpers ──────────────────────────────────

/** Poll a health endpoint until it responds 200 or timeout. */
async function waitForHealth(url, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* server not ready yet */ }
    if (Date.now() >= deadline) {
      throw new Error(`Health check at ${url} did not respond within ${timeoutMs}ms`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

/** Spawn a server process, wait for it to be healthy, run fn, then kill. */
async function withSpawnedServer(command, args, port, fn) {
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test' },
  });
  const stderrChunks = [];
  child.stderr.on('data', (d) => stderrChunks.push(d));

  try {
    await waitForHealth(`http://127.0.0.1:${port}/api/health`);
    await fn(port);
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(), 2000);
      child.on('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}

/** Create a temp output dir that is cleaned up. */
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `proxy-tuner-${prefix}-`));
  return dir;
}

// ══════════════════════════════════════════════
// README: 零依赖快速开始 — Mac/Linux 路径
// ══════════════════════════════════════════════

test('README [Mac/Linux]: ./quick-start.sh --check-only 验证 Node 版本', () => {
  const out = execFileSync('bash', ['quick-start.sh', '--check-only'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /Node v\d+\.\d+\.\d+ OK/);
  assert.match(out, /No npm install is required/);
});

test('README [Windows]: node scripts/quick-start-server.js --check-only 验证 Node 版本', () => {
  // TDD: quick-start-server.js 尚不支持 --check-only，此测试预期先失败
  const out = execFileSync('node', ['scripts/quick-start-server.js', '--check-only'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /Node v\d+\.\d+\.\d+ OK/);
  assert.match(out, /No npm install is required/);
});

test('README [Mac/Linux]: ./quick-start.sh 启动服务器并响应 health 端点', async () => {
  await withSpawnedServer('bash', ['quick-start.sh', '--port', '18788', '--no-open'], 18788, async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.ok(body.node, '应返回 Node 版本');
    assert.equal(body.platforms.surge, 'Surge');
  });
});

test('README [Windows]: npm run quick-start 启动服务器并响应 health 端点', async () => {
  // npm run quick-start 等价于 node scripts/quick-start-server.js
  await withSpawnedServer('node', ['scripts/quick-start-server.js', '--port', '18789', '--no-open'], 18789, async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.ok(body.node, '应返回 Node 版本');
  });
});

// ══════════════════════════════════════════════
// README: 命令行生成 — 所有平台
// ══════════════════════════════════════════════

const GENERATORS = [
  ['surge', 'surge-config-generator.js', 'conf'],
  ['loon', 'loon-config-generator.js', 'conf'],
  ['qx', 'quantumultx-config-generator.js', 'conf'],
  ['clash', 'clash-config-generator.js', 'yaml'],
];

for (const [label, script, ext] of GENERATORS) {
  test(`README: npm run generate:${label} 使用 ./ 路径生成配置文件`, () => {
    const tmpDir = tempDir(label);
    const outPath = path.join(tmpDir, `${label}.${ext}`);
    try {
      execFileSync('node', [
        path.join('scripts', script),
        '--addresses', FIXTURE_SAMPLE,
        '--preset', 'common',
        '--output', outPath,
      ], { cwd: REPO_ROOT, encoding: 'utf8' });
      assert.ok(fs.existsSync(outPath), `${outPath} 应存在`);
      const stat = fs.statSync(outPath);
      assert.ok(stat.size > 0, `生成的 ${label} 配置文件不应为空`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
}

// ══════════════════════════════════════════════
// README: 测试工具是否能跑 — smoke 命令
// ══════════════════════════════════════════════

test('README: smoke 测试命令使用 ./ 路径正常工作', () => {
  const tmpDir = tempDir('smoke');
  const outPath = path.join(tmpDir, 'surge-tuner-readme-smoke.conf');
  try {
    execFileSync('node', ['scripts/surge-config-generator.js',
      '--addresses', FIXTURE_SAMPLE,
      '--preset', 'common',
      '--adblock',
      '--output', outPath,
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.ok(fs.existsSync(outPath));

    const valOut = execFileSync('node', ['scripts/surge-config-validator.js', outPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.match(valOut, /ok/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ══════════════════════════════════════════════
// README: 一致性检查 — 文档中的命令可执行
// ══════════════════════════════════════════════

test('README: 所有引用的脚本文件真实存在', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  const scripts = [...readme.matchAll(/node scripts\/([\w.-]+)/g)].map((m) => m[1]);
  for (const s of [...new Set(scripts)]) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, 'scripts', s)),
      `scripts/${s} 应在 README 中被引用且真实存在`);
  }
});

test('README: 命令行示例的 --output 路径使用 ./ 而非 /tmp/', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  const cliSection = readme.split('## 给懂技术的人')[1];
  if (cliSection) {
    assert.doesNotMatch(cliSection, /--output \/tmp\//,
      'CLI 示例不应引用 /tmp/ 路径');
  }
});

test('README: 零依赖快速开始同时列出了 Mac/Linux 和 Windows 路径', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  const quickStartSection = readme.split('## 零依赖快速开始')[1].split('##')[0];

  assert.match(quickStartSection, /\*\*Mac \/ Linux\*\*/, '应有 Mac/Linux 小节');
  assert.match(quickStartSection, /\.\/quick-start\.sh/, '应有 bash 脚本路径');
  assert.match(quickStartSection, /\*\*Windows\*\*/, '应有 Windows 小节');
  assert.match(quickStartSection, /npm run quick-start/, '应有 npm 命令路径');
});

test('README: 电脑小白第二步同时列出了两种启动方式', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  const step2Section = readme.split('### 第二步：启动生成页面')[1].split('###')[0];

  assert.match(step2Section, /\*\*Mac \/ Linux\*\*/, '第二步应有 Mac/Linux 说明');
  assert.match(step2Section, /\.\/quick-start\.sh/, '第二步应有 bash 路径');
  assert.match(step2Section, /\*\*Windows\*\*/, '第二步应有 Windows 说明');
  assert.match(step2Section, /npm run quick-start/, '第二步应有 npm 路径');
});

test('README: 常见问题中页面打不开给出了两种平台的命令', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  assert.match(readme, /Mac\/Linux 运行.*quick-start\.sh.*Windows 运行.*npm run quick-start/);
});
