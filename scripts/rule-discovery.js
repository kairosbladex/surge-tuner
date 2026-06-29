'use strict';

const fs = require('fs');
const path = require('path');

const {
  DEFAULT_CATALOG_PATH,
  cleanName,
  cleanValue
} = require('./platform-base');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CACHE_PATH = path.join(REPO_ROOT, '.cache/rule-discovery.json');
const GITHUB_CONTENTS_ROOT = 'https://api.github.com/repos/blackmatrix7/ios_rule_script/contents/rule/Surge';
const DEFAULT_DISCOVERED_POLICIES = ['香港节点', '美国节点', '日本节点', 'All'];

function readJsonIfExists(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (_) {
    return fallback;
  }
  return fallback;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function loadRawCatalog(catalogPath = DEFAULT_CATALOG_PATH) {
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

function rawToCatalog(raw) {
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

async function prepareCatalogForServices(serviceNames, options = {}) {
  const services = Array.isArray(serviceNames) ? serviceNames.filter(Boolean) : [];
  const raw = loadRawCatalog(options.catalogPath || DEFAULT_CATALOG_PATH);
  const cachePath = options.cachePath || DEFAULT_CACHE_PATH;
  const cached = readJsonIfExists(cachePath, {});
  const discovered = [];

  for (const [name, item] of Object.entries(cached)) {
    if (!raw[name]) raw[name] = item;
  }

  let catalog = rawToCatalog(raw);
  const missing = services.filter((service) => !catalog.aliases.has(String(service).toLowerCase()));
  if (missing.length === 0 || !options.discoverRules) {
    return { catalog, discovered, missingServices: missing };
  }

  const nextCache = { ...cached };
  for (const service of missing) {
    const result = await discoverService(service, options);
    if (!result) {
      throw new Error(`Unknown service "${service}". It is not in local catalog and was not found in blackmatrix7 Surge rules. Add it to rules/services/service-catalog.json or use a known service name.`);
    }
    raw[result.name] = result.item;
    nextCache[result.name] = result.item;
    discovered.push({ name: result.name, rule: result.item.rules[0], source: result.source });
  }

  if (discovered.length > 0) writeJson(cachePath, nextCache);
  catalog = rawToCatalog(raw);
  return { catalog, discovered, missingServices: [] };
}

async function discoverService(serviceName, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Rule discovery requires fetch support in this Node.js runtime.');
  }

  for (const candidate of candidateNames(serviceName)) {
    const url = `${GITHUB_CONTENTS_ROOT}/${encodeURIComponent(candidate)}`;
    const response = await fetchImpl(url, { headers: githubHeaders(options) });
    if (!response.ok) {
      if (response.status === 404) continue;
      throw new Error(`GitHub rule discovery failed for "${serviceName}": HTTP ${response.status}`);
    }

    const listing = await response.json();
    const listFile = Array.isArray(listing)
      ? listing.find((item) => item.type === 'file' && item.name === `${candidate}.list`) ||
        listing.find((item) => item.type === 'file' && item.name.endsWith('.list'))
      : null;
    if (!listFile) continue;

    return {
      name: candidate,
      item: {
        aliases: [String(serviceName).toLowerCase()],
        group: candidate,
        rules: [`${candidate}/${listFile.name}`],
        policies: [...DEFAULT_DISCOVERED_POLICIES]
      },
      source: listFile.html_url || url
    };
  }

  return null;
}

function githubHeaders(options = {}) {
  const headers = {
    'accept': 'application/vnd.github+json',
    'user-agent': 'proxy-tuner-rule-discovery'
  };
  const token = options.githubToken || process.env.GITHUB_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function candidateNames(serviceName) {
  const raw = String(serviceName || '').trim();
  if (!raw) return [];
  const compact = raw.replace(/\s+/g, '');
  const title = compact.charAt(0).toUpperCase() + compact.slice(1);
  const upper = compact.toUpperCase();
  const candidates = [raw, compact, title, upper];
  return Array.from(new Set(candidates.filter(Boolean)));
}

module.exports = {
  DEFAULT_CACHE_PATH,
  prepareCatalogForServices,
  discoverService,
  candidateNames,
  rawToCatalog
};
