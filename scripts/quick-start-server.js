#!/usr/bin/env node
'use strict';

/**
 * quick-start-server.js — Zero-dependency local UI for first-run config generation.
 *
 * Uses only Node built-ins and delegates generation to the existing platform CLIs.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const { REPO_ROOT } = require('./platform-base');
const { renderPage } = require('./quick-start-page');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8788;
const MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, 'configs/generated/quick-start');

const PLATFORM_CONFIG = {
  surge: {
    label: 'Surge',
    npmScript: 'generate:surge',
    script: 'surge-config-generator.js',
    extension: 'conf',
    sidecarName: 'proxy-tuner-adblock.sgmodule',
    importSteps: [
      '在 Surge 中导入主配置文件。',
      '在 Surge 模块中导入同目录的 .sgmodule 文件。',
      '开启 MITM，并在系统设置中信任 Surge CA。'
    ]
  },
  loon: {
    label: 'Loon',
    npmScript: 'generate:loon',
    script: 'loon-config-generator.js',
    extension: 'conf',
    sidecarName: 'proxy-tuner-loon-adblock.conf',
    importSteps: [
      '在 Loon 中导入主配置文件。',
      '将生成的去广告片段导入插件或合并到配置。',
      '如需 kelee.one 插件，运行 bash kelee/fetch-plugins.sh 查看推荐项。'
    ]
  },
  quantumultx: {
    label: 'Quantumult X',
    npmScript: 'generate:qx',
    script: 'quantumultx-config-generator.js',
    extension: 'conf',
    sidecarName: 'proxy-tuner-qx-adblock.conf',
    importSteps: [
      '在 Quantumult X 中导入主配置文件。',
      '将生成片段合并到 rewrite、filter 和 MITM 对应区段。',
      '开启 MITM，并在系统设置中信任证书。'
    ]
  },
  clash: {
    label: 'Clash/Stash',
    npmScript: 'generate:clash',
    script: 'clash-config-generator.js',
    extension: 'yaml',
    sidecarName: 'proxy-tuner-clash-adblock.yaml',
    importSteps: [
      '在 Clash 或 Stash 中导入主 YAML 文件。',
      '如需去广告，将生成的 rule-provider 片段合并到 YAML。',
      'Clash 不执行 MITM 脚本，只使用规则层拦截。'
    ]
  }
};

function createQuickStartServer(options = {}) {
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `${DEFAULT_HOST}:${DEFAULT_PORT}`}`);

      if (req.method === 'GET' && url.pathname === '/') {
        return sendHtml(res, renderPage());
      }

      if (req.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(res, 200, {
          ok: true,
          node: process.versions.node,
          platforms: Object.fromEntries(Object.entries(PLATFORM_CONFIG).map(([key, value]) => [key, value.label]))
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/generate') {
        const payload = await readJsonBody(req);
        const result = await generateFromPayload(payload, { outputDir });
        return sendJson(res, 200, { ok: true, result });
      }

      return sendJson(res, 404, { ok: false, error: 'Route not found.' });
    } catch (error) {
      return sendJson(res, error.statusCode || 500, {
        ok: false,
        error: error.message
      });
    }
  });
}

async function generateFromPayload(payload, options = {}) {
  const input = normalizePayload(payload);
  const now = options.now || new Date();
  const timestampDir = formatTimestamp(now);
  // 时间文件夹：YYYYMMDD-HHMMSS，所有勾选平台放同一个文件夹
  const sessionDir = path.join(path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR), timestampDir);
  fs.mkdirSync(sessionDir, { recursive: true });

  const platforms = input.platforms;
  const results = [];
  for (const platform of platforms) {
    const cfg = PLATFORM_CONFIG[platform];
    const outputPath = path.join(sessionDir, `${platform}.${cfg.extension}`);
    const perInput = { ...input, platform };
    const args = buildGeneratorArgs(perInput, outputPath);
    const command = buildCommandPreview(perInput, outputPath);
    // eslint-disable-next-line no-await-in-loop
    const run = await runNodeScript(path.join(REPO_ROOT, 'scripts', cfg.script), args);
    const sidecarPath = (!input.unified && input.adBlock) ? expectedSidecarPath(outputPath, cfg.sidecarName) : null;

    const importSteps = input.unified
      ? [
          `在 ${cfg.label} 中导入主配置文件。`,
          ...(input.adBlock ? [`在 ${cfg.label} 中配置 MITM 证书并在系统设置中信任（去广告已合并）。`] : []),
          '订阅通过平台原生引用自动拉取，无需手动导入节点。'
        ]
      : cfg.importSteps;

    results.push({
      platform,
      platformLabel: cfg.label,
      configPath: outputPath,
      sidecarPath: sidecarPath && fs.existsSync(sidecarPath) ? sidecarPath : null,
      command,
      importSteps,
      stdout: run.stdout.trim(),
      stderr: run.stderr.trim()
    });
  }

  return {
    sessionDir,
    timestamp: timestampDir,
    results
  };
}

function normalizePayload(payload = {}) {
  // 支持多平台：platforms 数组优先，回退到单个 platform
  let platforms;
  if (Array.isArray(payload.platforms) && payload.platforms.length > 0) {
    platforms = payload.platforms.map(normalizePlatform).filter((p) => PLATFORM_CONFIG[p]);
    if (platforms.length === 0) {
      const error = new Error('未选择任何支持的平台');
      error.statusCode = 400;
      throw error;
    }
  } else {
    const platform = normalizePlatform(payload.platform || 'surge');
    if (!PLATFORM_CONFIG[platform]) {
      const error = new Error(`不支持的目标平台: ${payload.platform || ''}`);
      error.statusCode = 400;
      throw error;
    }
    platforms = [platform];
  }

  const addresses = parseAddresses(payload.addresses ?? payload.address ?? '');
  if (addresses.length === 0) {
    const error = new Error('至少需要一个 VPN 代理地址');
    error.statusCode = 400;
    throw error;
  }

  return {
    platforms,
    addresses,
    common: payload.common !== false,
    adBlock: payload.adBlock !== false,
    discoverRules: Boolean(payload.discoverRules),
    unified: Boolean(payload.unified)
  };
}

function formatTimestamp(now) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function parseAddresses(value) {
  const source = Array.isArray(value) ? value : String(value).split(/\r?\n/);
  return source
    .map((line) => String(line || '').trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith(';'));
}

function normalizePlatform(platform) {
  const value = String(platform || '').toLowerCase();
  if (value === 'qx') return 'quantumultx';
  if (value === 'stash') return 'clash';
  return value;
}

function buildGeneratorArgs(input, outputPath) {
  // 一体化模式：所有平台都用 --unified --subscription name|url，不走 --addresses 本地解析
  if (input.unified) {
    const args = ['--unified', '--output', outputPath];
    input.addresses.forEach((url, index) => {
      const name = `机场${index + 1}`;
      args.push('--subscription', `${name}|${url}`);
    });
    if (input.common) args.push('--preset', 'common');
    if (input.adBlock) args.push('--adblock');
    if (input.discoverRules) args.push('--discover-rules');
    return args;
  }

  const args = [
    '--addresses', JSON.stringify(input.addresses),
    '--output', outputPath
  ];
  if (input.common) args.push('--preset', 'common');
  if (input.adBlock) args.push('--adblock');
  if (input.discoverRules) args.push('--discover-rules');
  return args;
}

function buildCommandPreview(input, outputPath) {
  const platform = PLATFORM_CONFIG[input.platform];
  const parts = ['npm', 'run', platform.npmScript, '--'];

  if (input.unified) {
    parts.push('--unified');
    parts.push('--output', shellQuote(outputPath));
    input.addresses.forEach((url, index) => {
      const name = `机场${index + 1}`;
      parts.push('--subscription', shellQuote(`${name}|${url}`));
    });
  } else {
    parts.push('--addresses', shellQuote(JSON.stringify(input.addresses)));
    parts.push('--output', shellQuote(outputPath));
  }

  if (input.common) parts.push('--preset', 'common');
  if (input.adBlock) parts.push('--adblock');
  if (input.discoverRules) parts.push('--discover-rules');
  return parts.join(' ');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function expectedSidecarPath(outputPath, sidecarName) {
  const dir = path.dirname(outputPath);
  const base = path.basename(outputPath, path.extname(outputPath));
  return path.join(dir, `${base}.${sidecarName}`);
}

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: REPO_ROOT,
      env: process.env
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      const message = (stderr || stdout || `Generator exited with code ${code}`).trim();
      const error = new Error(message);
      error.statusCode = 400;
      reject(error);
    });
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error('Request body is too large.');
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        error.statusCode = 400;
        reject(error);
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendHtml(res, html) {
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(html);
}

async function startQuickStartServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const requestedPort = Number(options.port || DEFAULT_PORT);
  const maxAttempts = Number(options.maxAttempts || 50);

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = requestedPort + offset;
    const server = createQuickStartServer(options);
    try {
      await listen(server, host, port);
      return { server, host, port, url: `http://${host}:${port}` };
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }

  throw new Error(`No available port found from ${requestedPort} to ${requestedPort + maxAttempts - 1}.`);
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.unref();
    return true;
  } catch (_) {
    return false;
  }
}

function parseArgs(argv) {
  const args = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    open: true,
    outputDir: DEFAULT_OUTPUT_DIR
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--host') args.host = argv[++i];
    else if (arg === '--port') args.port = Number(argv[++i]);
    else if (arg === '--output-dir') args.outputDir = argv[++i];
    else if (arg === '--no-open') args.open = false;
    else if (arg === '--open') args.open = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/quick-start-server.js [--port 8788] [--no-open] [--output-dir configs/generated/quick-start]',
    '',
    'Starts a zero-dependency local UI at 127.0.0.1 for first-run config generation.'
  ].join('\n');
}

async function main() {
  const rawArgv = process.argv.slice(2);
  if (rawArgv.includes('--check-only')) {
    process.stdout.write(`Node ${process.version} OK. No npm install is required.\n`);
    process.exit(0);
  }
  const args = parseArgs(rawArgv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const started = await startQuickStartServer(args);
  process.stdout.write(`Proxy Tuner Quick Start is running at ${started.url}\n`);
  process.stdout.write(`Output directory: ${path.resolve(args.outputDir || DEFAULT_OUTPUT_DIR)}\n`);
  process.stdout.write('Press Ctrl+C to stop.\n');
  if (args.open) {
    const opened = openBrowser(started.url);
    if (!opened) process.stdout.write(`Open this URL manually: ${started.url}\n`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_OUTPUT_DIR,
  PLATFORM_CONFIG,
  createQuickStartServer,
  startQuickStartServer,
  generateFromPayload,
  normalizePayload,
  parseAddresses,
  buildGeneratorArgs,
  buildCommandPreview,
  formatTimestamp,
  expectedSidecarPath,
  parseArgs
};
