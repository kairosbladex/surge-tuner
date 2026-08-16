#!/usr/bin/env node
'use strict';

/**
 * adblock-installer.js — Auto-detect and install ad-blocking plugins/rules across platforms.
 *
 * Capabilities:
 *   - Surge: generate .sgmodule module file dynamically
 *   - Loon: integrate kelee.one plugins (auto-fetch list + install instructions)
 *   - QX/Clash: generate rule-provider refs to anti-ad / blackmatrix7
 *   - Custom: add user-defined domains to rulesets and MITM hostnames
 *   - All platforms: integrate online rule-sets (anti-ad, blackmatrix7)
 *
 * Usage:
 *   node scripts/adblock-installer.js --platform surge --action list
 *   node scripts/adblock-installer.js --platform surge --action generate --output custom-adblock.sgmodule
 *   node scripts/adblock-installer.js --platform surge --add-domain "*.example-ad.com" --output custom.sgmodule
 *   node scripts/adblock-installer.js --platform loon --action kelee-list
 *   node scripts/adblock-installer.js --platform all --action integrate --config <profile.conf> --output <enhanced.conf>
 */

const fs = require('fs');
const path = require('path');

const { renderSurgeScriptLines, renderLoonScriptLines } = require('./adblock-shared');

const REPO_ROOT = path.resolve(__dirname, '..');

// ── Surge Module Template ───────────────────────────────────────────────────────

const SURGE_MODULE_TEMPLATE = `#!name={{NAME}}
#!desc={{DESC}}
#!author=Proxy Tuner A2A Agent
#!system=ios
#!homepage=https://github.com/kairosbladex/surge-tuner
#!icon=

[MITM]
enable = true
skip-server-cert-verify = true
hostname = {{MITM_HOSTNAMES}}

[Rule]
{{RULES}}

[Script]
{{SCRIPTS}}
`;

// ── Online Rule Sources ─────────────────────────────────────────────────────────

const ONLINE_RULE_SOURCES = {
  'anti-ad': {
    surge: 'https://anti-ad.net/surge.txt',
    clash: 'https://anti-ad.net/clash.yaml',
    loon: 'https://anti-ad.net/surge.txt',
    quantumultx: 'https://anti-ad.net/easylist.txt'
  },
  'blackmatrix7-advertising': {
    surge: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Advertising/Advertising.list',
    clash: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Advertising/Advertising.yaml',
    loon: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Advertising/Advertising.list',
    quantumultx: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/QuantumultX/Advertising/Advertising.list'
  },
  'blackmatrix7-privacy': {
    surge: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Privacy/Privacy.list',
    clash: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Privacy/Privacy.yaml',
    loon: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Privacy/Privacy.list',
    quantumultx: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/QuantumultX/Privacy/Privacy.list'
  },
  'blackmatrix7-hijacking': {
    surge: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Hijacking/Hijacking.list',
    clash: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Hijacking/Hijacking.yaml',
    loon: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Hijacking/Hijacking.list',
    quantumultx: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/QuantumultX/Hijacking/Hijacking.list'
  }
};

// ── Capabilities per platform ───────────────────────────────────────────────────

const PLATFORM_ADBLOCK_CAPABILITIES = {
  surge: {
    moduleFormat: '.sgmodule',
    supportsScript: true,
    supportsMITM: true,
    supportsRuleSet: true,
    keleeCompatible: false, // kelee is Loon-native
    ruleSyntax: 'RULE-SET,<url>,<policy>',
    mitmSyntax: '[MITM]\nhostname = <list>',
    scriptSyntax: '[Script]\nhttp-response <pattern> script-path = <path>'
  },
  loon: {
    moduleFormat: '.plugin / .lpx',
    supportsScript: true,
    supportsMITM: true,
    supportsRuleSet: true,
    keleeCompatible: true,
    ruleSyntax: '# include "<url>", <policy>',
    mitmSyntax: '[MITM]\nhostname = <list>',
    scriptSyntax: '[Script]\nhttp-response <pattern> script-path = <path>'
  },
  quantumultx: {
    moduleFormat: '.conf / snippet',
    supportsScript: true,
    supportsMITM: true,
    supportsRuleSet: true,
    keleeCompatible: false,
    ruleSyntax: 'filter_remote/<rewrite_remote>',
    mitmSyntax: '[mitm]\nhostname = <list>',
    scriptSyntax: '[rewrite_local]\n^<url> url script-response-body <path>'
  },
  clash: {
    moduleFormat: 'YAML rule-provider',
    supportsScript: false,
    supportsMITM: false,
    supportsRuleSet: true,
    keleeCompatible: false,
    ruleSyntax: 'rule-providers:\n  <name>:\n    type: http\n    url: <url>',
    mitmSyntax: null,
    scriptSyntax: null
  }
};

