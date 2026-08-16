#!/usr/bin/env node
'use strict';

/**
 * clash-config-generator.js — Generate Clash/Stash YAML proxy configuration.
 *
 * Usage:
 *   node scripts/clash-config-generator.js --address <uri-or-sub-url> [--services Telegram,YouTube] [--adblock] [--output <clash.yaml>]
 *   node scripts/clash-config-generator.js --input <input.json> [--output <clash.yaml>]
 */

const fs = require('fs');
const path = require('path');

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
const REPO_ROOT = path.resolve(__dirname, '..');

// ── Clash Constants ─────────────────────────────────────────────────────────────

function clashRuleProviderName(pathStr) {
  return pathStr.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'rule';
}

// 基础/去广告清单直接内联为 Clash 规则。这些本地 .list 是 Surge 格式，
// 上游没有对应的 Clash 版本，rule-provider 远程引用只会得到 404。
// ChinaIP.list 不内联：rules 末尾已有 GEOIP,CN,DIRECT 覆盖。
const INLINE_BASE_RULESETS = [
  ['LAN.list', 'DIRECT'],
  ['Apple.list', 'DIRECT']
];
const INLINE_ADBLOCK_RULESETS = [
  ['SplashAd.list', 'REJECT'],
  ['InAppAd.list', 'REJECT'],
  ['Tracking.list', 'REJECT']
];

function toClashInlineRule(rawLine, policy) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#') || line.startsWith(';')) return null;
  const parts = line.split(',').map((part) => part.trim());
  const head = parts[0].toUpperCase();
  if (['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'IP-CIDR', 'IP-CIDR6'].includes(head) && parts[1]) {
    return `${head},${parts[1]},${policy}`;
  }
  if (parts.length === 1) {
    const domain = parts[0].replace(/^\*\./, '');
    if (domain && !domain.includes('/')) return `DOMAIN-SUFFIX,${domain},${policy}`;
  }
  return null;
}

function loadInlineRuleset(fileName, policy) {
  const fullPath = path.join(REPO_ROOT, 'rulesets', fileName);
  return fs.readFileSync(fullPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => toClashInlineRule(line, policy))
    .filter(Boolean);
}

// 解析 Surge 格式节点行（`name = type, host, port, key=value, ...`）的参数表。
// parser 只产出 Surge 文本行，Clash 需要的凭证字段（cipher/password/uuid 等）从这里还原。
function parseProxyLineParams(line) {
  const params = {};
  if (typeof line !== 'string') return params;
  const eqIndex = line.indexOf('=');
  if (eqIndex < 0) return params;
  const parts = line.slice(eqIndex + 1).split(',').map((part) => part.trim());
  for (const part of parts.slice(3)) { // 前 3 段固定是 type/host/port
    const kvIndex = part.indexOf('=');
    if (kvIndex < 1) continue;
    params[part.slice(0, kvIndex).trim()] = part.slice(kvIndex + 1).trim();
  }
  return params;
}

function toClashProxy(proxy) {
  const params = parseProxyLineParams(proxy.line);
  const out = {
    name: proxy.name,
    type: proxy.type || 'ss',
    server: proxy.host,
    port: proxy.port
  };
  switch (proxy.type) {
    case 'ss':
      if (params['encrypt-method']) out.cipher = params['encrypt-method'];
      if (params.password) out.password = params.password;
      out.udp = true;
      break;
    case 'trojan':
      if (params.password) out.password = params.password;
      if (params.sni) out.sni = params.sni;
      if (params['skip-cert-verify'] === 'true') out['skip-cert-verify'] = true;
      out.udp = true;
      break;
    case 'vmess':
      if (params.username) out.uuid = params.username;
      out.alterId = 0;
      out.cipher = params['encrypt-method'] || 'auto';
      if (params.tls === 'true') out.tls = true;
      if (params.sni) out.servername = params.sni;
      if (params.ws === 'true') {
        const wsOpts = { path: params['ws-path'] || '/' };
        const hostHeader = String(params['ws-headers'] || '').replace(/^Host:/i, '').trim();
        if (hostHeader) wsOpts.headers = { Host: hostHeader };
        out.network = 'ws';
        out['ws-opts'] = wsOpts;
      }
      break;
    case 'hysteria2':
      if (params.password) out.password = params.password;
      if (params.sni) out.sni = params.sni;
      if (params['skip-cert-verify'] === 'true') out['skip-cert-verify'] = true;
      break;
    case 'tuic':
      // parser 输出 token=<password|uuid>，uuid 与密码并存时另有 uuid=<uuid>
      if (params.uuid || params.token) out.uuid = params.uuid || params.token;
      if (params.token) out.password = params.token;
      if (params.sni) out.sni = params.sni;
      if (params.alpn) out.alpn = [params.alpn];
      break;
    default:
      break;
  }
  return out;
}

