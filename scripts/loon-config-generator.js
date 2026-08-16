#!/usr/bin/env node
'use strict';

/**
 * loon-config-generator.js — Generate Loon proxy configuration from parsed proxies/subscriptions.
 *
 * Usage:
 *   node scripts/loon-config-generator.js --address <uri-or-sub-url> [--services Telegram,YouTube] [--adblock] [--output <loon.conf>]
 *   node scripts/loon-config-generator.js --address-file <subscription.txt> [--services ...] [--adblock] [--output <loon.conf>]
 *   node scripts/loon-config-generator.js --input <input.json> [--output <loon.conf>]
 */

const {
  loadCatalog,
  normalizeSubscriptions,
  normalizeProxies,
  normalizeRegions,
  normalizeAdBlock,
  resolveServices,
  classifyProxiesByRegion,
  ensureGroup,
  cleanName,
  remoteRuleUrl
} = require('./platform-base');

const { parseGeneratorArgs, buildGeneratorInput, runGeneratorCli } = require('./generator-common');
const { renderLoonScriptLines } = require('./adblock-shared');

// ── Loon-Specific Constants ─────────────────────────────────────────────────────

const LOCAL_BASE_RULES = [
  ['rulesets/LAN.list', 'DIRECT'],
  ['rulesets/Apple.list', 'DIRECT']
];

const LOCAL_ADBLOCK_RULES = [
  ['rulesets/SplashAd.list', 'REJECT'],
  ['rulesets/InAppAd.list', 'REJECT'],
  ['rulesets/Tracking.list', 'REJECT'],
  ['rulesets/AntiAd-Script.list', 'REJECT-TINYGIF']
];

// ── Main Generator ──────────────────────────────────────────────────────────────