// ── Generate a Surge Module ─────────────────────────────────────────────────────

function generateSurgeModule(options = {}) {
  const name = options.name || 'Custom-Ad-Block';
  const desc = options.desc || 'Custom ad-blocking module generated by Proxy Tuner A2A';
  const customDomains = Array.isArray(options.customDomains) ? options.customDomains : [];
  const useOnlineRules = options.useOnlineRules !== false;
  const onlineSources = options.onlineSources || ['blackmatrix7-advertising', 'blackmatrix7-privacy'];
  const useLocalRules = options.useLocalRules !== false;
  const extraScripts = Array.isArray(options.extraScripts) ? options.extraScripts : [];

  // MITM hostnames
  const mitmHostnames = [
    '-*.apple.com',
    '-*.icloud.com',
    '-*.mzstatic.com',
    '-*.crashlytics.com',
    '*.pangle.io',
    '*.pangleglobal.com',
    '*.gdt.qq.com',
    '*.ad.qq.com',
    '*.doubleclick.net',
    '*.googlesyndication.com',
    '*.googleadservices.com',
    '*.appsflyer.com',
    '*.adjust.com'
  ];

  for (const domain of customDomains) {
    const clean = domain.replace(/^-\s*/, '').trim();
    if (clean && !mitmHostnames.includes(clean) && !mitmHostnames.includes(`-${clean}`)) {
      mitmHostnames.push(clean);
    }
  }

  // Rules
  const rules = [];

  if (useLocalRules) {
    rules.push('RULE-SET,rulesets/SplashAd.list,REJECT');
    rules.push('RULE-SET,rulesets/InAppAd.list,REJECT');
    rules.push('RULE-SET,rulesets/Tracking.list,REJECT');
    rules.push('RULE-SET,rulesets/AdDomains.list,REJECT-TINYGIF');
  }

  if (useOnlineRules) {
    for (const source of onlineSources) {
      const sourceDef = ONLINE_RULE_SOURCES[source];
      if (sourceDef && sourceDef.surge) {
        rules.push(`RULE-SET,${sourceDef.surge},REJECT`);
      }
    }
  }

  for (const domain of customDomains) {
    const clean = domain.replace(/^[*-]+\s*/, '').trim();
    if (clean && !clean.startsWith('*.') && !clean.includes('/')) {
      rules.push(`DOMAIN-SUFFIX,${clean},REJECT`);
    }
  }

  // Scripts
  const scripts = renderSurgeScriptLines();

  for (const extra of extraScripts) {
    scripts.push(extra);
  }

  // Render
  let output = SURGE_MODULE_TEMPLATE;
  output = output.replace('{{NAME}}', name);
  output = output.replace('{{DESC}}', desc);
  output = output.replace('{{MITM_HOSTNAMES}}', mitmHostnames.join(', '));
  output = output.replace('{{RULES}}', rules.join('\n'));
  output = output.replace('{{SCRIPTS}}', scripts.join('\n'));

  return output;
}

// ── Generate Loon Plugin Config ─────────────────────────────────────────────────

