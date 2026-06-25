#!/bin/bash
# ============================================================
# kelee.one 去广告插件获取工具
# 获取 hub.kelee.one 的 Loon 去广告插件列表及规则
# ============================================================
# 用法: bash kelee/fetch-plugins.sh [output-dir]
# 默认输出到 kelee/ 目录
# ============================================================

set -e

OUTPUT_DIR="${1:-kelee}"
CATALOG_URL="https://hub.kelee.one/list.json"
GITHUB_RAW="https://raw.githubusercontent.com/luestr/ProxyResource/main"

echo "📦 正在获取 kelee.one 插件目录..."
curl -sL "$CATALOG_URL" -o "$OUTPUT_DIR/list.json"

echo "✅ 已获取插件目录: $OUTPUT_DIR/list.json"
echo ""

# 提取去广告相关的插件
echo "🔍 发现以下去广告相关插件:"

# 使用 jq 解析（如果可用）或直接提示用户手动查看
if command -v jq &> /dev/null; then
  jq -r '.lists[] | select(.tag[] | contains("去广告")) | "  - \(.name): \(.desc)"' "$OUTPUT_DIR/list.json" 2>/dev/null || echo "  (无法解析，请手动查看 list.json)"
else
  echo "  (未安装 jq，请手动查看 list.json)"
  echo "  提示: 安装 jq 后可通过本脚本自动筛选去广告插件"
fi

echo ""
echo "📋 已保存完整插件目录到 $OUTPUT_DIR/list.json"
echo ""
echo "🔄 你也可以直接从 GitHub 获取原始资源:"
echo "  Loon 配置模板: $GITHUB_RAW/Tool/Loon/Lcf/zh-CN/"
echo "  Clash 示例配置: $GITHUB_RAW/Tool/Clash/Config/Clash_Sample_Config_By_iKeLee.yaml"
echo ""
echo "💡 Loon 去广告相关插件推荐（从 list.json 中获取）:"
echo "  1. 广告平台拦截器 - 广告域名过滤"
echo "  2. 去广告合集 - 综合性去广告"
echo "  3. 隐私保护 - 追踪拦截"
echo ""
echo "⚠️ 注意: 实际插件文件(.lpx)托管在 kelee.one CDN 上，"
echo "  需要代理访问。建议用户直接在 Loon App 中通过插件中心安装。"
