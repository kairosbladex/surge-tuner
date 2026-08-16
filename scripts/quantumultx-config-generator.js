#!/usr/bin/env node
'use strict';

/**
 * quantumultx-config-generator.js — Generate Quantumult X proxy configuration.
 *
 * Usage:
 *   node scripts/quantumultx-config-generator.js --address <uri-or-sub-url> [--services Telegram,YouTube] [--adblock] [--output <qx.conf>]
 *   node scripts/quantumultx-config-generator.js --input <input.json> [--output <qx.conf>]
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

// ── Main Generator ──────────────────────────────────────────────────────────────

function generateQuantumultXConfig(input, options = {}) {
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

  // [general]
  const general = [
    'ipv6 = false',
    'bypass-system = true',
    'bypass-tun = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12',
    'dns-server = system, 223.5.5.5, 119.29.29.29',
    'dns-ipv6 = false',
    'proxy-test-url = http://www.gstatic.com/generate_204',
    'test-timeout = 3',
    'loglevel = warning'
  ];

  // [server_remote] — subscriptions
  const serverRemoteLines = subscriptions.map((sub) =>
    `${sub.url}, tag=${sub.name}, update-interval=${sub.updateInterval}, opt-parser=false, enabled=true`
  );

  // [server_local] — single proxies
  const serverLocalLines = proxies.map((p) => {
    // Extract type and params from the Surge-format proxy line
    const line = p.line;
    // QX uses different syntax: <name> = <type>, <host>, <port>, <params>
    // We can reuse the Surge line mostly, adjusting type names
    let qxLine = line;
    if (p.type === 'ss') qxLine = qxLine.replace(/^(.+?) = ss, /, '$1 = shadowsocks, ');
    if (p.type === 'hysteria2') qxLine = qxLine.replace(/^(.+?) = hysteria2, /, '$1 = hysteria2, ');
    return qxLine;
  });

  // [policy] — QX groups
  const policyLines = [];
  const allPolicies = proxies.map((p) => p.name);

  // Static groups for each region
  for (const region of regions) {
    const regionProxies = classified.get(region.name) || [];
    const pNames = regionProxies.map((p) => p.name);
    if (pNames.length > 0 || subscriptions.length > 0) {
      // QX: static=<GroupName>, <type>=<PoolName>
      const poolName = `${region.name}池`;
      const members = pNames.length > 0 ? pNames.join(', ') : 'DIRECT';
      policyLines.push(`static=${region.name}, url-test=${poolName}, ${members}`);
      // url-test pool
      const parts = [`url-test=${poolName}`];
      parts.push(...pNames);
      if (subscriptions.length > 0) {
        parts.push('check-interval=600');
        parts.push('check-url=http://www.gstatic.com/generate_204');
        parts.push('check-tolerance=50');
        parts.push('regex-filter=' + region.regex);
      }
      policyLines.push(parts.join(', '));
    } else {
      policyLines.push(`static=${region.name}, DIRECT`);
    }
  }
  // All group
  policyLines.push(`static=All, select, ${allPolicies.length > 0 ? allPolicies.join(', ') : 'DIRECT'}`);

  // Service groups
  const generatedGroups = new Map(serviceSelection.groups);
  ensureGroup(generatedGroups, '微软服务', ['DIRECT', '香港节点', '美国节点', 'All']);
  ensureGroup(generatedGroups, '国产应用', ['DIRECT']);
  ensureGroup(generatedGroups, finalPolicy, ['DIRECT', '香港节点', '美国节点', '新加坡节点', '日本节点', 'All']);

  for (const [group, policies] of generatedGroups.entries()) {
    policyLines.push(`static=${group}, select, ${policies.join(', ')}`);
  }

  // [filter_remote]
  const filterRemoteLines = [];
  if (adBlock.enabled) {
    filterRemoteLines.push(
      `https://anti-ad.net/easylist.txt, tag=anti-ad, enabled=true`
    );
  }
  // Service rule providers
  for (const rule of serviceSelection.rules) {
    const url = remoteRuleUrl(rule.path, 'quantumultx');
    filterRemoteLines.push(`${url}, tag=${rule.policy.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '')}, policy=${rule.policy}, enabled=true`);
  }

  // [filter_local]
  const filterLocalLines = [];
  filterLocalLines.push('DOMAIN-KEYWORD,local, DIRECT');
  filterLocalLines.push('GEOIP,CN, DIRECT');
  filterLocalLines.push(`FINAL, ${finalPolicy}`);

  // [rewrite_remote] — adblock
  const rewriteRemoteLines = [];
  if (adBlock.enabled) {
    rewriteRemoteLines.push(
      `https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/QuantumultX/Advertising/Advertising.list, tag=去广告, enabled=true`
    );
  }

  // [server_remote] for adblock scripts
  const extraLines = [];
  if (adBlock.enabled && adBlock.mitm) {
    extraLines.push(
      '',
      '[rewrite_local]',
      '^https?://.* url script-response-body scripts/ad-block-all.js',
      '^https?://.* url script-request-header scripts/anti-tracking.js',
      '^https?://.* url script-response-body scripts/anti-tracking.js',
      '',
      '[mitm]',
      'hostname = -*.apple.com, -*.icloud.com, -*.mzstatic.com, *.pangle.io, *.pangleglobal.com, *.gdt.qq.com, *.ad.qq.com, *.doubleclick.net, *.googlesyndication.com, *.googleadservices.com',
      'skip-server-cert-verify = true'
    );
  }

  // ── Assembly ──────────────────────────────────────────────────────────────

  const output = [
    '; Generated by scripts/quantumultx-config-generator.js',
    '',
    '[general]',
    ...general,
    '',
    '[server_remote]',
    ...(serverRemoteLines.length > 0 ? serverRemoteLines : ['; No remote subscriptions']),
    '',
    '[server_local]',
    ...(serverLocalLines.length > 0 ? serverLocalLines : ['; No local proxies']),
    '',
    '[policy]',
    ...policyLines,
    '',
    '[filter_remote]',
    ...(filterRemoteLines.length > 0 ? filterRemoteLines : ['; No remote filters']),
    '',
    '[filter_local]',
    ...filterLocalLines,
    '',
    '[rewrite_remote]',
    ...(rewriteRemoteLines.length > 0 ? rewriteRemoteLines : ['; No remote rewrites']),
    ...extraLines
  ];

  return `${output.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

// usage 文案逐字保留（CLI 行为零容忍）；五段式主流程已下沉 generator-common。
const USAGE = [
  'Usage:',
  '  node scripts/quantumultx-config-generator.js --input <config.json> [--output <qx.conf>]',
  '  node scripts/quantumultx-config-generator.js --address <proxy-uri-or-subscription-url> [--services Telegram,YouTube] [--adblock] [--output <qx.conf>]',
  '  node scripts/quantumultx-config-generator.js --addresses <file-or-json-array> [--preset common] [--discover-rules] [--adblock] [--output <qx.conf>]',
  '  node scripts/quantumultx-config-generator.js --unified --subscription <name|url> [--subscription ...] [--preset common] [--adblock] [--output <qx.conf>]'
].join('\n');

function parseArgs(argv) {
  return parseGeneratorArgs(argv);
}

async function buildInputFromArgs(args) {
  return buildGeneratorInput(args);
}

async function main() {
  return runGeneratorCli({
    platform: 'quantumultx',
    label: 'Quantumult X',
    generate: generateQuantumultXConfig,
    usage: USAGE,
    defaultOutput: 'configs/generated/qx.conf'
  });
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { generateQuantumultXConfig, buildInputFromArgs, parseArgs };
