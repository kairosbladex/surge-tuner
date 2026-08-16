# Proxy Tuner 重构计划（P1 消重 + P2 低风险结构项）

> 本文件是重构工作的执行档案：包含计划、已知事实与逐步执行日志，存档供后续参考。
> 背景：P0 bug 修复与 P1 消重已全部完成（见 commit 3609b9b 及执行日志）。

## 全局原则（每一步都必须遵守）

1. **不做 git commit / git 任何写操作**，改动留在工作区供人工审阅。
2. **最小改动**：只做本步骤范围内的事，不顺手重构无关代码。
3. **行为保持**：生成器输出（surge/loon/qx/clash 配置文本）在步骤 1–3 中**不允许有任何变化**，除非步骤明确豁免。验收方式：步骤开始前先生成"金样本"输出矩阵存到临时目录，改完重新生成并 `diff`，必须无差异。
   金样本矩阵（用 node 内联脚本或临时脚本生成到 `%TEMP%/golden-before/`）：
   - 4 平台 × {标准模式 proxies 输入, unified 模式 subscriptions 输入} × {adBlock: true, false}
   - proxies 至少覆盖 ss / trojan / vmess(ws+tls) / hysteria2 / tuic 各一条（可用 tests/platform-generators.test.js 里的样例 + 自造 vmess/hy2/tuic 行）
   - services: ['Telegram', 'GitHub']，preset 不用
4. **测试必须全绿**：每步结束运行 `node --test tests/*.test.js`（E2E 慢，可只跑非 readme-commands 的文件，最后一步跑全量）和 `npm run validate`。改动前基线：136 个测试全过（修复完 P0 后）。
5. **允许新增测试**来锁定重构涉及的行为；**不允许删除或放宽现有断言**（除非该断言本身在 P0 修复中已被认定为错误并更新）。
6. 代码风格：零依赖、CommonJS、中文注释为主，与周边代码一致。
7. 每步完成后在本文件末尾"执行日志"追加一行：步骤号、改动文件、测试/validate/diff 结果。

## 已知事实（已核实，执行时可直接引用）

- `scripts/surge-config-generator.js:123-278` 是 `scripts/platform-base.js` 的私有拷贝（cleanName/cleanValue/cleanProxyLine/loadCatalog/normalize*/resolveServices/mergeUnique/ensureGroup/remoteRuleUrl/dedupeProxyObjects + 常量），约 150 行；`scripts/rule-discovery.js:39-58` 的 `rawToCatalog` 是 `loadCatalog` 的第三份拷贝（本计划不动它）。
- 行为差异点（改 surge 时必须保住）：base 版 `normalizeAdBlock` 是 `mitm: input.adBlock !== false`（undefined→true），surge 私有版是 `mitm: input.adBlock`（undefined→false）；surge 的 `remoteRuleUrl` 无 platform 参数、固定 Surge root。
- surge 生成器**不**用 platform-base 的 `classifyProxiesByRegion`，它在 `formatRegionGroup`（surge:698-727）里自己匹配——本次保持现状，不强行统一。
- 去广告 `[Script]` 注入行有 7 处拷贝：surge 生成器 2 处（:377-381 标准无逗号、:663-669 unified 无逗号——P0 已统一）、loon 生成器 :161-163（逗号 Loon 语法）、adblock-installer.js :184-188（Surge）、:266-269（Loon）、qx 生成器 :160-162（QX 语法不同，属另一格式）。MITM hostname 列表 4 处拷贝（loon:158 短版、qx:165、surge:375、surge:658），**内容略有差异**。
- 四个生成器的 CLI 层：loon/qx/clash 的 `parseArgs` 文本 100% 相同（loon:207-236、qx:203-232、clash:376-405 区域），`buildInputFromArgs` 与 `main()` 五段式雷同；surge 是同 flag 集的展开变体。`generator-common.js` 已有 splitList/applyServicePreset/buildProxySourceOptions。
- `scripts/a2a-agent.js` 四个 generate handler（:172-235 surge、:238-281 loon、:284-326 qx、:329-371 clash）逐行复制，差异仅：generator 函数、profileName 后缀、label 文案、surge 多一次 validate。
- `scripts/user-preference-store.js`：`_save()`（:118-123）直接 writeFileSync 非原子；`_load()` 只读一次缓存（:103-104），长驻进程看不到外部修改且 set() 会用陈旧缓存整体覆盖文件。
- `scripts/quick-start-server.js`：`renderPage()`（:408-1181，773 行）是一个内嵌 HTML+CSS+JS 模板字符串，占文件 63%。服务端逻辑本身已模块化，只需物理抽离。
- `scripts/surge-config-validator.js:9-15` 的 `KNOWN_GROUP_TYPES` 不含 `smart`，但 unified 模式（surge:530-561）会生成 `smart` 组 → 自家配置触发自家 validator 警告。
- `surge-tuner.skill.md:3` 和 `:10` 的链接 `../proxy-tuner.skill.md` 是死链（两文件同目录，应为 `./`）。
- 死代码（已逐一验证）：loon:31 死 import formatResults/hasFailure；qx:37 QX_BLACKMATRIX_ROOT 未用；qx:135 qxPath 死变量；generator-common.js:68-73 normalizeGeneratorInput 死导出；loon/qx/clash 导出的 parseArgs 无外部调用方（保留导出无妨，不删）；loon:66/qx:53/clash:84 解构的 unclassified 未使用。