function generateLoonAdblockConfig(options = {}) {
  const useKelee = options.useKelee !== false;
  const useOnlineRules = options.useOnlineRules !== false;
  const customDomains = Array.isArray(options.customDomains) ? options.customDomains : [];
  const onlineSources = options.onlineSources || ['anti-ad', 'blackmatrix7-advertising', 'blackmatrix7-privacy'];

  const lines = [
    '; Generated by proxy-tuner adblock-installer.js for Loon',
    ''
  ];

  // MITM
  const mitmHostnames = [
    '-*.apple.com',
    '-*.icloud.com',
    '-*.mzstatic.com',
    '*.pangle.io',
    '*.pangleglobal.com',
    '*.gdt.qq.com',
    '*.ad.qq.com',
    '*.doubleclick.net',
    '*.googlesyndication.com',
    '*.googleadservices.com',
    '*.appsflyer.com',
    '*.adjust.com'
  ];

  for (const domain of customDomains) {
    const clean = domain.replace(/^-\s*/, '').trim();
    if (clean && !mitmHostnames.includes(clean) && !mitmHostnames.includes(`-${clean}`)) {
      mitmHostnames.push(clean);
    }
  }

  lines.push('[MITM]');
  lines.push('enable = true');
  lines.push('skip-server-cert-verify = true');
  lines.push('hostname = ' + mitmHostnames.join(', '));
  lines.push('');

  // Rules
  lines.push('[Rule]');
  if (useOnlineRules) {
    for (const source of onlineSources) {
      const sourceDef = ONLINE_RULE_SOURCES[source];
      if (sourceDef && sourceDef.loon) {
        lines.push(`# include "${sourceDef.loon}", REJECT`);
      }
    }
  }
  for (const domain of customDomains) {
    const clean = domain.replace(/^[*-]+\s*/, '').trim();
    if (clean) {
      lines.push(`DOMAIN-SUFFIX,${clean},REJECT`);
    }
  }
  lines.push('');

  // Scripts
  lines.push('[Script]');
  for (const scriptLine of renderLoonScriptLines()) {
    lines.push(scriptLine);
  }
  lines.push('');

  // kelee.one plugin references
  if (useKelee) {
    lines.push('; kelee.one plugin references (install via Loon app → Plugin → Import)');
    lines.push('; See: https://hub.kelee.one/');
    lines.push('; Recommended plugins:');
    lines.push('; - 广告平台拦截器');
    lines.push('; - 去广告合集');
    lines.push('; - 隐私保护');
    lines.push('; To auto-fetch: bash kelee/fetch-plugins.sh');
  }

  return lines.join('\n');
}

// ── Generate Clash Rule-Providers ───────────────────────────────────────────────

function generateClashRuleProviders(options = {}) {
  const onlineSources = options.onlineSources || ['anti-ad', 'blackmatrix7-advertising', 'blackmatrix7-privacy'];
  const customDomains = Array.isArray(options.customDomains) ? options.customDomains : [];

  const lines = [
    '# Generated by proxy-tuner adblock-installer.js for Clash',
    '# Add these rule-providers and rules to your Clash YAML',
    ''
  ];

  lines.push('rule-providers:');
  for (const source of onlineSources) {
    const sourceDef = ONLINE_RULE_SOURCES[source];
    if (sourceDef && sourceDef.clash) {
      const name = source.replace(/[^a-zA-Z0-9]/g, '_');
      lines.push(`  ${name}:`);
      lines.push(`    type: http`);
      lines.push(`    behavior: classical`);
      lines.push(`    url: "${sourceDef.clash}"`);
      lines.push(`    interval: 86400`);
      lines.push(`    path: ./rules/${name}.yaml`);
    }
  }
  lines.push('');

  lines.push('rules:');
  for (const source of onlineSources) {
    const name = source.replace(/[^a-zA-Z0-9]/g, '_');
    lines.push(`  - RULE-SET,${name},REJECT`);
  }
  for (const domain of customDomains) {
    const clean = domain.replace(/^[*-]+\s*/, '').trim();
    if (clean) {
      lines.push(`  - DOMAIN-SUFFIX,${clean},REJECT`);
    }
  }
  lines.push('  - GEOIP,CN,DIRECT');
  lines.push('  - MATCH,兜底分流');

  return lines.join('\n') + '\n';
}

// ── Generate QX Adblock Config ─────────────────────────────────────────────────

function generateQXAdblockConfig(options = {}) {
  const onlineSources = options.onlineSources || ['anti-ad', 'blackmatrix7-advertising', 'blackmatrix7-privacy'];
  const customDomains = Array.isArray(options.customDomains) ? options.customDomains : [];

  const lines = [
    '; Generated by proxy-tuner adblock-installer.js for Quantumult X',
    ''
  ];

  // filter_remote
  lines.push('[filter_remote]');
  for (const source of onlineSources) {
    const sourceDef = ONLINE_RULE_SOURCES[source];
    if (sourceDef && sourceDef.quantumultx) {
      const tag = source.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '');
      lines.push(`${sourceDef.quantumultx}, tag=${tag}, policy=REJECT, enabled=true`);
    }
  }
  lines.push('');

  // filter_local (custom domains)
  if (customDomains.length > 0) {
    lines.push('[filter_local]');
    for (const domain of customDomains) {
      const clean = domain.replace(/^[*-]+\s*/, '').trim();
      if (clean) {
        lines.push(`HOST-SUFFIX,${clean},REJECT`);
      }
    }
    lines.push('');
  }

  // MITM
  const mitmHostnames = [
    '-*.apple.com',
    '-*.icloud.com',
    '-*.mzstatic.com',
    '*.pangle.io',
    '*.pangleglobal.com',
    '*.gdt.qq.com',
    '*.ad.qq.com',
    '*.doubleclick.net',
    '*.googlesyndication.com',
    '*.googleadservices.com',
    '*.appsflyer.com',
    '*.adjust.com'
  ];

  for (const domain of customDomains) {
    const clean = domain.replace(/^-\s*/, '').trim();
    if (clean && !mitmHostnames.includes(clean) && !mitmHostnames.includes(`-${clean}`)) {
      mitmHostnames.push(clean);
    }
  }

  lines.push('[mitm]');
  lines.push('hostname = ' + mitmHostnames.join(', '));
  lines.push('skip-server-cert-verify = true');
  lines.push('');

  // Rewrite (scripts)
  lines.push('[rewrite_local]');
  lines.push('^https?://.* url script-response-body scripts/ad-block-all.js');
  lines.push('^https?://.* url script-request-header scripts/anti-tracking.js');
  lines.push('^https?://.* url script-response-body scripts/anti-tracking.js');

  return lines.join('\n') + '\n';
}

