#!/usr/bin/env node
'use strict';

/**
 * platform-base.js — Shared logic for all proxy platform config generators.
 *
 * Provides region detection, proxy deduplication, service catalog resolution,
 * and formatting helpers used by Surge, Loon, Quantumult X, and Clash generators.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CATALOG_PATH = path.join(REPO_ROOT, 'rules/services/service-catalog.json');

// ── Region Detection ────────────────────────────────────────────────────────────

const DEFAULT_REGIONS = [
  { name: '香港节点', regex: '香港|Hong Kong|HK|HKG', type: 'url-test' },
  { name: '日本节点', regex: '日本|Japan|Tokyo|JP|NRT', type: 'url-test' },
  { name: '新加坡节点', regex: '新加坡|Singapore|SG|SGP', type: 'url-test' },
  { name: '美国节点', regex: '美国|United States|USA|US|LAX|SFO', type: 'url-test' },
  { name: '韩国节点', regex: '韩国|Korea|KR|Seoul', type: 'url-test' },
  { name: '台湾节点', regex: '台湾|Taiwan|TW|Taipei|TPE', type: 'url-test' }
];

// ── Catalog Loading ─────────────────────────────────────────────────────────────

function loadCatalog(catalogPath = DEFAULT_CATALOG_PATH) {
  const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const canonical = new Map();
  const aliases = new Map();

  for (const [name, item] of Object.entries(raw)) {
    const entry = {
      name,
      group: cleanName(item.group, `${name}.group`),
      rules: Array.isArray(item.rules) ? item.rules.map((r) => cleanValue(r, `${name}.rules`)) : [],
      policies: Array.isArray(item.policies) ? item.policies.map((p) => cleanName(p, `${name}.policies`)) : [],
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

// ── Input Normalisation ─────────────────────────────────────────────────────────

function normalizeSubscriptions(input) {
  if (!Array.isArray(input.subscriptions)) return [];
  return input.subscriptions.map((sub, index) => ({
    name: cleanName(sub.name || `机场${index + 1}`, `subscriptions[${index}].name`),
    url: cleanValue(sub.url, `subscriptions[${index}].url`),
    updateInterval: Number.isInteger(sub.updateInterval) ? sub.updateInterval : 86400
  }));
}

function normalizeProxies(input) {
  if (!Array.isArray(input.proxies)) return [];
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
    return { enabled: input.adBlock, mitm: input.adBlock !== false };
  }
  if (input.adBlock && typeof input.adBlock === 'object') {
    return {
      enabled: Boolean(input.adBlock.enabled),
      mitm: input.adBlock.mitm !== false
    };
  }
  return { enabled: false, mitm: false };
}

// ── Service Resolution ──────────────────────────────────────────────────────────

function resolveServices(serviceNames, catalog) {
  const selected = Array.isArray(serviceNames) ? serviceNames : [];
  const groups = new Map();
  const rules = [];

  for (const rawName of selected) {
    const key = String(rawName).toLowerCase();
    const entry = catalog.aliases.get(key);
    if (!entry) throw new Error(`Unknown service: ${rawName}`);

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

// ── Helpers ─────────────────────────────────────────────────────────────────────

function cleanName(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (/[\r\n=,]/.test(value)) throw new Error(`${field} contains unsupported characters: ${value}`);
  return value.trim();
}

function cleanValue(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (/[\r\n,]/.test(value)) throw new Error(`${field} contains unsupported characters: ${value}`);
  return value.trim();
}

function cleanProxyLine(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (/[\r\n]/.test(value)) throw new Error(`${field} contains unsupported newline characters`);
  return value.trim();
}

function mergeUnique(left, right) {
  const out = [...left];
  for (const v of right) {
    if (!out.includes(v)) out.push(v);
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

function dedupeProxyObjects(proxies) {
  const seen = new Map();
  return proxies.map((proxy) => {
    const count = seen.get(proxy.name) || 0;
    seen.set(proxy.name, count + 1);
    if (count === 0) return proxy;
    const nextName = `${proxy.name} ${count + 1}`;
    return { ...proxy, name: nextName, line: proxy.line.replace(`${proxy.name} = `, `${nextName} = `) };
  });
}

function classifyProxiesByRegion(proxies, regions) {
  const classified = new Map(); // regionName → proxy[]
  const unclassified = [];

  for (const proxy of proxies) {
    let matched = false;
    for (const region of regions) {
      if (new RegExp(region.regex, 'i').test(proxy.name)) {
        if (!classified.has(region.name)) classified.set(region.name, []);
        classified.get(region.name).push(proxy);
        matched = true;
        break;
      }
    }
    if (!matched) unclassified.push(proxy);
  }

  return { classified, unclassified };
}

const BLACKMATRIX_SURGE_ROOT = 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge';
const BLACKMATRIX_CLASH_ROOT  = 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash';
const BLACKMATRIX_QX_ROOT     = 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/QuantumultX';

function remoteRuleUrl(rulePath, platform) {
  if (/^https?:\/\//i.test(rulePath)) return rulePath;
  const roots = {
    surge: BLACKMATRIX_SURGE_ROOT,
    clash: BLACKMATRIX_CLASH_ROOT,
    quantumultx: BLACKMATRIX_QX_ROOT,
    loon: BLACKMATRIX_SURGE_ROOT // Loon shares Surge rule format mostly
  };
  const root = roots[platform] || BLACKMATRIX_SURGE_ROOT;
  return `${root}/${rulePath}`;
}

// ── Validate Generated Config (generic) ────────────────────────────────────────

function platformValidate(configText, platform, options = {}) {
  // Basic structural checks — each platform has its own validator
  const issues = [];

  if (!configText || configText.trim().length === 0) {
    issues.push({ severity: 'error', message: 'Generated config is empty' });
    return issues;
  }

  if (platform === 'clash') {
    // Clash uses YAML — try basic YAML-like validation
    if (!configText.includes('proxies:') && !configText.includes('proxy-groups:')) {
      issues.push({ severity: 'warning', message: 'Clash config missing proxies or proxy-groups section' });
    }
  } else {
    // INI-based platforms (Surge, Loon, QX)
    const hasSection = /^\[.*\]/m.test(configText);
    if (!hasSection) {
      issues.push({ severity: 'error', message: `${platform} config missing section headers` });
    }
  }

  return issues;
}

module.exports = {
  REPO_ROOT,
  DEFAULT_CATALOG_PATH,
  DEFAULT_REGIONS,
  loadCatalog,
  normalizeSubscriptions,
  normalizeProxies,
  normalizeRegions,
  normalizeAdBlock,
  resolveServices,
  classifyProxiesByRegion,
  cleanName,
  cleanValue,
  cleanProxyLine,
  mergeUnique,
  ensureGroup,
  dedupeProxyObjects,
  remoteRuleUrl,
  platformValidate
};
