# Surge 配置助手 —— DSH 预设安装脚本（Windows PowerShell）
#
# 把本目录（agent/）安装为 DSH 的 "surge-tuner" 预设，并把引擎
# （scripts/rules/rulesets/templates/modules）打包进预设目录的 engine/，
# 使预设自包含：即使移动或删除 surge-tuner 仓库也能正常工作。
#
# 用法（在仓库根目录或任意位置运行）:
#   powershell -ExecutionPolicy Bypass -File agent\install.ps1              # 全新安装/覆盖更新
#   powershell -ExecutionPolicy Bypass -File agent\install.ps1 -EngineOnly  # 只刷新引擎快照

param(
  [switch]$EngineOnly
)

$ErrorActionPreference = 'Stop'

$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path   # agent/ 目录
$RepoRoot = Split-Path -Parent $AgentDir                      # 仓库根

$DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$Target = Join-Path $DshHome '.agent-presets\surge-tuner'

# 校验引擎源目录存在
$Generator = Join-Path $RepoRoot 'scripts\surge-config-generator.js'
if (-not (Test-Path $Generator)) {
  Write-Error "找不到引擎入口 $Generator —— 请确认本脚本位于 surge-tuner 仓库的 agent/ 目录内。"
  exit 1
}

# 1. 预设文件
if (-not $EngineOnly) {
  New-Item -ItemType Directory -Path $Target -Force | Out-Null
  foreach ($file in 'agent.cordis.yml', 'preset.yml', 'surge-tuner-tools.js', 'README.md') {
    $src = Join-Path $AgentDir $file
    if (Test-Path $src) {
      Copy-Item $src (Join-Path $Target $file) -Force
      Write-Host "installed $file"
    }
  }
}

# 2. 引擎快照（先清后拷，保证是干净快照）
$EngineDir = Join-Path $Target 'engine'
if (Test-Path $EngineDir) { Remove-Item $EngineDir -Recurse -Force }
New-Item -ItemType Directory -Path $EngineDir -Force | Out-Null
foreach ($dir in 'scripts', 'rules', 'rulesets', 'templates', 'modules') {
  $src = Join-Path $RepoRoot $dir
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $EngineDir $dir) -Recurse -Force
    Write-Host "bundled engine/$dir"
  }
}

Write-Host ''
Write-Host "安装完成。预设目录: $Target"
Write-Host ''
Write-Host '下一步:'
Write-Host '  1. 在 DSH 里新建会话，预设选择 “Surge 配置助手”'
Write-Host '  2. 工作目录任选（引擎已打包进预设，不依赖工作目录）'
Write-Host '  3. 直接说: 用这个订阅链接生成 Surge 配置，加上 Telegram 和 ChatGPT'
Write-Host ''
Write-Host '更新引擎: 仓库内 git pull 后，重跑本脚本（-EngineOnly 可只刷新引擎）。'