// ── Integrate AdBlock into Existing Config ──────────────────────────────────────

function integrateAdblockIntoConfig(configText, platform, options = {}) {
  const customDomains = Array.isArray(options.customDomains) ? options.customDomains : [];
  const onlineSources = options.onlineSources || ['anti-ad', 'blackmatrix7-advertising', 'blackmatrix7-privacy'];

  let result = configText;

  if (platform === 'surge') {
    // Add RULE-SET lines before FINAL
    const adblockRules = [];
    for (const source of onlineSources) {
      const def = ONLINE_RULE_SOURCES[source];
      if (def && def.surge) {
        adblockRules.push(`RULE-SET,${def.surge},REJECT`);
      }
    }
    for (const domain of customDomains) {
      const clean = domain.replace(/^[*-]+\s*/, '').trim();
      if (clean) {
        adblockRules.push(`DOMAIN-SUFFIX,${clean},REJECT`);
      }
    }

    // Insert before FINAL
    result = result.replace(/(FINAL,.*)/, adblockRules.join('\n') + '\n$1');

    // Update MITM section if present
    if (result.includes('[MITM]')) {
      const mitmMatch = result.match(/hostname\s*=\s*([^\n]+)/);
      if (mitmMatch) {
        const existing = mitmMatch[1];
        for (const domain of customDomains) {
          const clean = domain.replace(/^-\s*/, '').trim();
          if (clean && !existing.includes(clean)) {
            result = result.replace(`hostname = ${existing}`, `hostname = ${existing}, ${clean}`);
          }
        }
      }
    }
  } else if (platform === 'clash') {
    // Add rule-providers before rules
    const providerEntries = [];
    const ruleEntries = [];
    for (const source of onlineSources) {
      const def = ONLINE_RULE_SOURCES[source];
      if (def && def.clash) {
        const name = source.replace(/[^a-zA-Z0-9]/g, '_');
        providerEntries.push(`  ${name}:`);
        providerEntries.push(`    type: http`);
        providerEntries.push(`    behavior: classical`);
        providerEntries.push(`    url: "${def.clash}"`);
        providerEntries.push(`    interval: 86400`);
        providerEntries.push(`    path: ./rules/${name}.yaml`);
        ruleEntries.push(`  - RULE-SET,${name},REJECT`);
      }
    }
    for (const domain of customDomains) {
      const clean = domain.replace(/^[*-]+\s*/, '').trim();
      if (clean) {
        ruleEntries.push(`  - DOMAIN-SUFFIX,${clean},REJECT`);
      }
    }

    // Insert rule-providers
    if (!result.includes('rule-providers:')) {
      result = result.replace(/^rules:/m, 'rule-providers:\n' + providerEntries.join('\n') + '\n\nrules:');
    }
    // Insert ad rules before MATCH
    result = result.replace(/(  - MATCH,.*)/, ruleEntries.join('\n') + '\n$1');
  }

  return result;
}

// ── List Available AdBlock Sources ──────────────────────────────────────────────

function listSources() {
  console.log('Available online ad-block rule sources:\n');
  for (const [key, def] of Object.entries(ONLINE_RULE_SOURCES)) {
    console.log(`  ${key}:`);
    for (const [platform, url] of Object.entries(def)) {
      console.log(`    ${platform}: ${url}`);
    }
    console.log('');
  }
}

