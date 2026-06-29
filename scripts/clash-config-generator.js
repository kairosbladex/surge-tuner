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
  platformValidate,
  remoteRuleUrl
} = require('./platform-base');

const { loadProxySource } = require('./surge-proxy-parser');
const { splitList, applyServicePreset, buildProxySourceOptions } = require('./generator-common');
const { prepareCatalogForServices } = require('./rule-discovery');
const { writeAdblockSidecar } = require('./adblock-artifacts');
const REPO_ROOT = path.resolve(__dirname, '..');

// ── Clash Constants ─────────────────────────────────────────────────────────────

const CLASH_BLACKMATRIX_ROOT = 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash';

function clashRuleProviderName(pathStr) {
  return pathStr.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'rule';
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

  const { classified, unclassified } = classifyProxiesByRegion(proxies, regions);

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
  const proxyList = proxies.map((p) => {
    const name = p.name;
    const type = p.type || 'ss';
    const clashType = type === 'ss' ? 'ss' : type;
    return { name, type: clashType, server: p.host, port: p.port };
  });

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

  // --- rule-providers ---
  const ruleProviders = {};
  const serviceRules = [];

  // Base rules
  const baseRules = [
    'RULE-SET,LAN.list,DIRECT',
    'RULE-SET,Apple.list,DIRECT'
  ];

  if (adBlock.enabled) {
    baseRules.push(
      'RULE-SET,SplashAd.list,REJECT',
      'RULE-SET,InAppAd.list,REJECT',
      'RULE-SET,Tracking.list,REJECT'
    );
  }

  baseRules.push('RULE-SET,ChinaIP.list,DIRECT');

  // Convert RULE-SET references to rule-providers
  const ruleSetRefs = new Set();
  for (const rule of baseRules) {
    const match = rule.match(/^RULE-SET,(.+?),(.+)$/);
    if (match) {
      ruleSetRefs.add(match[1]);
    }
  }

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

  // Local rule-set providers
  for (const rs of ruleSetRefs) {
    const name = clashRuleProviderName(rs);
    if (!ruleProviders[name]) {
      ruleProviders[name] = {
        type: 'http',
        behavior: 'classical',
        url: `${CLASH_BLACKMATRIX_ROOT}/../Clash/${name.replace(/\.list$/, '')}/${name.replace(/\.list$/, '')}.yaml`,
        interval: 86400,
        path: `./rules/${name}.yaml`
      };
    }
  }

  if (Object.keys(ruleProviders).length > 0) {
    sections['rule-providers'] = ruleProviders;
  }

  // --- rules ---
  const rules = [];

  for (const rule of baseRules) {
    rules.push(rule);
  }

  for (const rule of serviceSelection.rules) {
    const name = clashRuleProviderName(rule.path);
    rules.push(`RULE-SET,${name},${rule.policy}`);
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
            if (Array.isArray(iv)) {
              yamlLines.push(`${prefix}    ${ik}:`);
              for (const elem of iv) {
                yamlLines.push(`${prefix}      - ${yamlStr(elem)}`);
              }
            } else if (typeof iv === 'object' && iv !== null) {
              yamlLines.push(`${prefix}    ${ik}:`);
              for (const [ik2, iv2] of Object.entries(iv)) {
                yamlLines.push(`${prefix}      ${ik2}: ${yamlStr(iv2)}`);
              }
            } else {
              yamlLines.push(`${prefix}    ${ik}: ${yamlStr(iv)}`);
            }
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

function parseArgs(argv) {
  const args = {
    input: null, address: null, addresses: null, addressFile: null, output: null,
    catalog: null, services: [], preset: null, discoverRules: false, adblockOutput: null,
    unified: false, subscription: [],
    adBlock: false, validate: true, strict: false, help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--input' || arg === '-i') args.input = argv[++i];
    else if (arg === '--address' || arg === '-a') args.address = argv[++i];
    else if (arg === '--addresses') args.addresses = argv[++i];
    else if (arg === '--address-file') args.addressFile = argv[++i];
    else if (arg === '--output' || arg === '-o') args.output = argv[++i];
    else if (arg === '--adblock-output') args.adblockOutput = argv[++i];
    else if (arg === '--catalog') args.catalog = argv[++i];
    else if (arg === '--services') args.services = splitList(argv[++i]);
    else if (arg === '--preset') args.preset = argv[++i];
    else if (arg === '--discover-rules') args.discoverRules = true;
    else if (arg === '--unified') args.unified = true;
    else if (arg === '--subscription') args.subscription.push(argv[++i]);
    else if (arg === '--adblock') args.adBlock = true;
    else if (arg === '--no-adblock') args.adBlock = false;
    else if (arg === '--skip-validate') args.validate = false;
    else if (arg === '--strict') args.strict = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/clash-config-generator.js --input <config.json> [--output <clash.yaml>]',
    '  node scripts/clash-config-generator.js --address <proxy-uri-or-subscription-url> [--services Telegram,YouTube] [--adblock] [--output <clash.yaml>]',
    '  node scripts/clash-config-generator.js --addresses <file-or-json-array> [--preset common] [--discover-rules] [--adblock] [--output <clash.yaml>]',
    '  node scripts/clash-config-generator.js --unified --subscription <name|url> [--subscription ...] [--preset common] [--adblock] [--output <clash.yaml>]'
  ].join('\n');
}

async function buildInputFromArgs(args) {
  if (args.input) return applyServicePreset(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args.input), 'utf8')));
  if (args.unified && args.subscription.length > 0) {
    const subscriptions = args.subscription.map((raw, index) => {
      const sep = raw.indexOf('|');
      const name = sep > 0 ? raw.slice(0, sep) : `机场${index + 1}`;
      const url = sep > 0 ? raw.slice(sep + 1) : raw;
      return { name, url, updateInterval: 86400 };
    });
    return applyServicePreset({ unified: true, subscriptions, services: args.services, adBlock: args.adBlock, preset: args.preset });
  }
  const proxies = await loadProxySource(buildProxySourceOptions(args));
  return applyServicePreset({ proxies, services: args.services, adBlock: args.adBlock, preset: args.preset });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const hasInput = args.input || args.address || args.addresses || args.addressFile
    || (args.subscription.length > 0);
  if (args.help || !hasInput) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const input = await buildInputFromArgs(args);
  const catalogPath = args.catalog ? path.resolve(process.cwd(), args.catalog) : undefined;
  const catalogResult = await prepareCatalogForServices(input.services, {
    catalogPath,
    discoverRules: args.discoverRules,
    platform: 'clash'
  });
  const config = generateClashConfig(input, {
    catalog: catalogResult.catalog
  });

  const outputPath = args.output
    ? path.resolve(process.cwd(), args.output)
    : path.join(REPO_ROOT, 'configs/generated/clash.yaml');

  if (args.validate) {
    const issues = platformValidate(config, 'clash');
    const errors = issues.filter((i) => i.severity === 'error');
    if ((args.strict && issues.length > 0) || errors.length > 0) {
      throw new Error(`Config validation failed:\n${issues.map((i) => `  ${i.severity}: ${i.message}`).join('\n')}`);
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, config);
  if (input.adBlock && !input.unified) {
    const sidecar = writeAdblockSidecar(outputPath, 'clash', {
      outputPath: args.adblockOutput
    });
    console.log(`Clash ad-block artifact written to ${sidecar.path}`);
  }
  console.log(`Clash config written to ${outputPath}`);
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = { generateClashConfig, buildInputFromArgs, parseArgs };
