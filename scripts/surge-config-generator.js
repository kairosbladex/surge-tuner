#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { loadProxySource } = require('./surge-proxy-parser');
const { formatResults, hasFailure, validateText } = require('./surge-config-validator');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CATALOG_PATH = path.join(REPO_ROOT, 'rules/services/service-catalog.json');
const BLACKMATRIX_SURGE_ROOT = 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge';

const DEFAULT_REGIONS = [
  { name: '香港节点', regex: '香港|Hong Kong|HK|HKG', type: 'url-test' },
  { name: '日本节点', regex: '日本|Japan|Tokyo|JP|NRT', type: 'url-test' },
  { name: '新加坡节点', regex: '新加坡|Singapore|SG|SGP', type: 'url-test' },
  { name: '美国节点', regex: '美国|United States|USA|US|LAX|SFO', type: 'url-test' },
  { name: '韩国节点', regex: '韩国|Korea|KR|Seoul', type: 'url-test' },
  { name: '台湾节点', regex: '台湾|Taiwan|TW|Taipei|TPE', type: 'url-test' }
];

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

function parseArgs(argv) {
  const args = {
    input: null,
    address: null,
    addressFile: null,
    output: null,
    catalog: DEFAULT_CATALOG_PATH,
    services: [],
    adBlock: false,
    validate: true,
    strict: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--input' || arg === '-i') {
      args.input = argv[++i];
    } else if (arg === '--address' || arg === '-a') {
      args.address = argv[++i];
    } else if (arg === '--address-file') {
      args.addressFile = argv[++i];
    } else if (arg === '--output' || arg === '-o') {
      args.output = argv[++i];
    } else if (arg === '--catalog') {
      args.catalog = argv[++i];
    } else if (arg === '--services') {
      args.services = splitList(argv[++i]);
    } else if (arg === '--adblock') {
      args.adBlock = true;
    } else if (arg === '--no-adblock') {
      args.adBlock = false;
    } else if (arg === '--skip-validate') {
      args.validate = false;
    } else if (arg === '--strict') {
      args.strict = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/surge-config-generator.js --input <config.json> [--output <profile.conf>]',
    '  node scripts/surge-config-generator.js --address <proxy-uri-or-subscription-url> [--services Telegram,YouTube] [--adblock] [--output <profile.conf>]',
    '  node scripts/surge-config-generator.js --address-file <subscription.txt> [--services Telegram,YouTube] [--adblock] [--output <profile.conf>]',
    '  Add --strict to fail on validation warnings, or --skip-validate for debug-only generation.',
    '',
    'Input shape:',
    '  {',
    '    "subscriptions": [{"name": "机场A", "url": "https://example.com/sub?token=xxx"}],',
    '    "services": ["Telegram", "YouTube", "ChatGPT"],',
    '    "adBlock": true',
    '  }'
  ].join('\n');
}

