'use strict';

// Surge 配置工具插件 —— 把 surge-tuner 引擎的 CLI 封装成 DSH 结构化工具。
// 由本预设目录下 agent.cordis.yml 中的 `name: ./surge-tuner-tools.js` 行挂载。
//
// 引擎定位顺序（找到 scripts/surge-config-generator.js 即止）：
//   1. agent.cordis.yml 中 surge-tools 行的 config.repoPath（显式指定）
//   2. 会话工作目录/surge-tuner（开发者布局：引擎随 git pull 更新）
//   3. 本预设目录/engine（install 脚本打包的自包含快照，开箱即用）
//   4. 本预设目录/..（预设以 agent/ 子目录形式放在仓库内时，直接使用仓库根）
//
// 只消费宿主服务（tools / shell / systemPrompt），不发布任何服务，因此无需 isolate realm。
// 注意：模块按文件 URL 缓存在 DSH 进程内；修改本文件后需改文件名（或重启 DSH）才能生效。

const fs = require('node:fs');
const path = require('node:path');

// 与 surge-tuner/rules/services/service-catalog.json 保持一致的服务目录。
const SERVICE_NAMES = [
  'Telegram', 'YouTube', 'Google', 'GitHub', 'Netflix', 'Disney+', 'ChatGPT',
  'Claude', 'Gemini', 'Copilot', 'Twitter', 'Instagram', 'Facebook', 'Spotify',
  'TikTok', 'Discord', 'Reddit', 'Microsoft', 'OneDrive',
];

const DEFAULT_SERVICES = ['Telegram', 'YouTube', 'GitHub', 'ChatGPT'];

// 允许出现在命令参数里的字符（防命令注入，也覆盖 Windows 路径）。
const SAFE_ARG = /^[A-Za-z0-9_+\-./\\:]+$/;

function quoteForShell(value) {
  // 参数均已通过 SAFE_ARG 校验或由本插件生成；双引号包裹以兼容含空格的路径。
  return `"${value}"`;
}

function resolveRepoPath(config, sessionCwd) {
  const candidates = [];
  if (typeof config.repoPath === 'string' && config.repoPath.trim() !== '') {
    candidates.push(path.resolve(config.repoPath.trim()));
  }
  if (typeof sessionCwd === 'string' && sessionCwd.trim() !== '') {
    candidates.push(path.resolve(sessionCwd, 'surge-tuner'));
  }
  // 预设目录内自包含引擎快照（install 脚本打包，开箱即用）。
  candidates.push(path.resolve(__dirname, 'engine'));
  // 预设以 agent/ 子目录形式放在仓库内时，引擎就是仓库根。
  candidates.push(path.resolve(__dirname, '..'));
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'scripts', 'surge-config-generator.js'))) {
      return candidate;
    }
  }
  throw new Error(
    '找不到 surge-tuner 引擎：可用的定位方式依次为——'
    + '（1）在 agent.cordis.yml 的 surge-tools 行配置 repoPath；'
    + '（2）把 surge-tuner 仓库放在会话工作目录下；'
    + '（3）运行 agent/install 脚本把引擎打包进本预设的 engine/ 目录。'
    + `已尝试: ${candidates.join(' ; ')}`
  );
}

function sessionWorkspace(exec) {
  const cwd = exec && exec.agent && exec.agent.session && exec.agent.session.header
    ? exec.agent.session.header.cwd
    : undefined;
  return typeof cwd === 'string' && cwd.trim() !== '' ? cwd : undefined;
}

