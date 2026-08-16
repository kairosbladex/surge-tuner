#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

const KNOWN_GROUP_TYPES = new Set([
  'select',
  'url-test',
  'fallback',
  'load-balance',
  'subnet',
  'smart'
]);

const RESERVED_POLICIES = new Set([
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'REJECT-NO-DROP',
  'REJECT-TINYGIF',
  'REJECT-DICT',
  'REJECT-ARRAY',
  'REJECT-200',
  'CELLULAR',
  'CELLULAR-ONLY',
  'HYBRID'
]);

const RULE_TYPES_WITH_POLICY_AT_2 = new Set([
  'DOMAIN',
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD',
  'DOMAIN-SET',
  'RULE-SET',
  'IP-CIDR',
  'IP-CIDR6',
  'IP-ASN',
  'GEOIP',
  'SRC-IP-CIDR',
  'USER-AGENT',
  'URL-REGEX',
  'PROCESS-NAME'
]);

function parseArgs(argv) {
  const args = {
    all: false,
    json: false,
    strict: false,
    files: []
  };

  for (const arg of argv) {
    if (arg === '--all') {
      args.all = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--strict') {
      args.strict = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      args.files.push(arg);
    }
  }

  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/surge-config-validator.js --all [--strict] [--json]',
    '  node scripts/surge-config-validator.js <file...> [--strict] [--json]'
  ].join('\n');
}

function listDefaultFiles(repoRoot = REPO_ROOT) {
  const dirs = ['configs', 'templates', 'modules'];
  const files = [];
  for (const dir of dirs) {
    const absDir = path.join(repoRoot, dir);
    if (!fs.existsSync(absDir)) continue;
    for (const name of fs.readdirSync(absDir)) {
      if (/\.(conf|conf\.example|sgmodule)$/i.test(name)) {
        files.push(path.join(absDir, name));
      }
    }
  }
  return files.sort();
}

function stripLine(raw) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) {
    return '';
  }
  return raw.replace(/\s+;.*$/, '').trim();
}

function splitCsv(line) {
  const parts = [];
  let current = '';
  let quote = null;

  for (const char of line) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      current += char;
      continue;
    }

    if (char === ',' && !quote) {
      const value = current.trim();
      if (value) parts.push(value);
      current = '';
      continue;
    }

    current += char;
  }

  const value = current.trim();
  if (value) parts.push(value);
  return parts;
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

function addIssue(issues, severity, code, message, line) {
  issues.push({
    severity,
    code,
    message,
    line: line || null
  });
}

function parseConfig(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  let section = null;

  lines.forEach((raw, index) => {
    const line = stripLine(raw);
    if (!line) return;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      entries.push({ line, section, number: index + 1, kind: 'section' });
      return;
    }
    entries.push({ line, section, number: index + 1, kind: 'entry' });
  });

  return entries;
}

function resolveLocalFile(repoRoot, filePath, refPath) {
  const candidates = [];
  if (path.isAbsolute(refPath)) {
    candidates.push(refPath);
  } else {
    candidates.push(path.resolve(path.dirname(filePath), refPath));
    candidates.push(path.resolve(repoRoot, refPath));
    if (!refPath.includes('/')) {
      candidates.push(path.resolve(repoRoot, 'rulesets', refPath));
    }
  }

  const match = candidates.find((candidate) => fs.existsSync(candidate));
  return { match, candidates };
}

function validateText(text, options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const filePath = options.filePath || path.join(repoRoot, 'inline.conf');
  const isModule = /\.sgmodule$/i.test(filePath);
  const entries = parseConfig(text);
  const issues = [];
  const policyNames = new Set(RESERVED_POLICIES);
  const moduleSections = new Set();

  for (const entry of entries) {
    if (entry.kind === 'section' && isModule) {
      moduleSections.add(entry.section);
    }

    if (entry.kind !== 'entry') continue;

    if (entry.section === 'Proxy Group') {
      const assignment = parseAssignment(entry.line);
      if (!assignment) continue;
      policyNames.add(assignment.name);
      const groupType = splitCsv(assignment.value)[0];
      if (groupType && !KNOWN_GROUP_TYPES.has(groupType.toLowerCase())) {
        addIssue(
          issues,
          'warning',
          'NONSTANDARD_POLICY_GROUP_TYPE',
          `Policy group "${assignment.name}" uses nonstandard type "${groupType}". Verify Surge iOS supports it before shipping.`,
          entry.number
        );
      }
    }

    if (entry.section === 'Proxy') {
      const assignment = parseAssignment(entry.line);
      if (assignment) {
        policyNames.add(assignment.name);
      }
    }
  }

  for (const entry of entries) {
    if (entry.kind !== 'entry') continue;

    if (entry.section === 'Proxy Group') {
      validateProxyGroup(entry, issues, policyNames);
    }

    if (entry.section === 'Rule') {
      validateRule(entry, issues, policyNames, repoRoot, filePath);
    }

    validateScriptPath(entry, issues, repoRoot, filePath);

    if (isModule && entry.section === 'MITM' && /^enable\s*=/i.test(entry.line)) {
      addIssue(
        issues,
        'warning',
        'MODULE_MITM_ENABLE_REVIEW',
        'Module sets MITM enable. Prefer enabling MITM in the main profile and keeping the module to hostname/script changes.',
        entry.number
      );
    }
  }

  if (isModule && moduleSections.has('Body Rewrite')) {
    addIssue(
      issues,
      'warning',
      'MODULE_BODY_REWRITE_REVIEW',
      'Module contains [Body Rewrite]. Verify the current Surge module manual supports this section.',
      null
    );
  }

  return issues;
}

