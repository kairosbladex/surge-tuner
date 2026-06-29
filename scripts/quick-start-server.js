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

function renderPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Proxy Tuner Quick Start</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f4f6f9;
      --panel: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --accent: #2563eb;
      --accent-dark: #1d4ed8;
      --accent-soft: #eff6ff;
      --ok: #059669;
      --ok-soft: #ecfdf5;
      --error: #dc2626;
      --error-soft: #fef2f2;
      --code: #1e293b;
      --shadow: 0 1px 3px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.05);
      --shadow-lg: 0 10px 25px rgba(15, 23, 42, 0.1);
      --radius: 14px;
      --radius-sm: 10px;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a;
        --panel: #1e293b;
        --text: #f8fafc;
        --muted: #94a3b8;
        --border: #334155;
        --accent: #3b82f6;
        --accent-dark: #60a5fa;
        --accent-soft: #172554;
        --ok: #34d399;
        --ok-soft: #064e3b;
        --error: #f87171;
        --error-soft: #450a0a;
        --code: #e2e8f0;
        --shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2);
        --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.35);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    header {
      padding: 40px clamp(16px, 5vw, 64px) 32px;
      background: linear-gradient(135deg, var(--accent) 0%, #1e40af 100%);
      color: #fff;
      position: relative;
      overflow: hidden;
    }
    header::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 80% 20%, rgba(255,255,255,0.18) 0%, transparent 35%),
                  radial-gradient(circle at 20% 90%, rgba(255,255,255,0.12) 0%, transparent 30%);
      pointer-events: none;
    }
    header .wrap { position: relative; max-width: 1120px; margin: 0 auto; }
    .logo {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 18px;
    }
    .logo-icon {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: rgba(255,255,255,0.2);
      backdrop-filter: blur(4px);
      display: grid;
      place-items: center;
      font-size: 20px;
    }
    h1 { margin: 0; font-size: clamp(28px, 5vw, 44px); font-weight: 800; letter-spacing: -0.02em; }
    header p { margin: 10px 0 0; color: rgba(255,255,255,0.88); font-size: clamp(15px, 2vw, 18px); max-width: 720px; }
    header .hint {
      margin-top: 14px;
      color: rgba(255,255,255,0.72);
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: rgba(0,0,0,0.15);
      border-radius: 999px;
    }
    main {
      max-width: 1120px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
      gap: 24px;
      padding: 28px clamp(16px, 5vw, 64px) 48px;
      align-items: start;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      box-shadow: var(--shadow);
    }
    h2 { margin: 0 0 20px; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    h2 .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
    }
    .field { margin-bottom: 18px; }
    label.field-label { display: block; font-weight: 600; margin-bottom: 8px; font-size: 14px; }
    .field-hint {
      font-size: 12px;
      color: var(--muted);
      margin-top: -4px;
      margin-bottom: 8px;
    }
    textarea {
      width: 100%;
      min-height: 200px;
      resize: vertical;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 14px;
      font: 14px/1.6 ui-monospace, SFMono-Regular, Menlo, "Cascadia Mono", monospace;
      color: var(--code);
      background: var(--panel);
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
    .platforms {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin: 10px 0 6px;
    }
    .platforms input { position: absolute; opacity: 0; pointer-events: none; }
    .platforms .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 76px;
      border: 1.5px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text);
      cursor: pointer;
      text-align: center;
      padding: 10px;
      font-weight: 650;
      background: var(--panel);
      transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s, background 0.12s;
    }
    .platforms .tile:hover { transform: translateY(-1px); border-color: var(--accent); }
    .platforms input:checked + .tile {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent-dark);
      box-shadow: 0 0 0 1px var(--accent);
    }
    .platforms .tile .badge {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .platforms input:checked + .tile .badge { color: var(--accent-dark); opacity: 0.8; }
    .checks {
      display: grid;
      gap: 12px;
      margin: 18px 0 22px;
    }
    .checks label {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin: 0;
      font-weight: 500;
      color: var(--text);
      cursor: pointer;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--panel);
      transition: background 0.12s, border-color 0.12s;
    }
    .checks label:hover { border-color: var(--accent); background: var(--accent-soft); }
    .checks input {
      width: 18px;
      height: 18px;
      margin-top: 2px;
      accent-color: var(--accent);
      flex-shrink: 0;
    }
    .check-text { display: grid; gap: 2px; }
    .check-title { font-weight: 600; }
    .check-desc { font-size: 12px; color: var(--muted); font-weight: 400; line-height: 1.5; }
    button {
      width: 100%;
      min-height: 50px;
      border: 0;
      border-radius: var(--radius-sm);
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
      color: #fff;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: var(--shadow);
      transition: transform 0.12s, box-shadow 0.12s, filter 0.12s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: var(--shadow-lg); filter: brightness(1.05); }
    button:active:not(:disabled) { transform: translateY(0); }
    button:disabled { opacity: 0.72; cursor: wait; }
    .spinner {
      width: 18px;
      height: 18px;
      border: 2.5px solid rgba(255,255,255,0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      display: none;
    }
    button:disabled .spinner { display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .result { min-height: 280px; display: grid; gap: 14px; align-content: start; }
    .status {
      padding: 14px 16px;
      border-radius: var(--radius-sm);
      background: var(--accent-soft);
      color: var(--accent-dark);
      border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
      white-space: pre-wrap;
      font-size: 14px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .status.ok { background: var(--ok-soft); color: var(--ok); border-color: color-mix(in srgb, var(--ok) 20%, transparent); }
    .status.error { background: var(--error-soft); color: var(--error); border-color: color-mix(in srgb, var(--error) 20%, transparent); }
    .status-icon { flex-shrink: 0; margin-top: 2px; }

    .result-group {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      overflow: hidden;
      background: var(--panel);
    }
    .result-group + .result-group { margin-top: 4px; }
    .result-header {
      padding: 14px 16px;
      background: color-mix(in srgb, var(--accent-soft) 60%, var(--panel));
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .result-body { padding: 16px; display: grid; gap: 16px; }
    .result-section h3 {
      margin: 0 0 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      font-weight: 700;
    }
    .path-list { display: grid; gap: 8px; }
    .path-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 10px 12px;
      background: color-mix(in srgb, var(--bg) 70%, var(--panel));
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .path-label { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .path-value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: var(--code); overflow-wrap: anywhere; }
    ol.steps {
      margin: 0;
      padding-left: 22px;
      color: var(--text);
      line-height: 1.8;
      font-size: 14px;
    }
    ol.steps li::marker { color: var(--accent); font-weight: 700; }
    .code-block { position: relative; }
    pre {
      margin: 0;
      padding: 14px;
      background: #0f172a;
      color: #e2e8f0;
      border-radius: 10px;
      overflow: auto;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .copy-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.08);
      color: #e2e8f0;
      font-size: 12px;
      padding: 5px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .copy-btn:hover { background: rgba(255,255,255,0.18); }
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--muted);
    }
    .empty-state svg { opacity: 0.4; margin-bottom: 12px; }

    .stepper {
      display: flex;
      gap: 6px;
      margin-bottom: 22px;
      flex-wrap: wrap;
    }
    .step-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent-soft) 70%, var(--panel));
      border: 1px solid var(--border);
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
    }
    .step-pill .num {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 12px;
      font-weight: 700;
    }
    .step-pill.active { color: var(--accent-dark); border-color: var(--accent); }

    .help-callout {
      display: flex;
      gap: 10px;
      padding: 12px 14px;
      background: color-mix(in srgb, var(--accent-soft) 60%, var(--panel));
      border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
      border-radius: var(--radius-sm);
      font-size: 13px;
      line-height: 1.6;
      color: var(--text);
      margin-top: 8px;
    }
    .help-callout .icon { flex-shrink: 0; }
    .help-callout strong { color: var(--accent-dark); }

    .sample-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .sample-btn {
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);
      font-size: 12px;
      padding: 5px 10px;
      border-radius: 999px;
      cursor: pointer;
      transition: border-color 0.12s, background 0.12s;
    }
    .sample-btn:hover { border-color: var(--accent); background: var(--accent-soft); }

    .faq {
      max-width: 1120px;
      margin: 0 auto;
      padding: 0 clamp(16px, 5vw, 64px) 32px;
    }
    .faq-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .faq-title {
      padding: 18px 24px;
      font-size: 16px;
      font-weight: 700;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .faq-item { border-bottom: 1px solid var(--border); }
    .faq-item:last-child { border-bottom: 0; }
    .faq-q {
      width: 100%;
      text-align: left;
      padding: 14px 24px;
      background: transparent;
      border: 0;
      color: var(--text);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      box-shadow: none;
      border-radius: 0;
      min-height: 0;
    }
    .faq-q:hover { background: var(--accent-soft); filter: none; transform: none; }
    .faq-q .chevron { transition: transform 0.18s; color: var(--muted); }
    .faq-item.open .faq-q .chevron { transform: rotate(180deg); }
    .faq-a {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.22s ease-out;
      padding: 0 24px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.7;
    }
    .faq-item.open .faq-a { max-height: 320px; padding-bottom: 16px; padding-top: 0; }
    .faq-a code { background: var(--bg); padding: 2px 6px; border-radius: 4px; font-size: 13px; }

    .step-detail {
      margin-top: 8px;
      padding: 10px 12px;
      background: var(--bg);
      border-radius: 8px;
      border: 1px solid var(--border);
      font-size: 13px;
      line-height: 1.6;
      color: var(--muted);
      display: none;
}
    .step-detail.open { display: block; }
    .step-detail-toggle {
      background: transparent;
      border: 0;
      color: var(--accent);
      font-size: 12px;
      cursor: pointer;
      padding: 4px 0;
      margin-top: 4px;
      box-shadow: none;
      min-height: 0;
      border-radius: 0;
      display: inline-flex;
    }
    .step-detail-toggle:hover { filter: none; transform: none; text-decoration: underline; }

    footer {
      max-width: 1120px;
      margin: 0 auto;
      padding: 0 clamp(16px, 5vw, 64px) 40px;
      color: var(--muted);
      font-size: 12px;
      text-align: center;
    }
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      .platforms { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .stepper { font-size: 12px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <div class="logo">
        <div class="logo-icon">🚀</div>
        <span>Proxy Tuner</span>
      </div>
      <h1>Proxy Tuner Quick Start</h1>
      <p>粘贴一个或多个 VPN 地址，本机生成 Surge、Loon、Quantumult X 或 Clash 配置。零依赖，不需要 npm install。</p>
      <p class="hint"><span>🔒</span> 地址只发送到本机 127.0.0.1 服务用于生成配置，不会被保存为输入文件。</p>
    </div>
  </header>
  <main>
    <section class="card">
      <h2><span class="dot"></span>生成配置</h2>
      <div class="stepper" aria-hidden="true">
        <span class="step-pill active"><span class="num">1</span>粘贴地址</span>
        <span class="step-pill"><span class="num">2</span>选平台</span>
        <span class="step-pill"><span class="num">3</span>选选项</span>
        <span class="step-pill"><span class="num">4</span>生成并导入</span>
      </div>
      <form id="form">
        <div class="field">
          <label class="field-label" for="addresses">① VPN 地址，每行一个</label>
          <p class="field-hint">支持 Trojan、VMess、Shadowsocks 等节点 URI 或机场订阅链接。不知道格式？点击下方示例快速填充。</p>
          <textarea id="addresses" name="addresses" spellcheck="false" placeholder="trojan://secret@hk.example.com:443?sni=hk.example.com#HK-01&#10;trojan://secret@us.example.com:443?sni=us.example.com#US-01"></textarea>
          <div class="sample-row">
            <button type="button" class="sample-btn" data-sample="trojan">填充 Trojan 示例</button>
            <button type="button" class="sample-btn" data-sample="subscription">填充订阅链接示例</button>
            <button type="button" class="sample-btn" data-sample="clear">清空</button>
          </div>
          <div class="help-callout">
            <span class="icon">💡</span>
            <span><strong>地址从哪来？</strong> 你的机场（VPN 服务商）后台通常会提供：① 节点列表里复制单条 <code>trojan://</code> / <code>ss://</code> 链接；② 或「订阅链接」一整条 URL，形如 <code>https://xxx.com/sub?token=...</code>。两者都可直接粘贴到上方文本框。</span>
          </div>
        </div>
        <div class="field">
          <label class="field-label">② 目标平台（可多选，不确定就只勾 Surge）</label>
          <div class="platforms" aria-label="选择平台（可多选）">
            <label><input type="checkbox" name="platform" value="surge" checked><span class="tile"><span class="badge">iOS / macOS</span>Surge</span></label>
            <label><input type="checkbox" name="platform" value="loon"><span class="tile"><span class="badge">iOS</span>Loon</span></label>
            <label><input type="checkbox" name="platform" value="quantumultx"><span class="tile"><span class="badge">iOS</span>QX</span></label>
            <label><input type="checkbox" name="platform" value="clash"><span class="tile"><span class="badge">全平台</span>Clash</span></label>
          </div>
          <div class="help-callout">
            <span class="icon">📱</span>
            <span><strong>怎么选？</strong> iPhone/iPad 用 <strong>Surge</strong>（功能最全，需付费）；<strong>Loon</strong>、<strong>Quantumult X</strong> 是同类替代；<strong>Clash</strong> 全平台通吃（iOS 用 Stash，安卓/Win/Mac 用 Clash 系列）。只选你设备上已安装的那一个。</span>
          </div>
        </div>
        <div class="checks">
          <label>
            <input type="checkbox" id="common" checked>
            <span class="check-text">
              <span class="check-title">生成常用应用路由</span>
              <span class="check-desc">为流媒体、AI、社媒等常用服务自动分配策略组。建议保持开启。</span>
            </span>
          </label>
          <label>
            <input type="checkbox" id="adBlock" checked>
            <span class="check-text">
              <span class="check-title">同时生成去广告配置</span>
              <span class="check-desc">输出 MITM 与脚本/规则片段，按需合并到主配置。需要额外安装 MITM 证书才能生效。</span>
            </span>
          </label>
          <label>
            <input type="checkbox" id="unified">
            <span class="check-text">
              <span class="check-title">一体化模式（unified）</span>
              <span class="check-desc">主配置 + 去广告合并到一个文件，订阅用各平台原生引用，不本地解析节点。新手推荐勾选，省去手动合并步骤。</span>
            </span>
          </label>
          <label>
            <input type="checkbox" id="discoverRules">
            <span class="check-text">
              <span class="check-title">缺失服务时检索 GitHub 规则</span>
              <span class="check-desc">遇到本地规则表里没有的服务时，自动从社区规则库检索。可选项，网络慢时可不勾。</span>
            </span>
          </label>
        </div>
        <button id="submit" type="submit"><span class="spinner"></span><span class="btn-text">③ 生成配置</span></button>
      </form>
    </section>
    <section class="card result" aria-live="polite">
      <h2><span class="dot"></span>④ 结果与导入</h2>
      <div id="status" class="status"><span class="status-icon">⏳</span>等待输入。生成文件会写入 configs/generated/quick-start/，该目录不会进入 Git。</div>
      <div id="details">
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z"/></svg>
          <div>填写左侧信息并点击「生成配置」，结果将显示在这里。</div>
        </div>
      </div>
    </section>
  </main>
  <section class="faq">
    <div class="faq-card">
      <div class="faq-title">❓ 新手常见问题</div>
      <div class="faq-item">
        <button class="faq-q" type="button">VPN 地址是什么？我从哪里能拿到？<span class="chevron">▾</span></button>
        <div class="faq-a">VPN 地址是描述你的代理节点的链接，或一整条订阅 URL。通常来自你购买的「机场」（代理服务商）后台：① 在节点列表里复制单条 <code>trojan://</code>、<code>ss://</code>、<code>vmess://</code> 链接；② 或复制「订阅地址」，形如 <code>https://xxx.com/sub?token=...</code>。每行粘贴一个到上方文本框即可。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">应该选哪个平台？<span class="chevron">▾</span></button>
        <div class="faq-a">看你的设备上装了哪个 App：iPhone 上最常用的是 <strong>Surge</strong>（需付费，功能最全）；<strong>Loon</strong> 和 <strong>Quantumult X</strong> 是同类替代；安卓 / Windows / Mac 桌面端通常用 <strong>Clash</strong> 系列（iOS 用 Stash）。只勾选你已安装的客户端即可。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">生成后怎么导入到 App？<span class="chevron">▾</span></button>
        <div class="faq-a">生成完成后，右侧结果区会列出每个平台的「导入步骤」。简单说：① 把主配置文件传到手机（AirDrop / iCloud / 文件 App）；② 在 Surge/Loon 等 App 里选择「从文件导入」；③ 如果启用了去广告，还要导入额外的 sidecar 文件；④ 最后在 App 里开启 MITM 开关。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">什么是 MITM 证书？必须配置吗？<span class="chevron">▾</span></button>
        <div class="faq-a">MITM 用于解密 HTTPS 流量，是去广告脚本生效的前提。如果你<strong>不需要去广告</strong>，可以不勾选「同时生成去广告配置」，就不用配置 MITM。如果启用了去广告，每个 App 的「导入步骤」会标注需要安装并信任证书。证书是本机生成的私密文件，不要分享给别人。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">「一体化模式」是什么？我该勾吗？<span class="chevron">▾</span></button>
        <div class="faq-a">一体化模式把主配置和去广告规则合并到<strong>一个文件</strong>，并且订阅通过平台原生引用自动拉取，不需要本地解析节点。新手推荐勾选，导入更简单（只需导入 1 个文件）。缺点是首次使用时会触发平台去拉取订阅。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">生成的配置文件在哪？会被提交到 Git 吗？<span class="chevron">▾</span></button>
        <div class="faq-a">可视化页面生成的文件在 <code>configs/generated/quick-start/</code> 目录下，按时间戳分文件夹。该目录已被 <code>.gitignore</code> 忽略，不会进入版本库，也不会上传到任何远程服务。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">生成失败或提示错误怎么办？<span class="chevron">▾</span></button>
        <div class="faq-a">常见原因：① VPN 地址格式不正确——确认每行只有一个完整链接；② 没勾选任何平台——至少勾选一个；③ 网络问题导致订阅拉取失败——换一个网络再试。结果区会显示具体错误信息，也可查看「生成器输出」段。仍有问题可查阅 <code>docs/troubleshooting.md</code>。</div>
      </div>
    </div>
  </section>
  <footer>Proxy Tuner · 本地零依赖配置生成器</footer>
  <script>
    const form = document.getElementById('form');
    const submit = document.getElementById('submit');
    const statusBox = document.getElementById('status');
    const details = document.getElementById('details');
    const addressBox = document.getElementById('addresses');
    const stepper = document.querySelector('.stepper');

    // 示例填充
    const samples = {
      trojan: 'trojan://password@hk.example.com:443?sni=hk.example.com#🇭🇰 香港-01\\ntrojan://password@jp.example.com:443?sni=jp.example.com#🇯🇵 日本-01\\ntrojan://password@us.example.com:443?sni=us.example.com#🇺🇸 美国-01',
      subscription: 'https://example.com/sub?token=your-airport-token'
    };
    document.querySelectorAll('.sample-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.sample;
        if (type === 'clear') {
          addressBox.value = '';
        } else if (samples[type]) {
          addressBox.value = samples[type];
        }
        addressBox.focus();
      });
    });

    // FAQ 折叠
    document.querySelectorAll('.faq-q').forEach((q) => {
      q.addEventListener('click', () => {
        const item = q.parentElement;
        item.classList.toggle('open');
      });
    });

    // 步骤指示器联动（根据焦点高亮）
    function highlightStep(idx) {
      stepper.querySelectorAll('.step-pill').forEach((p, i) => {
        p.classList.toggle('active', i === idx);
      });
    }
    addressBox.addEventListener('focus', () => highlightStep(0));
    document.querySelectorAll('input[name="platform"]').forEach((el) => {
      el.addEventListener('focus', () => highlightStep(1));
    });
    document.querySelectorAll('#common, #adBlock, #unified, #discoverRules').forEach((el) => {
      el.addEventListener('focus', () => highlightStep(2));
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      highlightStep(3);
      statusBox.className = 'status';
      statusBox.innerHTML = '<span class="status-icon">⏳</span>正在生成，请稍候...';
      details.innerHTML = '';

      const payload = {
        platforms: document.querySelectorAll('input[name="platform"]:checked').length > 0
          ? Array.from(document.querySelectorAll('input[name="platform"]:checked')).map((el) => el.value)
          : ['surge'],
        addresses: document.getElementById('addresses').value,
        common: document.getElementById('common').checked,
        adBlock: document.getElementById('adBlock').checked,
        unified: document.getElementById('unified').checked,
        discoverRules: document.getElementById('discoverRules').checked
      };

      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error || '生成失败');
        renderResult(body.result);
      } catch (error) {
        statusBox.className = 'status error';
        statusBox.innerHTML = '<span class="status-icon">⚠️</span>' + escapeHtml(error.message);
      } finally {
        submit.disabled = false;
      }
    });

    function renderResult(result) {
      statusBox.className = 'status ok';
      const count = result.results.length;
      statusBox.innerHTML = '<span class="status-icon">✅</span>已生成 ' + count + ' 个平台配置，输出到 ' + escapeHtml(result.timestamp) + '/ 文件夹。';

      const parts = [
        '<div class="result-section"><h3>输出目录</h3><div class="path-list">',
        '<div class="path-row"><span class="path-label">Session Directory</span><span class="path-value">' + escapeHtml(result.sessionDir) + '</span></div>',
        '</div></div>'
      ];
      for (const r of result.results) {
        parts.push('<div class="result-group">');
        parts.push('<div class="result-header"><span>' + escapeHtml(r.platformLabel) + '</span></div>');
        parts.push('<div class="result-body">');
        parts.push('<div class="result-section"><h3>生成文件</h3><div class="path-list">');
        parts.push('<div class="path-row"><span class="path-label">主配置</span><span class="path-value">' + escapeHtml(r.configPath) + '</span></div>');
        if (r.sidecarPath) {
          parts.push('<div class="path-row"><span class="path-label">去广告</span><span class="path-value">' + escapeHtml(r.sidecarPath) + '</span></div>');
        }
        parts.push('</div></div>');
        parts.push('<div class="result-section"><h3>导入步骤</h3>');
        parts.push('<ol class="steps">' + r.importSteps.map((step) => '<li>' + escapeHtml(step) + '</li>').join('') + '</ol>');
        parts.push('</div>');
        parts.push('<div class="result-section"><h3>可复制命令</h3>');
        parts.push('<div class="code-block"><button class="copy-btn" data-cmd="' + escapeHtml(r.command) + '">复制</button><pre>' + escapeHtml(r.command) + '</pre></div>');
        parts.push('</div>');
        if (r.stderr) {
          parts.push('<div class="result-section"><h3>生成器输出</h3><pre>' + escapeHtml(r.stderr) + '</pre></div>');
        }
        parts.push('</div></div>');
      }
      details.innerHTML = parts.join('');

      details.querySelectorAll('.copy-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(btn.dataset.cmd);
            const original = btn.textContent;
            btn.textContent = '已复制';
            setTimeout(() => { btn.textContent = original; }, 1500);
          } catch (_) {
            btn.textContent = '复制失败';
          }
        });
      });
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[char]));
    }
  </script>
</body>
</html>`;
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
