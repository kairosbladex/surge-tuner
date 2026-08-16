'use strict';

// quick-start 本地 UI 的内嵌 HTML 页面模板（renderPage）。
// 设计基准：代理客户端仪表盘审美（Surge / Clash Verge / Stash）——
// 深色优先、玻璃质感卡片、紧凑密度、靛蓝→青色渐变强调色。

function renderPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Proxy Tuner Quick Start</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #090d14;
      --bg-glow-1: rgba(79, 124, 255, 0.07);
      --bg-glow-2: rgba(34, 211, 238, 0.05);
      --panel: #111827;
      --panel-grad: linear-gradient(180deg, #141c2e 0%, #101725 100%);
      --panel-inset: #0b1120;
      --text: #e6ecf5;
      --muted: #8b98ad;
      --faint: #5b6a82;
      --border: rgba(148, 163, 184, 0.13);
      --border-strong: rgba(148, 163, 184, 0.26);
      --accent: #4f7cff;
      --accent-2: #22d3ee;
      --accent-text: #9db4ff;
      --accent-soft: rgba(79, 124, 255, 0.12);
      --accent-ring: rgba(79, 124, 255, 0.35);
      --accent-glow: 0 10px 30px -10px rgba(79, 124, 255, 0.55);
      --ok: #34d399;
      --ok-soft: rgba(52, 211, 153, 0.1);
      --error: #f87171;
      --error-soft: rgba(248, 113, 113, 0.1);
      --code-bg: #0a0f1c;
      --code: #c7d2e8;
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 12px 32px -12px rgba(0, 0, 0, 0.5);
      --radius: 16px;
      --radius-sm: 12px;
      --mono: ui-monospace, SFMono-Regular, Menlo, "Cascadia Mono", monospace;
    }
    @media (prefers-color-scheme: light) {
      :root {
        color-scheme: light;
        --bg: #eef2f8;
        --bg-glow-1: rgba(79, 124, 255, 0.1);
        --bg-glow-2: rgba(34, 211, 238, 0.08);
        --panel: #ffffff;
        --panel-grad: linear-gradient(180deg, #ffffff 0%, #f8fafd 100%);
        --panel-inset: #f1f5fb;
        --text: #0f172a;
        --muted: #5d6b82;
        --faint: #8b98ad;
        --border: rgba(15, 23, 42, 0.1);
        --border-strong: rgba(15, 23, 42, 0.2);
        --accent: #2563eb;
        --accent-2: #0891b2;
        --accent-text: #1d4ed8;
        --accent-soft: rgba(37, 99, 235, 0.08);
        --accent-ring: rgba(37, 99, 235, 0.3);
        --accent-glow: 0 10px 26px -12px rgba(37, 99, 235, 0.45);
        --ok: #059669;
        --ok-soft: rgba(5, 150, 105, 0.08);
        --error: #dc2626;
        --error-soft: rgba(220, 38, 38, 0.07);
        --code-bg: #0f172a;
        --code: #e2e8f0;
        --shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px -16px rgba(15, 23, 42, 0.18);
      }
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      font-size: 14px;
      background:
        radial-gradient(1000px 500px at 85% -10%, var(--bg-glow-1) 0%, transparent 55%),
        radial-gradient(800px 420px at -10% 30%, var(--bg-glow-2) 0%, transparent 50%),
        var(--bg);
      background-attachment: fixed;
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    /* ── 顶部栏 ── */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      background: color-mix(in srgb, var(--bg) 78%, transparent);
      border-bottom: 1px solid var(--border);
    }
    .topbar-inner {
      max-width: 1080px;
      margin: 0 auto;
      padding: 0 clamp(16px, 4vw, 40px);
      height: 58px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
    .brand-mark {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
      display: grid;
      place-items: center;
      box-shadow: var(--accent-glow);
      flex-shrink: 0;
    }
    .brand-tag {
      font-size: 11px;
      font-weight: 600;
      color: var(--accent-text);
      background: var(--accent-soft);
      border: 1px solid var(--accent-ring);
      padding: 2px 8px;
      border-radius: 999px;
      letter-spacing: 0.02em;
    }
    .topbar-spacer { flex: 1; }
    .privacy-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--panel) 70%, transparent);
      padding: 5px 11px;
      border-radius: 999px;
    }
    .privacy-pill .dot-ok {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ok);
      box-shadow: 0 0 8px var(--ok);
    }

    /* ── 页头 ── */
    .pagehead {
      max-width: 1080px;
      margin: 0 auto;
      padding: 34px clamp(16px, 4vw, 40px) 8px;
    }
    .pagehead h1 {
      margin: 0 0 8px;
      font-size: clamp(24px, 3.4vw, 32px);
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .pagehead h1 .grad {
      background: linear-gradient(120deg, var(--accent) 10%, var(--accent-2) 90%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .pagehead p { margin: 0; color: var(--muted); max-width: 640px; }

    /* ── 步骤条 ── */
    .stepper {
      max-width: 1080px;
      margin: 0 auto;
      padding: 18px clamp(16px, 4vw, 40px) 4px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .step-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--faint);
      padding: 5px 12px 5px 6px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--panel) 60%, transparent);
      transition: color 0.15s, border-color 0.15s, background 0.15s;
    }
    .step-pill .num {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 11px;
      font-weight: 700;
      background: var(--panel-inset);
      border: 1px solid var(--border-strong);
      color: var(--muted);
      transition: all 0.15s;
    }
    .step-pill.active {
      color: var(--accent-text);
      border-color: var(--accent-ring);
      background: var(--accent-soft);
    }
    .step-pill.active .num {
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      border-color: transparent;
      color: #fff;
    }
    .step-link { color: var(--faint); font-size: 11px; user-select: none; }

    /* ── 主网格 ── */
    main {
      max-width: 1080px;
      margin: 0 auto;
      padding: 16px clamp(16px, 4vw, 40px) 44px;
      display: grid;
      grid-template-columns: minmax(0, 1.12fr) minmax(330px, 0.88fr);
      gap: 20px;
      align-items: start;
    }
    .card {
      background: var(--panel-grad);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 22px;
    }
    .card > h2 {
      margin: 0 0 18px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      color: var(--faint);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card > h2::after { content: ""; flex: 1; height: 1px; background: var(--border); }
    .sticky { position: sticky; top: 78px; }

    /* ── 表单 ── */
    .field { margin-bottom: 22px; }
    .field-label {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-weight: 650;
      font-size: 13.5px;
      margin-bottom: 6px;
    }
    .field-label .idx {
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 700;
      color: var(--accent-text);
      background: var(--accent-soft);
      border: 1px solid var(--accent-ring);
      border-radius: 6px;
      padding: 1px 6px;
    }
    .field-hint { font-size: 12px; color: var(--muted); margin: 0 0 8px; }
    textarea {
      width: 100%;
      min-height: 170px;
      resize: vertical;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 13px 14px;
      font: 13px/1.7 var(--mono);
      color: var(--text);
      background: var(--panel-inset);
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    textarea::placeholder { color: var(--faint); }
    textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft), 0 0 0 1px var(--accent);
    }
    .sample-row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .sample-btn {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      font-size: 12px;
      padding: 4px 11px;
      border-radius: 999px;
      cursor: pointer;
      font-family: inherit;
      min-height: 0;
      box-shadow: none;
      transition: color 0.12s, border-color 0.12s, background 0.12s;
    }
    .sample-btn:hover { color: var(--accent-text); border-color: var(--accent-ring); background: var(--accent-soft); transform: none; filter: none; }

    .help-callout {
      display: flex;
      gap: 9px;
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      background: color-mix(in srgb, var(--accent-soft) 45%, transparent);
      font-size: 12.5px;
      line-height: 1.65;
      color: var(--muted);
    }
    .help-callout strong { color: var(--text); }
    .help-callout code, .faq-a code {
      font-family: var(--mono);
      font-size: 11.5px;
      background: var(--panel-inset);
      border: 1px solid var(--border);
      padding: 1px 5px;
      border-radius: 5px;
      color: var(--accent-text);
    }

    /* ── 平台选择 ── */
    .platforms {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .platforms label { position: relative; display: block; margin: 0; }
    .platforms input { position: absolute; opacity: 0; pointer-events: none; }
    .platforms .tile {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      min-height: 74px;
      padding: 10px 8px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--panel-inset);
      color: var(--text);
      font-weight: 650;
      font-size: 13.5px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.14s, background 0.14s, box-shadow 0.14s, transform 0.14s;
    }
    .platforms .tile .badge {
      font-size: 10px;
      font-weight: 600;
      color: var(--faint);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .platforms .tile .tick {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 1.5px solid var(--border-strong);
      display: grid;
      place-items: center;
      font-size: 10px;
      color: transparent;
      transition: all 0.14s;
    }
    .platforms .tile:hover { border-color: var(--border-strong); transform: translateY(-1px); }
    .platforms input:checked + .tile {
      border-color: var(--accent);
      background: linear-gradient(180deg, var(--accent-soft), transparent 140%);
      box-shadow: 0 0 0 1px var(--accent), 0 6px 18px -8px var(--accent-ring);
    }
    .platforms input:checked + .tile .badge { color: var(--accent-text); }
    .platforms input:checked + .tile .tick {
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      border-color: transparent;
      color: #fff;
    }
    .platforms input:focus-visible + .tile { box-shadow: 0 0 0 3px var(--accent-soft); }

    /* ── 开关选项 ── */
    .options {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      overflow: hidden;
      background: var(--panel-inset);
    }
    .option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .option + .option { border-top: 1px solid var(--border); }
    .option:hover { background: color-mix(in srgb, var(--accent-soft) 40%, transparent); }
    .option input { position: absolute; opacity: 0; pointer-events: none; }
    .option .switch {
      flex-shrink: 0;
      width: 36px;
      height: 21px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--faint) 45%, transparent);
      position: relative;
      transition: background 0.16s;
    }
    .option .switch::after {
      content: "";
      position: absolute;
      top: 2.5px;
      left: 2.5px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
      transition: transform 0.16s;
    }
    .option input:checked ~ .switch { background: linear-gradient(135deg, var(--accent), var(--accent-2)); }
    .option input:checked ~ .switch::after { transform: translateX(15px); }
    .option input:focus-visible ~ .switch { box-shadow: 0 0 0 3px var(--accent-soft); }
    .option .check-text { display: grid; gap: 1px; }
    .option .check-title { font-weight: 600; font-size: 13px; }
    .option .check-desc { font-size: 12px; color: var(--muted); line-height: 1.5; }

    /* ── 主按钮 ── */
    button {
      font-family: inherit;
    }
    .submit-btn {
      width: 100%;
      min-height: 50px;
      margin-top: 2px;
      border: 0;
      border-radius: var(--radius-sm);
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 130%);
      color: #fff;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
      box-shadow: var(--accent-glow);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      transition: transform 0.13s, box-shadow 0.13s, filter 0.13s;
    }
    .submit-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.07); }
    .submit-btn:active:not(:disabled) { transform: translateY(0); }
    .submit-btn:disabled { opacity: 0.75; cursor: wait; }
    .spinner {
      width: 17px;
      height: 17px;
      border: 2.5px solid rgba(255, 255, 255, 0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      display: none;
    }
    .submit-btn:disabled .spinner { display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── 结果区 ── */
    .result { display: grid; gap: 14px; align-content: start; }
    .status {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      background: var(--panel-inset);
      color: var(--muted);
      font-size: 13px;
      white-space: pre-wrap;
    }
    .status.working { color: var(--accent-text); border-color: var(--accent-ring); background: var(--accent-soft); }
    .status.ok { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 30%, transparent); background: var(--ok-soft); }
    .status.error { color: var(--error); border-color: color-mix(in srgb, var(--error) 30%, transparent); background: var(--error-soft); }
    .status-icon { flex-shrink: 0; margin-top: 1px; }
    .empty-state {
      text-align: center;
      padding: 44px 20px;
      color: var(--faint);
      font-size: 13px;
    }
    .empty-state svg { opacity: 0.5; margin-bottom: 12px; }

    .result-group {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      overflow: hidden;
      background: var(--panel-inset);
    }
    .result-header {
      padding: 11px 14px;
      font-weight: 700;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--accent-soft) 40%, transparent);
    }
    .result-header .chip {
      font-family: var(--mono);
      font-size: 10.5px;
      font-weight: 700;
      color: var(--accent-text);
      border: 1px solid var(--accent-ring);
      border-radius: 6px;
      padding: 1px 7px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .result-body { padding: 14px; display: grid; gap: 14px; }
    .result-section h3 {
      margin: 0 0 7px;
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--faint);
      font-weight: 700;
    }
    .path-list { display: grid; gap: 7px; }
    .path-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 9px;
    }
    .path-label {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 700;
      color: var(--faint);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      min-width: 52px;
    }
    .path-value {
      flex: 1;
      font-family: var(--mono);
      font-size: 12px;
      color: var(--code);
      overflow-wrap: anywhere;
    }
    .mini-copy {
      flex-shrink: 0;
      border: 1px solid var(--border-strong);
      background: transparent;
      color: var(--muted);
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 6px;
      cursor: pointer;
      min-height: 0;
      box-shadow: none;
      transition: all 0.12s;
    }
    .mini-copy:hover { color: var(--accent-text); border-color: var(--accent-ring); background: var(--accent-soft); transform: none; filter: none; }
    ol.steps { margin: 0; padding-left: 20px; line-height: 1.85; font-size: 13px; color: var(--text); }
    ol.steps li::marker { color: var(--accent-text); font-weight: 700; font-family: var(--mono); font-size: 12px; }
    .code-block { position: relative; }
    pre {
      margin: 0;
      padding: 12px 14px;
      background: var(--code-bg);
      border: 1px solid var(--border);
      color: var(--code);
      border-radius: 9px;
      overflow: auto;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      font: 12px/1.6 var(--mono);
    }
    .copy-btn {
      position: absolute;
      top: 7px;
      right: 7px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: rgba(255, 255, 255, 0.07);
      color: #dbe4f3;
      font-size: 11px;
      padding: 3px 9px;
      border-radius: 6px;
      cursor: pointer;
      min-height: 0;
      box-shadow: none;
      transition: background 0.12s;
    }
    .copy-btn:hover { background: rgba(255, 255, 255, 0.16); transform: none; filter: none; }

    /* ── FAQ ── */
    .faq { max-width: 1080px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 40px) 28px; }
    .faq-card {
      background: var(--panel-grad);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .faq-title {
      padding: 15px 22px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      color: var(--faint);
      border-bottom: 1px solid var(--border);
    }
    .faq-item { border-bottom: 1px solid var(--border); }
    .faq-item:last-child { border-bottom: 0; }
    .faq-q {
      width: 100%;
      text-align: left;
      padding: 13px 22px;
      background: transparent;
      border: 0;
      color: var(--text);
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      box-shadow: none;
      border-radius: 0;
      min-height: 0;
      transition: background 0.12s;
    }
    .faq-q:hover { background: color-mix(in srgb, var(--accent-soft) 45%, transparent); transform: none; filter: none; }
    .faq-q .plus {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      border-radius: 6px;
      border: 1px solid var(--border-strong);
      display: grid;
      place-items: center;
      color: var(--muted);
      font-size: 13px;
      font-weight: 400;
      transition: all 0.16s;
    }
    .faq-item.open .faq-q .plus {
      background: var(--accent-soft);
      border-color: var(--accent-ring);
      color: var(--accent-text);
      transform: rotate(45deg);
    }
    .faq-a {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.22s ease-out;
      padding: 0 22px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.75;
    }
    .faq-item.open .faq-a { max-height: 340px; padding-bottom: 15px; }

    footer {
      max-width: 1080px;
      margin: 0 auto;
      padding: 0 clamp(16px, 4vw, 40px) 36px;
      color: var(--faint);
      font-size: 12px;
      text-align: center;
    }
    footer .sep { margin: 0 6px; opacity: 0.5; }

    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      .sticky { position: static; }
      .platforms { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .step-link { display: none; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <span class="brand-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2.2"/><circle cx="8" cy="16" r="2.2"/></svg>
        </span>
        <span>Proxy Tuner</span>
        <span class="brand-tag">Quick Start</span>
      </div>
      <div class="topbar-spacer"></div>
      <span class="privacy-pill"><span class="dot-ok"></span>本地运行 · 127.0.0.1</span>
    </div>
  </div>

  <div class="pagehead">
    <h1>生成你的<span class="grad">代理配置</span></h1>
    <p>粘贴节点或订阅链接，本机生成 Surge、Loon、Quantumult X、Clash 配置。零依赖，不需要 npm install，地址不会离开这台电脑。</p>
  </div>

  <div class="stepper" aria-hidden="true">
    <span class="step-pill active"><span class="num">1</span>粘贴地址</span>
    <span class="step-link">───</span>
    <span class="step-pill"><span class="num">2</span>选择平台</span>
    <span class="step-link">───</span>
    <span class="step-pill"><span class="num">3</span>生成选项</span>
    <span class="step-link">───</span>
    <span class="step-pill"><span class="num">4</span>导入手机</span>
  </div>

  <main>
    <section class="card">
      <h2>配置生成器</h2>
      <form id="form">
        <div class="field">
          <label class="field-label" for="addresses"><span class="idx">01</span>节点 / 订阅地址</label>
          <p class="field-hint">每行一个。支持 ss / trojan / vmess / hy2 / tuic 节点链接，或机场订阅 URL。</p>
          <textarea id="addresses" name="addresses" spellcheck="false" placeholder="trojan://secret@hk.example.com:443?sni=hk.example.com#HK-01&#10;ss://...@jp.example.com:8388#JP-01&#10;https://your-airport.com/sub?token=..."></textarea>
          <div class="sample-row">
            <button type="button" class="sample-btn" data-sample="trojan">填充 Trojan 示例</button>
            <button type="button" class="sample-btn" data-sample="subscription">填充订阅链接示例</button>
            <button type="button" class="sample-btn" data-sample="clear">清空</button>
          </div>
          <div class="help-callout">
            <span>💡</span>
            <span><strong>地址从哪来？</strong>机场后台的「节点列表」可复制单条 <code>trojan://</code> / <code>ss://</code> 链接；「订阅地址」则是一整条 <code>https://...</code> URL。两种都可以直接粘贴。</span>
          </div>
        </div>

        <div class="field">
          <label class="field-label"><span class="idx">02</span>目标平台</label>
          <p class="field-hint">可多选，只勾你设备上已安装的 App。</p>
          <div class="platforms" aria-label="选择平台（可多选）">
            <label><input type="checkbox" name="platform" value="surge" checked><span class="tile"><span class="tick">✓</span><span class="badge">iOS / macOS</span>Surge</span></label>
            <label><input type="checkbox" name="platform" value="loon"><span class="tile"><span class="tick">✓</span><span class="badge">iOS</span>Loon</span></label>
            <label><input type="checkbox" name="platform" value="quantumultx"><span class="tile"><span class="tick">✓</span><span class="badge">iOS</span>QX</span></label>
            <label><input type="checkbox" name="platform" value="clash"><span class="tile"><span class="tick">✓</span><span class="badge">全平台</span>Clash</span></label>
          </div>
          <div class="help-callout">
            <span>📱</span>
            <span><strong>怎么选？</strong>iPhone 上 <strong>Surge</strong> 功能最全（付费）；<strong>Loon</strong>、<strong>Quantumult X</strong> 是同类替代；安卓 / Windows / Mac 桌面端用 <strong>Clash</strong> 系列（iOS 用 Stash）。</span>
          </div>
        </div>

        <div class="field">
          <label class="field-label"><span class="idx">03</span>生成选项</label>
          <div class="options">
            <label class="option">
              <input type="checkbox" id="common" checked>
              <span class="switch"></span>
              <span class="check-text">
                <span class="check-title">常用应用路由</span>
                <span class="check-desc">为流媒体、AI、社媒等常用服务自动分配策略组，建议保持开启。</span>
              </span>
            </label>
            <label class="option">
              <input type="checkbox" id="adBlock" checked>
              <span class="switch"></span>
              <span class="check-text">
                <span class="check-title">同时生成去广告配置</span>
                <span class="check-desc">输出 MITM 与脚本/规则片段，需在 App 内安装 MITM 证书后生效。</span>
              </span>
            </label>
            <label class="option">
              <input type="checkbox" id="unified">
              <span class="switch"></span>
              <span class="check-text">
                <span class="check-title">一体化模式（unified）</span>
                <span class="check-desc">主配置 + 去广告合并为一个文件，订阅走平台原生引用。新手推荐，导入更省事。</span>
              </span>
            </label>
            <label class="option">
              <input type="checkbox" id="discoverRules">
              <span class="switch"></span>
              <span class="check-text">
                <span class="check-title">缺失服务时检索 GitHub 规则</span>
                <span class="check-desc">本地规则表没有的服务自动从社区规则库检索，网络慢时可不勾。</span>
              </span>
            </label>
          </div>
        </div>

        <button id="submit" class="submit-btn" type="submit"><span class="spinner"></span><span class="btn-text">生成配置 →</span></button>
      </form>
    </section>

    <section class="card result sticky" aria-live="polite">
      <h2>生成结果</h2>
      <div id="status" class="status"><span class="status-icon">⏳</span>等待输入。生成文件会写入 configs/generated/quick-start/，该目录不会进入 Git。</div>
      <div id="details">
        <div class="empty-state">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3.2"/></svg>
          <div>填写左侧信息并点击「生成配置」<br>结果与导入步骤将显示在这里</div>
        </div>
      </div>
    </section>
  </main>

  <section class="faq">
    <div class="faq-card">
      <div class="faq-title">新手常见问题</div>
      <div class="faq-item">
        <button class="faq-q" type="button">VPN 地址是什么？我从哪里能拿到？<span class="plus">+</span></button>
        <div class="faq-a">VPN 地址是描述你的代理节点的链接，或一整条订阅 URL。通常来自你购买的「机场」（代理服务商）后台：① 在节点列表里复制单条 <code>trojan://</code>、<code>ss://</code>、<code>vmess://</code> 链接；② 或复制「订阅地址」，形如 <code>https://xxx.com/sub?token=...</code>。每行粘贴一个到上方文本框即可。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">应该选哪个平台？<span class="plus">+</span></button>
        <div class="faq-a">看你的设备上装了哪个 App：iPhone 上最常用的是 <strong>Surge</strong>（需付费，功能最全）；<strong>Loon</strong> 和 <strong>Quantumult X</strong> 是同类替代；安卓 / Windows / Mac 桌面端通常用 <strong>Clash</strong> 系列（iOS 用 Stash）。只勾选你已安装的客户端即可。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">生成后怎么导入到 App？<span class="plus">+</span></button>
        <div class="faq-a">生成完成后，右侧结果区会列出每个平台的「导入步骤」。简单说：① 把主配置文件传到手机（AirDrop / iCloud / 文件 App）；② 在 Surge/Loon 等 App 里选择「从文件导入」；③ 如果启用了去广告，还要导入额外的 sidecar 文件；④ 最后在 App 里开启 MITM 开关。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">什么是 MITM 证书？必须配置吗？<span class="plus">+</span></button>
        <div class="faq-a">MITM 用于解密 HTTPS 流量，是去广告脚本生效的前提。如果你<strong>不需要去广告</strong>，可以不勾选「同时生成去广告配置」，就不用配置 MITM。如果启用了去广告，每个 App 的「导入步骤」会标注需要安装并信任证书。证书是本机生成的私密文件，不要分享给别人。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">「一体化模式」是什么？我该勾吗？<span class="plus">+</span></button>
        <div class="faq-a">一体化模式把主配置和去广告规则合并到<strong>一个文件</strong>，并且订阅通过平台原生引用自动拉取，不需要本地解析节点。新手推荐勾选，导入更简单（只需导入 1 个文件）。缺点是首次使用时会触发平台去拉取订阅。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">生成的配置文件在哪？会被提交到 Git 吗？<span class="plus">+</span></button>
        <div class="faq-a">可视化页面生成的文件在 <code>configs/generated/quick-start/</code> 目录下，按时间戳分文件夹。该目录已被 <code>.gitignore</code> 忽略，不会进入版本库，也不会上传到任何远程服务。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button">生成失败或提示错误怎么办？<span class="plus">+</span></button>
        <div class="faq-a">常见原因：① VPN 地址格式不正确——确认每行只有一个完整链接；② 没勾选任何平台——至少勾选一个；③ 网络问题导致订阅拉取失败——换一个网络再试。结果区会显示具体错误信息，也可查看「生成器输出」段。仍有问题可查阅 <code>docs/troubleshooting.md</code>。</div>
      </div>
    </div>
  </section>

  <footer>Proxy Tuner<span class="sep">·</span>本地零依赖配置生成器<span class="sep">·</span>数据不离开本机</footer>

  <script>
    const form = document.getElementById('form');
    const submit = document.getElementById('submit');
    const statusBox = document.getElementById('status');
    const details = document.getElementById('details');
    const addressBox = document.getElementById('addresses');
    const stepper = document.querySelector('.stepper');

    // 示例填充
    const samples = {
      trojan: 'trojan://password@hk.example.com:443?sni=hk.example.com#🇭🇰 香港-01\\ntrojan://password@jp.example.com:443?sni=jp.example.com#🇯🇵 日本-01\\ntrojan://password@us.example.com:443?sni=us.example.com#🇺🇸 美国-01',
      subscription: 'https://example.com/sub?token=your-airport-token'
    };
    document.querySelectorAll('.sample-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.sample;
        if (type === 'clear') {
          addressBox.value = '';
        } else if (samples[type]) {
          addressBox.value = samples[type];
        }
        addressBox.focus();
      });
    });

    // FAQ 折叠
    document.querySelectorAll('.faq-q').forEach((q) => {
      q.addEventListener('click', () => {
        q.parentElement.classList.toggle('open');
      });
    });

    // 步骤指示器联动（根据焦点高亮）
    function highlightStep(idx) {
      stepper.querySelectorAll('.step-pill').forEach((p, i) => {
        p.classList.toggle('active', i === idx);
      });
    }
    addressBox.addEventListener('focus', () => highlightStep(0));
    document.querySelectorAll('input[name="platform"]').forEach((el) => {
      el.addEventListener('change', () => highlightStep(1));
    });
    document.querySelectorAll('#common, #adBlock, #unified, #discoverRules').forEach((el) => {
      el.addEventListener('change', () => highlightStep(2));
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      highlightStep(3);
      statusBox.className = 'status working';
      statusBox.innerHTML = '<span class="status-icon">⏳</span>正在生成，请稍候...';
      details.innerHTML = '';

      const checked = Array.from(document.querySelectorAll('input[name="platform"]:checked'));
      const payload = {
        platforms: checked.length > 0 ? checked.map((el) => el.value) : ['surge'],
        addresses: addressBox.value,
        common: document.getElementById('common').checked,
        adBlock: document.getElementById('adBlock').checked,
        unified: document.getElementById('unified').checked,
        discoverRules: document.getElementById('discoverRules').checked
      };

      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.error || '生成失败');
        renderResult(body.result);
      } catch (error) {
        statusBox.className = 'status error';
        statusBox.innerHTML = '<span class="status-icon">⚠️</span>' + escapeHtml(error.message);
      } finally {
        submit.disabled = false;
      }
    });

    function renderResult(result) {
      statusBox.className = 'status ok';
      statusBox.innerHTML = '<span class="status-icon">✅</span>已生成 ' + result.results.length + ' 个平台配置，输出到 ' + escapeHtml(result.timestamp) + '/ 文件夹。';

      const parts = [];
      for (const r of result.results) {
        parts.push('<div class="result-group">');
        parts.push('<div class="result-header"><span class="chip">' + escapeHtml(r.platform) + '</span><span>' + escapeHtml(r.platformLabel) + '</span></div>');
        parts.push('<div class="result-body">');

        parts.push('<div class="result-section"><h3>生成文件</h3><div class="path-list">');
        parts.push(pathRow('主配置', r.configPath));
        if (r.sidecarPath) {
          parts.push(pathRow('去广告', r.sidecarPath));
        }
        parts.push('</div></div>');

        parts.push('<div class="result-section"><h3>导入步骤</h3>');
        parts.push('<ol class="steps">' + r.importSteps.map((step) => '<li>' + escapeHtml(step) + '</li>').join('') + '</ol>');
        parts.push('</div>');

        parts.push('<div class="result-section"><h3>可复制命令</h3>');
        parts.push('<div class="code-block"><button class="copy-btn" data-copy="' + escapeHtml(r.command) + '">复制</button><pre>' + escapeHtml(r.command) + '</pre></div>');
        parts.push('</div>');

        if (r.stderr) {
          parts.push('<div class="result-section"><h3>生成器输出</h3><pre>' + escapeHtml(r.stderr) + '</pre></div>');
        }
        parts.push('</div></div>');
      }
      details.innerHTML = parts.join('');

      details.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(btn.dataset.copy);
            const original = btn.textContent;
            btn.textContent = '已复制';
            setTimeout(() => { btn.textContent = original; }, 1500);
          } catch (_) {
            btn.textContent = '复制失败';
          }
        });
      });
    }

    function pathRow(label, value) {
      return '<div class="path-row"><span class="path-label">' + escapeHtml(label) + '</span>'
        + '<span class="path-value">' + escapeHtml(value) + '</span>'
        + '<button type="button" class="mini-copy" data-copy="' + escapeHtml(value) + '">复制</button></div>';
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[char]));
    }
  </script>
</body>
</html>`;
}

module.exports = { renderPage };
