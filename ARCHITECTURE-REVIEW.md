# BUDGET::TERM 架构一致性审查 · 完整问题清单

> **审查对象**：`index.html`（v0.0.5 时点 2609 行 → **v0.0.6 已 2846 行**，单文件应用）+ `README.md` + `.gitignore`
> **审查方式**：静态走查 → 350+ 条无头断言复现 → 真实浏览器（无头 Edge）渲染/交互验证
> **本文件位置**：项目主文件夹（与 `README.md` 同级）
> **行号说明**：行号为 v0.0.5 时点值，代码改动后会漂移；定位请优先用**符号名**（函数名/常量名）。
> **v0.0.6 补充**：新增「分摊成本 `amort`」与「记一笔」双选项卡，见 §10（含它给本项目带来的新一致性约束）。

---

## 0. 状态总览

| 严重度 | 条目 | 已修 | 部分 | 未修 |
| --- | --- | --- | --- | --- |
| 🔴 高（正确性 / 结构性） | 5（H1–H5） | **2** | 0 | 3 |
| 🟡 中（一致性 / 可维护性） | 8（M1–M8） | **2** | 0 | 6 |
| ⚪ 低（清理类） | 8（L1–L8） | **3** | 2 | 3 |
| **合计** | **21** | **7** | **2** | **12** |

**一句话结论**：这不是"架构混乱"的项目，而是"**约定正确、执行时被横向重复侵蚀**"的项目 ——
21 条里有 6 条同源于**缺少三层抽象**：颜色令牌（H1）、表格渲染器（H2）、命令登记表（M1/M2）、状态提交点（H4）。
这批抽象建好之后，剩下的条目多数是"把已有重复也挂到同一套抽象上"。

已修条目的版本归属：`v0.0.5`（P1 重构 / M1 / M2）、`v0.0.4`（L5 部分）。
v0.0.6 的新增代码（分摊成本）**没有引入新的重复**，反而新加了两个单一数据源（见 §10）。

---

## 1. 工程骨架（作为"一致性"的基准）

```
index.html (2609 行, LF, 单文件, 无构建, 无依赖)
├─ <style>  ~250 行  :root 19 个令牌 → 组件规则 → 弹窗规则 → 终端/表格规则
├─ <body>   ~105 行  header#statusbar · nav.toolbar(18 按钮 + 1 下拉) · #investbar
│                     main#term · footer(输入框 + ghost) · 3 个弹窗(XWrap > XModal)
└─ <script> ~2250 行 按分区注释组织：
    常量(含 COLOR / CAT_PALETTE / COMMANDS) → 比率助手 → 状态与持久化 → undo/redo →
    FSA 自动写盘 → 日期工具 → 周期引擎 → 投资换算 → 预算派生 → 渲染助手(kvRow) →
    输入/分发(COMMANDS→dispatch) → 各命令 → 总结/导出 → 配置/燃尽/资产 →
    UI 装配(弹窗/工具栏/补全) → boot

数据流：
  UI(按钮/弹窗/下拉) ──拼命令字符串──▶ runCommand ─▶ mutate(快照) ─▶ dispatch
                                                          │   (canonicalCmd 解析别名)
                                                          ▼
                                                     doXxx 命令
                                                          │
                                     state 变更 ─▶ save() ─▶ localStorage + FSA 目录写盘
                                                          │
                                            refreshHeader() / renderInvestBar() / 列表行

存储：localStorage[budget_term_v1]  ⇄  budget_term_backup.json（FSA，带 app/version 头）
      目录句柄 → IndexedDB(budget_term_fs/kv)
仓库：index.html · README.md · LICENSE · NOTICE · .gitignore（分区注释，屏蔽个人账本数据）
```

**设计基准（判断"统一"的标尺）**：单文件、零依赖、命令行 + 按钮双通道、单一可变 `state` + 纯派生计算、
所有用户数据走 `textContent`（无注入）、中文注释 + 英文标识符。

