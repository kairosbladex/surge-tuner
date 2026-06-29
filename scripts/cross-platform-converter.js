#!/usr/bin/env node
'use strict';

/**
 * cross-platform-converter.js — Convert proxy configs between Surge, Loon, Quantumult X, and Clash.
 *
 * Usage:
 *   node scripts/cross-platform-converter.js --input <source.conf> --from surge --to clash --output <target.yaml>
 *   node scripts/cross-platform-converter.js --input <source.conf> --from surge --to loon --output <target.conf>
 *   node scripts/cross-platform-converter.js --auto --address <proxy-uri> --to surge --output <result.conf>
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

// ── Supported platforms ─────────────────────────────────────────────────────────

const PLATFORMS = ['surge', 'loon', 'quantumultx', 'clash'];

// ── Detection ───────────────────────────────────────────────────────────────────

function detectPlatform(content) {
  const text = String(content || '');

  if (text.includes('proxy-providers:') || text.includes('proxy-groups:')) {
    // Could be Clash YAML
    if (text.includes('proxies:') || text.includes('dns:')) return 'clash';
  }

  if (text.includes('[server_remote]') || text.includes('[policy]') || text.includes('[server_local]')) {
    return 'quantumultx';
  }

  if (text.includes('[Remote Proxy]')) return 'loon';

  if (text.includes('[Proxy]') && text.includes('[Proxy Group]') && text.includes('[Rule]')) {
    return 'surge';
  }

  // Fallback heuristics
  if (text.includes('[General]') && text.includes('[Proxy]')) return 'surge';
  if (text.includes('[general]')) return 'quantumultx';

  return 'surge'; // safest default
}

// ── Surge → Loon ───────────────────────────────────────────────────────────────

function surgeToLoon(text) {
  let result = text;

  // Replace section headers
  // [Proxy] stays [Proxy], but add [Remote Proxy] for subscription policy-paths
  // [Proxy Group] → [Proxy Group] (compatible)
  // [Rule] → [Rule] + change RULE-SET to #include

  // Convert RULE-SET to #include (Loon compatible comments)
  result = result.replace(/RULE-SET,([^,]+),([^\n]+)/g, (match, path, policy) => {
    if (/^https?:\/\//i.test(path)) {
      return `# include "${path}", ${policy}`;
    }
    return `# include "${path}", ${policy}`;
  });

  // Convert FINAL (same in Loon)
  // Convert script syntax
  result = result.replace(/script-path\s*=\s*(scripts\/[^\s,]+)/g, 'script-path = $1');

  // Convert policy-path to [Remote Proxy] entries
  // Surge: policy-path=url, update-interval=N
  // Loon: url, tag=name, enabled=true
  result = result.replace(/policy-path=([^,\s]+),\s*update-interval=(\d+)/g, (match, url, interval) => {
    return `policy-path=${url}`;
  });

  return result;
}

// ── Surge → Quantumult X ────────────────────────────────────────────────────────

function surgeToQuantumultX(text) {
  let result = text;

  // Section header case
  result = result.replace(/^\[General\]$/m, '[general]');
  result = result.replace(/^\[Proxy\]$/m, '[server_local]');
  result = result.replace(/^\[Proxy Group\]$/m, '[policy]');
  result = result.replace(/^\[Rule\]$/m, '[filter_local]');

  // DOMAIN → HOST
  result = result.replace(/\bDOMAIN,/g, 'HOST,');
  result = result.replace(/\bDOMAIN-SUFFIX,/g, 'HOST-SUFFIX,');
  result = result.replace(/\bDOMAIN-KEYWORD,/g, 'HOST-KEYWORD,');

  // FINAL stays
  // RULE-SET → needs to become filter_remote or filter_local
  result = result.replace(/RULE-SET,([^,]+),([^\n]+)/g, (match, path, policy) => {
    if (/^https?:\/\//i.test(path)) {
      // QX filter_remote format
      const tag = policy.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      return `${path}, tag=${tag}, policy=${policy}, enabled=true`;
    }
    // Local filter - keep as comment for manual adjustment
    return `; RULE-SET ${path} → ${policy}`;
  });

  // Convert proxy group policies
  // Surge: Group = select, policy1, policy2
  // QX: static=Group, select, policy1, policy2
  result = result.replace(/^([^=]+) = select,\s*(.+)$/gm, 'static=$1, select, $2');
  result = result.replace(/^([^=]+) = url-test,\s*(.+)$/gm, (match, name, rest) => {
    return `static=${name}, url-test=${name}Pool, ${rest.replace(/policy-regex-filter=[^,]*,?\s*/g, '').replace(/url=[^,]*,?\s*/g, '').replace(/interval=\d+,?\s*/g, '').replace(/tolerance=\d+,?\s*/g, '').trim()}`;
  });

  // Add url-test pools
  const poolLines = [];
  const urlTestGroups = text.match(/^([^=]+) = url-test,([\s\S]*?)$/gm) || [];
  for (const line of urlTestGroups) {
    const nameMatch = line.match(/^(.+?) = url-test,/);
    if (nameMatch) {
      const name = nameMatch[1].trim();
      poolLines.push(`url-test=${name}Pool, url=http://www.gstatic.com/generate_204, interval=600`);
    }
  }
  if (poolLines.length > 0) {
    result += '\n\n; Auto-generated url-test pools\n' + poolLines.join('\n');
  }

  return result;
}

