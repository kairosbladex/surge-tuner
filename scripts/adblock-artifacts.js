'use strict';

const fs = require('fs');
const path = require('path');

const {
  generateSurgeModule,
  generateLoonAdblockConfig,
  generateClashRuleProviders,
  generateQXAdblockConfig
} = require('./adblock-installer');

function createAdblockArtifact(platform, options = {}) {
  const normalized = normalizePlatform(platform);
  const customDomains = options.customDomains || [];
  const useOnlineRules = options.useOnlineRules !== false;
  const onlineSources = options.onlineSources;

  if (normalized === 'surge') {
    return buildArtifact('surge-adblock-module', options.outputName || 'proxy-tuner-adblock.sgmodule', 'Surge ad-block module.', generateSurgeModule({
      name: options.name || 'Proxy-Tuner-AdBlock',
      desc: options.desc || 'Ad-block module generated with the proxy profile.',
      customDomains,
      useOnlineRules,
      onlineSources,
      extraScripts: options.extraScripts
    }));
  }
  if (normalized === 'loon') {
    return buildArtifact('loon-adblock-config', options.outputName || 'proxy-tuner-loon-adblock.conf', 'Loon ad-block snippet with kelee.one references.', generateLoonAdblockConfig({
      customDomains,
      useOnlineRules,
      onlineSources,
      useKelee: options.useKelee !== false
    }));
  }
  if (normalized === 'quantumultx') {
    return buildArtifact('quantumultx-adblock-snippet', options.outputName || 'proxy-tuner-qx-adblock.conf', 'Quantumult X ad-block snippet.', generateQXAdblockConfig({
      customDomains,
      useOnlineRules,
      onlineSources
    }));
  }
  if (normalized === 'clash') {
    return buildArtifact('clash-adblock-rule-providers', options.outputName || 'proxy-tuner-clash-adblock.yaml', 'Clash/Stash ad-block rule-provider snippet.', generateClashRuleProviders({
      customDomains,
      useOnlineRules,
      onlineSources
    }), 'application/x-yaml');
  }
  throw new Error(`Unsupported platform for ad-block artifact: ${platform}`);
}

function createAdblockInstructionArtifact(platform) {
  const normalized = normalizePlatform(platform);
  const lines = [
    '# 去广告导入说明',
    '',
    `平台: ${normalized}`,
    ''
  ];

  if (normalized === 'surge') {
    lines.push('1. 将主配置导入 Surge。', '2. 将 `.sgmodule` 文件导入 Surge → 模块。', '3. 开启 MITM，并在系统设置中信任 Surge CA。');
  } else if (normalized === 'loon') {
    lines.push('1. 将主配置导入 Loon。', '2. 在 Loon 插件中导入生成的片段。', '3. 如需 kelee.one 插件，先运行 `bash kelee/fetch-plugins.sh` 查看推荐项。');
  } else if (normalized === 'quantumultx') {
    lines.push('1. 将主配置导入 Quantumult X。', '2. 将生成片段合并到 rewrite/filter/MITM 对应区段。', '3. 开启 MITM 并信任证书。');
  } else if (normalized === 'clash') {
    lines.push('1. 将主配置导入 Clash/Stash。', '2. 将 rule-providers 片段合并到 YAML。', '3. Clash 不执行 MITM 脚本，仅使用规则层拦截。');
  }

  return buildArtifact('adblock-import-guide', 'adblock-import-guide.md', 'Human-readable ad-block import steps.', `${lines.join('\n')}\n`, 'text/markdown');
}

function writeAdblockSidecar(profileOutputPath, platform, options = {}) {
  const artifact = createAdblockArtifact(platform, options);
  const sidecarPath = options.outputPath
    ? path.resolve(process.cwd(), options.outputPath)
    : defaultSidecarPath(profileOutputPath, artifact.name);
  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
  fs.writeFileSync(sidecarPath, artifact.text, 'utf8');
  return { ...artifact, path: sidecarPath };
}

function defaultSidecarPath(profileOutputPath, artifactName) {
  const resolved = path.resolve(process.cwd(), profileOutputPath || artifactName);
  const dir = path.dirname(resolved);
  const base = path.basename(resolved, path.extname(resolved));
  return path.join(dir, `${base}.${artifactName}`);
}

function buildArtifact(artifactId, name, description, text, mimeType = 'text/plain') {
  return { artifactId, name, description, text, mimeType };
}

function normalizePlatform(platform) {
  const value = String(platform || 'surge').toLowerCase();
  if (value === 'qx') return 'quantumultx';
  if (value === 'stash') return 'clash';
  return value;
}

module.exports = {
  createAdblockArtifact,
  createAdblockInstructionArtifact,
  writeAdblockSidecar,
  normalizePlatform
};