function writeTempAddresses(workspace, addresses) {
  const name = `.surge-tuner-addresses-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
  const filePath = path.join(workspace, name);
  // 写成 JSON 数组：订阅链接（http/https）会由生成器逐个拉取，
  // 节点 URI 与明文/Base64 订阅内容也能被逐项解析。
  const lines = String(addresses).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  fs.writeFileSync(filePath, JSON.stringify(lines), 'utf8');
  return filePath;
}

function cleanup(filePath) {
  try {
    if (typeof filePath === 'string' && filePath) fs.unlinkSync(filePath);
  } catch (_) {
    // 清理失败不影响结果。
  }
}

function normalizeServices(services) {
  if (services === undefined || services === null) return DEFAULT_SERVICES;
  if (!Array.isArray(services) || services.length === 0) return DEFAULT_SERVICES;
  const known = new Map(SERVICE_NAMES.map((name) => [name.toLowerCase(), name]));
  const picked = [];
  for (const raw of services) {
    if (typeof raw !== 'string') throw new Error('services 必须是字符串数组');
    const canonical = known.get(raw.trim().toLowerCase());
    if (canonical === undefined) {
      throw new Error(`未知服务: ${raw}。可用服务: ${SERVICE_NAMES.join(', ')}`);
    }
    if (!picked.includes(canonical)) picked.push(canonical);
  }
  return picked;
}

function normalizeOutputPath(output, workspace) {
  let target;
  if (output === undefined || output === null || String(output).trim() === '') {
    target = path.join(workspace, 'surge.conf');
  } else {
    const raw = String(output).trim();
    if (!SAFE_ARG.test(raw)) {
      throw new Error(`输出路径含不支持的字符: ${raw}`);
    }
    target = path.isAbsolute(raw) ? raw : path.resolve(workspace, raw);
  }
  return target;
}

function renderText(parts) {
  const text = parts.filter((part) => typeof part === 'string' && part.trim() !== '').join('\n');
  return [{ type: 'text', text }];
}

function clamp(text, limit) {
  const raw = String(text || '');
  return raw.length > limit ? `${raw.slice(0, limit)}\n...[输出过长已截断]` : raw;
}

async function runNode(ctx, repoPath, args, exec, timeoutMs) {
  const command = `node ${args.map(quoteForShell).join(' ')}`;
  return ctx.shell.run(ctx.shell.resolve({
    command,
    workdir: repoPath,
    timeoutMs,
    signal: exec && exec.signal ? exec.signal : undefined,
    stdoutMaxBytes: 256 * 1024,
  }));
}

const GENERATE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
    message: { type: 'string' },
    outputPath: { type: 'string' },
    stdout: { type: 'string' },
    stderr: { type: 'string' },
  },
  required: ['ok', 'exitCode', 'message'],
};

const PARSE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
    message: { type: 'string' },
    nodes: { type: 'string' },
    stderr: { type: 'string' },
  },
  required: ['ok', 'exitCode', 'message'],
};

const VALIDATE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
    message: { type: 'string' },
    stdout: { type: 'string' },
    stderr: { type: 'string' },
  },
  required: ['ok', 'exitCode', 'message'],
};

module.exports = {
  name: 'surge-tools',
  inject: ['tools', 'shell', 'systemPrompt'],
  apply(ctx, config) {
    ctx.systemPrompt.section({
      name: 'surge-tuner-workflow',
      order: 106,
      text: [
        '# Surge 配置生成工作流（surge-tuner）',
        '',
        '本会话通过 surge-tuner 引擎生成 Surge 配置。工作流如下：',
        '',
        '1. 识别输入：订阅链接（http/https）、节点链接（ss/trojan/vmess/hy2/hysteria2/tuic）、或已有 .conf 文件。',
        '2. 不确定节点情况时，先调用 surge_parse_addresses 预览节点（名称/协议/服务器），确认后再生成。',
        '3. 调用 surge_generate_profile：addresses 一行一个链接（多个节点多行）；services 用目录中的服务名，缺省为 Telegram、YouTube、GitHub、ChatGPT；需要去广告时 adblock 置 true；缺省输出到工作目录的 surge.conf。',
        '4. 生成器默认自带校验，校验失败时不要交付配置，按错误信息修正（常见原因：订阅过期、地址复制不完整、订阅需要换 User-Agent）。',
        '5. 手工修改配置后，必须再调用 surge_validate_profile 校验，确认无 error 才能交付。',
        '6. 交付时告知用户输出文件路径与导入步骤（Surge → 配置列表 → 从文件导入 → 启用并测试）。',
        '7. 安全：订阅链接、节点链接、生成的 .conf 均含私密 token 或密码——不要在回复中完整回显，不要写入公开仓库或发给他人；读取配置时只查看需要的行。',
        '8. 交付前存在 warning 时向用户说明风险；正式交付建议 strict 置 true。',
      ].join('\n'),
    });

    ctx.tools.register({
      name: 'surge_generate_profile',
      description: [
        '根据 VPN 节点或订阅地址生成可导入 Surge 的配置文件（.conf）。',
        'addresses 一行一个链接：支持订阅链接（http/https，自动拉取）、节点链接（ss:// trojan:// vmess:// hy2:// hysteria2:// tuic://）、以及明文/Base64 订阅内容。',
        'services 可选（目录：' + SERVICE_NAMES.join('、') + '），缺省为 Telegram、YouTube、GitHub、ChatGPT。',
        'adblock 置 true 时集成去广告规则（需按 MITM 指南启用解密才生效）。',
        '生成器默认自带配置校验；校验有 error 时不要把配置作为成品交付。',
      ].join(' '),
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          addresses: {
            type: 'string',
            description: '订阅链接或节点链接，一行一个；多个节点写多行。',
          },
          services: {
            type: 'array',
            items: { type: 'string', enum: [...SERVICE_NAMES] },
            description: '需要分流规则的境外服务名；缺省使用 Telegram、YouTube、GitHub、ChatGPT。',
          },
          preset: {
            type: 'string',
            enum: ['common'],
            description: "服务预置组合；'common' 等价于缺省服务集合。",
          },
          adblock: {
            type: 'boolean',
            description: '是否集成去广告规则（默认 false）。',
          },
          output: {
            type: 'string',
            description: '输出文件路径；缺省为工作目录下的 surge.conf。',
          },
          strict: {
            type: 'boolean',
            description: '把校验 warning 也当失败处理（正式交付建议 true）。',
          },
        },
        required: ['addresses'],
      },
      output: {
        schema: GENERATE_OUTPUT_SCHEMA,
        render(_args, value) {
          return renderText([
            value.message,
            value.outputPath ? `输出文件: ${value.outputPath}` : '',
            value.stderr ? `stderr:\n${clamp(value.stderr, 4000)}` : '',
            value.stdout ? `stdout:\n${clamp(value.stdout, 4000)}` : '',
          ]);
        },
      },
      async execute(args, exec) {
        const workspace = sessionWorkspace(exec);
        if (workspace === undefined) {
          throw new Error('无法确定会话工作目录，请检查会话配置');
        }
        const repoPath = resolveRepoPath(config || {}, workspace);
        const rawAddresses = String(args.addresses || '').trim();
        if (!rawAddresses) {
          throw new Error('addresses 不能为空：请提供订阅链接或节点链接（一行一个）');
        }
        const services = normalizeServices(args.services);
        const preset = typeof args.preset === 'string' && args.preset.trim() !== '' ? args.preset.trim() : null;
        const outputPath = normalizeOutputPath(args.output, workspace);
        const tmpFile = writeTempAddresses(workspace, rawAddresses);
        const argv = ['scripts/surge-config-generator.js', '--addresses', tmpFile, '--output', outputPath];
        try {
          if (preset !== null) {
            argv.push('--preset', preset);
          } else {
            argv.push('--services', services.join(','));
          }
          if (args.adblock === true) argv.push('--adblock');
          if (args.strict === true) argv.push('--strict');
          const result = await runNode(ctx, repoPath, argv, exec, 180000);
          if (result.aborted) {
            return { ok: false, exitCode: null, message: '生成被取消', outputPath: null, stdout: '', stderr: '' };
          }
          const generated = fs.existsSync(outputPath);
          const ok = result.exitCode === 0 && generated;
          return {
            ok,
            exitCode: result.exitCode,
            message: ok
              ? `Surge 配置已生成并通过校验（${services.join('、')}${args.adblock ? '，含去广告' : ''}）`
              : `生成失败（exit ${result.exitCode}）。常见原因：订阅过期、地址复制不完整、订阅返回托管配置。`,
            outputPath: generated ? outputPath : null,
            stdout: clamp(result.stdout.text, 4000),
            stderr: clamp(result.stderr.text, 4000),
          };
        } finally {
          cleanup(tmpFile);
        }
      },
    });

    ctx.tools.register({
      name: 'surge_parse_addresses',
      description: [
        '解析订阅链接或节点链接，返回节点列表（名称、协议、服务器、端口），不生成配置。',
        '用于生成前先确认节点情况。支持 ss:// trojan:// vmess:// hy2:// hysteria2:// tuic:// 与明文/Base64 订阅内容。',
      ].join(' '),
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          addresses: {
            type: 'string',
            description: '订阅链接或节点链接，一行一个；多个节点写多行。',
          },
        },
        required: ['addresses'],
      },
      output: {
        schema: PARSE_OUTPUT_SCHEMA,
        render(_args, value) {
          return renderText([
            value.message,
            value.nodes ? `节点列表:\n${clamp(value.nodes, 6000)}` : '',
            value.stderr ? `stderr:\n${clamp(value.stderr, 4000)}` : '',
          ]);
        },
      },
      async execute(args, exec) {
        const workspace = sessionWorkspace(exec);
        if (workspace === undefined) {
          throw new Error('无法确定会话工作目录，请检查会话配置');
        }
        const repoPath = resolveRepoPath(config || {}, workspace);
        const rawAddresses = String(args.addresses || '').trim();
        if (!rawAddresses) {
          throw new Error('addresses 不能为空：请提供订阅链接或节点链接（一行一个）');
        }
        const tmpFile = writeTempAddresses(workspace, rawAddresses);
        const inline = [
          "const fs = require('node:fs');",
          "const { loadProxySource } = require('./scripts/surge-proxy-parser');",
          'const entries = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));',
          'loadProxySource({ addresses: entries })',
          '  .then((list) => console.log(JSON.stringify(list.map((e) => ({ name: e.name, type: e.type, host: e.host, port: e.port })))))',
          '  .catch((error) => { console.error(error.message); process.exit(1); });',
        ].join(' ');
        try {
          const result = await runNode(ctx, repoPath, ['-e', inline, tmpFile], exec, 120000);
          if (result.aborted) {
            return { ok: false, exitCode: null, message: '解析被取消', nodes: '', stderr: '' };
          }
          let nodes = '';
          let count = 0;
          try {
            const parsed = JSON.parse(result.stdout.text);
            count = Array.isArray(parsed) ? parsed.length : 0;
            nodes = JSON.stringify(parsed, null, 2);
          } catch (_) {
            // stdout 不是 JSON 时保持为空。
          }
          const ok = result.exitCode === 0 && count > 0;
          return {
            ok,
            exitCode: result.exitCode,
            message: ok ? `解析成功，共 ${count} 个节点` : `解析失败（exit ${result.exitCode}）`,
            nodes,
            stderr: clamp(result.stderr.text, 4000),
          };
        } finally {
          cleanup(tmpFile);
        }
      },
    });

    ctx.tools.register({
      name: 'surge_validate_profile',
      description: [
        '校验一个 Surge 配置文件（.conf）。',
        '生成器默认自带校验；手工修改配置后必须再调用本工具。',
        '有 error 时配置不可交付；有 warning 时需向用户说明风险。strict 置 true 时 warning 也视为失败。',
      ].join(' '),
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: {
            type: 'string',
            description: '要校验的 .conf 文件路径（相对路径按会话工作目录解析）。',
          },
          strict: {
            type: 'boolean',
            description: '把 warning 也当失败处理。',
          },
        },
        required: ['path'],
      },
      output: {
        schema: VALIDATE_OUTPUT_SCHEMA,
        render(_args, value) {
          return renderText([
            value.message,
            value.stdout ? `stdout:\n${clamp(value.stdout, 6000)}` : '',
            value.stderr ? `stderr:\n${clamp(value.stderr, 4000)}` : '',
          ]);
        },
      },
      async execute(args, exec) {
        const workspace = sessionWorkspace(exec);
        if (workspace === undefined) {
          throw new Error('无法确定会话工作目录，请检查会话配置');
        }
        const repoPath = resolveRepoPath(config || {}, workspace);
        const raw = String(args.path || '').trim();
        if (!raw) {
          throw new Error('path 不能为空');
        }
        if (!SAFE_ARG.test(raw)) {
          throw new Error(`路径含不支持的字符: ${raw}`);
        }
        const target = path.isAbsolute(raw) ? raw : path.resolve(workspace, raw);
        if (!fs.existsSync(target)) {
          throw new Error(`文件不存在: ${target}`);
        }
        const argv = ['scripts/surge-config-validator.js', target];
        if (args.strict === true) argv.push('--strict');
        const result = await runNode(ctx, repoPath, argv, exec, 60000);
        if (result.aborted) {
          return { ok: false, exitCode: null, message: '校验被取消', stdout: '', stderr: '' };
        }
        const ok = result.exitCode === 0;
        return {
          ok,
          exitCode: result.exitCode,
          message: ok ? '校验通过' : `校验未通过（exit ${result.exitCode}），不要将配置作为成品交付`,
          stdout: clamp(result.stdout.text, 6000),
          stderr: clamp(result.stderr.text, 4000),
        };
      },
    });
  },
};
