#!/usr/bin/env node
'use strict';

/**
 * user-preference-store.js — Persistent user preference storage for proxy configuration.
 *
 * Stores preferences like:
 *   - Preferred proxy software (surge / loon / quantumultx / clash)
 *   - Region ordering for nodes
 *   - Services the user commonly uses
 *   - Ad-block level (none / basic / full / custom)
 *   - Custom ad domains
 *   - Custom routing rules
 *   - Subscription URLs
 *   - Final policy preference
 *   - Theme / naming preferences
 *
 * Data stored as JSON in configs/user-preferences.json by default.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_STORE_PATH = path.join(REPO_ROOT, 'configs/user-preferences.json');

// ── Default Preferences ─────────────────────────────────────────────────────────

const DEFAULT_PREFERENCES = {
  version: 1,

  // Which proxy software to generate configs for
  preferredPlatform: 'surge',  // surge | loon | quantumultx | clash

  // Node region ordering (higher priority first)
  regionOrder: [
    '香港节点',
    '日本节点',
    '新加坡节点',
    '美国节点',
    '韩国节点',
    '台湾节点'
  ],

  // Commonly used services (auto-suggested)
  commonServices: [
    'Telegram',
    'YouTube',
    'ChatGPT',
    'GitHub',
    'Google',
    'Twitter',
    'Instagram'
  ],

  // Ad-block level
  // none: no ad blocking
  // basic: local rulesets only
  // full: local + online rule sets
  // custom: full + user-defined domains
  adBlockLevel: 'full',

  // Custom ad domains to always block
  customAdDomains: [],

  // Custom routing rules (type, value, policy)
  customRules: [],

  // Subscription URLs the user has registered
  subscriptions: [],

  // Final/default policy
  finalPolicy: '兜底分流',

  // MITM settings
  mitm: {
    enabled: true,
    extraHostnames: []
  },

  // Proxy test URL
  proxyTestUrl: 'http://www.gstatic.com/generate_204',

  // Whether to auto-validate generated configs
  autoValidate: true,

  // Strict mode (warnings become errors)
  strictMode: false,

  // Last updated timestamp
  updatedAt: new Date().toISOString()
};

// ── Preference Store ────────────────────────────────────────────────────────────

class UserPreferenceStore {
  constructor(storePath = DEFAULT_STORE_PATH) {
    this.storePath = storePath;
    this._data = null;
  }

  // 每次都从磁盘重新读取，不在内存里长期缓存：
  // CLI 与长驻 A2A 进程可能并存读写同一文件，写前重读才能在他人的修改之上合并，
  // 避免用陈旧缓存整体覆盖文件。文件仅几 KB 且访问频率低（每次 CLI 调用 / A2A 任务），
  // 重读开销可忽略，也比按 mtime 失效缓存更确定（不受 mtime 精度影响）。
  _load() {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf8');
        this._data = { ...DEFAULT_PREFERENCES, ...JSON.parse(raw), updatedAt: new Date().toISOString() };
      } else {
        this._data = { ...DEFAULT_PREFERENCES };
      }
    } catch (error) {
      console.warn(`Failed to load preferences from ${this.storePath}: ${error.message}. Using defaults.`);
      this._data = { ...DEFAULT_PREFERENCES };
    }
    return this._data;
  }

  // 原子写：先写同目录临时文件再 rename 替换（同目录保证同盘，rename 才是原子操作），
  // 避免进程中断时留下写了一半的 JSON。临时文件名带 pid，避免多进程互踩。
  _save() {
    if (!this._data) return;
    this._data.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    const tmpPath = `${this.storePath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(this._data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.storePath);
    } catch (error) {
      try { fs.unlinkSync(tmpPath); } catch (_) { /* 临时文件可能没写出来，忽略 */ }
      throw error;
    }
  }

  /**
   * Get all preferences.
   * 返回深拷贝，调用方改动返回值（如 push 嵌套数组）不会污染 store 内部数据。
   */
  getAll() {
    return JSON.parse(JSON.stringify(this._load()));
  }

  /**
   * Get a specific preference key.
   */
  get(key) {
    return this._load()[key];
  }

  /**
   * Set one or more preference values.
   */
  set(updates) {
    const data = this._load();
    for (const [key, value] of Object.entries(updates)) {
      if (key in DEFAULT_PREFERENCES || key === 'version') {
        data[key] = value;
      } else {
        console.warn(`Unknown preference key: ${key}. Ignoring.`);
      }
    }
    this._save();
  }

  /**
   * Add a custom ad domain to block.
   */
  addAdDomain(domain) {
    if (typeof domain !== 'string') {
      throw new Error(`addAdDomain: domain must be a string, got ${typeof domain}`);
    }
    const data = this._load();
    const clean = domain.trim().replace(/^[*-]+\s*/, '');
    if (clean && !data.customAdDomains.includes(clean)) {
      data.customAdDomains.push(clean);
      data.adBlockLevel = 'custom';
      this._save();
      return true;
    }
    return false;
  }

  /**
   * Remove a custom ad domain.
   */
  removeAdDomain(domain) {
    if (typeof domain !== 'string') {
      throw new Error(`removeAdDomain: domain must be a string, got ${typeof domain}`);
    }
    const data = this._load();
    const clean = domain.trim().replace(/^[*-]+\s*/, '');
    const index = data.customAdDomains.indexOf(clean);
    if (index >= 0) {
      data.customAdDomains.splice(index, 1);
      this._save();
      return true;
    }
    return false;
  }

  /**
   * Add a subscription URL.
   */
  addSubscription(name, url) {
    if (typeof name !== 'string' || typeof url !== 'string') {
      throw new Error(`addSubscription: name and url must be strings, got ${typeof name} and ${typeof url}`);
    }
    const data = this._load();
    const existing = data.subscriptions.find((s) => s.url === url);
    if (!existing) {
      data.subscriptions.push({ name, url });
      this._save();
      return true;
    }
    return false;
  }

  /**
   * Remove a subscription.
   */
  removeSubscription(url) {
    if (typeof url !== 'string') {
      throw new Error(`removeSubscription: url must be a string, got ${typeof url}`);
    }
    const data = this._load();
    const index = data.subscriptions.findIndex((s) => s.url === url);
    if (index >= 0) {
      data.subscriptions.splice(index, 1);
      this._save();
      return true;
    }
    return false;
  }

  /**
   * Add a custom routing rule.
   */
  addCustomRule(type, value, policy) {
    if (typeof type !== 'string' || typeof value !== 'string' || typeof policy !== 'string') {
      throw new Error(`addCustomRule: type, value and policy must be strings, got ${typeof type}, ${typeof value} and ${typeof policy}`);
    }
    const data = this._load();
    data.customRules.push({ type, value, policy });
    this._save();
  }

  /**
   * Set preferred platform.
   */
  setPlatform(platform) {
    const valid = ['surge', 'loon', 'quantumultx', 'clash'];
    if (valid.includes(platform)) {
      this.set({ preferredPlatform: platform });
      return true;
    }
    return false;
  }

  /**
   * Set ad-block level.
   */
  setAdBlockLevel(level) {
    const valid = ['none', 'basic', 'full', 'custom'];
    if (valid.includes(level)) {
      this.set({ adBlockLevel: level });
      return true;
    }
    return false;
  }

  /**
   * Generate input config for config generators based on stored preferences.
   */
  buildGeneratorInput(overrides = {}) {
    const data = this._load();
    return {
      subscriptions: overrides.subscriptions || data.subscriptions,
      services: overrides.services || data.commonServices,
      adBlock: overrides.adBlock ?? (data.adBlockLevel !== 'none'),
      finalPolicy: overrides.finalPolicy || data.finalPolicy,
      rules: [...(data.customRules || []), ...(overrides.customRules || [])],
      regions: overrides.regions || undefined,
      proxies: overrides.proxies || undefined,
      ...overrides
    };
  }

  /**
   * Reset to defaults.
   */
  reset() {
    this._data = { ...DEFAULT_PREFERENCES, updatedAt: new Date().toISOString() };
    this._save();
  }

  /**
   * Get the store file path.
   */
  getStorePath() {
    return this.storePath;
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────────

const defaultStore = new UserPreferenceStore();

function getDefaultStore() {
  return defaultStore;
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { action: 'get', key: null, value: null, platform: null, adLevel: null,
    addDomain: null, removeDomain: null, addSub: null, addSubName: null,
    addRule: null, addRuleType: null, addRulePolicy: null, reset: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--get' || arg === '--all') args.action = 'get';
    else if (arg === '--set') { args.action = 'set'; args.key = argv[++i]; args.value = argv[++i]; }
    else if (arg === '--platform') { args.action = 'platform'; args.platform = argv[++i]; }
    else if (arg === '--ad-level') { args.action = 'adLevel'; args.adLevel = argv[++i]; }
    else if (arg === '--add-domain') { args.action = 'addDomain'; args.addDomain = argv[++i]; }
    else if (arg === '--remove-domain') { args.action = 'removeDomain'; args.removeDomain = argv[++i]; }
    else if (arg === '--add-sub') { args.action = 'addSub'; args.addSub = argv[++i]; args.addSubName = argv[++i]; }
    else if (arg === '--add-rule') { args.action = 'addRule'; args.addRule = argv[++i]; args.addRuleType = argv[++i]; args.addRulePolicy = argv[++i]; }
    else if (arg === '--reset') args.reset = true;
    else if (arg === '--file') args.file = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/user-preference-store.js --all                                    # show all preferences',
    '  node scripts/user-preference-store.js --set <key> <value>                      # set a preference',
    '  node scripts/user-preference-store.js --platform surge|loon|quantumultx|clash  # set preferred platform',
    '  node scripts/user-preference-store.js --ad-level none|basic|full|custom        # set ad-block level',
    '  node scripts/user-preference-store.js --add-domain "*.example.com"             # add custom ad domain',
    '  node scripts/user-preference-store.js --remove-domain "*.example.com"          # remove custom ad domain',
    '  node scripts/user-preference-store.js --add-sub <url> <name>                   # add subscription',
    '  node scripts/user-preference-store.js --add-rule <type> <value> <policy>       # add custom routing rule',
    '  node scripts/user-preference-store.js --reset                                  # reset to defaults',
    '',
    'Available keys:',
    '  ' + Object.keys(DEFAULT_PREFERENCES).join(', ')
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const store = args.file ? new UserPreferenceStore(args.file) : getDefaultStore();

  if (args.help) { console.log(usage()); return; }
  if (args.reset) { store.reset(); console.log('Preferences reset to defaults.'); return; }

  switch (args.action) {
    case 'get':
      console.log(JSON.stringify(store.getAll(), null, 2));
      break;
    case 'set':
      store.set({ [args.key]: parseValue(args.value) });
      console.log(`Set ${args.key} = ${args.value}`);
      break;
    case 'platform':
      if (store.setPlatform(args.platform)) console.log(`Platform set to ${args.platform}`);
      else console.error(`Invalid platform: ${args.platform}. Use surge, loon, quantumultx, or clash.`);
      break;
    case 'adLevel':
      if (store.setAdBlockLevel(args.adLevel)) console.log(`Ad-block level set to ${args.adLevel}`);
      else console.error(`Invalid level: ${args.adLevel}. Use none, basic, full, or custom.`);
      break;
    case 'addDomain':
      if (store.addAdDomain(args.addDomain)) console.log(`Added domain: ${args.addDomain}`);
      else console.log(`Domain already exists or invalid: ${args.addDomain}`);
      break;
    case 'removeDomain':
      if (store.removeAdDomain(args.removeDomain)) console.log(`Removed domain: ${args.removeDomain}`);
      else console.log(`Domain not found: ${args.removeDomain}`);
      break;
    case 'addSub':
      if (store.addSubscription(args.addSubName, args.addSub)) console.log(`Added subscription: ${args.addSubName} (${args.addSub})`);
      else console.log('Subscription URL already exists.');
      break;
    case 'addRule':
      store.addCustomRule(args.addRuleType, args.addRule, args.addRulePolicy);
      console.log(`Added rule: ${args.addRuleType},${args.addRule},${args.addRulePolicy}`);
      break;
  }
}

function parseValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (!isNaN(Number(value))) return Number(value);
  try { return JSON.parse(value); } catch (_) { return value; }
}

if (require.main === module) main();

module.exports = { UserPreferenceStore, getDefaultStore, DEFAULT_PREFERENCES };