## 步骤

### Step 1 — 去广告共享片段收敛

目标：消除 `[Script]` 注入行与 MITM hostname 的多份拷贝，建立单一事实来源。

- 新建 `scripts/adblock-shared.js`，导出：
  - `ADBLOCK_SCRIPTS`：脚本条目元数据数组 `[{ type: 'http-response'|'http-request', pattern, scriptPath, requiresBody }]`，内容 = 现在三行（ad-block-all http-response requiresBody、anti-tracking http-request、anti-tracking http-response）。
  - `renderSurgeScriptLines()` / `renderLoonScriptLines()`：按平台语法渲染（Surge：`http-response <pattern> requires-body = true script-path = <path>`；Loon：`http-response <pattern> script-path = <path>, requires-body = true`）。
  - `MITM_HOSTNAMES`：**仅当** surge:375 与 surge:658 两份列表完全相同时才收敛为一份；loon/qx 的短版保持各自现状不动。若两份不同，本项跳过并在日志说明。
- 替换点：surge 生成器 2 处、loon 生成器 1 处、adblock-installer.js 2 处（Surge/Loon 各一）。qx 的 rewrite 语法不同，不动。
- 验收：金样本 diff 无差异（loon/surge 输出逐字节一致）；installer 输出可对拍 `node scripts/adblock-installer.js --platform surge|loon` 前后 diff；测试全绿。

### Step 2 — surge-config-generator 接入 platform-base

- 删除 surge-config-generator.js:123-278 的私有拷贝函数，改为从 `./platform-base` require。
- 保住行为差异：调用 base 的 `normalizeAdBlock` 后按 surge 语义修正 `mitm`（或在调用点包一层），`remoteRuleUrl(path)` 用 base 版传 `'surge'`。surge 私有的 `formatRegionGroup` 分类逻辑保持不动。
- 验收：金样本 diff 无差异（surge 标准 + unified）；测试全绿；文件行数应从 859 降到约 700。

### Step 3 — CLI 样板下沉 generator-common

- 在 `generator-common.js` 新增 `parseGeneratorArgs(argv, extraFlags?)` 与 `runGeneratorCli({ platform, generate, defaultOutput, validate? })`，收纳四份重复的 parseArgs/buildInputFromArgs/main。
- 四个生成器 CLI 改为薄封装；surge 的展开写法也切换过去（flag 集一致才可切换，若有 surge 独有 flag 通过 extraFlags 表达）。
- 不允许改变 CLI 行为：每个生成器 `--help` 文案保留（可作为参数传入）；所有 npm scripts 入口不变。
- 验收：金样本 diff 无差异（CLI 路径也要对拍：4 平台 unified `--subscription` CLI 各跑一次前后 diff）；测试全绿。

### Step 4 — a2a-agent 四个 generate handler 表驱动化

- 在 `scripts/a2a-agent.js` 建立 `PLATFORM_PROFILES = { surge: { generate, label, fileName, validate? }, loon: ..., quantumultx: ..., clash: ... }`，四个 handler 合并为一个工厂函数。
- 保持：每个 skill 的注册名、输入输出结构、artifacts 形状、错误消息文案不变（tests/a2a-server.test.js 有逐字断言，如 `/RULE-SET,.*Telegram\.list,Telegram/`、`hk.conf`）。
- 顺手删除：:23 未使用的 `UserPreferenceStore` 顶层 import（:612 的动态 require 才是实际用法）、:813-816 死函数 `cleanProfileName`。
- 验收：a2a-server / a2a-task-manager 测试全绿。