// ── Surge → Clash ──────────────────────────────────────────────────────────────

function surgeToClash(text) {
  // Extract sections
  const proxySection = extractSection(text, 'Proxy');
  const proxyGroupSection = extractSection(text, 'Proxy Group');
  const ruleSection = extractSection(text, 'Rule');
  const mitmSection = extractSection(text, 'MITM');
  const generalSection = extractSection(text, 'General');

  const lines = ['# Generated by cross-platform-converter.js via Surge → Clash', ''];

  // Basic config
  lines.push('port: 7890');
  lines.push('socks-port: 7891');
  lines.push('allow-lan: false');
  lines.push('mode: Rule');
  lines.push('log-level: warning');
  lines.push('ipv6: false');
  lines.push('');

  // DNS
  lines.push('dns:');
  lines.push('  enabled: true');
  lines.push('  nameserver:');
  lines.push('    - 223.5.5.5');
  lines.push('    - 119.29.29.29');
  lines.push('  fallback:');
  lines.push('    - tls://8.8.4.4');
  lines.push('');

  // Proxies
  if (proxySection) {
    lines.push('proxies:');
    // Parse Surge proxy entries
    for (const line of proxySection.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^(.+?) = (\w+),\s*(.+?),\s*(\d+)/);
      if (match) {
        const [, name, type, server, port] = match;
        const clashType = type === 'ss' ? 'ss' : type;
        lines.push(`  - name: "${name.trim()}"`);
        lines.push(`    type: ${clashType}`);
        lines.push(`    server: ${server.trim()}`);
        lines.push(`    port: ${parseInt(port)}`);
        lines.push('');
      }
    }
  }

  // Proxy Groups
  if (proxyGroupSection) {
    lines.push('proxy-groups:');
    for (const line of proxyGroupSection.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^(.+?) = (select|url-test|fallback),?\s*(.*)$/);
      if (match) {
        const [, name, type, rest] = match;
        lines.push(`  - name: "${name.trim()}"`);
        lines.push(`    type: ${type}`);
        const policies = rest.split(',').map((s) => s.trim()).filter(Boolean);
        if (policies.length > 0) {
          lines.push('    proxies:');
          for (const p of policies) {
            const clean = p.replace(/policy-regex-filter=[^,\s]*/g, '').replace(/include-other-group="[^"]*"/g, '').replace(/url=[^,\s]*/g, '').replace(/interval=\d+/g, '').replace(/tolerance=\d+/g, '').trim();
            if (clean) {
              lines.push(`      - "${clean}"`);
            }
          }
        }
        lines.push('');
      }
    }
  }

  // Rules
  if (ruleSection) {
    lines.push('rules:');
    for (const line of ruleSection.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
      let clashRule = trimmed;
      // FINAL → MATCH
      clashRule = clashRule.replace(/^FINAL,/, 'MATCH,');
      lines.push(`  - ${clashRule}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Generic Converter ───────────────────────────────────────────────────────────

function extractSection(text, sectionName) {
  const regex = new RegExp('^\\[' + sectionName + '\\]\\n([\\s\\S]*)', 'm');
  const match = text.match(regex);
  if (!match) return '';
  // Strip the section header itself, keep content
  return match[1].trim();
}

function convertConfig(text, from, to) {
  if (from === to) return text;

  // Normalize to Surge first, then convert
  let surgeText;

  if (from === 'surge') {
    surgeText = text;
  } else if (from === 'loon') {
    surgeText = loonToSurge(text);
  } else if (from === 'quantumultx') {
    surgeText = quantumultXToSurge(text);
  } else if (from === 'clash') {
    surgeText = clashToSurge(text);
  } else {
    throw new Error(`Unsupported source platform: ${from}. Supported: ${PLATFORMS.join(', ')}`);
  }

  if (to === 'surge') return surgeText;

  if (to === 'loon') return surgeToLoon(surgeText);
  if (to === 'quantumultx') return surgeToQuantumultX(surgeText);
  if (to === 'clash') return surgeToClash(surgeText);

  throw new Error(`Unsupported target platform: ${to}. Supported: ${PLATFORMS.join(', ')}`);
}

// ── Loon → Surge ────────────────────────────────────────────────────────────────

function loonToSurge(text) {
  let result = text;

  // Convert #include back to RULE-SET
  result = result.replace(/#\s*include\s+"([^"]+)",\s*([^\n]+)/g, 'RULE-SET,$1,$2');

  // [Remote Proxy] → policy-path in [Proxy Group]
  // This is a best-effort conversion
  const remoteProxies = extractSection(text, 'Remote Proxy');
  if (remoteProxies) {
    // Convert remote proxy entries to Surge subscription format
    const surProxies = remoteProxies.split('\n').map((line) => {
      const match = line.match(/^([^,]+),\s*tag=([^,]+)/);
      if (match) {
        return `${match[2].trim()} = select, policy-path=${match[1].trim()}`;
      }
      return line;
    }).join('\n');
    result = result.replace(/\[Remote Proxy\][\s\S]*?(?=\[|$)/, `[Proxy]\n; Converted from Loon Remote Proxy\n`);
    // Add subscription entries to Proxy Group
    if (surProxies) {
      result = result.replace(/\[Proxy Group\]/, `[Proxy Group]\n${surProxies}`);
    }
  }

  return result;
}

// ── Quantumult X → Surge ────────────────────────────────────────────────────────

function quantumultXToSurge(text) {
  let result = text;

  // Section headers
  result = result.replace(/^\[general\]$/m, '[General]');
  result = result.replace(/^\[server_local\]$/m, '[Proxy]');
  result = result.replace(/^\[server_remote\]$/m, '; [server_remote] → Surge policy-path');
  result = result.replace(/^\[policy\]$/m, '[Proxy Group]');
  result = result.replace(/^\[filter_remote\]$/m, '; [filter_remote] → RULE-SET');
  result = result.replace(/^\[filter_local\]$/m, '[Rule]');
  result = result.replace(/^\[rewrite_remote\]$/m, '; [rewrite_remote] → Surge MITM/Script');
  result = result.replace(/^\[rewrite_local\]$/m, '[Script]');
  result = result.replace(/^\[mitm\]$/m, '[MITM]');

  // HOST → DOMAIN
  result = result.replace(/\bHOST,/g, 'DOMAIN,');
  result = result.replace(/\bHOST-SUFFIX,/g, 'DOMAIN-SUFFIX,');
  result = result.replace(/\bHOST-KEYWORD,/g, 'DOMAIN-KEYWORD,');

  // Policy format: static=Group, select, policies → Group = select, policies
  result = result.replace(/^static=([^,]+),\s*select,\s*(.+)$/gm, '$1 = select, $2');
  result = result.replace(/^static=([^,]+),\s*url-test=([^,]+),\s*(.+)$/gm, '$1 = url-test, $3, policy-regex-filter=.');

  return result;
}

// ── Clash → Surge ──────────────────────────────────────────────────────────────

function clashToSurge(text) {
  const lines = [];
  lines.push('; Converted from Clash YAML via cross-platform-converter.js');
  lines.push('');

  // Extract proxies
  const proxyMatch = text.match(/proxies:\n([\s\S]+?)(?=\n\w|\n\n|\n$)/);
  if (proxyMatch) {
    lines.push('[Proxy]');
    const proxyLines = [];
    const currentProxies = proxyMatch[1].match(/- name:\s*"([^"]+)"[\s\S]*?(?=- name:|\n\n|$)/g) || [];
    for (const block of currentProxies) {
      const nameMatch = block.match(/name:\s*"([^"]+)"/);
      const typeMatch = block.match(/type:\s*(\w+)/);
      const serverMatch = block.match(/server:\s*([^\n]+)/);
      const portMatch = block.match(/port:\s*(\d+)/);
      if (nameMatch && typeMatch && serverMatch && portMatch) {
        const name = nameMatch[1];
        const type = typeMatch[1];
        const server = serverMatch[1].trim();
        const port = portMatch[1];
        proxyLines.push(`${name} = ${type}, ${server}, ${port}`);
      }
    }
    lines.push(...proxyLines);
    lines.push('');
  }

  // Extract proxy groups
  const groupMatch = text.match(/proxy-groups:\n([\s\S]+?)(?=\n\w|\n\n|\n$)/);
  if (groupMatch) {
    lines.push('[Proxy Group]');
    const blocks = groupMatch[1].match(/- name:\s*"([^"]+)"[\s\S]*?(?=- name:|\n\n|$)/g) || [];
    for (const block of blocks) {
      const nameMatch = block.match(/name:\s*"([^"]+)"/);
      const typeMatch = block.match(/type:\s*(\w+)/);
      if (nameMatch && typeMatch) {
        const name = nameMatch[1];
        const type = typeMatch[1];
        const proxyMatches = block.match(/proxies:\n(\s+- "[^"]+"(?:\n\s+- "[^"]+")*)/);
        let proxies = [];
        if (proxyMatches) {
          proxies = proxyMatches[1].match(/"([^"]+)"/g)?.map((p) => p.replace(/"/g, '')) || [];
        }
        lines.push(`${name} = ${type}, ${proxies.join(', ')}`);
      }
    }
    lines.push('');
  }

  // Extract rules
  const ruleMatch = text.match(/rules:\n([\s\S]+?)(?=\n\w|\n\n|\n$)/);
  if (ruleMatch) {
    lines.push('[Rule]');
    const rules = ruleMatch[1].split('\n').map((l) => l.trim().replace(/^- /, '')).filter(Boolean);
    for (const rule of rules) {
      lines.push(rule.replace(/^MATCH,/, 'FINAL,'));
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Auto: detect input platform ────────────────────────────────────────────────

function autoDetectAndConvert(text, targetPlatform) {
  const detected = detectPlatform(text);
  return convertConfig(text, detected, targetPlatform);
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { input: null, from: null, to: null, output: null, auto: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--input' || arg === '-i') args.input = argv[++i];
    else if (arg === '--from') args.from = argv[++i];
    else if (arg === '--to') args.to = argv[++i];
    else if (arg === '--output' || arg === '-o') args.output = argv[++i];
    else if (arg === '--auto') args.auto = true;
    else if (arg === '--list') args.list = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/cross-platform-converter.js --input <config> --from surge --to clash --output <result>',
    '  node scripts/cross-platform-converter.js --input <config> --auto --to surge --output <result>',
    '  node scripts/cross-platform-converter.js --list',
    '',
    'Platforms: surge, loon, quantumultx, clash',
    '--auto: detect source platform automatically'
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    console.log('Supported platforms:', PLATFORMS.join(', '));
    console.log('Conversion paths:');
    console.log('  surge ↔ loon ↔ quantumultx ↔ clash');
    return;
  }

  if (args.help || !args.input || !args.to) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const text = fs.readFileSync(path.resolve(process.cwd(), args.input), 'utf8');

  let result;
  if (args.auto) {
    result = autoDetectAndConvert(text, args.to);
  } else if (!args.from) {
    console.error('--from is required (or use --auto)');
    process.exit(1);
  } else {
    result = convertConfig(text, args.from, args.to);
  }

  if (args.output) {
    const outPath = path.resolve(process.cwd(), args.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, result);
    console.log(`Converted config written to ${outPath}`);
  } else {
    console.log(result);
  }
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });

module.exports = {
  PLATFORMS,
  detectPlatform,
  convertConfig,
  autoDetectAndConvert,
  surgeToLoon,
  surgeToQuantumultX,
  surgeToClash,
  loonToSurge,
  quantumultXToSurge,
  clashToSurge
};
