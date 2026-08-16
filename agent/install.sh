#!/usr/bin/env bash
# Surge 配置助手 —— DSH 预设安装脚本（macOS / Linux）
#
# 把本目录（agent/）安装为 DSH 的 "surge-tuner" 预设，并把引擎
# （scripts/rules/rulesets/templates/modules）打包进预设目录的 engine/，
# 使预设自包含：即使移动或删除 surge-tuner 仓库也能正常工作。
#
# 用法（在仓库根目录或任意位置运行）:
#   bash agent/install.sh              # 全新安装/覆盖更新
#   bash agent/install.sh --engine-only  # 只刷新引擎快照

set -euo pipefail

ENGINE_ONLY=0
if [ "${1:-}" = "--engine-only" ]; then ENGINE_ONLY=1; fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # agent/ 目录
REPO_ROOT="$(dirname "$SCRIPT_DIR")"                          # 仓库根

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
TARGET="$DSH_HOME/.agent-presets/surge-tuner"

if [ ! -f "$REPO_ROOT/scripts/surge-config-generator.js" ]; then
  echo "找不到引擎入口 $REPO_ROOT/scripts/surge-config-generator.js —— 请确认本脚本位于 surge-tuner 仓库的 agent/ 目录内。" >&2
  exit 1
fi

# 1. 预设文件
if [ "$ENGINE_ONLY" -eq 0 ]; then
  mkdir -p "$TARGET"
  for file in agent.cordis.yml preset.yml surge-tuner-tools.js README.md; do
    if [ -f "$SCRIPT_DIR/$file" ]; then
      cp -f "$SCRIPT_DIR/$file" "$TARGET/$file"
      echo "installed $file"
    fi
  done
fi

# 2. 引擎快照（先清后拷，保证是干净快照）
ENGINE_DIR="$TARGET/engine"
rm -rf "$ENGINE_DIR"
mkdir -p "$ENGINE_DIR"
for dir in scripts rules rulesets templates modules; do
  if [ -d "$REPO_ROOT/$dir" ]; then
    cp -R "$REPO_ROOT/$dir" "$ENGINE_DIR/$dir"
    echo "bundled engine/$dir"
  fi
done

echo ""
echo "安装完成。预设目录: $TARGET"
echo ""
echo "下一步:"
echo "  1. 在 DSH 里新建会话，预设选择 “Surge 配置助手”"
echo "  2. 工作目录任选（引擎已打包进预设，不依赖工作目录）"
echo "  3. 直接说: 用这个订阅链接生成 Surge 配置，加上 Telegram 和 ChatGPT"
echo ""
echo "更新引擎: 仓库内 git pull 后，重跑本脚本（--engine-only 可只刷新引擎）。"