function generateLoonConfig(input, options = {}) {
  const catalog = options.catalog || loadCatalog(options.catalogPath);
  const subscriptions = normalizeSubscriptions(input);
  const proxies = normalizeProxies(input);
  if (subscriptions.length === 0 && proxies.length === 0) {
    throw new Error('subscriptions or proxies must contain at least one entry');
  }
  const regions = normalizeRegions(input);
  const adBlock = normalizeAdBlock(input);
  const serviceSelection = resolveServices(input.services, catalog);
  const finalPolicy = cleanName(input.finalPolicy || '兜底分流', 'finalPolicy');

  const { classified } = classifyProxiesByRegion(proxies, regions);

  // ── Sections ──────────────────────────────────────────────────────────────

  // [General]
  const general = [
    'ipv6 = false',
    'bypass-system = true',
    'skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, localhost',
    'dns-server = system, 223.5.5.5, 119.29.29.29',
    'dns-ipv6 = false',
    'proxy-test-url = http://www.gstatic.com/generate_204',
    'test-timeout = 3',
    'loglevel = warning'
  ];

  // [Proxy] / [Remote Proxy]
  const proxyLines = proxies.map((p) => p.line);
  const remoteProxyLines = subscriptions.map((sub) =>
    `${sub.url}, tag=${sub.name}, enabled=true, update-interval=${sub.updateInterval}`
  );

  // [Proxy Group]
  const proxyGroupLines = [];

  // All group
  const allProxyNames = proxies.map((p) => p.name);
  const allParts = ['All = select', ...allProxyNames];
  if (subscriptions.length > 0) allParts.push('include-all-proxies=true');
  if (allParts.length === 1) allParts.push('DIRECT');
  proxyGroupLines.push(allParts.join(', '));

  // Region groups
  for (const region of regions) {
    const regionProxies = classified.get(region.name) || [];
    const proxyNames = regionProxies.map((p) => p.name);
    if (proxyNames.length > 0 || subscriptions.length > 0) {
      const parts = [`${region.name} = url-test`];
      parts.push(...proxyNames);
      if (subscriptions.length > 0) {
        parts.push(`policy-regex=${region.regex}`);
        parts.push('include-all-proxies=true');
      }
      parts.push(`url=http://www.gstatic.com/generate_204`);
      parts.push(`interval=${region.interval || 600}`);
      proxyGroupLines.push(parts.join(', '));
    } else {
      proxyGroupLines.push(`${region.name} = select, All`);
    }
  }

  // Service groups
  const generatedGroups = new Map(serviceSelection.groups);
  ensureGroup(generatedGroups, '微软服务', ['DIRECT', '香港节点', '美国节点', 'All']);
  ensureGroup(generatedGroups, '国产应用', ['DIRECT']);
  ensureGroup(generatedGroups, finalPolicy, ['DIRECT', '香港节点', '美国节点', '新加坡节点', '日本节点', 'All']);

  for (const [group, policies] of generatedGroups.entries()) {
    proxyGroupLines.push(`${group} = select, ${policies.join(', ')}`);
  }

  // [Rule]
  const ruleLines = [];
  for (const [rulePath, policy] of LOCAL_BASE_RULES) {
    ruleLines.push(`# include "${rulePath}", ${policy}`);
  }
  if (adBlock.enabled) {
    for (const [rulePath, policy] of LOCAL_ADBLOCK_RULES) {
      ruleLines.push(`# include "${rulePath}", ${policy}`);
    }
  }

  for (const rule of serviceSelection.rules) {
    const url = remoteRuleUrl(rule.path, 'loon');
    ruleLines.push(`# include "${url}", ${rule.policy}`);
  }

  const customRules = Array.isArray(input.rules) ? input.rules : [];
  for (const customRule of customRules) {
    ruleLines.push(formatLoonCustomRule(customRule));
  }

  ruleLines.push('GEOIP,CN,DIRECT');
  ruleLines.push(`FINAL,${finalPolicy}`);

  // [MITM] (adBlock)
  const mitmLines = [];
  const scriptLines = [];
  if (adBlock.enabled && adBlock.mitm) {
    mitmLines.push(
      'enable = true',
      'skip-server-cert-verify = true',
      'hostname = -*.apple.com, -*.icloud.com, -*.mzstatic.com, *.pangle.io, *.pangleglobal.com, *.gdt.qq.com, *.ad.qq.com, *.doubleclick.net, *.googlesyndication.com, *.googleadservices.com'
    );
    // Loon scripts have different syntax
    scriptLines.push(...renderLoonScriptLines());
  }

  // ── Assembly ──────────────────────────────────────────────────────────────

  const output = [
    '; Generated by scripts/loon-config-generator.js',
    '',
    '[General]',
    ...general,
    '',
    '[Proxy]',
    ...(proxyLines.length > 0 ? proxyLines : ['; No standalone proxies defined']),
    '',
    '[Remote Proxy]',
    ...(remoteProxyLines.length > 0 ? remoteProxyLines : ['; No remote subscriptions defined']),
    '',
    '[Proxy Group]',
    ...proxyGroupLines,
    '',
    '[Rule]',
    ...ruleLines
  ];

  if (mitmLines.length > 0) {
    output.push('', '[MITM]', ...mitmLines);
  }
  if (scriptLines.length > 0) {
    output.push('', '[Script]', ...scriptLines);
  }

  return `${output.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function formatLoonCustomRule(rule) {
  if (!rule || typeof rule !== 'object') throw new Error('custom rule must be an object');
  const type = cleanName(rule.type, 'rule.type').toUpperCase();
  const value = cleanName(rule.value, 'rule.value');
  const policy = cleanName(rule.policy, 'rule.policy');
  return `${type},${value},${policy}`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

// usage 文案逐字保留（CLI 行为零容忍）；五段式主流程已下沉 generator-common。
const USAGE = [
  'Usage:',
  '  node scripts/loon-config-generator.js --input <config.json> [--output <loon.conf>]',
  '  node scripts/loon-config-generator.js --address <proxy-uri-or-subscription-url> [--services Telegram,YouTube] [--adblock] [--output <loon.conf>]',
  '  node scripts/loon-config-generator.js --addresses <file-or-json-array> [--preset common] [--discover-rules] [--adblock] [--output <loon.conf>]',
  '  node scripts/loon-config-generator.js --address-file <subscription.txt> [--services ...] [--adblock] [--output <loon.conf>]',
  '  node scripts/loon-config-generator.js --unified --subscription <name|url> [--subscription ...] [--preset common] [--adblock] [--output <loon.conf>]'
].join('\n');

function parseArgs(argv) {
  return parseGeneratorArgs(argv);
}

async function buildInputFromArgs(args) {
  return buildGeneratorInput(args);
}

async function main() {
  return runGeneratorCli({
    platform: 'loon',
    label: 'Loon',
    generate: generateLoonConfig,
    usage: USAGE,
    defaultOutput: 'configs/generated/loon.conf'
  });
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { generateLoonConfig, buildInputFromArgs, parseArgs };
