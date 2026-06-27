# 快速开始指南

## 前提条件

1. 已安装 **Surge iOS**（需正版授权）
2. iOS 设备可正常联网

## 📱 安装步骤

### Step 1: 准备文件

将本项目中的以下文件放入 Surge 的配置文件目录：

- **方案一（推荐）**：仅使用模块
  - 将 `modules/` 目录下的 `.sgmodule` 文件通过 AirDrop / 文件 App 放入 `Surge/Profiles/` 目录

- **方案二（完整配置）**：
  - 将 `scripts/` 目录复制到 Surge 配置文件目录
  - 将 `rulesets/` 目录复制到 Surge 配置文件目录
  - 导入 `configs/full-adblock.conf` 为主配置

> Surge 配置文件默认路径：`Surge/Profiles/`（在 iOS 文件 App 中）

### Step 2: 安装 MITM 证书（必须）

要使用脚本去广告功能，必须启用 MITM 并安装根证书：

1. **打开 Surge** → 点击底部 **配置**
2. 选择 **MITM** 选项
3. 点击 **生成 CA 证书**（如已生成可跳过）
4. 点击 **安装 CA 证书**
5. 系统弹出描述文件 → 点击 **允许**
6. 打开 **设置 App** → **通用** → **VPN 与设备管理**
7. 找到 Surge 的描述文件 → **安装**
8. 回到 **设置 → 通用 → 关于本机 → 证书信任设置**
9. 找到 Surge 证书 → **开启开关**

### Step 3: 启用模块

1. 打开 Surge → **配置 → 模块**
2. 点击 **安装模块**（+ 号）
3. 选择对应的 `.sgmodule` 文件
4. 回到模块列表 → **开启开关**

### Step 4: 启用 MITM

1. 打开 Surge → **配置 → MITM**
2. 确保 **MITM 开关** 已开启
3. hostname 字段已由模块自动配置

> 模块只追加 MITM hostname、规则和脚本，不主动开启 MITM。去广告脚本要生效，必须在 Surge 主配置或 App 设置中开启 MITM 并信任 CA。

### Step 5: 启动 Surge

1. 回到 Surge 主界面
2. 点击 **开始**
3. 确认 VPN 图标出现在状态栏

## ✅ 验证是否生效

1. 打开一个之前有开屏广告的 App（如微博、知乎）
2. 观察是否不再显示开屏广告
3. 进入 App 后观察信息流中是否还有广告

## 🎯 推荐组合

### 最全去广告方案

启用：`Ad-Block-All.sgmodule` + `Stable-Optimization.sgmodule`

### 轻量方案

启用：`Anti-Splash-Ad.sgmodule` + `Stable-Optimization.sgmodule`

### 仅稳定性优化

启用：`Stable-Optimization.sgmodule`