---

## 2. 亮点（审查中确认健康、应保持的约定）

1. **"UI → 命令字符串 → `runCommand`" 漏斗**：下拉菜单、3 个弹窗、工具栏真实命令全部拼串回灌
   `runCommand`，因此双通道行为、撤销栈、日志格式天然一致 —— 这是本项目最值得保留的决策。
2. **`mutate()` 快照-比对-入栈**统一了 undo/redo，且读命令不污染撤销栈。
3. **单一 `state` + 纯派生**：`consumeShare/rateSplit/periodSnapshot/forecastData/grantedTotal`
   全部现算，无影子副本、无缓存失效问题。
4. **渲染安全一致**：`line/addSeg/mkSpan/dotPair` 一律 `textContent`，`innerHTML` 仅用于清空（4 处）。
5. **文档纪律**：README 需求对照表 + 逐版本更新记录（现象/原因/解决），`.gitignore` 分区注释屏蔽个人数据。

---

## 3. 🔴 高优先级

### H1 · 主题双轨：CSS 令牌 vs JS 内联颜色字面量 —— ✅ 已修（v0.0.5 · P1）

| 项 | 内容 |
| --- | --- |
| 问题 | CSS 定义 12 个颜色令牌且 100+ 处 `var(--x)`，但 JS 侧另有 **224 处** `"#3dff7a"` 之类字面量，同一语义色在两层各写一遍 |
| 证据 | `:root`（L24）vs 遍布全文件的 `c:"#..."`；`LEVEL_COLOR`、`PREDEFINED` 调色板、`ratioDot`、`recStatus` |
| 影响 | 换配色 = 全文件替换，必然漏改；v0.0.3 那个"弹窗按钮黑字看不见"正是漏改产物 |
| 修复 | 新增 `COLOR` 常量表（L375）：**启动时读 `:root` 的 CSS 变量**，读不到回落内置字面量；补齐令牌 `--index/--pure/--faint/--cat-fallback/--panel-2/--panel-3/--field`；**307 处**引用改为 `COLOR.*` |
| 现状 | JS 里除 `COLOR` 定义块与调色板 2 个扩展色外**无颜色字面量**（`COLOR.*` 299 处）；改配色只需改 `:root` 一处 |
| 相关 | `COLOR`、`CAT_PALETTE`、`PREDEFINED`（L398-400） |

### H2 · 表格渲染 4 套实现（列宽还不一致）—— ✅ 已修（v0.0.5 · P1）

| 项 | 内容 |
| --- | --- |
| 问题 | 同一件事 4 套写法：`printSummaryReport` 的 `rows` 数组 + `padEnd(24)`；`doForecast`/`doAssets` **各一份逐字节相同**的 `row()` 闭包 + `padEnd(22)`；`showSettings` 手写空格对齐；另有 3 个从未被调用的表格助手 |
| 证据 | `printSummaryReport`(L1725)、`doForecast`/`doAssets` 的 `const row=…`、`showSettings`(L1926)；死函数 `boxLines`/`hr`/`tableRow` |
| 影响 | 命令之间数值列对不齐；新增表格必然再抄一遍 |
| 修复 | 统一 `kvRow(key, value, width, color, glow)`（L1035），4 条路径全部改走它；列宽不再写死，改为**按终端宽度自适应**（`kvColWidth()`/`termCols()`，≈列数×26%，夹在 14~24，`resize` 失效重算） |
| 现状 | summary/forecast/assets/config **列宽完全一致**；560px 窄窗列宽自动收到 16，1400px 用满 24 |

### H3 · "分类(category)"有 3 个真相来源 —— ⬜ 未修