### Step 5 — user-preference-store 持久化修复

- `_save()` 改为写临时文件 + `fs.renameSync` 原子替换（同目录 tmp 文件，避免跨盘 rename）。
- 修复陈旧缓存：每次写前先重新读盘合并（或按 mtime 失效缓存），保证 CLI 与长驻 A2A 进程并存时不互相覆盖；`getAll()` 返回深拷贝。
- 边界：`addAdDomain` 等非字符串输入抛友好 Error 而不是 TypeError。
- 允许新增单测覆盖：并发写不丢数据、外部修改后 set 不覆盖。
- 验收：extended-modules.test.js 全绿 + 新测试通过。

### Step 6 — quick-start-server UI 抽离

- 把 `renderPage()`（:408-1181）整体移到新文件 `scripts/quick-start-page.js`（导出 `renderPage`），quick-start-server.js require 之。模板字符串内容**逐字节不变**（包括缩进与插值表达式）。
- 验收：tests/quick-start-server.test.js 全绿；对拍 `renderPage()` 输出前后 diff 无差异；服务端文件降到约 450 行。

### Step 7 — 清理

- `surge-config-validator.js` 的 `KNOWN_GROUP_TYPES` 增加 `smart`（消除 unified 配置的 NONSTANDARD_POLICY_GROUP_TYPE 警告）；跑一遍生成 unified 配置 + validator 确认警告消失。
- 删死代码：loon:31 死 import、qx:37 死常量、qx:135 死变量、generator-common.js normalizeGeneratorInput 死导出（删除前全仓 grep 确认无引用，含 agent/ 与 docs/）。
- 修死链：`surge-tuner.skill.md` 的 `../proxy-tuner.skill.md` → `./proxy-tuner.skill.md`（2 处）。
- loon:66/qx:53/clash:84 的 `unclassified` 未使用解构：改为只取 `classified`（**不改行为**——未分类节点维持现状不进区域组）。
- 验收：测试全绿、validate 无 smart 警告。

## 明确不做（后续另立计划）

- 5 个 Surge 运行时去广告脚本（remove-*.js / anti-tracking.js / ad-block-all.js）的"纯函数+胶水层"重构与补测试——改动面大且是核心运行时代码，单独评估。
- cross-platform-converter 改走结构化中间模型；vless:// 协议支持；A2A cancel/stream 语义落地。
- rules/ 与 rulesets/ 改名、surge-tuner/proxy-tuner 双名统一。

## 执行日志

