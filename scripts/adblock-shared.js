'use strict';

// 去广告共享片段：Surge/Loon 配置生成器与 adblock-installer 的单一事实来源。
// qx 的 rewrite 语法不同，不使用本模块。

// [Script] 注入条目元数据。渲染顺序即数组顺序。
const ADBLOCK_SCRIPTS = [
  { type: 'http-response', pattern: '^https?://.*', scriptPath: 'scripts/ad-block-all.js', requiresBody: true },
  { type: 'http-request', pattern: '^https?://.*', scriptPath: 'scripts/anti-tracking.js', requiresBody: false },
  { type: 'http-response', pattern: '^https?://.*', scriptPath: 'scripts/anti-tracking.js', requiresBody: false }
];

// Surge MITM hostname 列表（surge-config-generator 标准/ unified 两处原完全一致，收敛于此）。
// 注意：loon/qx 生成器各自的短版列表保持原样，不用这份。
const MITM_HOSTNAMES = [
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

// Surge 语法：http-response <pattern> requires-body = true script-path = <path>
function renderSurgeScriptLines() {
  return ADBLOCK_SCRIPTS.map((script) => {
    const requiresBody = script.requiresBody ? 'requires-body = true ' : '';
    return `${script.type} ${script.pattern} ${requiresBody}script-path = ${script.scriptPath}`;
  });
}

// Loon 语法：http-response <pattern> script-path = <path>, requires-body = true
function renderLoonScriptLines() {
  return ADBLOCK_SCRIPTS.map((script) => {
    const requiresBody = script.requiresBody ? ', requires-body = true' : '';
    return `${script.type} ${script.pattern} script-path = ${script.scriptPath}${requiresBody}`;
  });
}

module.exports = {
  ADBLOCK_SCRIPTS,
  MITM_HOSTNAMES,
  renderSurgeScriptLines,
  renderLoonScriptLines
};
