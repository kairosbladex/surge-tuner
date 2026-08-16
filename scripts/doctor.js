#!/usr/bin/env node
'use strict';

/**
 * doctor.js — Proxy Tuner 环境诊断
 *
 * 检查运行本项目所需的环境条件，给新手明确的修复提示：
 *   Node 版本 / git / 代理配置健康度 / 网络可达性 / 项目完整性 / 输出目录可写 / 默认端口
 *
 * 用法:
 *   node scripts/doctor.js            # 完整检查（含网络探测）
 *   node scripts/doctor.js --offline  # 只做本地检查（不访问网络）
 *   npm run doctor
 */

const fs = require('fs');
const net = require('net');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const MIN_NODE_MAJOR = 20;
const QUICK_START_PORT = 8788;

function tcpCheck(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function httpCheck(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    return response.ok || response.status === 405;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function gitOutput(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return null;
  }
}

function collectProxies() {
  const proxies = [];
  for (const key of ['http.proxy', 'https.proxy']) {
    const value = gitOutput(['config', '--global', '--get', key]);
    if (value) proxies.push({ source: `git ${key}`, value });
  }
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) {
    if (process.env[key]) proxies.push({ source: `环境变量 ${key}`, value: process.env[key] });
  }
  return proxies;
}

function parseProxyHostPort(value) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `http://${value}`);
    return { host: url.hostname, port: Number(url.port) || 8080 };
  } catch (_) {
    return null;
  }
}

async function runChecks(options = {}) {
  const offline = Boolean(options.offline);
  const results = [];
  const add = (level, name, message, hint) => results.push({ level, name, message, hint });

  // 1. Node 版本（硬性要求）
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor >= MIN_NODE_MAJOR) {
    add('pass', 'Node.js 版本', `v${process.versions.node}（要求 ≥ ${MIN_NODE_MAJOR}）`);
  } else {
    add('fail', 'Node.js 版本', `v${process.versions.node} 过旧，要求 ≥ ${MIN_NODE_MAJOR}`,
      '到 https://nodejs.org 下载安装 LTS 版本后重开终端');
  }

  // 2. 操作系统
  const platformNames = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
  const platformName = platformNames[process.platform] || process.platform;
  add('pass', '操作系统', `${platformName}（${process.platform}/${process.arch}）`);

  // 3. git（克隆/更新需要，已下载则可选）
  const gitVersion = gitOutput(['--version']);
  if (gitVersion) {
    add('pass', 'git', gitVersion);
  } else {
    add('warn', 'git', '未安装或不在 PATH 中',
      '用 ZIP 下载可不需要 git；需要克隆/更新时请安装：https://git-scm.com');
  }

  // 4. 代理配置健康度（失效代理会让 git clone/pull 直接失败）
  const proxies = collectProxies();
  if (proxies.length === 0) {
    add('pass', '代理配置', '未配置代理，git 将直连');
  } else {
    const seen = new Set();
    for (const proxy of proxies) {
      const target = parseProxyHostPort(proxy.value);
      if (!target) {
        add('warn', '代理配置', `${proxy.source} = ${proxy.value}（格式无法识别）`);
        continue;
      }
      const key = `${target.host}:${target.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (offline) {
        add('warn', '代理配置', `${proxy.source} = ${proxy.value}（--offline 模式未探测）`);
        continue;
      }
      const alive = await tcpCheck(target.host, target.port);
      if (alive) {
        add('pass', '代理配置', `${proxy.source} = ${proxy.value}（可连接）`);
      } else {
        add('warn', '代理配置', `${proxy.source} = ${proxy.value}（无法连接，代理可能没启动）`,
          'git 操作会因它失败。启动该代理，或执行：git config --global --unset http.proxy && git config --global --unset https.proxy');
      }
    }
  }

  // 5. 网络可达性（仅参考：生成本身不下载规则集内容，URL 只写进配置由手机端下载；
  //    真正需要联网的是可选的 --discover-rules 与通过订阅 URL 拉节点）
  if (offline) {
    add('warn', '网络检查', '--offline 模式已跳过');
  } else {
    const githubOk = await httpCheck('https://github.com');
    if (githubOk) {
      add('pass', 'GitHub', 'github.com 可访问（项目克隆/更新、在线规则发现正常）');
    } else {
      add('warn', 'GitHub', 'github.com 无法访问',
        '不影响本地生成配置；只影响克隆/更新项目与可选的 --discover-rules');
    }
    const rawOk = await httpCheck('https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/README.md');
    if (rawOk) {
      add('pass', '规则集源站', 'raw.githubusercontent.com 可访问');
    } else {
      add('warn', '规则集源站', 'raw.githubusercontent.com 无法访问',
        '不影响本机生成（规则集 URL 只写进配置，由手机端经代理下载）；手机若无法更新规则集请检查手机网络');
    }
  }

  // 6. 项目完整性
  const requiredPaths = [
    'scripts/surge-config-generator.js',
    'scripts/quick-start-server.js',
    'scripts/adblock-shared.js',
    'rules/services/service-catalog.json',
    'rulesets'
  ];
  const missing = requiredPaths.filter((p) => !fs.existsSync(path.join(REPO_ROOT, p)));
  if (missing.length === 0) {
    add('pass', '项目完整性', '关键文件与目录齐全');
  } else {
    add('fail', '项目完整性', `缺少: ${missing.join(', ')}`,
      '项目文件不完整，请重新下载完整项目（不要只复制单个文件）');
  }

  // 7. 输出目录可写
  try {
    const outDir = path.join(REPO_ROOT, 'configs', 'generated');
    fs.mkdirSync(outDir, { recursive: true });
    const probe = path.join(outDir, '.doctor-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    add('pass', '输出目录', 'configs/generated/ 可写');
  } catch (err) {
    add('fail', '输出目录', `configs/generated/ 不可写: ${err.message}`,
      '检查项目目录权限；不要把项目放在需要管理员权限的目录（如 C:\\Program Files）');
  }

  // 8. quick-start 默认端口
  const portBusy = await tcpCheck('127.0.0.1', QUICK_START_PORT, 800);
  if (portBusy) {
    add('warn', '默认端口', `${QUICK_START_PORT} 已被占用`,
      '启动时会自动换用相邻端口；也可以 npm run quick-start -- --port 8899');
  } else {
    add('pass', '默认端口', `${QUICK_START_PORT} 空闲`);
  }

  return results;
}

function printReport(results) {
  const icons = { pass: '✅', warn: '⚠️ ', fail: '❌' };
  console.log('\nProxy Tuner 环境诊断\n');
  for (const item of results) {
    console.log(`${icons[item.level]} ${item.name}: ${item.message}`);
    if (item.hint) console.log(`   💡 ${item.hint}`);
  }
  const fails = results.filter((r) => r.level === 'fail').length;
  const warns = results.filter((r) => r.level === 'warn').length;
  const passes = results.filter((r) => r.level === 'pass').length;
  console.log(`\n汇总: ${passes} 项通过, ${warns} 项警告, ${fails} 项失败`);
  if (fails > 0) {
    console.log('请先解决 ❌ 项再使用；新手教程见 docs/beginner-guide.md\n');
  } else if (warns > 0) {
    console.log('可以正常使用；⚠️ 项建议按需处理。\n');
  } else {
    console.log('环境完全就绪，运行 npm run quick-start 开始生成配置。\n');
  }
}

async function main() {
  const offline = process.argv.slice(2).includes('--offline');
  const results = await runChecks({ offline });
  printReport(results);
  const fails = results.filter((r) => r.level === 'fail').length;
  process.exit(fails > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`诊断过程出错: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { runChecks };
