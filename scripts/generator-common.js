'use strict';

const fs = require('fs');
const path = require('path');

const { loadProxySource } = require('./surge-proxy-parser');
const { platformValidate } = require('./platform-base');
const { prepareCatalogForServices } = require('./rule-discovery');
const { writeAdblockSidecar } = require('./adblock-artifacts');

const COMMON_PRESET_SERVICES = [
  'Telegram',
  'YouTube',
  'GitHub',
  'ChatGPT',
  'Google',
  'Twitter',
  'Instagram'
];

function splitList(value) {
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function applyServicePreset(input = {}) {
  const preset = String(input.preset || '').toLowerCase();
  const services = Array.isArray(input.services) ? input.services.filter(Boolean) : [];
  if (services.length > 0) return { ...input, services };
  if (preset === 'common') return { ...input, services: [...COMMON_PRESET_SERVICES] };
  return { ...input, services };
}

function readAddressesArgument(value, cwd = process.cwd()) {
  if (!value) return [];
  const raw = String(value);
  const filePath = path.resolve(cwd, raw);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return parseAddressList(fs.readFileSync(filePath, 'utf8'));
  }
  return parseAddressList(raw);
}

function parseAddressList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const raw = String(value || '').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parseAddressList(parsed);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.addresses)) {
      return parseAddressList(parsed.addresses);
    }
  } catch (_) {
    // Not JSON; treat it as plain text.
  }

  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function buildProxySourceOptions(args = {}, cwd = process.cwd()) {
  return {
    address: args.address || null,
    addresses: args.addresses ? readAddressesArgument(args.addresses, cwd) : args.addresses,
    addressFile: args.addressFile ? path.resolve(cwd, args.addressFile) : null
  };
}

// ── 生成器 CLI 公共层 ─────────────────────────────────────────────────────────
// 四个平台生成器（surge/loon/quantumultx/clash）曾各自复制同一份
// parseArgs / buildInputFromArgs / main 五段式（建目录→写文件→校验门禁→sidecar→成功日志），
// 此处收敛为单一实现；各生成器只保留薄封装与平台差异参数（usage 文案、默认输出、校验/输出钩子）。

const GENERATOR_REPO_ROOT = path.resolve(__dirname, '..');

// 解析四个生成器共用的命令行 flag 集。
// extraFlags：平台默认值覆盖表，逐键并入初始 args（如 surge 传 { catalog: DEFAULT_CATALOG_PATH }）。
function parseGeneratorArgs(argv, extraFlags = {}) {
  const args = {
    input: null, address: null, addresses: null, addressFile: null, output: null,
    catalog: null, services: [], preset: null, discoverRules: false, adblockOutput: null,
    unified: false, subscription: [],
    adBlock: false, validate: true, strict: false, help: false,
    ...extraFlags
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

// 由命令行参数构建生成器输入：--input 读 JSON；--unified + --subscription 直传订阅；否则解析节点来源。
async function buildGeneratorInput(args) {
  if (args.input) return applyServicePreset(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args.input), 'utf8')));
  // --subscription name|url：不本地解析节点，直接传 subscriptions 给生成器
  if (args.unified && args.subscription && args.subscription.length > 0) {
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

// 五段式主流程：解析输入 → 准备规则目录 → 生成配置 → 校验门禁 → 写文件/sidecar/日志。
// options:
//   platform     平台标识（prepareCatalogForServices / platformValidate / sidecar 用）
//   label        sidecar 与成功日志的显示名（默认 emitResult 用，如 'Quantumult X'）
//   generate     (input, { catalog }) => string，平台生成函数
//   usage        --help / 无参数时逐字输出的 usage 文案
//   defaultOutput 相对仓库根目录的默认输出路径（--output 缺省时）
//   extraFlags   可选，透传给 parseGeneratorArgs 的默认值覆盖表
//   validate(config, outputPath, args)        可选，覆盖默认 platformValidate 门禁
//   emitResult(config, outputPath, args, input) 可选，覆盖默认“写文件+sidecar+成功日志”
async function runGeneratorCli(options) {
  const args = parseGeneratorArgs(process.argv.slice(2), options.extraFlags);
  const hasInput = args.input || args.address || args.addresses || args.addressFile
    || (args.subscription.length > 0);
  if (args.help || !hasInput) {
    console.log(options.usage);
    process.exit(args.help ? 0 : 1);
  }

  const input = await buildGeneratorInput(args);
  const catalogPath = args.catalog ? path.resolve(process.cwd(), args.catalog) : undefined;
  const catalogResult = await prepareCatalogForServices(input.services, {
    catalogPath,
    discoverRules: args.discoverRules,
    platform: options.platform
  });
  const config = options.generate(input, {
    catalog: catalogResult.catalog
  });

  const outputPath = args.output
    ? path.resolve(process.cwd(), args.output)
    : path.join(GENERATOR_REPO_ROOT, options.defaultOutput);

  if (args.validate) {
    if (options.validate) {
      options.validate(config, outputPath, args);
    } else {
      const issues = platformValidate(config, options.platform);
      const errors = issues.filter((i) => i.severity === 'error');
      if ((args.strict && issues.length > 0) || errors.length > 0) {
        throw new Error(`Config validation failed:\n${issues.map((i) => `  ${i.severity}: ${i.message}`).join('\n')}`);
      }
    }
  }

  if (options.emitResult) {
    options.emitResult(config, outputPath, args, input);
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, config);
  // 一体化模式不生成 sidecar（去广告已合并进主配置）
  if (input.adBlock && !input.unified) {
    const sidecar = writeAdblockSidecar(outputPath, options.platform, {
      outputPath: args.adblockOutput
    });
    console.log(`${options.label} ad-block artifact written to ${sidecar.path}`);
  }
  console.log(`${options.label} config written to ${outputPath}`);
}

module.exports = {
  COMMON_PRESET_SERVICES,
  splitList,
  applyServicePreset,
  readAddressesArgument,
  parseAddressList,
  buildProxySourceOptions,
  parseGeneratorArgs,
  buildGeneratorInput,
  runGeneratorCli
};
