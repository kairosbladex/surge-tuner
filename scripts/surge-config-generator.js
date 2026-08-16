#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { formatResults, hasFailure, validateText } = require('./surge-config-validator');
const { parseGeneratorArgs, buildGeneratorInput, runGeneratorCli } = require('./generator-common');
const { writeAdblockSidecar } = require('./adblock-artifacts');
const { MITM_HOSTNAMES, renderSurgeScriptLines } = require('./adblock-shared');
// 共享逻辑（默认区域/服务目录加载/输入归一化/服务解析等）统一来自 platform-base；
// REPO_ROOT、DEFAULT_CATALOG_PATH、DEFAULT_REGIONS 与原私有拷贝内容一致。
const {
  REPO_ROOT,
  DEFAULT_CATALOG_PATH,
  DEFAULT_REGIONS,
  loadCatalog,
  normalizeSubscriptions,
  normalizeProxies,
  normalizeRegions,
  normalizeAdBlock: baseNormalizeAdBlock,
  resolveServices,
  cleanName,
  cleanValue,
  ensureGroup,
  remoteRuleUrl: baseRemoteRuleUrl
} = require('./platform-base');

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

// ── CLI ─────────────────────────────────────────────────────────────────────────

// surge 的 flag 集与其余三个平台一致，唯一差异是 catalog 默认值（经 extraFlags 表达）。
function parseArgs(argv) {
  return parseGeneratorArgs(argv, { catalog: DEFAULT_CATALOG_PATH });
}