function splitList(value) {
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function cleanName(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (/[\r\n=,]/.test(value)) {
    throw new Error(`${field} contains unsupported characters: ${value}`);
  }
  return value.trim();
}

function cleanValue(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (/[\r\n,]/.test(value)) {
    throw new Error(`${field} contains unsupported characters: ${value}`);
  }
  return value.trim();
}

function cleanProxyLine(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (/[\r\n]/.test(value)) {
    throw new Error(`${field} contains unsupported newline characters`);
  }
  return value.trim();
}

function loadCatalog(catalogPath = DEFAULT_CATALOG_PATH) {
  const raw = readJson(catalogPath);
  const canonical = new Map();
  const aliases = new Map();

  for (const [name, item] of Object.entries(raw)) {
    const entry = {
      name,
      group: cleanName(item.group, `${name}.group`),
      rules: Array.isArray(item.rules) ? item.rules.map((rule) => cleanValue(rule, `${name}.rules`)) : [],
      policies: Array.isArray(item.policies) ? item.policies.map((policy) => cleanName(policy, `${name}.policies`)) : [],
      aliases: Array.isArray(item.aliases) ? item.aliases : []
    };
    canonical.set(name.toLowerCase(), entry);
    aliases.set(name.toLowerCase(), entry);
    for (const alias of entry.aliases) {
      aliases.set(String(alias).toLowerCase(), entry);
    }
  }

  return { canonical, aliases };
}

function normalizeSubscriptions(input) {
  if (!Array.isArray(input.subscriptions)) {
    return [];
  }

  return input.subscriptions.map((sub, index) => ({
    name: cleanName(sub.name || `机场${index + 1}`, `subscriptions[${index}].name`),
    url: cleanValue(sub.url, `subscriptions[${index}].url`),
    updateInterval: Number.isInteger(sub.updateInterval) ? sub.updateInterval : 86400
  }));
}

function normalizeProxies(input) {
  if (!Array.isArray(input.proxies)) {
    return [];
  }

  return dedupeProxyObjects(input.proxies.map((proxy, index) => {
    const name = cleanName(proxy.name, `proxies[${index}].name`);
    return {
      name,
      type: proxy.type || '',
      host: proxy.host || '',
      port: proxy.port || null,
      line: cleanProxyLine(proxy.line, `proxies[${index}].line`)
    };
  }));
}

function normalizeRegions(input) {
  const source = Array.isArray(input.regions) && input.regions.length > 0 ? input.regions : DEFAULT_REGIONS;
  return source.map((region, index) => ({
    name: cleanName(region.name, `regions[${index}].name`),
    regex: cleanValue(region.regex, `regions[${index}].regex`),
    type: cleanName(region.type || 'url-test', `regions[${index}].type`),
    url: region.url || 'http://www.gstatic.com/generate_204',
    interval: Number.isInteger(region.interval) ? region.interval : 600,
    tolerance: Number.isInteger(region.tolerance) ? region.tolerance : 50
  }));
}

function normalizeAdBlock(input) {
  if (typeof input.adBlock === 'boolean') {
    return { enabled: input.adBlock, mitm: input.adBlock };
  }
  if (input.adBlock && typeof input.adBlock === 'object') {
    return {
      enabled: Boolean(input.adBlock.enabled),
      mitm: input.adBlock.mitm !== false
    };
  }
  return { enabled: false, mitm: false };
}

function resolveServices(serviceNames, catalog) {
  const selected = Array.isArray(serviceNames) ? serviceNames : [];
  const groups = new Map();
  const rules = [];

  for (const rawName of selected) {
    const key = String(rawName).toLowerCase();
    const entry = catalog.aliases.get(key);
    if (!entry) {
      throw new Error(`Unknown service: ${rawName}`);
    }

    if (!groups.has(entry.group)) {
      groups.set(entry.group, []);
    }
    groups.set(entry.group, mergeUnique(groups.get(entry.group), entry.policies));

    for (const rule of entry.rules) {
      rules.push({ path: rule, policy: entry.group });
    }
  }

  return { groups, rules };
}

function mergeUnique(left, right) {
  const out = [...left];
  for (const value of right) {
    if (!out.includes(value)) {
      out.push(value);
    }
  }
  return out;
}

function ensureGroup(groupMap, group, policies) {
  if (groupMap.has(group)) {
    groupMap.set(group, mergeUnique(groupMap.get(group), policies));
  } else {
    groupMap.set(group, [...policies]);
  }
}

function remoteRuleUrl(rulePath) {
  if (/^https?:\/\//i.test(rulePath)) {
    return rulePath;
  }
  return `${BLACKMATRIX_SURGE_ROOT}/${rulePath}`;
}

function section(name, lines) {
  return [`[${name}]`, ...lines, ''].join('\n');
}

function generateSurgeConfig(input, options = {}) {
  const catalog = options.catalog || loadCatalog(options.catalogPath || DEFAULT_CATALOG_PATH);
  const subscriptions = normalizeSubscriptions(input);
  const proxies = normalizeProxies(input);
  if (subscriptions.length === 0 && proxies.length === 0) {
    throw new Error('subscriptions or proxies must contain at least one entry');
  }
  const regions = normalizeRegions(input);
  const adBlock = normalizeAdBlock(input);
  const serviceSelection = resolveServices(input.services, catalog);
  const subscriptionNames = subscriptions.map((sub) => sub.name).join(', ');
  const proxyNames = proxies.map((proxy) => proxy.name);
  const finalPolicy = cleanName(input.finalPolicy || '兜底分流', 'finalPolicy');

  const general = [
    'ipv6 = false',
    'bypass-system = true',
    'bypass-tun = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10',
    'skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, 17.0.0.0/8, localhost, *.local',
    'always-real-ip = *.apple.com, *.icloud.com, *.icloud-content.com, *.mzstatic.com, *.apple-cloudkit.com, *.push.apple.com',
    'exclude-simple-hostnames = true',
    'enhanced-mode-by-rule = true',
    'dns-server = system, 223.5.5.5, 119.29.29.29',
    'encrypted-dns-server = https://dns.alidns.com/dns-query, https://doh.pub/dns-query',
    'dns-ipv6 = false',
    'internet-test-url = http://www.qualcomm.cn/generate_204',
    'proxy-test-url = http://www.gstatic.com/generate_204',
    'test-timeout = 3',
    'loglevel = warning'
  ];

  const proxyGroups = [];
  for (const sub of subscriptions) {
    proxyGroups.push(`${sub.name} = select, policy-path=${sub.url}, update-interval=${sub.updateInterval}`);
  }
  proxyGroups.push(formatAllGroup(proxyNames, subscriptions));
  proxyGroups.push('');

  for (const region of regions) {
    proxyGroups.push(formatRegionGroup(region, proxies, subscriptions, subscriptionNames));
  }
  proxyGroups.push('');

  const generatedGroups = new Map(serviceSelection.groups);
  ensureGroup(generatedGroups, '微软服务', ['DIRECT', '香港节点', '美国节点', 'All']);
  ensureGroup(generatedGroups, '国产应用', ['DIRECT', '香港节点', '美国节点', '日本节点']);
  ensureGroup(generatedGroups, finalPolicy, ['DIRECT', '香港节点', '美国节点', '新加坡节点', '日本节点', 'All']);

  for (const [group, policies] of generatedGroups.entries()) {
    proxyGroups.push(`${group} = select, ${policies.join(', ')}`);
  }

  const rules = [];
  for (const [rulePath, policy] of LOCAL_BASE_RULES) {
    rules.push(`RULE-SET,${rulePath},${policy}`);
  }
  if (adBlock.enabled) {
    for (const [rulePath, policy] of LOCAL_ADBLOCK_RULES) {
      rules.push(`RULE-SET,${rulePath},${policy}`);
    }
  }
  rules.push('RULE-SET,rulesets/ChinaApps.list,DIRECT');
  rules.push('RULE-SET,rulesets/ChinaIP.list,DIRECT');

  for (const rule of serviceSelection.rules) {
    rules.push(`RULE-SET,${remoteRuleUrl(rule.path)},${rule.policy}`);
  }

  const customRules = Array.isArray(input.rules) ? input.rules : [];
  for (const customRule of customRules) {
    rules.push(formatCustomRule(customRule));
  }

  rules.push('GEOIP,CN,DIRECT');
  rules.push(`FINAL,${finalPolicy}`);

  const output = [
    '; Generated by scripts/surge-config-generator.js',
    section('General', general),
    section('Proxy', proxies.length > 0 ? proxies.map((proxy) => proxy.line) : ['; Subscription nodes are managed by policy-path entries in [Proxy Group].']),
    section('Proxy Group', proxyGroups),
    section('Rule', rules)
  ];

  if (adBlock.enabled && adBlock.mitm) {
    output.push(section('MITM', [
      'enable = true',
      'skip-server-cert-verify = true',
      'hostname = -*.apple.com, -*.icloud.com, -*.mzstatic.com, -*.crashlytics.com, *.pangle.io, *.pangleglobal.com, *.gdt.qq.com, *.ad.qq.com, *.doubleclick.net, *.googlesyndication.com, *.googleadservices.com, *.appsflyer.com, *.adjust.com'
    ]));
    output.push(section('Script', [
      'http-response ^https?://.* requires-body = true script-path = scripts/ad-block-all.js',
      'http-request ^https?://.* script-path = scripts/anti-tracking.js',
      'http-response ^https?://.* script-path = scripts/anti-tracking.js'
    ]));
  }

  return `${output.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function formatCustomRule(rule) {
  if (!rule || typeof rule !== 'object') {
    throw new Error('custom rule must be an object');
  }
  const type = cleanName(rule.type, 'rule.type').toUpperCase();
  const value = cleanValue(rule.value, 'rule.value');
  const policy = cleanName(rule.policy, 'rule.policy');
  return `${type},${value},${policy}`;
}

function formatAllGroup(proxyNames, subscriptions) {
  const parts = ['All = select'];
  parts.push(...proxyNames);
  if (subscriptions.length > 0) {
    parts.push(`include-other-group="${subscriptions.map((sub) => sub.name).join(', ')}"`);
  }
  if (parts.length === 1) {
    parts.push('DIRECT');
  }
  return parts.join(', ');
}

function formatRegionGroup(region, proxies, subscriptions, subscriptionNames) {
  const matchedProxyNames = proxies
    .filter((proxy) => new RegExp(region.regex, 'i').test(proxy.name))
    .map((proxy) => proxy.name);

  if (matchedProxyNames.length > 0) {
    const parts = [`${region.name} = ${region.type}`, ...matchedProxyNames];
    if (subscriptions.length > 0) {
      parts.push(`policy-regex-filter=${region.regex}`, `include-other-group="${subscriptionNames}"`);
    }
    if (region.type === 'url-test') {
      parts.push(`url=${region.url}`, `interval=${region.interval}`, `tolerance=${region.tolerance}`);
    }
    return parts.join(', ');
  }

  if (subscriptions.length > 0) {
    const parts = [
      `${region.name} = ${region.type}`,
      `policy-regex-filter=${region.regex}`,
      `include-other-group="${subscriptionNames}"`
    ];
    if (region.type === 'url-test') {
      parts.push(`url=${region.url}`, `interval=${region.interval}`, `tolerance=${region.tolerance}`);
    }
    return parts.join(', ');
  }

  return `${region.name} = select, All`;
}

function dedupeProxyObjects(proxies) {
  const seen = new Map();
  return proxies.map((proxy) => {
    const count = seen.get(proxy.name) || 0;
    seen.set(proxy.name, count + 1);
    if (count === 0) return proxy;

    const nextName = `${proxy.name} ${count + 1}`;
    return {
      ...proxy,
      name: nextName,
      line: proxy.line.replace(`${proxy.name} = `, `${nextName} = `)
    };
  });
}

async function buildInputFromArgs(args) {
  if (args.input) {
    return readJson(path.resolve(process.cwd(), args.input));
  }

  const proxies = await loadProxySource({
    address: args.address,
    addressFile: args.addressFile ? path.resolve(process.cwd(), args.addressFile) : null
  });
  return {
    proxies,
    services: args.services,
    adBlock: args.adBlock
  };
}

function validateGeneratedConfig(config, filePath, options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const result = {
    file: path.resolve(filePath || path.join(repoRoot, 'configs/generated/stdout.conf')),
    issues: validateText(config, {
      repoRoot,
      filePath: path.resolve(filePath || path.join(repoRoot, 'configs/generated/stdout.conf'))
    })
  };

  if (hasFailure([result], Boolean(options.strict))) {
    throw new Error(`Generated config failed validation:\n${formatResults([result])}`);
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.input && !args.address && !args.addressFile)) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const catalogPath = path.resolve(process.cwd(), args.catalog);
  const input = await buildInputFromArgs(args);
  const config = generateSurgeConfig(input, {
    catalogPath
  });
  const outputPath = args.output ? path.resolve(process.cwd(), args.output) : path.join(REPO_ROOT, 'configs/generated/stdout.conf');

  if (args.validate) {
    const result = validateGeneratedConfig(config, outputPath, {
      strict: args.strict
    });
    const warnings = result.issues.filter((issue) => issue.severity === 'warning');
    if (warnings.length > 0) {
      process.stderr.write(`Generated config validation warnings:\n${formatResults([{ ...result, issues: warnings }])}\n`);
    }
  }

  if (args.output) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, config);
  } else {
    process.stdout.write(config);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_REGIONS,
  loadCatalog,
  generateSurgeConfig,
  buildInputFromArgs,
  validateGeneratedConfig
};