function parseAssignment(line) {
  const index = line.indexOf('=');
  if (index < 1) return null;
  const name = line.slice(0, index).trim();
  const value = line.slice(index + 1).trim();
  if (!name || !value) return null;
  return { name, value };
}

function validateProxyGroup(entry, issues, policyNames) {
  const assignment = parseAssignment(entry.line);
  if (!assignment) return;

  const parts = splitCsv(assignment.value);
  if (parts.length < 2) return;

  for (const policy of parts.slice(1)) {
    if (!isProxyGroupPolicyReference(policy)) continue;
    // 策略引用可能用引号包裹（如 "♻️ 自动选择"），比较时去掉外层引号。
    const normalized = stripQuotes(policy);
    if (!policyNames.has(normalized)) {
      addIssue(
        issues,
        'error',
        'GROUP_POLICY_UNDEFINED',
        `Proxy group "${assignment.name}" references undefined policy or proxy "${normalized}".`,
        entry.number
      );
    }
  }
}

function stripQuotes(value) {
  const item = String(value || '').trim();
  if (item.length >= 2) {
    const first = item[0];
    const last = item[item.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return item.slice(1, -1).trim();
    }
  }
  return item;
}

function isProxyGroupPolicyReference(value) {
  const item = String(value || '').trim();
  if (!item) return false;
  if (/^[A-Za-z][A-Za-z0-9-]*\s*=/.test(item)) return false;
  return true;
}

function validateRule(entry, issues, policyNames, repoRoot, filePath) {
  const parts = splitCsv(entry.line);
  if (parts.length === 0) return;
  const type = parts[0].toUpperCase();

  if (type === 'RULE-SET') {
    const refPath = parts[1];
    const policy = parts[2];
    if (!refPath) {
      addIssue(issues, 'error', 'RULESET_MISSING_PATH', 'RULE-SET is missing a path.', entry.number);
      return;
    }
    validateLocalRuleSet(refPath, issues, repoRoot, filePath, entry.number);
    validatePolicy(policy, policyNames, issues, entry.number);
    return;
  }

  if (type === 'FINAL') {
    validatePolicy(parts[1], policyNames, issues, entry.number);
    return;
  }

  if (RULE_TYPES_WITH_POLICY_AT_2.has(type)) {
    validatePolicy(parts[2], policyNames, issues, entry.number);
  }
}

function validateLocalRuleSet(refPath, issues, repoRoot, filePath, line) {
  if (isUrl(refPath)) return;

  const { match } = resolveLocalFile(repoRoot, filePath, refPath);
  if (!match) {
    addIssue(
      issues,
      'error',
      'LOCAL_RULESET_NOT_FOUND',
      `Local RULE-SET file not found: ${refPath}`,
      line
    );
    return;
  }

  if (!refPath.includes('/') && path.basename(match) === refPath && path.basename(path.dirname(match)) === 'rulesets') {
    addIssue(
      issues,
      'warning',
      'LOCAL_RULESET_BARE_PATH',
      `Local RULE-SET "${refPath}" resolves to rulesets/${refPath}; use "rulesets/${refPath}" unless files are flattened on device.`,
      line
    );
  }
}

function validatePolicy(policy, policyNames, issues, line) {
  if (!policy) {
    addIssue(issues, 'error', 'RULE_POLICY_MISSING', 'Rule is missing a policy target.', line);
    return;
  }
  // 策略名可能用引号包裹（如 RULE-SET,url,"♻️ 自动选择"），比较时去掉外层引号。
  const normalized = stripQuotes(policy);
  if (!policyNames.has(normalized)) {
    addIssue(
      issues,
      'error',
      'RULE_POLICY_UNDEFINED',
      `Rule targets undefined policy "${normalized}".`,
      line
    );
  }
}

function validateScriptPath(entry, issues, repoRoot, filePath) {
  const match = entry.line.match(/\bscript-path\s*=\s*([^,\s]+)/i);
  if (!match) return;
  const scriptPath = match[1].trim();
  if (isUrl(scriptPath)) return;

  const { match: localMatch } = resolveLocalFile(repoRoot, filePath, scriptPath);
  if (!localMatch) {
    addIssue(
      issues,
      'error',
      'SCRIPT_PATH_NOT_FOUND',
      `script-path file not found: ${scriptPath}`,
      entry.number
    );
  }
}

function validateFile(filePath, options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  return {
    file: path.resolve(filePath),
    issues: validateText(fs.readFileSync(filePath, 'utf8'), {
      repoRoot,
      filePath: path.resolve(filePath)
    })
  };
}

function formatResults(results) {
  const lines = [];
  for (const result of results) {
    if (result.issues.length === 0) {
      lines.push(`${path.relative(REPO_ROOT, result.file)}: ok`);
      continue;
    }
    for (const issue of result.issues) {
      const location = issue.line ? `${path.relative(REPO_ROOT, result.file)}:${issue.line}` : path.relative(REPO_ROOT, result.file);
      lines.push(`${location}: ${issue.severity.toUpperCase()} ${issue.code} ${issue.message}`);
    }
  }
  return lines.join('\n');
}

function hasFailure(results, strict) {
  return results.some((result) => result.issues.some((issue) => issue.severity === 'error' || (strict && issue.severity === 'warning')));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.all && args.files.length === 0)) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const files = args.all ? listDefaultFiles(REPO_ROOT) : args.files.map((file) => path.resolve(process.cwd(), file));
  const results = files.map((file) => validateFile(file, { repoRoot: REPO_ROOT }));

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(formatResults(results));
  }

  process.exit(hasFailure(results, args.strict) ? 1 : 0);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  listDefaultFiles,
  validateText,
  validateFile,
  formatResults,
  hasFailure
};