| 项 | 内容 |
| --- | --- |
| 问题 | ① 弹窗 datalist 用 `PREDEFINED.keys()`；② `doList` 的"现有类别"提示用记录里的 `category`；③ Tab 补全用 `allCategories()` 并集。三者不同步；自定义类别注册时颜色恒为 `#8be9fd`，与 `catColor()` 的**兜底色完全相同** → 颜色机制形同虚设；导入备份后不刷新 datalist |
| 证据 | `validateCategory`(L1455) 写入 `PREDEFINED.set(c,"#8be9fd")`；`catColor` 兜底同为 `#8be9fd`；`refreshCatlist`(L2158) 只遍历 `PREDEFINED.keys()`；`allCategories`(L2397) 是并集；`restoreFromText`(L586) 只调 `refreshHeader` |
| 影响 | 用户自定义类别在**刷新页面后不再出现在表单下拉里**（Tab 补全却仍能补出来）；类别配色无意义 |
| 建议 | 收敛成 `knownCategories()` 单一入口（`PREDEFINED ∪ 记录`），弹窗/补全/提示共用；类别底色改为按名称哈希取 `CAT_PALETTE`；`restoreFromText` 里补 `refreshCatlist()` |
| 风险 | 低（纯 UI 数据源收敛，不涉及账本计算） |

### H4 · "改数据 → 落盘 → 刷新"缺统一提交点 —— ⬜ 未修（建议优先）

| 项 | 内容 |
| --- | --- |
| 问题 | 3 种写法并存：① 靠 `runCommand` 的 `mutate` 包一层（多数命令）；② UI 处理函数自己再包 `mutate`（列表行按钮、`doInvestFull`）；③ 领域函数内部直接 `save()`（`investAmount`）。**没有单一 commit 点** |
| 证据 | `save()` **24 处**调用、`refreshHeader()` **22 处**调用，散落在 20+ 个函数里；`mutate()` 仅 5 处 |
| 影响 | "改了数据但界面没刷新"这类缺陷会持续产生 —— v0.0.4 修的"改设置后顶栏不刷新"就是这个模式的必然产物 |
| 建议 | 引入 `commit(){ save(); refreshAll(); }`，命令里只改 state，落盘与刷新统一在出口；`save()` 不再被命令直接调用 |
| 风险 | **中高**：会碰到几乎所有 `doXxx`，必须靠现有 353 条断言 + 浏览器截图做回归；建议单独一个版本做 |

### H5 · 双通道覆盖不对称 + 弹窗 edit 分支是死代码 —— ⬜ 未修

| 项 | 内容 |
| --- | --- |
| 问题 | README 宣称"命令行 + 按钮双通道"，但：**「全额投资」只有鼠标**（无对应命令）；`config` **只有命令行**（无按钮）；`open-add` 弹窗的 edit 分支不可达（`modalMode` 永远 `"add"`、`modalId` 永远 `null`），所以 `update` 也只能走命令行 |
| 证据 | `doInvestFull`(L1691) 仅被工具栏按钮调用；`modalMode`(L2150/2151/2226)；工具栏 17 处 `data-cmd` 无 config |
| 影响 | 两条通道能力不等价，文档承诺与实际不符；死分支误导维护者 |
| 建议 | 二选一：要么补 `invest full [mm\|idx]` 命令 + `config` 按钮，要么在 README 明确"分摊型操作仅 UI"；死分支直接删掉或补上"列表行 ✎ 编辑"入口 |

---

## 4. 🟡 中优先级

### M1 · 命令清单四处漂移 —— ✅ 已修（v0.0.5）