// usage 文案逐字保留（CLI 行为零容忍）；五段式主流程已下沉 generator-common。
const USAGE = [
  'Usage:',
  '  node scripts/surge-config-generator.js --input <config.json> [--output <profile.conf>]',
  '  node scripts/surge-config-generator.js --address <proxy-uri-or-subscription-url> [--services Telegram,YouTube] [--adblock] [--output <profile.conf>]',
  '  node scripts/surge-config-generator.js --addresses <file-or-json-array> [--preset common] [--discover-rules] [--adblock] [--output <profile.conf>]',
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

async function buildInputFromArgs(args) {
  return buildGeneratorInput(args);
}

// platform-base 的 normalizeAdBlock 布尔分支为 `mitm: input.adBlock !== false`；
// Surge 的历史语义是 mitm 严格等于开关本身（adBlock 缺省 undefined → enabled/mitm 均 false）。
// 这里包一层锁定 Surge 现状语义，不随 base 漂移。
function normalizeAdBlock(input) {
  if (typeof input.adBlock === 'boolean') {
    return { enabled: input.adBlock, mitm: input.adBlock };
  }
  return baseNormalizeAdBlock(input);
}

// base 版 remoteRuleUrl 需要 platform 参数；Surge 固定使用 Surge 规则 root。
function remoteRuleUrl(rulePath) {
  return baseRemoteRuleUrl(rulePath, 'surge');
}

function section(name, lines) {
  return [`[${name}]`, ...lines, ''].join('\n');
}

function generateSurgeConfig(input, options = {}) {
  if (input && input.unified === true) {
    return generateUnifiedSurgeConfig(input, options);
  }
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
      `hostname = ${MITM_HOSTNAMES.join(', ')}`
    ]));
    output.push(section('Script', renderSurgeScriptLines()));
  }

  return `${output.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

// ── 一体化模式（--unified）────────────────────────────────────────────────────
// 把主配置 + 去广告 + MITM 合并到一个 .conf 文件，订阅用 policy-path 引用。
// 参考用户本机 Surge 配置风格：emoji 策略组 + smart 类型 + ACL4SSR 远程规则集。

const ACL4SSR_BASE = 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash';

// 服务名 → ACL4SSR 规则集映射。未列出的服务回退到 blackmatrix7。
const ACL4SSR_SERVICE_RULESETS = {
  Telegram: { path: 'Telegram.list', group: '♻️ 自动选择' },
  YouTube: { path: 'Ruleset/YouTube.list', group: '📹 油管视频' },
  Netflix: { path: 'Ruleset/Netflix.list', group: '🎥 奈飞视频' },
  OpenAI: { path: 'Ruleset/OpenAi.list', group: '💬 OpenAI 美国' },
  ChatGPT: { path: 'Ruleset/OpenAi.list', group: '💬 OpenAI 美国' },
  Microsoft: { path: 'Microsoft.list', group: 'Ⓜ️ 微软服务' },
  OneDrive: { path: 'OneDrive.list', group: 'Ⓜ️ 微软云盘' },
  Apple: { path: 'Apple.list', group: '🍎 苹果服务' },
  Spotify: { path: 'Ruleset/Spotify.list', group: '🌍 国外媒体' },
  Steam: { path: 'Ruleset/Steam.list', group: '🎮 游戏平台' },
  Bilibili: { path: 'Ruleset/Bilibili.list', group: '📺 哔哩哔哩' },
  Bahamut: { path: 'Ruleset/Bahamut.list', group: '📺 巴哈姆特' },
  NetEaseMusic: { path: 'Ruleset/NetEaseMusic.list', group: '🎶 网易音乐' },
  GoogleFCM: { path: 'Ruleset/GoogleFCM.list', group: '📢 谷歌FCM' }
};

const ACL4SSR_ADBLOCK_RULESETS = [
  { path: 'BanAD.list', group: '🛑 广告拦截' },
  { path: 'BanProgramAD.list', group: '🍃 应用净化' }
];

// catalog group 名 → unified emoji group 名映射。
// catalog 里有些服务自带独立 group（如 Instagram/Spotify），unified 模式没有对应组，
// 统一归到 🌍 国外媒体。
const CATALOG_GROUP_TO_UNIFIED = {
  Instagram: '🌍 国外媒体',
  Spotify: '🌍 国外媒体',
  GitHub: '🚀 节点选择',
  Google: '♻️ 自动选择',
  Twitter: '🌍 国外媒体',
  YouTube: '📹 油管视频',
  Netflix: '🎥 奈飞视频',
  Telegram: '📲 电报消息',
  OpenAI: '💬 OpenAi',
  ChatGPT: '💬 OpenAi',
  Microsoft: 'Ⓜ️ 微软服务',
  OneDrive: 'Ⓜ️ 微软云盘',
  Apple: '🍎 苹果服务',
  Steam: '🎮 游戏平台',
  Bilibili: '📺 哔哩哔哩',
  Bahamut: '📺 巴哈姆特',
  NetEaseMusic: '🎶 网易音乐',
  GoogleFCM: '📢 谷歌FCM',
  AI服务: '💬 OpenAi'
};

function mapCatalogGroupToUnified(group) {
  return CATALOG_GROUP_TO_UNIFIED[group] || group;
}

const UNIFIED_REGION_GROUPS = [
  { emoji: '🇭🇰', name: '香港节点', regex: '(🇭🇰)|(港)|(Hong)|(HK)' },
  { emoji: '🇨🇳', name: '台湾节点', regex: '(🇨🇳)|(台)|(Tai)|(TW)' },
  { emoji: '🇺🇲', name: '美国节点', regex: '(🇺🇸)|(美)|(States)|(US)|(USA)|(Los)|(Las)' },
  { emoji: '🇯🇵', name: '日本节点', regex: '(🇯🇵)|(日本)|(Japan)|(JP)' },
  { emoji: '🇸🇬', name: '狮城节点', regex: '(🇸🇬)|(新)|(Singapore)|(SG)' },
  { emoji: '🇰🇷', name: '韩国节点', regex: '(🇰🇷)|(韩)|(Korea)|(KR)' }
];

function buildUnifiedSubscriptionEntries(subscriptions) {
  // 一体化模式：固定输出三个订阅位（手动切换/备用订阅/新订阅），让用户后续在 Surge UI 里替换 URL。
  // 如果用户提供了 subscriptions，则用提供的 URL 填充到"新订阅"位。
  const primaryUrl = subscriptions[0] ? subscriptions[0].url : '';
  const primaryName = subscriptions[0] ? subscriptions[0].name : '新订阅';

  // 命名与用户本机配置一致
  const entries = [
    { name: '🚀 手动切换', url: '', comment: '手动切换（在 Surge UI 选择节点）' },
    { name: '🔗 备用订阅', url: '', comment: '备用订阅 URL，留空则不引用' },
    { name: '🧩 新订阅', url: primaryUrl, comment: primaryName }
  ];
  return entries;
}

function generateUnifiedSurgeConfig(input, options = {}) {
  const catalog = options.catalog || loadCatalog(options.catalogPath || DEFAULT_CATALOG_PATH);
  const subscriptions = normalizeSubscriptions(input);
  if (subscriptions.length === 0 && !Array.isArray(input.proxies)) {
    throw new Error('unified mode requires at least one subscription (subscriptions[].url)');
  }

  const adBlock = normalizeAdBlock(input);
  const serviceSelection = resolveServices(input.services, catalog);
  const subEntries = buildUnifiedSubscriptionEntries(subscriptions);
  const subscriptionGroupNames = subEntries.map((e) => e.name).join(',');
  const testUrl = 'http://www.gstatic.com/generate_204';

  // [General]
  const general = [
    '# > 日志级别',
    'loglevel = notify',
    'show-error-page-for-reject = true',
    '# > Wi-Fi 访问',
    'allow-wifi-access = false',
    '# > All Hybrid 网络并发',
    'all-hybrid = false',
    '# > IPv6 支持（默认关闭）',
    'ipv6 = false',
    '# > 测试超时（秒）',
    'test-timeout = 5',
    '# > Internet 测试 URL',
    'internet-test-url = http://www.baidu.com',
    '# > 代理测速 URL',
    `proxy-test-url = ${testUrl}`,
    '# > GeoIP 数据库',
    'geoip-maxmind-url = https://github.com/Hackl0us/GeoIP2-CN/raw/release/Country.mmdb',
    '# > 排除简单主机名',
    'exclude-simple-hostnames = true',
    '# > DNS 服务器',
    'dns-server = 223.5.5.5, 119.29.29.29',
    'hijack-dns = 8.8.8.8:53, 8.8.4.4:53',
    '# > 从 /etc/hosts 读取 DNS 记录',
    'read-etc-hosts = true',
    '# > 跳过代理',
    'skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, 17.0.0.0/8, localhost, *.local, *.crashlytics.com',
    '# > Always Real IP Hosts',
    'always-real-ip = *.srv.nintendo.net, *.stun.playstation.net, xbox.*.microsoft.com, *.xboxlive.com, *.battlenet.com.cn, *.battlenet.com, *.blzstatic.cn, *.battle.net'
  ];

  // [Proxy Group]
  const proxyGroups = [];

  // 主选择组
  proxyGroups.push('🚀 节点选择 = select, "♻️ 自动选择", "🌐 亚洲优选", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "🇰🇷 韩国节点", "🚀 手动切换", "🧩 新订阅", "🔗 备用订阅", DIRECT');

  // 订阅位（policy-path 引用订阅 URL）
  for (const entry of subEntries) {
    if (entry.url) {
      proxyGroups.push(`${entry.name} = select, policy-path=${entry.url}, url=${testUrl}, interval=300`);
    } else {
      proxyGroups.push(`${entry.name} = select, DIRECT`);
    }
  }

  // 自动选择（smart 类型，引用所有订阅位）
  proxyGroups.push(`♻️ 自动选择 = smart, include-other-group="${subscriptionGroupNames}", url=${testUrl}, interval=300, tolerance=100, no-alert=true, hidden=false`);

  // OpenAI / Claude 专用组（smart + 美国 regex）
  proxyGroups.push(`🤖 Claude Codex = smart, include-other-group="${subscriptionGroupNames}", policy-regex-filter=(🇯🇵)|(日本)|(Japan)|(JP), url=https://chatgpt.com/cdn-cgi/trace, interval=180, tolerance=80, no-alert=true`);
  proxyGroups.push(`💬 OpenAI 美国 = smart, include-other-group="${subscriptionGroupNames}", policy-regex-filter=(🇺🇸)|(🇺🇲)|(美)|(美国)|(America)|(United)|(States)|(US)|(USA)|(Los)|(Las)|(San)|(Seattle)|(NY)|(Ashburn)|(Dallas), url=https://chatgpt.com/cdn-cgi/trace, interval=180, tolerance=80, no-alert=true`);
  proxyGroups.push(`🌐 亚洲优选 = smart, include-other-group="${subscriptionGroupNames}", policy-regex-filter=(🇭🇰)|(港)|(Hong)|(HK)|(🇯🇵)|(日本)|(Japan)|(JP)|(🇸🇬)|(新)|(Singapore)|(SG)|(🇨🇳)|(台)|(Tai)|(TW), url=${testUrl}, interval=180, tolerance=80, no-alert=true`);

  // 服务分流选择组（emoji 名）
  proxyGroups.push('📲 电报消息 = select, "♻️ 自动选择", "🌐 亚洲优选", "🚀 节点选择", "🇸🇬 狮城节点", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "🇰🇷 韩国节点", "🚀 手动切换", DIRECT');
  proxyGroups.push('💬 OpenAi = select, "💬 OpenAI 美国", "🇺🇲 美国节点", "🤖 Claude Codex", "♻️ 自动选择", "🚀 节点选择", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇯🇵 日本节点", "🇰🇷 韩国节点", "🚀 手动切换", DIRECT');
  proxyGroups.push('📹 油管视频 = select, "♻️ 自动选择", "🚀 节点选择", "🇸🇬 狮城节点", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "🇰🇷 韩国节点", "🚀 手动切换", DIRECT');
  proxyGroups.push('🎥 奈飞视频 = select, "🎥 奈飞节点", "🚀 节点选择"');
  proxyGroups.push('📺 巴哈姆特 = select, "🇨🇳 台湾节点", "🚀 节点选择", "🚀 手动切换", DIRECT');
  proxyGroups.push('📺 哔哩哔哩 = select, "🎯 全球直连", "🇨🇳 台湾节点", "🇭🇰 香港节点", "🔗 备用订阅"');
  proxyGroups.push('🌍 国外媒体 = select, "♻️ 自动选择", "🚀 节点选择", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "🇰🇷 韩国节点", "🚀 手动切换", DIRECT');
  proxyGroups.push('🌏 国内媒体 = select, DIRECT, "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🚀 手动切换"');
  proxyGroups.push('📢 谷歌FCM = select, DIRECT, "🚀 节点选择", "🇺🇲 美国节点", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇰🇷 韩国节点", "🚀 手动切换"');
  proxyGroups.push('Ⓜ️ 微软云盘 = select, DIRECT, "🚀 节点选择", "🇺🇲 美国节点", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇰🇷 韩国节点", "🚀 手动切换"');
  proxyGroups.push('Ⓜ️ 微软服务 = select, DIRECT, "🚀 节点选择", "🇺🇲 美国节点", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇰🇷 韩国节点", "🚀 手动切换"');
  proxyGroups.push('🍎 苹果服务 = select, DIRECT, "🚀 节点选择", "🇺🇲 美国节点", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇰🇷 韩国节点", "🚀 手动切换"');
  proxyGroups.push('🎮 游戏平台 = select, DIRECT, "🚀 节点选择", "🇺🇲 美国节点", "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇰🇷 韩国节点", "🚀 手动切换"');
  proxyGroups.push('🎶 网易音乐 = select, DIRECT, "🚀 节点选择", "♻️ 自动选择"');
  proxyGroups.push('🎯 全球直连 = select, DIRECT, "🚀 节点选择", "♻️ 自动选择"');
  proxyGroups.push('🛑 广告拦截 = select, REJECT, DIRECT');
  proxyGroups.push('🍃 应用净化 = select, REJECT, DIRECT');
  proxyGroups.push('🐟 漏网之鱼 = select, "♻️ 自动选择", "🚀 节点选择", DIRECT, "🇭🇰 香港节点", "🇨🇳 台湾节点", "🇸🇬 狮城节点", "🇯🇵 日本节点", "🇺🇲 美国节点", "🇰🇷 韩国节点", "🚀 手动切换", "🧩 新订阅", "🔗 备用订阅"');

  // 地区节点组（smart + include-other-group 引用订阅位）
  proxyGroups.push('# > 外部节点自动匹配');
  proxyGroups.push('# > 匹配到关键字，自动收纳为节点组');
  for (const region of UNIFIED_REGION_GROUPS) {
    proxyGroups.push(`${region.emoji} ${region.name} = smart, include-other-group="${subscriptionGroupNames}", policy-regex-filter=${region.regex}, url=${testUrl}, interval=300, tolerance=150`);
  }
  proxyGroups.push('🎥 奈飞节点 = select, "🇭🇰 香港节点", include-other-group="' + subscriptionGroupNames + '", policy-regex-filter=Hong');

  // [Rule]
  const rules = [];

  // 本地规则
  rules.push('DOMAIN-SUFFIX,sensorsdata.cn,DIRECT');
  rules.push('DOMAIN,sdp.asiainfo.com,DIRECT');
  rules.push('# V2EX 广告/统计');
  rules.push('DOMAIN-SUFFIX,wwads.cn,REJECT');
  rules.push('DOMAIN-SUFFIX,googlesyndication.com,REJECT');
  rules.push('DOMAIN-SUFFIX,googletagservices.com,REJECT');
  rules.push('DOMAIN-SUFFIX,googleadservices.com,REJECT');
  rules.push('DOMAIN-SUFFIX,doubleclick.net,REJECT');
  rules.push('DOMAIN-SUFFIX,google-analytics.com,REJECT');

  // Gemini / Google 专用规则
  rules.push('# Gemini 专用规则（必须在 google.com 之前）');
  rules.push('DOMAIN,gemini.google.com,"🤖 Claude Codex"');
  rules.push('DOMAIN,aistudio.google.com,"🤖 Claude Codex"');
  rules.push('DOMAIN,generativelanguage.googleapis.com,"🤖 Claude Codex"');
  rules.push('DOMAIN-SUFFIX,google.dev,"🤖 Claude Codex"');
  rules.push('DOMAIN-SUFFIX,googleapis.com,"🤖 Claude Codex"');
  rules.push('DOMAIN-KEYWORD,gemini,"🤖 Claude Codex"');
  rules.push('DOMAIN-SUFFIX,google.com,"♻️ 自动选择"');
  rules.push('DOMAIN-SUFFIX,google.com.hk,"♻️ 自动选择"');
  rules.push('DOMAIN-SUFFIX,google.com.tw,"♻️ 自动选择"');
  rules.push('DOMAIN-SUFFIX,v2ex.com,"♻️ 自动选择"');

  // Claude / OpenAI 专用规则
  rules.push('# Claude 专用规则');
  rules.push('DOMAIN-SUFFIX,anthropic.com,"🤖 Claude Codex"');
  rules.push('DOMAIN-SUFFIX,claude.ai,"🤖 Claude Codex"');
  rules.push('DOMAIN-SUFFIX,claude.com,"🤖 Claude Codex"');
  rules.push('# OpenAI / ChatGPT / Codex 专用规则');
  rules.push('DOMAIN-SUFFIX,openai.com,"💬 OpenAI 美国"');
  rules.push('DOMAIN-SUFFIX,chatgpt.com,"💬 OpenAI 美国"');
  rules.push('DOMAIN-SUFFIX,oaistatic.com,"💬 OpenAI 美国"');
  rules.push('DOMAIN-SUFFIX,oaiusercontent.com,"💬 OpenAI 美国"');

  // ACL4SSR 规则集（去广告 + 服务分流）
  rules.push('# > ACL4SSR 远程规则集');
  for (const rs of ACL4SSR_ADBLOCK_RULESETS) {
    rules.push(`RULE-SET,${ACL4SSR_BASE}/${rs.path},${rs.group},"update-interval=86400"`);
  }

  // 服务规则集：优先用 ACL4SSR，没有则回退 blackmatrix7
  const selectedServices = Array.isArray(input.services) ? input.services : [];
  const usedAcl4ssrServices = new Set();
  for (const svc of selectedServices) {
    const key = String(svc).toLowerCase();
    // 服务目录别名归一化
    const aliasEntry = catalog.aliases.get(key);
    const canonicalName = aliasEntry ? aliasEntry.name : svc;
    const acl4ssr = ACL4SSR_SERVICE_RULESETS[canonicalName];
    if (acl4ssr) {
      rules.push(`RULE-SET,${ACL4SSR_BASE}/${acl4ssr.path},${acl4ssr.group},"update-interval=86400"`);
      usedAcl4ssrServices.add(canonicalName);
    }
  }

  // 未被 ACL4SSR 覆盖的服务，回退到 blackmatrix7，并把 policy 映射到 unified emoji 组
  for (const rule of serviceSelection.rules) {
    const aliasEntry = catalog.aliases.get(String(rule.policy).toLowerCase());
    const canonicalName = aliasEntry ? aliasEntry.name : rule.policy;
    if (usedAcl4ssrServices.has(canonicalName)) continue;
    const unifiedPolicy = mapCatalogGroupToUnified(rule.policy);
    rules.push(`RULE-SET,${remoteRuleUrl(rule.path)},${unifiedPolicy}`);
  }

  // 兜底
  rules.push('GEOIP,CN,🎯 全球直连');
  rules.push('FINAL,🐟 漏网之鱼');

  // 输出
  const output = [
    '; Generated by scripts/surge-config-generator.js (unified mode)',
    '; 一体化配置：主配置 + 去广告 + MITM 合并到一个文件',
    '; 订阅用 policy-path 引用，Surge 启动时自动拉取节点',
    '',
    section('General', general),
    section('Proxy Group', proxyGroups),
    section('Rule', rules)
  ];

  // [MITM]（不含 ca-p12，留引导注释）
  if (adBlock.enabled) {
    const mitmLines = [
      '# MITM 证书安装引导：',
      '# 1. 在 Surge → 设置 → MITM → 点击"配置新 CA 证书"',
      '# 2. 按提示在系统设置中信任 Surge CA 证书',
      '# 3. 配置完成后，下面的 hostname 列表才会生效',
      '# （以下不输出 ca-p12/ca-passphrase，由 Surge 自动生成）',
      'enable = true',
      'skip-server-cert-verify = true',
      `hostname = ${MITM_HOSTNAMES.join(', ')}`
    ];
    output.push(section('MITM', mitmLines));

    // [Script]
    const scriptLines = [
      '# 去广告脚本（需要本地或远程 script-path）',
      '# 推荐使用脚本仓库：https://github.com/blackmatrix7/ios_rule_script',
      ...renderSurgeScriptLines()
    ];
    output.push(section('Script', scriptLines));
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
  return runGeneratorCli({
    platform: 'surge',
    extraFlags: { catalog: DEFAULT_CATALOG_PATH },
    generate: generateSurgeConfig,
    usage: USAGE,
    defaultOutput: 'configs/generated/stdout.conf',
    // surge 专属校验门禁：自家 validator，strict 时 warning 也算失败；非 strict 打印 warning 到 stderr
    validate: (config, outputPath, args) => {
      const result = validateGeneratedConfig(config, outputPath, {
        strict: args.strict
      });
      const warnings = result.issues.filter((issue) => issue.severity === 'warning');
      if (warnings.length > 0) {
        process.stderr.write(`Generated config validation warnings:\n${formatResults([{ ...result, issues: warnings }])}\n`);
      }
    },
    // surge 专属输出：无 --output 时写 stdout；sidecar 提示走 stderr
    emitResult: (config, outputPath, args, input) => {
      if (args.output) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, config);
        // 一体化模式不生成 sidecar（去广告已合并进主配置）
        if (input.adBlock && !input.unified) {
          const sidecar = writeAdblockSidecar(outputPath, 'surge', {
            outputPath: args.adblockOutput
          });
          process.stderr.write(`Ad-block module written to ${sidecar.path}\n`);
        }
      } else {
        process.stdout.write(config);
        if (input.adBlock && !input.unified && args.adblockOutput) {
          const sidecar = writeAdblockSidecar(args.adblockOutput, 'surge', {
            outputPath: args.adblockOutput
          });
          process.stderr.write(`Ad-block module written to ${sidecar.path}\n`);
        }
      }
    }
  });
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
  parseArgs,
  generateSurgeConfig,
  buildInputFromArgs,
  validateGeneratedConfig
};
