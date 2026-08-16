# 零基础新手教程（Windows / Mac 通用）

这份教程假设你**从来没用过命令行**。照着做一遍，大约 10 分钟就能生成你的第一份代理配置。

遇到问题随时运行环境自检：

```bash
npm run doctor
```

它会逐项检查环境并告诉你怎么修。

---

## 你要准备什么

| 物品 | 说明 |
|------|------|
| 一台电脑 | Windows 或 Mac 都可以 |
| 一个订阅链接或节点链接 | 在你服务商（"机场"）后台，常见名字是"订阅地址""一键导入""复制节点"，以 `https://` 或 `ss://` `trojan://` 等开头 |
| 手机上的代理 App | Surge、Loon、Quantumult X、Stash 任一 |

> ⚠️ 订阅链接和生成的配置文件都是**私密数据**。不要发到群聊、论坛、截图或公开仓库。

---

## 第一步：安装 Node.js

本项目只需要 Node.js（≥ 20），不需要安装任何其他依赖。

1. 打开 https://nodejs.org ，下载 **LTS** 版本。
2. **Windows**：双击安装包，一路"下一步"（保持默认勾选即可）。
3. **Mac**：双击 .pkg 安装包按提示安装。
4. 装完**重新打开一个终端窗口**，输入：

```bash
node -v
```

显示 `v20.x.x` 或更高（如 `v22.x.x`）就是装好了。

> 如果提示 `'node' 不是内部或外部命令` 或 `command not found`：安装后没重开终端，或安装失败，重装一次。

## 第二步：下载本项目

两种方式任选。**不会 git 就用方式 A**。

### 方式 A：下载 ZIP（推荐新手）

1. 浏览器打开项目主页。
2. 点绿色 **Code** 按钮 → **Download ZIP**。
3. 解压到一个你找得到的位置，比如桌面。解压后文件夹叫 `surge-tuner-main`，把它改名为 `surge-tuner`（不改也能用，下文以 `surge-tuner` 为准）。

### 方式 B：git clone

```bash
cd Desktop
git clone https://github.com/kairosbladex/surge-tuner.git
```

> Windows 上如果 clone 报 `SSL/TLS connection failed`：多半是你配置了没启动的代理。运行 `npm run doctor` 会检测出来；或执行
> `git config --global --unset http.proxy && git config --global --unset https.proxy` 后重试。

## 第三步：打开终端并进入项目目录

**Windows**（二选一）：

- 打开 `surge-tuner` 文件夹，在地址栏输入 `powershell` 回车，会直接在该目录打开 PowerShell；
- 或打开 PowerShell，输入 `cd C:\Users\你的用户名\Desktop\surge-tuner`。

**Mac**：

- 打开"终端"，输入 `cd `（cd 后面带一个空格），把 `surge-tuner` 文件夹**拖进终端窗口**，回车。

进入目录后输入 `npm run doctor` 能看到诊断输出，就说明位置对了。

## 第四步：环境自检

```bash
npm run doctor
```

逐项含义：

- ✅ 全绿 → 直接进行下一步。
- ⚠️ 警告 → 一般不影响使用，按提示按需处理（如默认端口被占用、GitHub 暂时不可达）。
- ❌ 失败 → 必须修：Node 版本不够就装 LTS；项目文件缺了就重新完整下载；目录不可写就换个位置（**不要**放 `C:\Program Files` 这类需要管理员权限的目录）。

没有网络的环境可以加 `--offline` 跳过网络检查：`npm run doctor -- --offline`。

## 第五步：启动生成页面

```bash
npm run quick-start
```

（Mac 也可以 `./quick-start.sh`，效果一样。）

启动后会自动打开浏览器，地址是 `http://127.0.0.1:8788`。没自动打开就手动复制到浏览器。

> 这个页面只跑在你自己电脑上（127.0.0.1），你的订阅链接不会发到任何服务器。

## 第六步：生成配置

在页面里：

1. **粘贴**你的订阅链接或节点链接（支持多行/多个）。
2. 选择你手机上用的 **App**（Surge / Loon / Quantumult X / Clash/Stash）。
3. 选择常用服务（Telegram、YouTube 等，不确定就保持默认）。
4. 需要去广告就勾选 **去广告**。
5. 点 **生成**，然后 **下载** 生成的配置文件。

## 第七步：传到手机并导入

传输方式任选：AirDrop（Mac→iPhone 最方便）、微信/QQ 文件传输、邮件附件、局域网共享。

各 App 的导入入口：

- **Surge**：配置 → 从文件导入（或"从 URL 下载"）。去广告模块（.sgmodule）在 配置 → 模块 里安装，并按 `docs/quick-start.md` 安装 MITM 证书。
- **Loon**：配置 → 导入 → 从文件导入；插件在 插件 页面导入。
- **Quantumult X**：设置 → 配置文件 → 下载/导入；去广告片段合并到 rewrite/filter。
- **Stash / Clash 类**：配置 → 新建 → 从文件导入 `.yaml`。

每步的详细图文说明见 `docs/user-guide.md`。

## 第八步：手机端验证

1. 打开代理开关，访问一个国外网站确认连通。
2. 在 App 里**手动更新一次规则集**（规则集是远程引用的，靠手机网络下载）。
3. 连不上就按 `docs/troubleshooting.md` 的顺序排查：先看节点是否可用，再看分流规则，最后看去广告模块。

---

## 进阶玩法（可选，新手可先跳过）

- **命令行生成**：`npm run generate:surge -- --address "你的订阅链接" --preset common --adblock`，其他平台见 `npm run` 列表。
- **环境自检**：`npm run doctor`。
- **A2A 服务**（给其他 Agent 调用）：`npm run start:a2a`，见 `docs/a2a.md`。
- **DSH Agent 预设**：Windows 运行 `powershell -ExecutionPolicy Bypass -File agent\install.ps1`，Mac/Linux 运行 `bash agent/install.sh`，见 `agent/README.md`。

## 常见问题 FAQ

**`npm` 提示不是命令？** 和 `node` 一样：装了 Node 就自带 npm，重开终端。

**Mac 运行 `./quick-start.sh` 提示 Permission denied？** 先 `chmod +x quick-start.sh`，或直接用 `npm run quick-start`。

**页面打不开 / 端口被占用？** 启动时会自动换端口，看终端里打印的实际地址；doctor 也会提示端口占用情况。

**订阅链接拉取失败？** 链接过期或需要特定网络环境。在服务商后台重新复制；仍不行就把节点链接（`ss://` 等）直接粘贴进去，不走订阅。

**生成后手机无法联网？** 九成是节点本身不可用。先在 App 里单测节点延迟；节点正常再按 `docs/troubleshooting.md` 排查分流与 MITM。

**手机提示规则集更新失败？** 规则集 URL 由手机直接下载，检查手机当前网络/代理是否能访问 GitHub 相关域名，稍后重试即可，不影响已下载的规则。