| 项 | 内容 |
| --- | --- |
| 问题 | `dispatch()` 的 switch（含各别名）、`HELP_LINES`（help 输出）、`CMD_WORDS`（Tab 补全）各抄一份命令表 → `config/settings/thresholds/alerts` **能用但 help 里查不到**；别名只存在于 dispatch；`case "budget show"` 永远匹配不到（命令名只取第一个 token） |
| 证据 | 修复前 `HELP_LINES` 无 config 条目；`CMD_WORDS` 16 个词；`case "budget": case "budget show":` |
| 修复 | 新增**唯一**的命令登记表 `COMMANDS`（L1110，29 行 = 16 命令 + 13 子用法），由它派生三样东西：`printHelp()`（含自动生成的「命令别名」块）、`canonicalCmd()` 别名解析（L1149）、`CMD_WORDS`（L2394）；`dispatch` 改为 `switch(canonicalCmd(cmd))`（L1237）只按主名分派；`argCandidates` 先归一别名 |
| 顺带修复 | 别名 `u` 以前走 `mutate()` 包一层 → 撤销后又被当成"新改动"压栈**并把 redo 清空**；现在 `runCommand` 用主名判断（L1218 区） |
| 现状 | 34 个名字（16 主名 + 18 别名）全部有 help 行、有补全、有 dispatch 分支；`help` 补齐 `config` 且 `redo` 独立成行 |

### M2 · Tab 补全槽位模型不统一 —— ✅ 已修（v0.0.5）

| 项 | 内容 |
| --- | --- |
| 问题 | 用"第几个 token"当槽位，但 `@日期` 是**位置无关**参数（`add @2027-08-18 300 购物` 与 `add 300 购物 @2027-08-18` 都合法）→ ① `add` 忽略槽位，**金额位也提示类别**；② `update` 的类别放在**金额位**（slot 2），真正的类别位（slot 3）返回空 —— `update 1 60 餐` 补不出来、`update 1 餐` 反而提示"餐饮"；③ 多余槽位重复提示 id/类别 |
| 证据 | 修复前 `argCandidates` 里的 `slot===1/2/3` 判定；`if(cmd==="add") return [...PREDEFINED.keys()]`（无槽位判断） |
| 修复 | 改为**语义槽位** `arg` = 已输入的"值参数"个数（命令名与 `@日期` 都不计入），全命令共用；正在输 `@` 时只给有意义候选（仅 `list` 有 `@today/@period/@month`）。见 `argCandidates`(L2406) |
| 实测（真实浏览器 + 真实按键） | `update 1 60 餐`+Tab → `update 1 60 餐饮`；`update 1 餐`+Tab → 不动；`add 50 餐`+Tab → `add 50 餐饮`；`a 50 交`+Tab → `a 50 交通`；`add @2027-08-18 50 餐`+Tab → `…50 餐饮`；`list @t`+Tab → `list @today` |

### M3 · 数字解析 4 套，校验强度不一致 —— ⬜ 未修

| 项 | 内容 |
| --- | --- |
| 证据 | `numeric()`（严格正则，16 处）、`parseFloat`（`set alert`、`input2num`）、`input2num`（弹窗，去逗号，5 处）、`Number()`（归一化，4 处） |
| 影响 | 同一输入在不同入口命运不同：`set budget 1e3` 被 `numeric` 拒，弹窗/归一化路径却接受；`set alert 8e2` 被 `parseFloat` 收成 800 再被范围过滤 |
| 建议 | 统一为 `parseAmount()`（金额：>0、最多两位小数）与 `parsePercent()`（0~100）两个入口，弹窗与命令共用 |
| 风险 | 低-中（要逐个替换并补边界断言） |

### M4 · 弹窗 ID 命名 3 套，CSS 因之重复 —— ⬜ 未修

| 项 | 内容 |
| --- | --- |
| 证据 | 记一笔：`f_*` + `btnSubmit/btnCancel` + `mTitle`（4 + 5 处）；预算：`b_*`（9 处）；日期：`d_*`（11 处）。同一"主按钮"角色的颜色规则因此分散在 `#btnSubmit,#b_current` 与 `#b_daily_save,#d_ok` 两条，红色同理 |
| 影响 | 新增弹窗极易漏设颜色 —— v0.0.3 的"黑字看不见"就是在这个结构上发生的 |
| 建议 | 统一 `#<name>Modal` + `#<name>_ok/_cancel/_save`，按钮颜色收敛为 `.mbtns button.primary/.danger/.ghost` 三个类 |
| 风险 | 低（纯 HTML/CSS + `bindModal` 选择器） |