function listPlatformCapabilities() {
  console.log('Ad-block capabilities per platform:\n');
  for (const [platform, caps] of Object.entries(PLATFORM_ADBLOCK_CAPABILITIES)) {
    console.log(`  ${platform}:`);
    console.log(`    Module format: ${caps.moduleFormat}`);
    console.log(`    Script support: ${caps.supportsScript}`);
    console.log(`    MITM support: ${caps.supportsMITM}`);
    console.log(`    kelee.one compatible: ${caps.keleeCompatible}`);
    console.log('');
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    platform: 'surge', action: 'generate', name: null, desc: null,
    output: null, config: null, 'add-domain': [], useOnline: true,
    onlineSources: [], list: false, showCapabilities: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--platform') args.platform = argv[++i];
    else if (arg === '--action') args.action = argv[++i];
    else if (arg === '--name') args.name = argv[++i];
    else if (arg === '--desc') args.desc = argv[++i];
    else if (arg === '--output' || arg === '-o') args.output = argv[++i];
    else if (arg === '--config') args.config = argv[++i];
    else if (arg === '--add-domain') args['add-domain'].push(argv[++i]);
    else if (arg === '--no-online') args.useOnline = false;
    else if (arg === '--online-source') args.onlineSources.push(argv[++i]);
    else if (arg === '--list') args.list = true;
    else if (arg === '--capabilities') args.showCapabilities = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/adblock-installer.js --platform surge --action generate --output adblock.sgmodule',
    '  node scripts/adblock-installer.js --platform surge --add-domain "*.my-ad.com" --output custom.sgmodule',
    '  node scripts/adblock-installer.js --platform loon --action kelee-list',
    '  node scripts/adblock-installer.js --platform all --action integrate --config profile.conf --output enhanced.conf',
    '  node scripts/adblock-installer.js --list                          # list rule sources',
    '  node scripts/adblock-installer.js --capabilities                  # show platform support',
    '',
    'Actions: generate, integrate, kelee-list, list',
    'Platforms: surge, loon, quantumultx, clash, all'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) { console.log(usage()); return; }
  if (args.list) { listSources(); return; }
  if (args.showCapabilities) { listPlatformCapabilities(); return; }

  const options = {
    customDomains: args['add-domain'],
    useOnlineRules: args.useOnline,
    onlineSources: args.onlineSources.length > 0 ? args.onlineSources : undefined
  };

  if (args.action === 'generate') {
    let output;
    if (args.platform === 'surge') {
      output = generateSurgeModule({ name: args.name || undefined, desc: args.desc || undefined, ...options });
    } else if (args.platform === 'loon') {
      output = generateLoonAdblockConfig(options);
    } else if (args.platform === 'quantumultx') {
      output = generateQXAdblockConfig(options);
    } else if (args.platform === 'clash') {
      output = generateClashRuleProviders(options);
    } else {
      console.error(`Unsupported platform: ${args.platform}`);
      process.exit(1);
    }

    if (args.output) {
      const outPath = path.resolve(process.cwd(), args.output);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, output);
      console.log(`Ad-block config written to ${outPath}`);
    } else {
      console.log(output);
    }
  } else if (args.action === 'integrate') {
    if (!args.config) { console.error('--config is required for integrate action'); process.exit(1); }
    const configText = fs.readFileSync(path.resolve(process.cwd(), args.config), 'utf8');

    const platforms = args.platform === 'all'
      ? ['surge', 'loon', 'quantumultx', 'clash']
      : [args.platform];

    for (const platform of platforms) {
      const result = integrateAdblockIntoConfig(configText, platform, options);
      const outPath = args.output
        ? path.resolve(process.cwd(), args.output.replace(/\.\w+$/, `.${platform}$&`))
        : path.join(REPO_ROOT, `configs/generated/enhanced-${platform}.conf`);

      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, result);
      console.log(`Enhanced ${platform} config written to ${outPath}`);
    }
  } else if (args.action === 'kelee-list') {
    console.log('Fetching kelee.one plugin list...');
    console.log('Run: bash kelee/fetch-plugins.sh');
    console.log('Then check: kelee/list.json');
    console.log('\nRecommended kelee.one plugins for ad-block:');
    console.log('  - 广告平台拦截器 (Ad Platform Blocker)');
    console.log('  - 去广告合集 (Ad Block Collection)');
    console.log('  - 隐私保护 (Privacy Protection)');
    console.log('\nInstall via Loon app → Configuration → Plugin → + → Import from URL');
  }
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = {
  generateSurgeModule,
  generateLoonAdblockConfig,
  generateClashRuleProviders,
  generateQXAdblockConfig,
  integrateAdblockIntoConfig,
  listSources,
  listPlatformCapabilities,
  ONLINE_RULE_SOURCES,
  PLATFORM_ADBLOCK_CAPABILITIES
};