| 步骤 | 改动文件 | 结果 |
|---|---|---|
| （待填写） | | |
| Step 1 | 新建 scripts/adblock-shared.js；改 scripts/surge-config-generator.js（标准+unified 的 MITM hostname 与 [Script]）、scripts/loon-config-generator.js（[Script]）、scripts/adblock-installer.js（Surge/Loon [Script]） | MITM 列表已收敛（surge:375 与 :658 两处 md5 一致，loon/qx 短版保持原样）；金样本 diff（surge 标准/unified、loon、qx、clash × adBlock on/off + installer surge/loon 对拍）逐字节一致；指定 6 个测试文件 93/93 通过；npm run validate 全 ok |
| Step 2 | 改 scripts/surge-config-generator.js：删除 platform-base 私有拷贝 13 个函数（cleanName/cleanValue/cleanProxyLine/loadCatalog/normalizeSubscriptions/normalizeProxies/normalizeRegions/normalizeAdBlock/resolveServices/mergeUnique/ensureGroup/remoteRuleUrl/dedupeProxyObjects）及重复常量（REPO_ROOT/DEFAULT_CATALOG_PATH/DEFAULT_REGIONS/BLACKMATRIX_SURGE_ROOT），改从 ./platform-base require；normalizeAdBlock 与 remoteRuleUrl 在本地包一层锁定 surge 语义（布尔分支 mitm=开关本身；remoteRuleUrl 固定传 'surge'） | 854→700 行；金样本 diff（surge 标准+unified × adBlock true/false/undefined/对象三形态共 12 例 + 4 平台 unified CLI 对拍）逐字节一致，adBlock undefined case 前后均无 MITM/Script 段；指定 5 个测试文件 70/70 通过；npm run validate 全 ok |
| Step 3 | 改 scripts/generator-common.js（新增 parseGeneratorArgs(argv, extraFlags?)/buildGeneratorInput(args)/runGeneratorCli(options)，默认实现 platformValidate 门禁+写文件+sidecar+成功日志五段式）；四个生成器改薄封装：surge-config-generator.js（700→599 行，catalog 默认值经 extraFlags 表达，专属 validate/emitResult 钩子锁定 stderr warning、stdout 输出、无成功日志等 surge 行为）、loon-config-generator.js（310→228）、quantumultx-config-generator.js（304→225）、clash-config-generator.js（543→468）；各文件 --help usage 文案逐字保留为 USAGE 常量传入 | 金样本对拍（4 平台 × {unified 双订阅+adblock, standard --addresses+adblock 含 sidecar, --help, 无参数 usage+退出码} 共 16 case，stdout/stderr/退出码/输出文件含 sidecar）逐字节无差异；全量测试 136/136 通过；npm run validate 全 ok |
| Step 4 | 改 scripts/a2a-agent.js：四个 generate handler（:172-371）合并为 PLATFORM_PROFILES 平台配置表（generate/label/fileName/mimeType/progressText/profileDescription/withRules/validate?）+ registerGenerateProfileSkill 工厂，registerSkills 内四次调用注册（skill 名不变）；删 :23 死 import UserPreferenceStore 与死函数 cleanProfileName。注意：原 qx/clash handler 不透传 input.rules 而 surge/loon 透传（clash 生成器会消费 input.rules，属可观测差异），表内以 withRules 逐平台保真，计划原文“差异仅…”一项不完整 | 829→757 行（净 -72）；a2a-server+a2a-task-manager 30/30 通过；非 readme 全量 128/128 通过；readme-commands 14/14 通过；内联对拍：surge/loon 透传自定义 rules、qx/clash 不透传，artifact 形状/消息文案/注册名与原来逐字一致 |
| Step 5 | 改 scripts/user-preference-store.js（_save 原子写：同目录 .pid.tmp 临时文件 + renameSync，失败清理 tmp 并重抛；_load 去掉一次性缓存改为每次重读磁盘，写前重读合并防陈旧缓存整体覆盖；getAll 返回 JSON 深拷贝；addAdDomain/removeAdDomain/addSubscription/removeSubscription/addCustomRule 非字符串入参抛友好 Error 而非 TypeError）；新增 tests/user-preference-store.test.js（6 个测试：双实例交替写不丢更新、外部改文件后 set 不覆盖+长驻实例读可见外部修改、getAll 深拷贝、5 个方法非字符串入参友好 Error、tmp+rename 流程断言、写入中断原文件不损坏无 tmp 残留） | 指定 3 个测试文件 45/45 通过（39 既有 + 6 新增）；全量非 E2E 11 个文件 128/128 通过；npm run validate 全 ok；CLI 两进程交叉写同一文件实测合并正确且无 tmp 残留；模块导出形状与方法签名未变 |
| Step 7 | 改 scripts/surge-config-validator.js（KNOWN_GROUP_TYPES 增加 'smart'）；scripts/loon-config-generator.js（删 formatResults/hasFailure 死 import、unclassified 解构改只取 classified）；scripts/quantumultx-config-generator.js（删 QX_BLACKMATRIX_ROOT 死常量、qxPath 死变量、unclassified 解构改只取 classified）；scripts/clash-config-generator.js（unclassified 解构改只取 classified）；scripts/generator-common.js（删 normalizeGeneratorInput 死导出）；surge-tuner.skill.md（死链 ../proxy-tuner.skill.md → ./ 共 2 处） | 删除前全仓 grep（含 agent/、docs/、tests/）确认各死代码无引用（仅本计划文档提及）；unified 配置 validator 输出由 10 条 NONSTANDARD_POLICY_GROUP_TYPE(smart) 警告变为 ok 零警告；全量测试 136/136 通过；npm run validate 全 ok 无 smart 警告 |
| Step 6 | 新建 scripts/quick-start-page.js（renderPage 整体 774 行原样搬运 + 头部注释 + module.exports）；改 scripts/quick-start-server.js（删除原 :408-1181 renderPage 定义，新增 const { renderPage } = require('./quick-start-page')） | server 1227→453 行，page 新增 781 行；renderPage() 输出与 HTTP 服务页面（GET /）前后逐字节一致（31328 字节，md5 8c59c2d9b9caaccdc4f57a35dbaa6464）；node --test tests/quick-start-server.test.js tests/readme-commands.test.js 23/23 通过；npm run validate 全 ok |