### M5 · 工具栏把"命令"与"伪动作"塞进同一个 `data-cmd` —— ⬜ 未修

| 项 | 内容 |
| --- | --- |
| 证据 | 17 处 `data-cmd`：`budget/summary day/export md/cls…` 是真命令，`open-add/open-budget/backup-download/restore-file/autosave-dir` 是纯 UI 动作，`bindToolbar` 用 if 链逐个特判 |
| 建议 | 拆成 `data-cmd`（回灌命令）与 `data-action`（本地动作）两类，`bindToolbar` 分两个分支处理 |
| 风险 | 低 |

### M6 · 24 个 catch 的错误策略不统一 —— ⬜ 未修

| 项 | 内容 |
| --- | --- |
| 证据 | 部分报给用户（`line`/`fsLog`），部分静默 `catch(e){}` 或仅注释"忽略"（`requestPermission`/`persistDirHandle`/`armAutoReconnect`/IDB 读写） |
| 建议 | 明确三档策略并写进注释：**用户可见**（终端提示）、**可降级**（静默但记 `console.warn`）、**预期失败**（静默 + 注释说明） |
| 风险 | 低 |

### M7 · "版本"一词 3 种含义 —— ⬜ 未修

| 项 | 内容 |
| --- | --- |
| 证据 | `APP_VERSION`（应用版本，界面/config 显示）、`serializeState().version:2`（备份**格式**版本）、git tag；`restoreFromText` 校验了 `app` 字段却**完全不校验 `version`**（新旧格式被同等对待） |
| 建议 | 改名为 `APP_VERSION` / `BACKUP_FORMAT`；导入时对 `BACKUP_FORMAT > 当前` 给出明确提示（"备份来自更新的版本"） |
| 风险 | 低，但涉及备份兼容性语义，建议与 v0.0.5 之后的版本一起做 |

### M8 · 多步变更无原子性 —— ⬜ 未修

| 项 | 内容 |
| --- | --- |
| 证据 | `mutate()`（L533）只做快照比对、不回滚；`restoreFromText` 内先写 settings 再写 records，中途抛错会留下"设置新、记录旧"的半更新状态（目前靠 `normalize*` 足够防御，但模式本身脆弱） |
| 建议 | `mutate()` 支持事务：`fn` 抛错则回滚到 `before` 快照；导入这类多步操作整体放入事务 |
| 风险 | 中（要小心不要掩盖错误：回滚后仍需把异常抛给 `runCommand` 播报） |

---

## 5. ⚪ 低优先级（清理类）

