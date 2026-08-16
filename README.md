# Proxy Tuner — 帮你生成自己的手机代理配置文件

## 这是什么

Proxy Tuner 是一个本地小工具。你把服务商后台给你的订阅链接或节点链接粘进去，它会帮你生成 Surge、Loon、Quantumult X、Clash/Stash 可以导入的配置文件。

你不用先学配置语法，也不用手写规则。先按下面的步骤跑通一次：打开浏览器页面，粘贴链接，选择你手机上用的 App，点击生成，把文件发到手机，在 App 里导入。

你的真实链接只在你自己的电脑上处理。不要把订阅链接、节点链接、生成后的配置文件发到微信群、公开仓库、截图或论坛里。

> 🔰 完全没接触过命令行？看 [零基础新手教程](docs/beginner-guide.md)（Windows / Mac 通用）。
> 环境有问题先跑 `npm run doctor` 自检，它会逐项检查并告诉你怎么修。

## 零依赖快速开始

你需要一台电脑和 Node >= 20。还没有 Node？从 [nodejs.org](https://nodejs.org) 下载安装 LTS 版本即可。还没有 Git？Mac 用户首次运行 `git clone` 时会自动提示安装；Windows 用户请从 [git-scm.com](https://git-scm.com) 下载。

打开终端，按你的系统选择下面的方式启动：

**Mac / Linux**（终端）：

```bash
git clone https://github.com/kairosbladex/surge-tuner.git
cd surge-tuner
./quick-start.sh
```

如果提示 `Permission denied`，先运行 `chmod +x quick-start.sh` 再试。

**Windows**（PowerShell）：

```powershell
git clone https://github.com/kairosbladex/surge-tuner.git
cd surge-tuner
npm run quick-start
```

运行后会自动打开浏览器页面：

```text
http://127.0.0.1:8788
```

如果浏览器没有自动打开，就把上面这行地址复制到浏览器地址栏。

## 你需要准备什么

| 需要准备 | 从哪里来 |
|----------|----------|
| 一台电脑 | Mac、Windows、Linux 都可以，只要能运行 Node >= 20 |
| 一个订阅链接或节点链接 | 通常在你的服务商后台，常见名字是“订阅地址”“一键导入”“复制节点” |
| 一个手机 App | Surge、Loon、Quantumult X、Stash 或其他 Clash 类 App |
| 一点耐心 | 第一次照着步骤做，先保证能导入和连通 |

订阅链接通常长这样：

```text
https://example.com/sub?token=这里是你的私密内容
```

节点链接通常以这些开头：

```text
ss://...
trojan://...
vmess://...
hy2://...
tuic://...
```

上面只是格式示例，不能直接拿来用。请使用你自己服务商后台提供的真实链接。

## 电脑小白怎么操作

### 第一步：打开终端

Mac 用户可以打开“终端”。Windows 用户可以打开 PowerShell 或命令提示符。

### 第二步：启动生成页面

如果你还没有下载项目，就按”零依赖快速开始”的指引操作。已经进入项目目录的话：

**Mac / Linux** 运行：

```bash
./quick-start.sh
```

**Windows** 运行：

```bash
npm run quick-start
```

### 第三步：在浏览器里粘贴链接

页面打开后，找到输入框，把你的订阅链接或节点链接粘进去。

多个链接时，一行一个。不要把多个链接挤在同一行。

### 第四步：选择你手机上用的 App

| 你手机上用的是 | 页面里选择 |
|----------------|------------|
| Surge | Surge |
| Loon | Loon |
| Quantumult X | Quantumult X |
| Stash、Clash、Clash Verge | Clash |

不确定选哪个，就看你手机上安装的 App 名字。

### 第五步：点击生成

点击页面上的生成按钮。成功后，页面右侧会显示文件路径。

默认文件会放在：

```text
configs/generated/quick-start/
```

你只需要关注生成出来的主配置文件。去广告相关文件可以等代理能正常使用后再研究。

## 手机小白怎么导入

### 第一步：把文件发到手机

常见方式：

- Mac 到 iPhone：用 AirDrop。
- Windows 到 iPhone：用 [LocalSend](https://localsend.org)（局域网，免账号）、iCloud Drive、网盘或数据线。
- 发给自己：可以用微信文件传输助手临时传文件，但不要把真实配置转发给别人。
- Android：可以用数据线、网盘、局域网传输或手机文件管理器。

### 第二步：打开你的代理 App

打开 Surge、Loon、Quantumult X 或 Stash。

### 第三步：导入配置文件

在 App 里找这些入口：

- 导入配置
- 从文件导入
- 新建配置
- Profiles
- Config

不同 App 叫法不一样，但意思都是“选择一个配置文件导入”。

### 第四步：启动并测试

导入后，回到 App 主界面，开启代理或连接开关。

测试这些常用 App 或网站：

- Telegram
- YouTube
- GitHub
- ChatGPT

能打开，说明主配置已经基本可用。

## 四个平台分别怎么做

### Surge

你要导入的主文件一般是 `.conf` 文件，例如：

```text
surge.conf
```

操作顺序：

1. 把 `.conf` 文件发到 iPhone、iPad 或 Mac。
2. 打开 Surge。
3. 进入配置列表。
4. 选择从文件导入。
5. 选中刚才生成的 `.conf` 文件。
6. 回到主界面，开启 Surge。
7. 打开 Telegram、YouTube、GitHub 或 ChatGPT 测试。

如果你生成时勾选了去广告，可能还会看到 `.sgmodule` 文件。第一次使用建议先只导入主配置，确认能正常上网后，再按 [MITM 配置指南](docs/mitm-setup.md) 处理去广告。

### Loon

你要导入的主文件一般是 `.conf` 文件，例如：

```text
loon.conf
```

操作顺序：

1. 把 `.conf` 文件发到手机。
2. 打开 Loon。
3. 找到配置或导入入口。
4. 选择刚才生成的文件。
5. 启动 Loon。
6. 打开常用 App 测试。

如果生成了额外的去广告文件，先放一边。主配置能用以后，再按 Loon 的插件导入方式处理。

### Quantumult X

你要导入的主文件一般是 `.conf` 文件，例如：

```text
quantumultx.conf
```

操作顺序：

1. 先备份你原来 Quantumult X 里的配置。
2. 把新生成的 `.conf` 文件发到手机。
3. 打开 Quantumult X。
4. 导入或替换配置。
5. 启动后测试 Telegram、YouTube、GitHub 或 ChatGPT。

Quantumult X 的设置项比较细。第一次建议只先导入主文件，不要急着合并去广告内容。

### Clash / Stash

你要导入的主文件一般是 `.yaml` 文件，例如：

```text
clash.yaml
```

操作顺序：

1. 把 `.yaml` 文件发到手机或电脑。
2. 打开 Stash、Clash Verge 或其他 Clash 类客户端。
3. 找到配置导入入口。
4. 选择刚才生成的 `.yaml` 文件。
5. 启动配置。
6. 打开常用 App 或网站测试。

Clash/Stash 主要负责分流和连接。去广告效果和 Surge、Loon、Quantumult X 不完全一样，第一次先把连接跑通。

## 常见问题

### 不知道链接在哪里

去你的服务商后台找这些入口：

- 订阅地址
- 一键导入
- Clash 订阅
- Surge 订阅
- 复制节点
- 节点列表

如果后台提供了多个链接，优先复制“订阅地址”。如果只有单个节点，也可以复制节点链接。

### 页面打不开

先确认你已经在项目目录里运行了启动命令（Mac/Linux 运行 `./quick-start.sh`，Windows 运行 `npm run quick-start`）。

再手动打开：

```text
http://127.0.0.1:8788
```

如果还是打不开，检查终端里有没有报错。

### Node 版本不对

先运行：

```bash
node -v
```

如果版本低于 20，请升级 Node。升级后运行：

```bash
# Mac / Linux
./quick-start.sh --check-only
# Windows
npm run quick-start -- --check-only
```

看到 `Node v... OK. No npm install is required.` 就说明电脑环境可以用。

### 生成失败

先检查这几件事：

1. 链接是不是完整复制了。
2. 每一行是不是只有一个链接。
3. 页面里有没有选择平台。
4. 订阅链接在当前网络下能不能访问。
5. 服务商后台的链接有没有过期。

还是失败的话，看页面右侧或终端里的错误提示，再去 [故障排除指南](docs/troubleshooting.md) 查。

### 导入后不能用

先按顺序检查：

1. 导入的是不是主配置文件，而不是额外的去广告文件。
2. App 里有没有真正启用这个新配置。
3. 手机当前网络是否正常。
4. 订阅链接或节点是否已经过期。
5. 服务商账号是否还有流量。

不要一开始就改复杂设置，先确认主配置能不能连通。

### 去广告不生效

第一次使用建议先不折腾去广告。先确认代理能正常使用。

如果主配置已经能用，再检查：

1. 生成时有没有勾选去广告。
2. 额外生成的去广告文件有没有导入。
3. App 里是否开启了对应的证书和解密设置。
4. 手机系统是否信任了 App 生成的证书。

证书和解密设置比较敏感，里面的私密内容不要发给别人。详细步骤看 [MITM 配置指南](docs/mitm-setup.md)。

### 真实链接能不能发给别人

不要发。

订阅链接、节点链接、生成后的配置文件都可能包含你的服务商 token。别人拿到以后，可能直接使用你的流量。

不要把这些内容发到：

- 微信群
- QQ 群
- 朋友圈
- 公开 GitHub 仓库
- 论坛
- 截图

## 给懂技术的人

如果你熟悉终端，可以直接用命令生成。

### 命令行生成

先把自己的链接写到一个文本文件 `my-addresses.txt`，每行一个。用你喜欢的编辑器（Mac/Linux 可以用 `nano`，Windows 可以用 `notepad`）。

生成 Surge：

```bash
npm run generate:surge -- --addresses ./my-addresses.txt --preset common --adblock --output ./surge.conf
```

生成 Loon：

```bash
npm run generate:loon -- --addresses ./my-addresses.txt --preset common --adblock --output ./loon.conf
```

生成 Quantumult X：

```bash
npm run generate:qx -- --addresses ./my-addresses.txt --preset common --adblock --output ./quantumultx.conf
```

生成 Clash/Stash：

```bash
npm run generate:clash -- --addresses ./my-addresses.txt --preset common --adblock --output ./clash.yaml
```

### 测试工具是否能跑

仓库里有测试用示例，可以验证本地工具链：

```bash
node scripts/surge-config-generator.js --addresses tests/fixtures/sample-subscription.txt --preset common --adblock --output ./surge-tuner-readme-smoke.conf
node scripts/surge-config-validator.js ./surge-tuner-readme-smoke.conf
```

看到类似下面的输出就说明生成和检查正常：

```text
./surge-tuner-readme-smoke.conf: ok
```

测试示例地址不能当作真实代理使用。

### A2A 和开发文档

| 你想做什么 | 入口 |
|------------|------|
| 启动可视化页面 | `npm run quick-start` |
| 让其他 Agent 调用 | `npm run start:a2a`，详见 [docs/a2a.md](docs/a2a.md) |
| 安装 DSH 智能体预设（自然语言生成配置） | 运行 `agent/install.ps1`（Windows）或 `bash agent/install.sh`（macOS/Linux），详见 [agent/README.md](agent/README.md) |
| 跑完整检查 | `npm run check` |
| 查看用户说明 | [docs/user-guide.md](docs/user-guide.md) |
| 查看证书和去广告设置 | [docs/mitm-setup.md](docs/mitm-setup.md) |
| 排查问题 | [docs/troubleshooting.md](docs/troubleshooting.md) |
| 查看测试说明 | [docs/testing-guide.md](docs/testing-guide.md) |

## 说明

本项目仅供学习和个人配置管理使用。请遵守当地法律法规以及服务商、客户端的使用条款。