function yamlStr(value) {
  if (typeof value === 'string' && /[:{}[\],&*?|>!%@`#]|\s/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return String(value);
}

function yamlList(items, indent = 2) {
  return items.map((item) => `${' '.repeat(indent)}- ${yamlStr(item)}`).join('\n');
}

function yamlMap(map, indent = 2) {
  return Object.entries(map).map(([k, v]) => {
    const prefix = `${' '.repeat(indent)}${k}:`;
    if (typeof v === 'object' && !Array.isArray(v) && v !== null) {
      return `${prefix}\n${yamlMap(v, indent + 2)}`;
    }
    if (Array.isArray(v)) {
      return `${prefix}\n${yamlList(v, indent + 2)}`;
    }
    if (typeof v === 'boolean' || typeof v === 'number') {
      return `${prefix} ${v}`;
    }
    return `${prefix} ${yamlStr(v)}`;
  }).join('\n');
}

// ── Main Generator ──────────────────────────────────────────────────────────────

function generateClashConfig(input, options = {}) {
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

  // ── Build YAML ────────────────────────────────────────────────────────────

  const sections = {};

  // --- port / socks-port / mixed-port ---
  sections['port'] = 7890;
  sections['socks-port'] = 7891;
  sections['allow-lan'] = false;
  sections['mode'] = 'Rule';
  sections['log-level'] = 'warning';
  sections['ipv6'] = false;
  sections['external-controller'] = '127.0.0.1:9090';

  // --- DNS ---
  sections['dns'] = {
    'enabled': true,
    'listen': '0.0.0.0:53',
    'default-nameserver': ['223.5.5.5', '119.29.29.29'],
    'nameserver': ['system', '223.5.5.5', '119.29.29.29'],
    'fallback': ['tls://8.8.4.4', 'https://doh.opendns.com'],
    'fallback-filter': { 'geoip': true, 'ipcidr': ['240.0.0.0/4', '0.0.0.0/32'] }
  };

  // --- proxies ---
  const proxyList = proxies.map((p) => toClashProxy(p));

  sections['proxies'] = proxyList;

  // --- proxy-groups ---
  const proxyGroups = [];

  // All group
  proxyGroups.push({
    name: 'All',
    type: 'select',
    proxies: proxies.length > 0 ? proxies.map((p) => p.name) : ['DIRECT']
  });

  // Region groups
  for (const region of regions) {
    const regionProxies = classified.get(region.name) || [];
    const proxyNames = regionProxies.map((p) => p.name);
    if (proxyNames.length > 0 || subscriptions.length > 0) {
      proxyGroups.push({
        name: region.name,
        type: 'url-test',
        proxies: proxyNames.length > 0 ? proxyNames : ['All', 'DIRECT'],
        'url': 'http://www.gstatic.com/generate_204',
        'interval': region.interval || 600,
        'tolerance': region.tolerance || 50
      });
    } else {
      proxyGroups.push({
        name: region.name,
        type: 'select',
        proxies: ['All', 'DIRECT']
      });
    }
  }

  // Service groups
  const generatedGroups = new Map(serviceSelection.groups);
  ensureGroup(generatedGroups, '微软服务', ['DIRECT', '香港节点', '美国节点', 'All']);
  ensureGroup(generatedGroups, '国产应用', ['DIRECT']);
  ensureGroup(generatedGroups, finalPolicy, ['DIRECT', '香港节点', '美国节点', '新加坡节点', '日本节点', 'All']);

  for (const [group, policies] of generatedGroups.entries()) {
    proxyGroups.push({
      name: group,
      type: 'select',
      proxies: policies
    });
  }

  sections['proxy-groups'] = proxyGroups;

  // --- proxy-providers (subscriptions) ---
  if (subscriptions.length > 0) {
    const providers = {};
    for (const sub of subscriptions) {
      providers[sub.name] = {
        type: 'http',
        url: sub.url,
        interval: sub.updateInterval,
        'health-check': {
          enable: true,
          url: 'http://www.gstatic.com/generate_204',
          interval: 300
        }
      };
    }
    sections['proxy-providers'] = providers;

    // For subscriptions, we need to add "use" references to region groups
    // Update region groups to use providers
    for (const group of proxyGroups) {
      if (regions.some((r) => r.name === group.name)) {
        if (subscriptions.length > 0 && (!group.proxies || group.proxies.length === 0)) {
          group['use'] = subscriptions.map((s) => s.name);
          delete group.proxies;
        }
      }
    }
  }

  // --- rule-providers（仅目录服务规则；基础/去广告清单内联到 rules 段） ---
  const ruleProviders = {};

  for (const rule of serviceSelection.rules) {
    const name = clashRuleProviderName(rule.path);
    ruleProviders[name] = {
      type: 'http',
      behavior: 'classical',
      url: remoteRuleUrl(rule.path, 'clash').replace(/\.list$/, '.yaml'),
      interval: 86400,
      path: `./rules/${name}.yaml`
    };
  }

  if (Object.keys(ruleProviders).length > 0) {
    sections['rule-providers'] = ruleProviders;
  }

  // --- rules ---
  // 基础与去广告清单内联展开，RULE-SET 名称必须与上面 provider 名一一对应。
  const rules = INLINE_BASE_RULESETS.flatMap(([file, policy]) => loadInlineRuleset(file, policy));

  if (adBlock.enabled) {
    for (const [file, policy] of INLINE_ADBLOCK_RULESETS) {
      rules.push(...loadInlineRuleset(file, policy));
    }
  }

  for (const rule of serviceSelection.rules) {
    rules.push(`RULE-SET,${clashRuleProviderName(rule.path)},${rule.policy}`);
  }

  const customRules = Array.isArray(input.rules) ? input.rules : [];
  for (const customRule of customRules) {
    const type = cleanName(customRule.type, 'rule.type').toUpperCase();
    const value = cleanName(customRule.value, 'rule.value');
    const policy = cleanName(customRule.policy, 'rule.policy');
    rules.push(`${type},${value},${policy}`);
  }

  rules.push('GEOIP,CN,DIRECT', `MATCH,${finalPolicy}`);
  sections['rules'] = rules;

  // ── Serialize to YAML ────────────────────────────────────────────────────

  const yamlLines = ['# Generated by scripts/clash-config-generator.js', ''];

  // 递归序列化字段值，ws-opts.headers 这类多层嵌套也能正确输出。
  function serializeField(fieldKey, fieldValue, fieldIndent) {
    if (fieldValue === undefined) return;
    const fieldPrefix = ' '.repeat(fieldIndent);
    if (Array.isArray(fieldValue)) {
      yamlLines.push(`${fieldPrefix}${fieldKey}:`);
      for (const elem of fieldValue) {
        yamlLines.push(`${fieldPrefix}  - ${yamlStr(elem)}`);
      }
    } else if (typeof fieldValue === 'object' && fieldValue !== null) {
      yamlLines.push(`${fieldPrefix}${fieldKey}:`);
      for (const [nestedKey, nestedValue] of Object.entries(fieldValue)) {
        serializeField(nestedKey, nestedValue, fieldIndent + 2);
      }
    } else {
      yamlLines.push(`${fieldPrefix}${fieldKey}: ${yamlStr(fieldValue)}`);
    }
  }

  function serializeSection(key, value, indent = 0) {
    const prefix = ' '.repeat(indent);
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      // Check if it's an array of objects or primitives
      if (value.length > 0 && typeof value[0] === 'object' && !Array.isArray(value[0])) {
        yamlLines.push(`${prefix}${key}:`);
        for (const item of value) {
          yamlLines.push(`${prefix}  - name: ${yamlStr(item.name)}`);
          for (const [ik, iv] of Object.entries(item)) {
            if (ik === 'name') continue;
            serializeField(ik, iv, indent + 4);
          }
        }
      } else {
        yamlLines.push(`${prefix}${key}:`);
        for (const item of value) {
          yamlLines.push(`${prefix}  - ${yamlStr(item)}`);
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      yamlLines.push(`${prefix}${key}:`);
      for (const [k, v] of Object.entries(value)) {
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          yamlLines.push(`${prefix}  ${k}:`);
          for (const [k2, v2] of Object.entries(v)) {
            if (typeof v2 === 'object' && v2 !== null) {
              yamlLines.push(`${prefix}    ${k2}:`);
              for (const [k3, v3] of Object.entries(v2)) {
                yamlLines.push(`${prefix}      ${k3}: ${yamlStr(v3)}`);
              }
            } else {
              yamlLines.push(`${prefix}    ${k2}: ${yamlStr(v2)}`);
            }
          }
        } else if (Array.isArray(v)) {
          yamlLines.push(`${prefix}  ${k}:`);
          for (const e of v) {
            if (typeof e === 'object' && e !== null) {
              const entries = Object.entries(e);
              yamlLines.push(`${prefix}    - ${entries[0][0]}: ${yamlStr(entries[0][1])}`);
              for (const [ek, ev] of entries.slice(1)) {
                if (Array.isArray(ev)) {
                  yamlLines.push(`${prefix}      ${ek}:`);
                  for (const elem of ev) {
                    yamlLines.push(`${prefix}        - ${yamlStr(elem)}`);
                  }
                } else {
                  yamlLines.push(`${prefix}      ${ek}: ${yamlStr(ev)}`);
                }
              }
            } else {
              yamlLines.push(`${prefix}    - ${yamlStr(e)}`);
            }
          }
        } else {
          yamlLines.push(`${prefix}  ${k}: ${yamlStr(v)}`);
        }
      }
    } else {
      yamlLines.push(`${prefix}${key}: ${yamlStr(value)}`);
    }
  }

  // Serialize in order
  const sectionOrder = [
    'port', 'socks-port', 'allow-lan', 'mode', 'log-level', 'ipv6', 'external-controller',
    'dns', 'proxies', 'proxy-groups', 'proxy-providers', 'rule-providers', 'rules'
  ];

  for (const key of sectionOrder) {
    if (sections[key] !== undefined) {
      if (yamlLines.length > 1) yamlLines.push('');
      serializeSection(key, sections[key]);
    }
  }

  return yamlLines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

// usage 文案逐字保留（CLI 行为零容忍）；五段式主流程已下沉 generator-common。
const USAGE = [
  'Usage:',
  '  node scripts/clash-config-generator.js --input <config.json> [--output <clash.yaml>]',
  '  node scripts/clash-config-generator.js --address <proxy-uri-or-subscription-url> [--services Telegram,YouTube] [--adblock] [--output <clash.yaml>]',
  '  node scripts/clash-config-generator.js --addresses <file-or-json-array> [--preset common] [--discover-rules] [--adblock] [--output <clash.yaml>]',
  '  node scripts/clash-config-generator.js --unified --subscription <name|url> [--subscription ...] [--preset common] [--adblock] [--output <clash.yaml>]'
].join('\n');

function parseArgs(argv) {
  return parseGeneratorArgs(argv);
}

async function buildInputFromArgs(args) {
  return buildGeneratorInput(args);
}

async function main() {
  return runGeneratorCli({
    platform: 'clash',
    label: 'Clash',
    generate: generateClashConfig,
    usage: USAGE,
    defaultOutput: 'configs/generated/clash.yaml'
  });
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { generateClashConfig, buildInputFromArgs, parseArgs, toClashProxy, toClashInlineRule };