| ID | 问题 | 证据 | 状态 |
| --- | --- | --- | --- |
| **L1** | 死函数/死参数：`boxLines`、`hr`、`tableRow`、`periodSpend`、`catNameOfRecord`、`recordMoneyInv`、`recordHistory`、常量 `INVEST_SHARE`、`printSummaryReport` 的 `budgetRef` 形参（4 处传参、函数体内从未读取）、`buildReportText` 里 `md? money : money` 恒等三元 | 定义后全文件无调用 | ✅ **已删**（v0.0.5 · P1） |
| **L2** | 死 CSS：`.line0~.line5`、`.lvl-0~.lvl-4`、`table.kv`、`.tag`、`.bar-track`、`.bar-fill`、`.error` | 无任何 JS 生成这些类名 | ✅ **已删**（v0.0.5 · P1） |
| **L3** | 重复表达：`row()` 助手两份逐字节相同 → 已合并；**提示符用两种写法表达同一件事**（footer 用 `<b>user</b>@<span class="pwd">budget</span>:~$` 分片，`echoCommand`(L2061) 用整串 `"user@budget:~$ "`） | `user@budget` 字面量 1 处 + footer 分片 1 处 | 🟨 部分（`row()` 已合并；提示符未统一） |
| **L4** | 记录字段 `created` **只写不读**（`normalizeRecords` L504/509、`makeRecord` L1499 写入，无任何展示或计算使用） | 3 处 | ⬜ 未修（要么在 `list`/导出里显示，要么删字段） |
| **L5** | `state.seq` 与记录 id 只靠约定 | v0.0.4 已统一为 `seq = max(备份 seq, 记录最大 id)` + 重复/缺失 id 自动顺延 | 🟨 部分（仍无显式 id 分配器） |
| **L6** | 仓库形态：新增的 `release-notes/` 是首个未提交子目录，规范未定 | `git status` → `?? release-notes/` | ✅ **已纳入仓库**（`release-notes/v0.0.4.md` 随 v0.0.5 补交；回归装置同时移入 `tests/`，见 §7） |
| **L7** | 注释分区风格混用：`/* ===== X ===== */`、`/* --- x --- */`、`/* ---------- x ---------- */` | 全文件 | ⬜ 未修 |
| **L8** | 数据表里混入控制哨兵 `__HEADER`/`__INFO` | 原 `HELP_LINES` 结构 | ✅ **已消**（随 M1 改为结构化 `COMMANDS`） |

---

## 6. 建议实施顺序

| 优先级 | 动作 | 收益 | 风险 |
| --- | --- | --- | --- |
| **P0** | **H4** 收口"改数据 → commit（save + refresh）" | 根除"改了没刷新"一整类缺陷 | 中高（碰所有命令，需完整回归） |
| **P1** | ~~H1 颜色令牌~~ / ~~H2 统一表格~~ | 主题单点可改、列宽统一 | 已完成 |
| **P2** | ~~M1 命令登记表~~ / ~~M2 语义槽位~~ | 消除命令清单与补全漂移 | 已完成 |
| **P3** | **H3** 分类真相来源收敛 + **L6** 仓库规范 | 自定义类别行为可预期 | 低 |
| **P4** | **M3** 解析入口收敛 + **M4** 弹窗 ID 规范 | 输入校验一致、新弹窗不再漏色 | 低 |
| **P5** | **M5/M6/M7/M8** + **H5** + 剩余低项 | 边界清晰、错误策略统一、通道对称 | 低-中 |

**共同风险提示**：这些都是"横向重构"，改动面大。护栏是现成的 ——
`test.mjs`/`test2.mjs`/`test3.mjs`/`test4.mjs`/`test5.mjs` 共 **353 条断言**（含针对 P1/M1/M2 的变异测试），
外加无头 Edge 的多分辨率截图与运行期探针。

---

## 7. 如何验证（回归护栏）

测试装置已随 v0.0.5 移入仓库 `tests/`（原先散落在 `%TEMP%\bt-harness\`，路径已全部相对化）：

```powershell
node tests/run-all.mjs     # 单一入口：跑完 5 个套件并按 §5.3 基线校验断言数，合计 411 条
node tests/mutate-amort.mjs # 变异测试：6 组分摊成本变异必须全部被抓住（v0.0.6 新增）
node tests/test.mjs        # 110 条 · 账本/周期/投资/导入导出/持久化 + 分摊成本(T28)
node tests/test2.mjs       #  55 条 · 端到端命令流/弹窗/备份数据冒烟
node tests/test3.mjs       #  84 条 · P1 重构护栏（颜色令牌一致、kvRow、自适应列宽、死代码已删、响应式规则在）
node tests/test4.mjs       #  81 条 · M1 护栏（登记表 ↔ dispatch ↔ help ↔ 补全 ↔ README 双向校验）
node tests/test5.mjs       #  81 条 · M2 护栏（语义槽位、@日期位置无关、ghost 预览）+ amort 补全与双选项卡
# 换被测文件(变异测试)：$env:BT_HTML=<path>
# 拿真实备份做冒烟：  $env:BT_FIXTURE=<budget_term_backup.json>   (只读，不入库；见下方告警)
```

装置特点：自建 DOM stub 直接执行 `index.html` 的内联脚本；**冻结时钟**（`loadApp({now})` 可指定，默认 2027-08-30）
避免"换一天跑就假失败"；另有 `gen-probe.mjs`（运行期读取真实 `COLOR`/列宽并写进 DOM，配 `--dump-dom` 取值）、
`gen-tab.mjs`（用真实键盘事件验证 Tab 补全）、`gen-amort.mjs`（真实点击选项卡 + `input` 事件验证双选项卡与预览）。
默认夹具 `tests/fixtures/user_backup.json` 是**全合成账本**（settings/日期/金额/备注均为编造，不含任何真实账目）
——详见 `tests/README.md`。

> ⚠️ `BT_FIXTURE` 指真实备份时**不要期待全绿**：一批断言把夹具 settings 与冻结时钟一起用（`T3.2`、`T24.1/2`），
> 真实周期配置与 2027 合成时间线天然不一致。判定标准是"没有新增崩溃/异常"。

v0.0.6 起另有**变异测试脚本** `tests/mutate-amort.mjs`：6 组分摊成本变异必须全部被对应断言抓住（§4.3）。

---

## 8. 附：量化指标

| 指标 | v0.0.5 | v0.0.6 | 说明 |
| --- | --- | --- | --- |
| `index.html` 行数 | 2609 | 2846 | +237（分摊成本 + 双选项卡 + 注释） |
| CSS 令牌 / `var(--x)` 使用 | 19 / 103 | 19 / 111 | 未新增令牌（复用既有色） |
| JS `COLOR.*` 引用 / 残留颜色字面量 | 299 / 15 | 333 / 15 | 新增代码全部走 `COLOR.*`，字面量数不变（H1 未回退） |
| 命令登记行 / 命令名+别名 | 29 / 34（16+18） | 30 / 36（17 主名 + 19 别名） | 新增 `amort`=`amortize` |
| `save()` / `refreshHeader()` / `mutate()` | 24 / 22 / 5 | 25 / 23 / 5 | 新命令走既有 A6 约定（H4 未动） |
| `catch` 块 / `innerHTML` / `Escape` 处理 | 24 / 4 / 0 | 24 / 4 / 0 | 未新增 `catch`（`amort` 无静默吞错） |
| `padEnd(2x)` 表格残留 | 0 | 2 | 均为 `renderRecordRow()` 的**行内列对齐**（类别/金额），非表格助手（H2 未回退） |
| 断言总数 | 353 | **411** | +58（test 110 / test2 55 / test3 84 / test4 81 / test5 81） |
| 变异测试组数 | 7 | **13** | +6（全部被抓住） |

---

## 9. 本清单的维护

- 每次修掉一条：把对应表格里的状态改为 `✅ 已修（版本）`，并在"修复"栏写清做法与相关符号。
- 新增发现：追加同类 ID（H/M/L + 序号），并补"证据（符号名）→ 影响 → 建议 → 风险"四段。
- 行号会随代码漂移，**以符号名为准**；重构后可顺手更新第 8 节的量化指标。

---

## 10. v0.0.6 变更对既有结论的影响

本次是**加功能**（分摊成本 `amort` + 「记一笔」双选项卡），没有横向重构，因此 21 条的状态不变。
但新代码与既有 21 条有交叉，逐条说明：

| 条目 | 影响 | 说明 |
| --- | --- | --- |
| **A2 / F1（横向重复）** | 🟢 **未新增重复** | 新代码新加了两个单一数据源：`recDays()`/`recTotal()`/`recAmortized()`（分摊记录的唯一读取入口）与 `setModalTab()`/`updateAmortHint()`（选项卡切换/预览的唯一入口）。全文件没有第二处 `r.amortDays||1` 这种兜底写法 |
| **A3 / F2（命令登记表漂移）** | 🟢 护栏已抓住一次 | 新增 `amort` 时先漏了 README 行，`test4.mjs` M1.34 **立刻变红** —— 登记表机制按设计生效（这正是 M1 修复想要的效果） |
| **A8 / F7（两条路径不一致）** | 🟢 已加护栏 | `normalizeRecords()` 是唯一归一化入口；实测**同一份旧备份（153 条）在 v0.0.5 与 v0.0.6 下的归一化结果逐字段字节一致**（纯加法，无迁移） |
| **H3（分类三个真相来源）** | ⬜ 未变 | 分摊成本复用 `validateCategory()`，因此**继承**了同一个缺陷（自定义类别刷新后不在 datalist）。没有恶化，也没有修 |
| **H4（缺统一提交点）** | ⬜ 未变 | `doAmort()` 照现有约定自己调 `save()` + `refreshHeader()`（`save()` 25 处 / `refreshHeader()` 23 处）。**新命令没有让它变好，也没有让它变坏** —— 但这是"再多一处需要收口的点"，P0 的收益随功能增加而上升 |
| **H5（双通道不对称 / 死分支）** | 🟡 **部分缓解** | 新增功能**两条通道都做了**（`amort` 命令 ↔ 分摊选项卡，弹窗也拼串回灌 `runCommand`），没有制造新的不对称；但 `open-add` 的 edit 分支仍是死代码，本次未做编辑入口 |
| **M3（数字解析 4 套）** | ⚠ **+1 入口** | 新增 `parseDaysToken()`（天数/`12月`/`12m`），成为第 5 个解析入口。它只解析"天数"这一种语义、边界集中（`AMORT_MIN_DAYS`~`AMORT_MAX_DAYS`），未与金额解析混用；但 P4 做 M3 收敛时应把它**一起纳入**（建议 `parseDays()`） |
| **M4（弹窗 ID 命名 3 套）** | ⚠ **+1 套** | 新增字段用 `f_amt/f_cat/f_date/f_note` 的 `fa_*` 前缀（`fa_total`/`fa_days`/`fa_cat`/`fa_date`/`fa_note`）+ `.mtabs/.mpanel` 类。与既有三套并存，属于**已知变体**；P4 统一弹窗规范时应合并到 `#<name>Modal` + `.mbtns button.primary` 体系 |
| **M5（工具栏 `data-cmd` 混装）** | ⬜ 未变 | 「+ 记一笔」仍是 `open-add` 伪动作，未拆 `data-action` |
| **M6（24 个 catch 策略不统一）** | 🟢 未新增 | `amort` 路径没有新增 `catch`（`catch` 仍 24 处） |
| **L4（`created` 只写不读）** | 🟢 **未重演** | 新增的 `amortDays`/`amortTotal` 都有明确读取点（`recDays`/`recTotal` → 列表行、报告、`update`、`recalc`），并写了"新字段必须有读取点"的配方（HANDOVER §3.4） |
| **F13（一个数字两套口径）** | 🆕 **新失败模式** | 分摊成本让"消费=每天 / 投资=总价"这两个口径共存。**先写恒等式再写代码**（`Σ(每天÷N占比) ＝ 总价÷N占比`），并把它变成断言 T28.6 —— 这是本轮唯一真正的新风险面，已用断言封住 |
| **F14（变异没红 ≠ 护栏不行）** | 🆕 经验 | `m_amort_bounds` 第一次没红，因为被**另一条**护栏（每天不足 ¥0.01）顺手拦住；补"上限 3650 放行 / 99999 拒绝"后才真正守住 |

**给下一版的建议（不变）**：**P0 · H4**（统一 commit 出口）。理由在 v0.0.6 反而更强：
新增 `amort` 又添了一处 `save()`/`refreshHeader()` 手工调用点 —— 功能越多，H4 的收益越大、成本越高。
