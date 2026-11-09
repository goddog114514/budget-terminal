# BUDGET::TERM 架构与验证基线 · 完整问题清单

> **本文件的双重角色**：① **架构/验证的唯一权威** —— 工程骨架与索引（§1）、怎么验证（§7）、
> 量化指标（§8）、文档分工（§9）；② **审查问题清单** —— 21 条（§3–§5）与实施顺序（§6）、每版影响（§10）。
> **配套文档**：[`README.md`](README.md)（用户手册 + 逐版更新记录）、`HANDOVER.md`（本地约束文件：
> 不变量 / 改动配方 / AI 规范 / 隐私与流程纪律 —— 它**索引本文件**，不重复本文件的内容，分工见 §9.1）。
> **审查对象**：`index.html`（v0.0.5 时点 2609 行 → v0.0.8 已 2944 行 → **v0.0.9 已 3007 行**，单文件应用）+ `README.md` + `.gitignore`
> **审查方式**：静态走查 → 350+ 条无头断言复现 → 真实浏览器（无头 Edge）渲染/交互验证
> **本文件位置**：项目主文件夹（与 `README.md` 同级）
> **行号说明**：行号为 v0.0.5 时点值，代码改动后会漂移；定位请优先用**符号名**（§1.5 有索引）。
> **版本时点**：`v0.0.9`（合并 v0.09-rev.1 的 H5 与 v0.09-rev.2 的 H4：双通道对称 + 弹窗 edit 分支 + 统一提交点；此前 v0.0.8 分摊起始日期精确到日）。

---

## 0. 状态总览

| 严重度 | 条目 | 已修 | 部分 | 未修 |
| --- | --- | --- | --- | --- |
| 🔴 高（正确性 / 结构性） | 5（H1–H5） | **3** | 0 | 2 |
| 🟡 中（一致性 / 可维护性） | 8（M1–M8） | **2** | 0 | 6 |
| ⚪ 低（清理类） | 8（L1–L8） | **3** | 2 | 3 |
| **合计** | **21** | **8** | **2** | **11** |

**一句话结论**：这不是"架构混乱"的项目，而是"**约定正确、执行时被横向重复侵蚀**"的项目 ——
21 条里有 6 条同源于**缺少三层抽象**：颜色令牌（H1）、表格渲染器（H2）、命令登记表（M1/M2）、状态提交点（H4）—— 这四类抽象现已全部建成（H4 见 v0.09-rev.2）。
这批抽象建好之后，剩下的条目多数是"把已有重复也挂到同一套抽象上"。

已修条目的版本归属：`v0.0.9`（**H4 + H5**）、`v0.0.5`（P1 重构 / M1 / M2）、`v0.0.4`（L5 部分）。
v0.0.6 的新增代码（分摊成本）**没有引入新的重复**，反而新加了两个单一数据源；
**v0.0.7 修掉了它遗留的窗口口径缺陷**（同一笔钱在五处统计里各算一份/漏算），
并把五处收口成 `collectWindow()` 一套（见 §10.1）。

---

## 1. 工程骨架与索引（作为"一致性"的基准）

> 这一节是**唯一**的实现索引：代码分区、数据流、存储、命令表、符号表、术语表都在这里。
> `HANDOVER.md` 只索引本节，不再重复维护同一份内容（宪法见 §8）。

### 1.1 代码分区

```
index.html (3404 行, LF, 单文件, 无构建, 无依赖)
├─ <style>  ~310 行  :root 19 个令牌 → 组件规则 → 弹窗规则 → 终端/表格规则 → 选项卡规则
│                     → 图表规则(.chart-bars/.chart-pie/.chart-legend, v0.0.10)
├─ <body>   ~140 行  header#statusbar · nav.toolbar(命令按钮 + 2 个范围下拉: 消费列表 / 总结与图表) · #investbar
│                     main#term · footer(输入框 + ghost) · 3 个弹窗(XWrap > XModal,
│                     记一笔弹窗内含 2 个选项卡面板 #mp_add / #mp_amort)
└─ <script> ~2790 行 按分区注释组织：
    常量(含 AMORT_* / CHART_* / COLOR / CAT_PALETTE / COMMANDS) → 比率助手 → 状态与持久化 → undo/redo →
    FSA 自动写盘 → 日期工具 → 周期引擎 → 投资换算(含 recDays/recTotal/recWindow) →
    ★窗口统计唯一入口(collectWindow/sumRange/recAmountInRange) → 预算派生 →
    渲染助手(kvRow) → 输入/分发(COMMANDS→dispatch) → 各命令(含 doAmort) →
    ★窗口解析唯一入口(resolveWindow, summary/chart/report 共用) → 总结/图表/合并入口/导出 →
    配置/燃尽/资产 → UI 装配(弹窗/选项卡/工具栏/下拉/补全) → boot
```

### 1.2 数据流（每个命令都走这条线）

```
UI(按钮/弹窗/下拉) ──拼命令字符串──▶ runCommand(raw)
                                      │
                                      ├─ 解析 & 回显 & 入历史
                                      ├─ canonicalCmd(cmd) 解析别名
                                      ├─ undo/redo → 直接 dispatch（不进撤销栈）
                                      └─ 其余 → mutate(() => dispatch(cmd, tokens))
                                                   │
                                              doXxx(tokens)
                                                   ├─ 校验参数
                                                   ├─ 改 state
                                                   ├─ save()   → localStorage + FSA 写盘
                                                   └─ 渲染     → line/kvRow/refreshHeader/renderInvestBar
```

**"UI 拼串回灌 `runCommand`"是本项目最值得保留的决策**：下拉、弹窗（含「记一笔」两个选项卡）、
工具栏命令全部拼命令字符串回灌，因此双通道行为、撤销栈、日志格式天然一致（见 §2 亮点 1）。

### 1.3 存储与仓库形态

```
localStorage[budget_term_v1]  ⇄  budget_term_backup.json（FSA，带 {app,version,savedAt} 头）
目录句柄 → IndexedDB(budget_term_fs / kv)
仓库：index.html · README.md · ARCHITECTURE-REVIEW.md · LICENSE · NOTICE · .gitignore
      · release-notes/ · tests/          （HANDOVER.md 有意不入库，见 §8）
```

**设计基准（判断"统一"的标尺）**：单文件、零依赖、命令行 + 按钮双通道、单一可变 `state` + 纯派生计算、
所有用户数据走 `textContent`（无注入）、中文注释 + 英文标识符。

### 1.4 命令表（43 个名字 = 20 主名 + 23 别名；设置入口在 config 下）

由代码里的 `COMMANDS` 登记表派生 —— 改命令请改登记表，别在别处抄（M1）。

```
help(?) (h)      查看帮助                     set            周期/投资/阈值等设置(见下)
budget           当期预算进度                  forecast(burn)(predict)  燃尽预测
add(a)           记一笔                        amort(amortize) 分摊成本(总价/天数/类别)
list(ls)         消费列表(类别/@日期/@period)   del(rm)(delete)  删除
update(edit)     修改/改地点(#-)               pay(invest)    标记已投
place(where)     手动设置/清除地点            config set geo auto|manual  地点模式
config set geokey <Key>  腾讯地图 Key        config set invest <比例%>  配置投资比例
summary(sum)     总结(day/week/month/cat/类别)  chart(charts)(viz)  图表总结(柱状图/饼图 + 分析)
report(overview) 总结与图表(合并入口)          export         导出 md|txt
assets(asset)(networth)  资产看板              undo(u)        撤销
redo             重做                          config(settings)(thresholds)(alerts)  查看配置
cls(clear)       清屏                          config set budget <金额> [now]  配置预算(now=仅当期)
config set invest <比例%>  配置投资比例        set            周期/阈值/年化等设置(见下)
set 子命令: daily | period | periodstart | monthstart | weekstart | alert | rate
注: 旧写法 set budget / set invest(consume/ratio) 仍兼容, 但 help 只推荐 config set …
```

### 1.5 关键符号索引（v0.0.8 行号，仅作起点，定位以符号名为准）

| 符号 | 行 | 职责 |
| --- | --- | --- |
| `LS_KEY` / `APP_VERSION` | 388 / 389 | 存储 key（**不得改**）与应用版本号 |
| `AMORT_MIN_DAYS` / `AMORT_MAX_DAYS` / `AMORT_DAYS_UNIT` | 403 | 分摊天数区间 2~3650 与"月→天"折算 30 |
| `:root` | 24 | **颜色/面板令牌单一数据源（19 个）** |
| `COLOR` / `CAT_PALETTE` / `PREDEFINED` | 421 / 444 / 446 | 颜色表、类别调色板、已知类别 |
| `defaultSettings` / `normalizeSettings` / `normalizeRecords` | 473 / 495 / 535 | 默认值、加载与导入共用的归一化（分摊字段在 `normalizeRecords`） |
| `loadState` / `save` / `mutate` / `applyState` / `undo` / `redo` | 479 / 571 / 588 / 599 / 603 / 612 | 加载、落盘、撤销快照、恢复、撤销/重做 |
| `restoreFromText` / `doBackupDownload` | 641 / 663 | 备份导入 / 导出下载 |
| `investOf` / `recomputeAllInvest` / `recDays` / `recTotal` / `recAmortized` | 912 / 918 / 902 / 903 / 908 | 投资换算（按**总价**）、比例变更重算、分摊记录读取入口 |
| `recWindow` / `recDaysInRange` / `recInWindow` / `recAmountInRange` / `recAmountUpToToday` / `sumRange` / `collectWindow` / `investTotalsOf` | 912 / 917 / 924 / 926 / 933 / 937 / 993 / 1008 | **窗口统计唯一入口**（v0.0.7）：分摊按"落在统计窗口内的天数"计；`collectWindow` 是总结/报告/`periodSnapshot` 共用的窗口统计，`investTotalsOf` 是应投/已投合计 |
| `periodBounds` / `currentPeriod` / `ensureEpoch` | 840 / 871 / 1002 | 周期引擎与账本起点对齐 |
| `investAmount` / `investFull` | 951 / 987 | 池分摊、全额投资 |
| `moneyPending` / `indexPending` / `totalCharge` / `grantedTotal` / `availableBalance` / `periodSnapshot` | 934 / 935 / 1104 / 1033 / 1041 / 1110 | 池累计、占用合计（**只累计到今天**）、发放/结转/当期口径（复用 `collectWindow`） |
| `kvColWidth` / `kvRow` | 1092 / 1102 | **统一表格渲染器（含窗口自适应列宽）** |
| `COMMANDS` / `CMD_ALIAS` / `canonicalCmd` | 1177 / 1209 / 1217 | **命令登记表与别名解析** |
| `resolveWindow` / `noCategoryHint` | 2130 附近 | **窗口解析唯一入口**：`summary` / `chart` / `report` 共用，返回 `{win,name,isDay}`；`kind="date"` 支持指定某一天 |
| `parseChartArgs` / `chartBuckets` / `renderBarChart` / `renderPieChart` | 2190 附近 | 图表参数 / 分桶(每桶走 `collectWindow`) / 柱状图 DOM / 饼图 DOM（v0.0.10） |
| `printChartTable` / `printChartAnalysis` / `renderChartBody` / `doChart` / `doReport` | 2380 附近 | 文本数据表 / 自动分析 / **绘图唯一实现(`chart` 与 `report` 共用)** / 两个命令入口（v0.0.10） |
| `toggleDd` / `closeDd` / `onRangeMenuItem` / `RANGE_COMMANDS` | 2990 附近 | **范围下拉唯一实现**：消费列表与合并后的总结共用（v0.0.10 同版迭代） |
| `dateModalTarget` / `dateModalCmd` / `openDateModal` / `applyDateModal` | 3050 附近 | 同一个手动输日期弹窗按 target 拼 `list` / `report` 命令（v0.0.10 同版迭代） |
| `printHelp` / `runCommand` / `dispatch` | 1220 / 1286 / 1305 | help 渲染 / 命令入口 / 分派 |
| `doXxx`（17 个命令处理器） | 1331（`doSet`）– 2176（`doAssets`） | 各命令实现 |
| `makeRecord` / `amortSplitLine` / `parseDaysToken` / `doAmort` | 1565 / 1577 / 1588 / 1602 | 记录工厂、分摊明细行、天数解析、`amort` 命令 |
| `renderRecordRow` / `refreshHeader` / `renderInvestBar` | 1654 / 2220 / 2264 | 列表行 / 顶栏 / 理财条 |
| `buildReportText` / `showSettings` | 2008 / 2081 | 导出报告 / `config` 输出 |
| `doForecast` / `forecastData` / `doAssets` | 2139 / 2106 / 2176 | 燃尽预测 / 预测数据 / 资产看板 |
| `setModalTab` / `updateAmortHint` / `amortPickDate` / `openAdd` / `submitModal` / `submitAmort` | 2383 / 2400 / 2437 / 2465 / 2536 / 2530 | **「记一笔」双选项卡**、实时预览、**起始日期唯一解析入口**、提交 |
| 补全区：`CMD_WORDS` / `argCandidates` / `completionCandidates` / `textWidthPx` | 2624 / 2636 / 2705 / 2733 | **补全词 / 语义槽位 / 补全入口 / 字宽度量** |
| `boot` | 2813 | 启动（loadState → 渲染 → 绑定 → banner） |

### 1.6 术语表

| 术语 | 含义 |
| --- | --- |
| 占用 / 总花费 | `消费 ÷ N`（预算口径的"真实消耗"） |
| 应投 | `占用 × (1−N)`，拆成"应投货币 / 应投指数"两池 |
| 池 / 未投池 | 各记录 `应投 − 已投` 的累计（跨期累计） |
| 全额投资 | 池 ≥ 阈值（货币 100 / 指数 20）时一次性投掉整池，按未投额比例分摊 |
| 结转 / 透支 | 当期占用 < 发放 → 剩余结转到下期；> 发放 → 从下期发放扣回 |
| 周期 | `month`（自然月或自定义起始日）或 `rolling`（固定 N 天） |
| epoch | 账本起点（第一期发放所在周期起点），必须落在真实周期边界 |
| 当期覆盖 | `periodBudget[start]` 只改某一期的预算 |
| 批次 | 每次「全额投资」分摊时处理的池子；支持一笔只投一部分 |
| **分摊成本** | 一次性付掉的总价按天数摊到每天：`amount`=每天金额，`amortDays`=天数，`amortTotal`=总价；**投资按总价记一次**（v0.0.6） |
| 口径 | 同一个数字的两种读法：**消费口径=每天**、**投资口径=总价**（v0.0.6 起的分摊成本要严格区分，§10 的 F13） |

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

### H3 · "分类(category)"有 3 个真相来源 —— ✅ 已修（v0.0.12 · P1）

| 项 | 内容 |
| --- | --- |
| 问题 | ① 弹窗 datalist 用 `PREDEFINED.keys()`；② `doList` 的"现有类别"提示用记录里的 `category`；③ Tab 补全用 `allCategories()` 并集。三者不同步；自定义类别注册时颜色恒为 `#8be9fd`，与 `catColor()` 的**兜底色完全相同** → 颜色机制形同虚设；导入备份后不刷新 datalist |
| 证据 | `validateCategory`(L1455) 写入 `PREDEFINED.set(c,"#8be9fd")`；`catColor` 兜底同为 `#8be9fd`；`refreshCatlist`(L2158) 只遍历 `PREDEFINED.keys()`；`allCategories`(L2397) 是并集；`restoreFromText`(L586) 只调 `refreshHeader` |
| 影响 | 用户自定义类别在**刷新页面后不再出现在表单下拉里**（Tab 补全却仍能补出来）；类别配色无意义 |
| 建议 | 收敛成 `knownCategories()` 单一入口（`PREDEFINED ∪ 记录`），弹窗/补全/提示共用；类别底色改为按名称哈希取 `CAT_PALETTE`；`restoreFromText` 里补 `refreshCatlist()` |
| ✅ **修复（v0.0.12 P1）** | `knownCategories()` 成为**单一真相来源**：`refreshCatlist()`、三处 `argCandidates()` 类别位、`list`/`summary`/`chart`/`report` 提示与 `customCatColor()` 全部复用；`validateCategory()` 不再写全局 `PREDEFINED`（消除命令失败时的副作用）；新增 `CUSTOM_CAT_PALETTE` 8 色（与默认色板不重叠），按已知自定义类别的**排序索引**分配 → 相邻类别必异色、跨会话稳定（比"按名称哈希"更彻底地解决相邻同色）。`restoreFromText()` 走 `commit() → refreshAll() → refreshCatlist()`，导入备份后不再丢。护栏：`test8` P1.28–P1.33、`test3` C9/C10 系列与 4 组变异 |
| 风险 | 低（纯 UI 数据源收敛，不涉及账本计算） |

### H4 · "改数据 → 落盘 → 刷新"缺统一提交点 —— ✅ 已修（v0.09-rev.2 · P0）

| 项 | 内容 |
| --- | --- |
| 问题 | 3 种写法并存：① 靠 `runCommand` 的 `mutate` 包一层（多数命令）；② UI 处理函数自己再包 `mutate`（列表行按钮、`doInvestFull`）；③ 领域函数内部直接 `save()`（`investAmount`）。**没有单一 commit 点** |
| 证据 | 修复前 `save()` **25 处**、`refreshHeader()` **23 处**，散落在 20+ 个函数里；`mutate()` 仅 5 处 |
| 影响 | "改了数据但界面没刷新"这类缺陷会持续产生 —— v0.0.4 修的"改设置后顶栏不刷新"就是这个模式的必然产物 |
| 修复 | 新增 `refreshAll()`（`refreshHeader` + `refreshHistoryUI` + `refreshCatlist`）与**唯一提交点** `commit(){ save(); refreshAll(); }`；`runCommand` 出口调用 `commitIfDirty()`（`pendingCommit` 由 `mutate()` 在快照确实变化时置位）；`applyState()` / `restoreFromText()` / 列表行按钮 / `doInvestFull()` 各自在出口调 `commit`。命令函数只改 `state`，不再自己 `save()`/`refreshHeader()` |
| 现状 | `save()` 仅在 `loadState()`（启动落盘，非命令）与 `commit()` 里各调一次；`refreshHeader()` 只在 `refreshAll()` 里调。**命令路径只有一个落盘 + 一个刷新出口** |
| 风险 | 中高（已完成）：碰了几乎所有 `doXxx`；用现有 **455 条断言**全量回归（全绿）+ 3 组变异（见 §7.4）验证 |

### H5 · 双通道覆盖不对称 + 弹窗 edit 分支是死代码 —— ✅ 已修（v0.09-rev.1）

| 项 | 内容 |
| --- | --- |
| 问题 | README 宣称"命令行 + 按钮双通道"，但：**「全额投资」只有鼠标**（无对应命令）；`config` **只有命令行**（无按钮）；`open-add` 弹窗的 edit 分支不可达（`modalMode` 永远 `"add"`、`modalId` 永远 `null`），所以 `update` 也只能走命令行 |
| 证据 | `doInvestFull` 仅被工具栏按钮调用；`modalMode`/`modalId` 只在复位时写；工具栏 17 处 `data-cmd` 无 config |
| 修复 | 三条都补齐（未做"仅 UI"的降级）：① 新增 `pay full [mm\|idx]`（别名 `invest full`），把"执行+播报"抽成 `investFullRun(kind)` 供命令与按钮共用；② 工具栏加 `data-cmd="config"` 按钮，理财条 `全额投资` 改为回灌 `runCommand("pay full …")` —— 与命令行同一条通道、撤销栈单步；③ `list` 行加 `✎ 编辑` → `openEdit()` 进入 `modalMode="edit"`、提交走 `update` 命令，编辑态隐藏选项卡、失效行不可编辑 |
| 现状 | 命令 ↔ 按钮能力对齐；`open-add` 的 edit 分支不再是死代码；`pay full` 有补全、有 help、有 README 行 |
| 相关 | `COMMANDS` / `doPay` / `doPayFull` / `investFullRun` / `doInvestFull` / `invCluster` / `openEdit` / `setModalTab` / `setModalTabsVisible` / `submitModal` / `renderRecordRow`；护栏 `tests/test6.mjs`（43 条）+ 6 组变异 |

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
| **P0** | ~~**H4** 收口"改数据 → commit（save + refresh）"~~ | 根除"改了没刷新"一整类缺陷 | ✅ **已完成（v0.09-rev.2）** |
| **P1** | ~~H1 颜色令牌~~ / ~~H2 统一表格~~ | 主题单点可改、列宽统一 | 已完成 |
| **P2** | ~~M1 命令登记表~~ / ~~M2 语义槽位~~ | 消除命令清单与补全漂移 | 已完成 |
| **P3** | ~~**H3** 分类真相来源收敛~~（✅ v0.0.12 P1）+ **L6** 仓库规范 | 自定义类别行为可预期 | 低（H3 已完成，L6 仍待办） |
| **P4** | **M3** 解析入口收敛 + **M4** 弹窗 ID 规范 | 输入校验一致、新弹窗不再漏色 | 低 |
| **P5** | **M5/M6/M7/M8** + ~~H5~~（已完成 v0.09-rev.1）+ 剩余低项 | 边界清晰、错误策略统一、~~通道对称~~ | 低-中 |

**共同风险提示**：这些都是"横向重构"，改动面大。护栏是现成的 ——
`test.mjs`/`test2.mjs`/`test3.mjs`/`test4.mjs`/`test5.mjs` 共 **353 条断言**（含针对 P1/M1/M2 的变异测试），
外加无头 Edge 的多分辨率截图与运行期探针。

---

## 7. 如何验证（回归护栏 · 唯一权威）

> **本节是全项目"怎么验证"的唯一存放处**：测试装置清单、跑法、验证闸门、浏览器验证、变异测试、
> 以及历年踩过的坑，都只在这里维护。`HANDOVER.md` §4 / §5.3 只写"必须验证"这条规则并指向本节。

### 7.1 测试装置（已入仓；原"头号交接风险"已关闭）

装置原先散落在 `%TEMP%\bt-harness\`（临时目录随时会被清理）且有 7 处硬编码本机绝对路径。
v0.0.5 已把它整体移入仓库并相对化：

```
tests/
  run-all.mjs        全量入口：顺序跑 8 个套件 + 按 §7.2 基线校验断言数（护栏被删/改期望值也会红）
  env.mjs            路径解析单一入口（仓库根 / index.html / README / 夹具）
  dom.mjs            极简 DOM stub（元素/classList/style/事件/localStorage）
  app.mjs            加载 index.html 内联脚本并暴露内部符号 loadApp({seedStorage, now, navigator, TMap})
                     （v0.0.12 起可注入浏览器定位与腾讯地图 SDK 桩, 测试全程不发网络请求）
  test.mjs   152 条  账本/周期/结转/投资池/导入导出/持久化/撤销重做 + **分摊成本 amort**(T28) + **分摊窗口口径**(T29) + **P2 导入提示/持久化诊断/导出转义**
  test2.mjs   55 条  端到端命令流/弹窗/备份数据冒烟/阈值与红绿黄圆点
  test3.mjs  123 条  P1 护栏（颜色令牌一致、kvRow、自适应列宽、死代码已删、响应式 CSS）+ v0.0.11 统一视觉组件 + v0.0.12 自定义类别独立色板
  test4.mjs  121 条  M1 护栏（COMMANDS ↔ dispatch ↔ help ↔ 补全 ↔ README ↔ 架构文件 §1.4 双向校验 + P0 比例/金额边界 + P2 config 第四 token/help 与补全暴露）
  test5.mjs   92 条  M2 护栏（语义槽位、@日期位置无关、ghost 预览）+ amort 补全与双选项卡（含 P0 分摊预览口径；`config` 不再整体返回空）
  test6.mjs   59 条  **H5 护栏**（pay full 命令 / config 按钮 / 弹窗 edit 分支可达；双通道等价；程序化入口统一提交）
  test7.mjs  206 条  **v0.0.10 图表总结 + 合并入口护栏**（四窗口/三图型/桶金额恒等式/分摊口径/预算口径/分析与结论/空数据/双通道/日期弹窗复用/规范自检 + 同版浮层互斥 CH10）
  test8.mjs  163 条  **v0.0.12 地点护栏**（字段归一化往返/place 命令/#地点/弹窗双通道/启动预热一次/记账同步写入/左上角 Canvas 准星/GCJ-02/缓存与撤销/合规源码断言/Key 打码 + 同版 P0 备注转义 + P1 Key/SDK/诊断/类别/place）
  mutate-amort.mjs   **变异测试**: 77 组"把缺陷改回去" → 期望对应断言变红
                     （amort 9 + H5 6 + H4 4 + 图表 5 + 合并入口 5 + 视觉 4 + 地点 13 + P0 6 + 浮层互斥 2 + P1 14 + P2 8）
  gen-clean/gen-help/gen-probe/gen-tab/gen-amort/gen-window/gen-h5/gen-chart.mjs   浏览器验证用页面生成器（默认输出到系统临时目录；
                                                    gen-window / gen-chart 自带 Date 桩把时钟钉在 2027-08-30，见 §7.3）
  fixtures/user_backup.json                  **全合成**账本夹具（不含任何真实账目）
```

环境变量（都有默认值）：`BT_HTML` 换被测文件（变异测试用）、`BT_README` 换 README、
`BT_FIXTURE` 指向**本地真实备份**做"实弹冒烟"（只读，不写入仓库、不回显内容）。

> ⚠️ `BT_FIXTURE` 只适合"**不炸**"级别的冒烟：套件里有一批断言把夹具的 **settings**（周期/锚点/预算）
> 连同**冻结时钟**一起用（如 `T3.2`、`T24.1/2`），真实备份的周期配置与 2027 合成时间线不一致，必然红几条。
> 判定标准是"**没有新增崩溃/异常**"，不是"全绿"；要全绿一律用默认的合成夹具。

**冻结时钟**：`loadApp({now})` 默认 `2027-08-30`。应用大量逻辑以 `todayYMD()` 为基准，
新增断言依赖具体日期时**必须**走冻结时钟，不要写死当天日期（否则"换一天跑就全红"，F4）。

### 7.2 跑法与验证闸门（两档）

```powershell
# 全量（发版 / 跨模块改动）：顺序跑 8 个套件 + 基线校验，任一项失败/断言数不符即非 0 退出
node tests/run-all.mjs
#   ✓ 152 / 55 / 123 / 121 / 92 / 59 / 206 / 163 → 合计 971

# 日常小更新：只跑本次改动涉及的套件 —— 这已经满足低档闸门
node tests/test5.mjs
node tests/mutate-amort.mjs   # 只在你新增/改动护栏后重跑

# 换被测文件（变异测试）／换夹具（真实数据冒烟，只读；见 §7.1 的告警）
$env:BT_HTML="C:\path\to\mutant.html";    node tests/test3.mjs
$env:BT_FIXTURE="C:\...\budget_term_backup.json"; node tests/run-all.mjs
```

**低档 · 日常小更新（只碰单个模块/命令/文案）**

```
[ ] 跑本次改动相关的套件，相关断言全绿
[ ] 手工/探针过一遍本次改动的路径（改了 UI 才需要浏览器，见 §7.3）
[ ] 新增护栏 → 变异测试：把旧缺陷改回去，对应断言必须变红（§7.4）
[ ] 隐私自检 → 提交内容里无真实账目；夹具仍是全合成
[ ] README 更新记录 + 版本号已同步
```

**高档 · 发版，或改动落在共享抽象上（跨模块）**

```
[ ] node tests/run-all.mjs  → 合计 971 PASS / 0 FAIL（152/55/123/121/92/59/206/163，且与基线一致）
[ ] 改动涉及 UI/视觉 → 浏览器确认改的那块对；**发版或专门动样式**时顺带量 1400 / 900 / 520 三档，
    scrollWidth === clientWidth（适配性是发版检查项，不是每次小更新的检查项）
[ ] 改动涉及颜色/主题 → 探针确认 COLOR.* 与 CSS 令牌（js_* vs css_*）逐项相等
[ ] 新增护栏 → 变异测试全被抓住（§7.4）
[ ] 隐私自检 → 提交内容里无真实账目，夹具仍是全合成
[ ] README 更新记录 + 版本号已同步
```

**怎么判断该走哪一档**（拿不准就走高档，成本只是几十秒）

| 本次改了什么 | 档位 | 理由 |
| --- | --- | --- |
| 单个命令/单个弹窗/文案/注释/文档 | 低档 | 影响面就是它自己 |
| 某个 `doXxx()` 内部逻辑 | 低档 + 跑对应套件 | 同上 |
| `COLOR` / `kvRow()` / `COMMANDS` / `normalize*` / `investOf()` / `recDays()` 等**共享抽象** | **高档** | 所有调用方都算"被改动的模块" |
| `state` 字段、存储 key、备份格式、周期/预算/结转/投资口径 | **高档** | 破坏兼容或算错账 = 致命 |
| 准备打标签发版 | **高档** | 发版对外承诺整体可用 |

> ⚠️ 单跑一个套件时**没有"断言数 vs 基线"这道检查**（那是 `run-all.mjs` 独有的），
> 所以"护栏被悄悄删掉"只会在全量跑时暴露 —— 这就是把全量留给发版的代价。

**基线**：`run-all.mjs` 顶部的 `SUITES` 表（每个套件的期望断言数）。增删断言后必须同步它，
否则会被当成"护栏被删"而非 0 退出（F4/B10）。

### 7.3 真实浏览器验证（**仅当改动涉及 UI/视觉时做**）

生成器默认把产物写到系统临时目录（不污染仓库），也可以传第一个参数指定路径。

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$t = $env:TEMP

node tests/gen-clean.mjs "$t\bt-clean.html"    # 只跑命令(含 amort) → 截图
node tests/gen-probe.mjs "$t\bt-probe.html"    # 注入探针 → --dump-dom 取值
node tests/gen-tab.mjs   "$t\bt-tab.html"      # 真实按键驱动 Tab 补全
node tests/gen-help.mjs  "$t\bt-help.html"     # 只看 help 排版
node tests/gen-amort.mjs "$t\bt-amort.html"    # 真实点击选项卡 + 输入事件 → 分摊预览/面板切换
node tests/gen-window.mjs "$t\bt-window.html"  # 分摊"窗口口径"端到端: 冻结时钟 + 真实按键 → 每日/周期/列表/总结四处取值
node tests/gen-chart.mjs "$t\bt-chart.html"    # v0.0.10 图表端到端: 冻结时钟 + 真实点击工具栏下拉 → 柱/饼 DOM、高度、配色、回灌命令

# 截图（默认 520 窄窗就够；要顺带看适配性再补 1400/900）
& $edge --headless=new --disable-gpu --no-first-run "--user-data-dir=$t\bt-ep" `
  "--window-size=520,900" --virtual-time-budget=3000 "--screenshot=$t\bt-520.png" `
  "file:///$($t -replace '\\','/')/bt-clean.html"

# 取值探针（运行期读真实 COLOR/列宽）
& $edge --headless=new --disable-gpu --no-first-run "--user-data-dir=$t\bt-ep2" `
  "--window-size=1400,900" --dump-dom "file:///$($t -replace '\\','/')/bt-probe.html" |
  Select-String '>PROBE::(.*?)::END<'
```

**验证要求**：确认**本次改动的那一块**在浏览器里真的生效即可 ——
例如"双击 `+ 记一笔` 能开、选项卡能切、预览数字与终端一致"。
**不要求**每次都把 1400 / 900 / 520 三档量一遍：适配性属于"发版或专门动样式"时的检查项，
平时由 `test3.mjs` §7 的 CSS 规则断言兜着（`HANDOVER.md` §2.7 定义了不得削弱的响应式契约）。
涉及颜色/主题时，探针里 `js_*` 与 `css_*` 应逐项相等；
涉及弹窗改动时，用 `gen-amort.mjs` 那类"真实点击 + 真实 input 事件"的探针核对
（面板显隐、标题、预览文案），别靠肉眼看截图；
涉及**按日期统计**的改动（分摊/周期/总结）时用 `gen-window.mjs`：它自带 `Date` 桩把时钟钉住
（浏览器里 `todayYMD()` 取真实当天，不钉住就会出现"过一天结论就变"，F4），
再真实按键跑 `amort`/`list`/`summary`，一次比出"每日 / 周期 / 列表 / 总结"四处的数字是否自洽。

**五个坑（都踩过）**

1. `--window-size` / `--user-data-dir` / `--screenshot` 这类"值里带逗号或带变量"的参数**必须整体加引号**：
   写 `"--window-size=$w,900"`。不加引号时 PowerShell 会把 `$w,900` 当数组拆开，Edge 收不到宽度 ——
   症状是三档宽度量出来的结果一模一样（都是默认窗口）。
2. `--virtual-time-budget` 与 `--dump-dom` 同时用可能拿不到输出；探针页**不要**用 `setTimeout` 延迟，
   直接在 `load` 事件里同步跑完再写 DOM。
3. `--dump-dom` 会把 `<script>` 源码也打出来，正则要匹配渲染后的节点文本（如 `>PROBE::…::END<`），
   别匹配到脚本源码；用 `LastIndexOf("PROBE::")` 取**最后一个**（渲染出来的那个）更稳。
4. **`--dump-dom` 的输出在管道里会丢**：`& $edge ... | Select-String ...` 有时返回 0 字节（同一命令在
   `Start-Process -RedirectStandardOutput` 下正常）。要点：用
   `Start-Process -FilePath $edge -ArgumentList @(...) -RedirectStandardOutput out.txt -NoNewWindow -Wait`，
   再读 `out.txt`。别在"输出为空"上反复重跑，先换成重定向再看。
5. `--headless=new` 的 `--screenshot` 不受上述影响（一直可用）；失败时先用一张最小页面 + `--dump-dom`
   自证 Edge 能跑，再排查被测页面。

### 7.4 变异测试（证明护栏真的有效）

写完护栏后，**故意把旧缺陷改回去**，确认对应断言会红：

```powershell
$src = "index.html"
node -e "const fs=require('fs');fs.writeFileSync('C:\temp\mut.html',fs.readFileSync('index.html','utf8').split('旧写法').join('改坏的写法'))"
$env:BT_HTML="C:\temp\mut.html"; node tests/test5.mjs      # 必须 FAIL，且失败项正是那条护栏
```

注意用 **Node 做字面替换**（`split/join`），别用 PowerShell 的 `-replace`（它是正则，`$`/`\` 会咬人）。
v0.0.6 起把这套做法写成了脚本 `tests/mutate-amort.mjs`（一次跑 9 组、自动校验"命中恰好一次"），
新增功能时**照它加一段 `MUTANTS` 就行**，别再手搓命令。

已实测 84 组（脚本 `mutate-amort.mjs` 77 组 + 早期手工 7 组；其中 v0.0.12 P1 新增 14 组、P2 新增 8 组），覆盖全部 **8** 个套件：

| 变异体 | 套件 | 还原的缺陷 | 应变红 |
| --- | --- | --- | --- |
| `m_color` | test3 | 只改 CSS 令牌、不动 JS 兜底值（颜色双轨 H1） | C2 |
| `m_responsive` | test3 | 删掉 `header` 的 `flex-wrap:wrap` | R header 换行 |
| `m_commands` | test4 | 登记表里抹掉 `config`（清单漂移 M1） | 6 条 |
| `m_atdate` | test5 | 让 `@日期` 重新占槽位（M2） | 5 条 |
| `m_ratio` | test | 比例区间改回开区间（端点被拒 F5） | 8 条 |
| `m_stale` | test | 失效行不再提示失效（假成功 B7） | T12.2 |
| `m_header` | test2 | 拿掉 `set budget` 后的 `refreshHeader()`（H4/F10）—— **v0.09-rev.2 后该调用点已不存在**，改由下面 3 组守护 | T21.1 |
| `m_commit_exit` | test2 | 去掉 `runCommand` 出口的 `commitIfDirty()`（H4 复发：改了也不落盘/不刷新） | 8 条 |
| `m_commit_refresh` | test2 | `commit()` 只 `save()` 不 `refreshAll()`（落盘了但界面没刷新） | T21.1/2/3 |
| `m_commit_save` | test2 | `commit()` 只 `refreshAll()` 不 `save()`（界面刷新了但没落盘） | T27.x |
| `m_investfull_commit` | test6 | `doInvestFull` 把 `commitIfDirty` 塞回执行体且自己不再提交（程序化入口改了不落盘） | 1 条 |
| `m_amort_dispatch` | test4 | 抹掉 `dispatch` 的 `amort` 分支（F2） | 1 条 |
| `m_amort_invest` | test | 投资改按**每天**算（投资被分摊，少算 N 倍） | 3 条 |
| `m_amort_days` | test | `12月` 只当 12 天（不按 30 天/月折算） | 3 条 |
| `m_amort_bounds` | test | 放宽天数上限（越界天数不再被拒） | 3 条 |
| `m_amort_tab` | test5 | 切选项卡时不换面板（点了没反应） | 4 条 |
| `m_amort_total` | test | 归一化时丢掉摊销总价（旧备份导入失真） | 4 条 |
| `m_amort_window_sum` | test | **只按记账当天求和**（其余天数的钱不计入消费 —— v0.0.7 修的那个缺陷） | 9 条 |
| `m_amort_window_rows` | test | **只按 `r.date` 筛选窗口**（窗口内其余天查不到这笔分摊） | 3 条 |
| `m_amort_day_precision` | test5 | **起始日期吸到每月 1 号**（"精确到日"被打回"精确到月"，v0.0.8 修的缺陷） | 4 条 |
| `m_payfull_cmd` | test6 | 抹掉 `doPay` 的 `full` 分支（全额投资又只剩鼠标，H5） | 6 条红 |
| `m_config_btn` | test6 | 拿掉工具栏 `config` 按钮（H5） | 1 条红 |
| `m_invest_button` | test6 | 全额投资按钮绕过命令直调 `doInvestFull`（通道再次不对称，H5） | 2 条红 |
| `m_edit_branch` | test6 | `openEdit` 不回 edit 模式（弹窗 edit 分支又成死代码，H5） | 9 条红 |
| `m_edit_submit` | test6 | 编辑提交拼成 `add` 命令（编辑变成新建一条，H5） | 2 条红 |
| `m_edit_tab_lock` | test6 | 编辑模式仍可切到分摊选项卡（编辑旧记录却新建 amort，H5） | 1 条红 |
| `m_chart_dispatch` | test7 | 抹掉 dispatch 的 `chart` 分支（命令又只剩登记表，F2） | 74 条红 |
| `m_chart_both` | test7 | `both` 退化成只画柱状图（饼图选项失效） | 14 条红 |
| `m_chart_bucket_window` | test7 | 柱桶金额又按 `r.date` 求和（分摊成本除记账当天全漏，F13） | 5 条红 |
| `m_chart_pie_count` | test7 | 饼图占比按笔数而不是按金额（¥240 与 ¥60 同宽） | 2 条红 |
| `m_report_summary` | test7 | 合并入口又丢掉总结报告（只剩图表） | 4 条红 |
| `m_report_both` | test7 | 合并入口退化成只画柱状图（要求同时出两图） | 8 条红 |
| `m_report_date_modal` | test7 | 手动输日期弹窗又拼回 `list`（选了总结却跳去消费列表） | 2 条红 |
| `m_report_date_window` | test7 | 填了具体日期却按整月统计（指定日期窗口失效） | 2 条红 |

**v0.0.12 新增 9 组地点变异**（全部命中 `test8.mjs`，实测全被抓住）：
`m_geo_normalize`（归一化丢 `place`）、`m_geo_dispatch`（抹掉 `place` 分支）、
`m_geo_commit`（回填只 `save()` 不走统一提交点）、
`m_geo_undo`（**同版 P0 修复后反转**：回填绕开 `mutate` → 地点又不可撤销、被无关 undo 清掉）、
`m_geo_amort`（分摊也自动定位）、`m_geo_coords`（坐标写进记录）、
`m_geo_fetch`（绕过官方 Geocoder 手写外部请求）、`m_geo_key`（前端硬编码 Key）、
`m_geo_toolbar`（主页切换绕过命令直改 state）。另修正了 `m_config_btn` 漂移的锚点（按钮文案早已改成「当前配置」）。

**v0.0.12 同版 P0 修复新增 7 组**（脚本共 **51 组**，全部被抓住）：`m_p0_note_escape`（弹窗备注不转义）、
`m_p0_unescape`（不还原转义备注）、`m_p0_date_last`（`@日期` 又取最后一个 token）、
`m_p0_geo_identity`（去掉记录对象引用校验 → undo 后 id 复用串记录）、
`m_p0_ratio`（`config set ratio` 又按投资比例解释）、`m_p0_amount`（去掉 `r2` 后 >0 校验）、
`m_p0_amort_preview`（分摊预览应投又按逐日累计算）。
`m_geo_undo` / `m_geo_coords` / `m_geo_amort` 的锚点随 `applyAutoPlace()` 改动同步更新。

**同版「浮层互斥」修复新增 2 组**（脚本共 **51 组**，全部被抓住）：`m_dd_exclusive`（`toggleDd()` 打开前不关其它浮层 → 多个下拉又叠在一起）、
`m_modal_exclusive`（`openOverlay()` 不关其它浮层 → 弹窗/下拉又同时打开）；对应 `test7.mjs` CH10.1–CH10.9。

> 后两组是 v0.0.7 新增：它们**打的是同一个缺陷的两个不同点**（金额求和 / 行筛选），
> 所以必须各自变红 —— 只改金额时列表里连行都看不到，只改筛选时行在但金额不对（F14 的做法）。

**四条经验**：① 变异体必须"恰好命中一次"，命中 0 次说明源已漂移，此时变异无效、不能当通过；
② 多行变异模式要按**实际行尾**归一（本机工作区是 CRLF），否则同样报"命中 0 次" —— 那是脚本自己坏了；
③ 变异点必须落在**该护栏真正断言的东西**上 —— 曾把告警文案改掉却以为能验证"失效行"护栏，
结果测试没红：那是因为该断言看的是另一个 DOM 节点的文案。**没红不等于护栏不行，先确认变异打对了地方。**
④ 变异"没红"也可能是**被另一条护栏顺手拦住了**（`m_amort_bounds` 第一次就是被"每天不足 ¥0.01"拦下），
补一条**只针对该点**的断言（上限放行/越界拒绝）才算真正守住。

### 7.5 AI 任务提示词模板（可直接复制）

```text
你在 BUDGET::TERM 仓库工作。开工前必须做：
1) 读 README.md 的「版本与更新记录」与 ARCHITECTURE-REVIEW.md
   （§1 工程骨架与索引 / §7 如何验证 / §10 最近一版对既有结论的影响）；
2) 读 HANDOVER.md §1.5（隐私纪律）、§2（不变量）、§3（改动配方）、§5（强制规范）；
3) 按 ARCHITECTURE-REVIEW §7.2 判断档位：小更新只需跑**本次改动相关的套件**（单跑，不必全量）；
   只有发版或改动落在共享抽象/存储/领域口径上，才跑 node tests/run-all.mjs 全量 + mutate-amort。

任务：<在这里写清要改什么、期望行为、不允许变的语义>

硬性要求：
- 单文件交付：只改 index.html（必要才动 README.md / ARCHITECTURE-REVIEW.md / tests/）；
- 复用既有抽象：COLOR.* / kvRow() / COMMANDS+canonicalCmd / normalize* / numeric / recDays·recTotal，
  禁止第二份实现；
- 改数据必须 save() + refreshHeader()（或走 mutate）；用户数据只用 textContent；
- 不动 LS_KEY、备份 app 字段、字段名、amount 语义、r2/r6 精度、13:2 拆池、响应式 CSS 规则；
- **不得把任何真实账本数据写进被跟踪文件**（含夹具、文档示例、提交信息、输出回显）；
  测试装置路径一律走 tests/env.mjs，不要写绝对路径；
- 补齐本模块的护栏断言（含边界与变异测试），并更新 README 更新记录与版本号；
- **不要**为一次小更新重跑整个项目，也**不要**再验证分辨率适配性。

交付时必须给我：
1) 改了哪些文件、每个改动的作用；
2) 相关套件的实际输出（PASS 数）+ 说明为何走这一档（ARCHITECTURE-REVIEW §7.2）；
3) 若改动涉及界面：这次改的那一块的浏览器证据（截图或探针；不必凑三档宽度）；
4) 若新增护栏：变异测试结果（把旧缺陷改回去 → 哪几条断言变红）；
5) 隐私自检结论（确认无真实账目入库）；
6) 仍未做/不确定的部分，明确标注，不要含糊。
```

---

## 8. 附：量化指标

| 指标 | v0.0.5 | v0.0.6 | v0.0.7 | v0.0.8 | v0.0.9 | **v0.0.10** | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `index.html` 行数 | 2609 | 2846 | 2924 | 2944 | 3007 | **3404** | 新增图表 CSS / DOM 图形 / `chart` + `report` 命令区与 `resolveWindow()` 抽公共窗口；数据结构未动 |
| CSS 令牌 / `var(--x)` 使用 | 19 / 103 | 19 / 111 | 19 / 111 | 19 / 111 | 19 / 111 | **19 / 119** | 图表复用既有令牌，未新增令牌 |
| JS `COLOR.*` 引用 / 残留颜色字面量 | 299 / 15 | 333 / 15 | 335 / 15 | 335 / 15 | 335 / 15 | **372 / 15** | 新增代码全部走 `COLOR.*` / `catColor()`（H1 未回退） |
| 命令登记行 / 命令名+别名 | 29 / 34（16+18） | 30 / 36（17 主名 + 19 别名） | 30 / 36 | 30 / 36 | 31 / 36 | **35 / 41（19 主名 + 22 别名）** | 新增 `chart` 与合并入口 `report` 两个主名（+3 别名 +2 子用法行） |
| `save()` / `refreshHeader()` / `mutate()` | 24 / 22 / 5 | 25 / 23 / 5 | 25 / 23 / 5 | 25 / 23 / 5 | 2 / 1 / 6 | **2 / 1 / 6** | `chart` 是纯派生命令，不改 `state`、不落盘（H4 未回退） |
| `catch` 块 / `innerHTML` / `Escape` 处理 | 24 / 4 / 0 | 24 / 4 / 0 | 24 / 4 / 0 | 24 / 4 / 0 | 24 / 4 / 0 | **24 / 4 / 0** | 图表区零 `innerHTML`、零新增 `catch` |
| `padEnd(2x)` 表格残留 | 0 | 2 | 2 | 2 | 2 | **2** | 均为 `renderRecordRow()` 的**行内列对齐**（H2 未回退） |
| 断言总数 | 353 | **415** | **455** | **455** | **498** | **718** | v0.0.11 相对 v0.0.10 +19：`test3.mjs` §8 统一视觉（标题/比例条/堆叠条/类别行/迷你柱）；v0.0.10 曾相对 v0.0.9 +201（`test7.mjs` 196 条 + `test4.mjs` 5 条） |
| 变异测试组数 | 7 | 13 | **16** | **16** | **26** | **35** | v0.0.10 新增 9 组（图表 4 组 + 合并入口 4 组：`m_report_summary` / `m_report_both` / `m_report_date_modal` / `m_report_date_window`），全部被抓住 |

> **v0.0.12 当前权威基线（含同版 P0 / 启动预热 / P1 / P2 四轮修复）**：`run-all.mjs` 的 `SUITES` = **971 条全绿**（152/55/123/121/92/59/206/163），
> `mutate-amort.mjs` **77 组变异全部被抓住**（13 组地点 + 6 组 P0 + 2 组浮层互斥 + **14 组 P1 + 8 组 P2**）。上表是各版历史快照，
> 历史时点：840/42 → 871/51 → 896/55 → 948/69 → **971/77**；一切数字以 `run-all.mjs` / `mutate-amort.mjs` 的实际输出为准。

### 8.1 测试装置自身的量化（增删护栏时同步这里与 `run-all.mjs` 的基线表）

| 套件 | v0.0.5 | v0.0.6 | v0.0.8 | v0.0.9 | v0.0.10 | **v0.0.12** | 责任范围 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `test.mjs` | 78 | 110 | **138** | 138 | 138 | **152** | 账本/周期/结转/投资池/导入导出/持久化/撤销重做 + `amort`(T28) + 分摊窗口口径(T29) + P2 导入/持久化/导出（+14） |
| `test2.mjs` | 55 | 55 | 55 | 55 | 55 | **55** | 端到端命令流/弹窗/备份冒烟/阈值与圆点 |
| `test3.mjs` | 84 | 84 | **85** | 85 | 114 | **123** | P1 护栏：颜色令牌/`kvRow`/自适应列宽/死代码/响应式 + 统一视觉组件 + v0.0.12 自定义类别色板（+9） |
| `test4.mjs` | 79 | 85 | 85 | 85 | 101 | **121** | M1 护栏：登记表 ↔ dispatch ↔ help ↔ 补全 ↔ README ↔ 架构文件 §1.4 命令表（+2 = `place`/`where`；同版 P0 +8 = 金额/比例口径；P2 +10 = config 第四 token/help/补全） |
| `test5.mjs` | 57 | 81 | **92** | 92 | 92 | **92** | M2 护栏：语义槽位/`@日期`/ghost + `amort` 补全与双选项卡 + 起始日精确到日（同版 P0 +1 = 预览口径；P2 断言改写至 92） |
| `test6.mjs` | — | — | — | **43** | 59 | **59** | **H5 护栏**：双通道对称 + 程序化入口统一提交 |
| `test7.mjs` | — | — | — | — | 197 | **206** | **v0.0.10 图表总结 + 合并入口**：四窗口/三图型/分摊口径/预算口径/分析与结论/空数据/双通道/日期弹窗复用（同版浮层互斥 +9 = CH10） |
| `test8.mjs` | — | — | — | — | — | **163** | **v0.0.12 地点**：字段/命令/弹窗/mock 定位/GCJ-02/统一提交点/合规断言（P0 +13 = 备注转义/异步回填；预热重构 +25；**P1 +43 = Key/SDK/诊断/类别/place**） |
| **合计** | 353 | 415 | **455** | **498** | 756 | **971** | v0.0.12 列为 P2 修复后的**当前值**；增删后必须同步 `run-all.mjs` 顶部 `SUITES` 基线 |

---

## 9. 文档分工与维护

### 9.1 分工（**避免同内容两处维护**）

| 内容 | 唯一存放处 | 另一个文件怎么处理 |
| --- | --- | --- |
| 代码分区 / 数据流 / 存储 / 命令表 / 符号索引 / 术语表 | **本文件 §1** | `HANDOVER.md` 只索引，不重复 |
| 怎么验证：装置清单 / 跑法 / 两档闸门 / 浏览器手法 / 变异测试 / 提示词模板 | **本文件 §7** | `HANDOVER.md` §4/§5.3 只写规则并指向本节 |
| 21 条问题清单与状态、实施顺序、量化指标 | **本文件** §3–§6、§8 | — |
| 每版"对既有结论的影响" | **本文件 §10** | `README.md` 写面向用户的更新记录 |
| 不可破坏的不变量、改动配方、AI 强制规范、失败模式、提交/发版纪律 | **`HANDOVER.md`** §2/§3/§5/§6 | 本文件不重复 |
| 隐私纪律细则、本机权限/代理、Git 状态与历史脱敏、政策修订历史 | **`HANDOVER.md`** §1.2/§1.4/§1.5/§8 | 本文件只提"公开仓库"这一事实 |
| 面向用户的用法与功能说明 | **`README.md`** | 两份内部文档都不重复用户文档 |

> **新内容放哪里**：是"**怎么验证 / 代码长什么样**"→ 本文件；是"**不许怎么做 / 改了要遵守什么**"→ `HANDOVER.md`。
> 两边都别写第二份：写指针。

### 9.2 本清单的维护

- 每次修掉一条：把对应表格里的状态改为 `✅ 已修（版本）`，并在"修复"栏写清做法与相关符号。
- 新增发现：追加同类 ID（H/M/L + 序号），并补"证据（符号名）→ 影响 → 建议 → 风险"四段。
- 行号会随代码漂移，**以符号名为准**；重构后可顺手更新第 8 节的量化指标与 §1.1/§1.5。
- 每版收尾在 §10 追加一节"本版对既有结论的影响"（新代码是否引入重复、护栏是否被触发、哪些债变好/变坏）。
- 本节只维护**已验证的事实**；"打算怎么做"写进 `HANDOVER.md` §6 的技术债与顺序。

---

## 10. 各版变更对既有结论的影响

### v0.0.12：地点（自动定位 / 手动）—— 新增可选字段 + 首个外部服务

新增记录字段 `place`（行政区地名字符串），新增 `place` 命令、`#地点` 参数、`config set geo|geokey` 与主页「地点 ▾」入口。
**金额口径、`amount` 语义、`LS_KEY`、备份头（`app` / `version:2`）、精度与 13:2 投资比例全部未动**；
旧备份没有 `place` 时由 `normalizeRecords()` 回落空串，零迁移。

| 既有结论 | 影响 |
| --- | --- |
| H4（统一提交点） | **本版重点**：定位是异步的，命令 `mutate → commitIfDirty()` 出口之后结果才回来。回填不在回调里直改 state，而是 `applyAutoPlace()` 走统一提交点 **`commit()`**（落盘 + `refreshAll()`）；首次交付时不经 `mutate`、只压一步撤销。**同版 P0 修复后改为经 `mutate` 压一步撤销**（地点可单独 undo/redo），见本节末尾；`test8` GEO.34/48 + `m_geo_commit` / `m_geo_undo`（已反转）双向守住 |
| H5（双通道对称） | 保持：弹窗两个选项卡的地点输入、`✎ 编辑` 预填/清空、主页模式切换、按 id 补填，全部拼命令回灌 `runCommand`；`GEO_COMMANDS` 与 `submitGeoPlace()` 是同一条命令路径，`m_geo_toolbar` 防止绕过 |
| M1（命令清单单一数据源） | 扩展：新增主名 `place` / 别名 `where` 只登记在 `COMMANDS`，help / 别名 / 补全 / README / §1.4 由测试双向校验；`test4` 因两个新名字从 101 → 103 |
| M2（补全语义槽位） | `#地点` 与 `@日期` 一样位置无关、不占槽位；`tokenize()` 保留引号前的 `#` 前缀（`#"..."` 与 `"#..."` 两种写法都合法），纯引号开头的旧行为不变 |
| F1 / F12（横向重复 / 死代码） | 地名归一只有 `normalizePlace()` 一份，五处对称保留（`makeRecord` / `normalizeRecords` / `doUpdate` / `renderRecordRow` / `buildReportText`）；参数拆分收口到 `splitRecordArgs()` |
| 安全 / XSS | 外部 API 返回的地名只用 `line()` / `addSeg()` 的 `textContent` 渲染；`innerHTML` 仍恰好 4 处且都是清空；地名先清洗控制字符并截断 60 字 |
| 新增结论：合规与隐私 | 只接**腾讯地图 JSAPI GL**（`TMap.service.Geocoder`），不手写 `fetch`、不接非合规地图源；SDK 按需加载且 URL 只带用户自填 Key，代码仅有显式占位符；`echoCommand()` / `config` 对 Key 打码。**坐标只在内存里，不写记录/备份/导出**，落盘的只有省/市/区字符串；`m_geo_coords` / `m_geo_fetch` / `m_geo_key` 是对应的变异护栏 |
| 新增结论：失败降级 | 无 `navigator.geolocation`（含离线测试环境）、拒绝授权、超时、无 Key、SDK 加载失败、空地址、记录已删/已手填 —— 一律静默跳过，不阻断记账；只有 `add` 触发，`amort` 永不自动定位（`m_geo_amort` 守着） |
| 首个外部依赖 | 应用从"零网络请求"变成"可选的一次 SDK 加载 + 一次逆地理编码"；默认 `geoMode:"auto"` 但 `geoKey:""`，未配置时不会发起任何网络请求，离线单文件定位不变 |

**同版 P0 修复（2026-11-09，未升版本号）**：按 `HANDOVER.md` §6A 的审查结论修掉 8 条 P0，
**数据结构 / `LS_KEY` / 备份头 / 精度 / 13:2 全部未动**，老备份零迁移。

| 既有结论 | 影响 |
| --- | --- |
| M2 / `splitRecordArgs()` | 备注首字符为 `#`/`@` 时由 `quoteNote()` 前置 `\` 转义，拆分后由 `unescapeArg()` 统一还原；`findDateToken()` 只取**第一个** `@日期`，其余 `@…` 保留为备注。地点与备注不再互换、备注不再被吞 |
| H4 / 异步回填 | `startAutoPlace()` 改传**记录对象**，`applyAutoPlace()` 用 `state.records.includes(rec)` 做身份校验（undo/导入/删除都会换掉对象引用），并复查 `geoMode`/`geoKey`；回填经 `mutate` 再 `commit()`。**自动填地点现在是独立可撤销的一步**，不受无关 undo 静默清掉 |
| M3（数字解析多入口） | 金额类设置新增唯一入口 `parseAmount()`（有限、>0、`r2` 后仍 >0），覆盖 `config set budget` / `set budget` / `budget set` / `budget default` / `set daily` 与 `normalizeSettings()` 的备份归一化；M3 其余部分仍未修 |
| 分摊口径（§2.5 / F13） | 预览与 `makeRecord()` 共用「记录总价 `r2(total)`」算应投；逐日累计 `r2(daily×days)` 单独标为消费口径。恒等式不变，但预览不再把两者混成一个「合计」 |
| `config set` 与 `set` 一致性 | `ratio`/`share`/`consume` 统一按消费占比解释（只有 `invest`/`investment` 按投资比例），消除 `config set ratio 0.85 → 99.15%` 的重算历史应投缺陷 |
| 护栏 | 共新增 31 条断言（`test4` +8 / `test5` +1 / `test7` +9 浮层互斥 / `test8` +13），全量 **871 PASS / 0 FAIL**；变异脚本 42 → **51 组**（7 组 P0 + 2 组浮层互斥；"m_geo_undo" 反转、3 组锚点同步），**全部被抓住** |
| 浮层互斥（用户反馈） | 新增 `DD_IDS`/`MODAL_IDS` 单一清单 + `closeAllOverlays()` / `openOverlay()` / `closeAllDd()`；`toggleDd()` 打开前先关其它浮层，六个弹窗入口统一走 `openOverlay()` → 全局同时最多一个 `open`；二次点击仍能关自己、点空白仍收起下拉 |

**同版迭代 · 启动预热重构 + 左上角 Canvas 定位（2026-11-09，用户反馈）**：用户实测「定位晚于数据落盘」，
要求「每次打开后自动申请一次定位」并在左上角显示区名。这次是**整条链路重排**，不是给异步回填打补丁：

| 既有结论 | 影响 |
| --- | --- |
| H4（统一提交点） | `applyAutoPlace()` / `startAutoPlace()` **整体删除**。`boot()` 调 `primeGeoLocation()` 只申请一次；结果只写内存 `geoCache` + 独立键 `budget_term_geo_v1` + 左上角 badge，**异步链路不再触碰 `state.records`、不再调 `commit()`**。`doAdd` 同步 `rec.place = currentGeoPlace()`，随命令 `mutate → commitIfDirty()` 一次落盘。一次记账仍只压一步撤销 |
| 根因消除 | 原 P0「对象引用校验 / 地点独立一步撤销 / 迟到结果丢弃」防的缺陷不再可能发生：没有延迟写入就没有串号、被 undo 吞掉、期间切模式污染。相关断言改写为预热模型下的撤销 / 配置变更 / 导入行为 |
| H5（双通道） | 不变；新增「点左上角图标重定位」`primeGeoLocation(true)`，切模式 / 填 Key 也各补一次，记账时零定位请求 |
| 新增结论：左上角 badge | `renderGeoBadge()` 由 `refreshHeader()` 清空后第一个 append（不占 `#statusbar .stat` 索引）；`drawGeoIcon()` 用 **Canvas 2D** 画准星（圆环 + 四向直角刻线 + 方形中心点，16×16 @2x，状态色取 `COLOR.*`），**不用 Emoji / 外部图片**；文字只显示 `district`（`districtFromAddressComponent()` / `districtOf()` 兜底）。`getContext` 不可用静默降级 |
| 新增结论：跨会话缓存 | 地名（非坐标）存独立 localStorage 键，不进账本 / 备份 / 撤销栈；下次打开瞬间显示，首笔即可同步带地名。`config set geo manual` / `geokey off` 清缓存 |
| 护栏 | `test8.mjs` 95 → **120 条**，`app.mjs` 支持 `seedStorage` 注入 Key 让 boot 预热真实跑起来；`mutate-amort.mjs` 51 → **55 组**（13 组地点护栏随模型重写，4 组漂移锚点修复）。全量 **896 全绿**，变异全被抓住 |

**同版修复 · P1（2026-11-09，按 `HANDOVER.md` §6A.2）**：6 条 P1 全修；**领域模型、存储字段、精度与 13:2 全部未动**。

| 既有结论 | 影响 |
| --- | --- |
| A2 / F1（横向重复） | 三处"同一个语义写两遍"被收口：Key 校验 → `normalizeGeoKey()`（命令写入 / 备份重启共用）；类别来源 → `knownCategories()`（datalist / 补全 / 提示 / 配色共用）；`place` 参数 → 复用 `splitRecordArgs()`（与 `add`/`amort`/`update` 同口径） |
| **H3（分类三个真相来源）** | ✅ **已修**（从 P3 债务清单移出）：`validateCategory()` 不再写全局 `PREDEFINED`，消除命令失败时不受 `undo`/落盘约束的副作用；`restoreFromText → commit → refreshAll → refreshCatlist` 让导入备份后自定义类别不再丢；`customCatColor()` 按已知自定义类别排序索引从独立色板取色，解决 B-15「相邻同色无分界」 |
| B6 / B7（静默忽略输入 / 假成功） | 定位/SDK/逆地理编码失败不再 `.catch(()=>{})` 全吞：`geoErrorText()`/`geoWarnOnce()` 按原因一次性提示 + `console.warn` + badge `title`；SDK `onload` 缺 Geocoder / `onerror` / 超时 / 宿主缺失都清缓存可重试；脏 Key 当场拒绝而非静默存下 |
| A8 / F7（两条路径不一致） | `config set geokey` 与 `normalizeSettings()` 同规则；弹窗回灌 `quote()` / `quoteNote()` 与命令行同通道；换 Key 调 `resetTMapSDK()` 使 UI 状态与 SDK 实例一致（旧实现改 Key 仍复用旧 Key 的 SDK） |
| H1（颜色双轨） | 新增 `CUSTOM_CAT_PALETTE` 8 个 hex **只出现在色板常量里**（`test3` C6 计数 15→23），`catColor()` 仍只从调色板取色；图表区没有散落的颜色字面量 |
| 护栏 | `test3` 114→**123**、`test8` 120→**163**；`run-all.mjs` 基线 896→**948**；`mutate-amort.mjs` 55→**69**（P1 新增 14 组，全部被抓住）。顺带同步 4 条随「行内 Canvas 图标 / 导出 `地点:` 文字降级」漂移的旧断言（GEO.58/62b/79/80） |

**同版修复 · P2（2026-11-09，按 `HANDOVER.md` §6A.3）**：5 条 P2 全修（B-16～B-20）；**领域模型、存储字段、精度与 13:2 全部未动**。

| 既有结论 | 影响 |
| --- | --- |
| F9（静默失败路径） | 全面可观测：`save()` 每次失败都 `console.warn`；`restoreFromText()` 重复导入不再误提示「可 undo」；`config set budget` 非法第四 token 报错；自动写盘失败回落 `autosaveOn` 并同步 UI |
| A3 / §3.11（持久化） | `commit()` 感知 `save()` 失败并返回 false，持久化成败有明确契约；自动写盘由永不报错改为可降级且留痕 |
| M2（输入转义） | 新增 `escapeMd()`（`\\`、`` ` ``、`**`、`#`、`|` 等 11 个字符），`buildReportText()` 逐笔行补 `created` 字段，与记录字段对齐；`normalizeRecords()` 对 `note` 与 `place` 同一清洗纪律 |
| M1（help/补全） | `configUsage()` 补 `consume|ratio|share` 子名行；`argCandidates()` 为 `config` 各子命令的合法值提供候选，与 `doConfig` 的真实语义同口径 |
| 护栏 | `test.mjs` 138→**152**、`test4.mjs` 111→**121**、`test5.mjs` 93→**92**（断言改写）、`app.mjs` 暴露 `save()` 与 `autosaveOn`；`run-all.mjs` 基线 948→**971**；`mutate-amort.mjs` 69→**77**（P2 新增 8 组，全部被抓住） |

### v0.0.11：输出层视觉统一 —— 只动渲染，不动口径

把 `budget` / `forecast` / `assets` / `config` / `list` / `summary` / `chart` / `report` 的**输出渲染**统一到五类图形块
（`sectionHead` / `ratioBar` / `stackBar` / `catRows` / `miniBars`）。**没有任何计算、存储或命令语义变更**。

| 既有结论 | 影响 |
| --- | --- |
| H1（颜色双轨）/ H2（多套表格） | 未回退：新图形块的颜色全部取自 `COLOR.*` / `LEVEL_COLOR` / `catColor()`，图表区仍无 hex 字面量（`test7` CH8.3 守着）；表格仍只走 `kvRow()`，`padEnd(2x)` 仍是 2 处行内对齐 |
| F1（横向重复）/ F12（死代码漂移） | **本版重点**：标题渲染从"图表一份、命令各写一份"收口到 `sectionHead()`（`chartHead()` 降级为别名）；`sparkline()`（字符曲线）被 `miniBars()` 取代后删除，不留死代码（`test3` D 段仍在扫） |
| F13 / §3.8（一个数字两套口径） | 未触碰：所有金额仍来自 `collectWindow()` / `periodSnapshot()` / `forecastData()`，本轮**只读不重算**；`test.mjs` 的 T29 口径断言全绿 |
| M1 / M2（命令与补全漂移） | 未改命令、别名、槽位与补全（`test4` / `test5` 全绿） |
| H4（唯一提交点）/ H5（双通道对称） | 未回退：新图形块只 append 到 `#term`，不改 `state`、不调 `save()` / `refreshHeader()` |
| M5（`data-cmd` 混装）/ H3（类别真相来源） | 状态不变（本轮不碰工具栏与类别登记） |
| 视觉一致性（新增结论） | 比例类信息**只有一种画法**（`ratioBar` / `stackBar`），不再出现 `█░` 字符条；`test3` §8 的 V9–V12 断言四条命令确实产出对应图形块且输出无 `█░` |
| 进度条形状/配色（同版迭代） | 全部进度条改**直角方形 + 双色分段**（已用=语义色实心、剩余=同色 16% 实色，无点阵/斜纹）；顶部栏「发放进度」与终端共用 `hbarTrack()`（`progressBar()` 只再算等级色与百分比）。`test3` §9 的 V13–V18 守住形状、分色、顶部栏与"只有一份实现" |
| 饼图闭合（同版修复） | `renderPieChart()` 不再向 `conic-gradient` 插 `transparent` 停靠点（那等于挖掉 0.5% 的扇形，相邻同色时看着就是"少了一块"）；切片严格 `from→to` 首尾相接、最后一片收敛到 100%。`test7` CH4.19 逐停靠点校验"无透明漏洞 + 0%→100% 连续"，`m_chart_pie_gap` 证明护栏有效 |


### v0.0.10：图表总结（`chart`）+ 合并入口（`report`）——本版新增，未改写既有结论

新增"日 / 周 / 周期 / 自然月 → 柱状图 + 饼图 + 自动分析与建议"能力，并在**同一版本内**把工具栏四个总结入口合并成
「总结与图表 ▾」（先复用消费列表的范围选择/手动输日期，再一次输出总结 + 两张图 + 分析）。**纯派生、零状态变更**：

| 既有结论 | 影响 |
| --- | --- |
| H1（颜色双轨）/ H2（4 套表格） | 未回退：图形配色全走 `COLOR.*` / `catColor()`（字面 hex 仍 15 个），文本明细全走 `kvRow()`（`padEnd(2x)` 仍 2 处行内对齐） |
| M1 / M2（命令清单与补全槽位漂移） | `chart` / `report` 各只登记一次（`COMMANDS` + 3 别名 + 2 子用法），`dispatch` / `help` / 补全 / README / §1.4 由 `test4.mjs` 双向守着；补全按语义槽位给同一组候选 |
| H4（唯一提交点）/ H5（双通道对称） | 未回退：`chart` / `report` 都不改 `state`，不调 `save()` / `refreshHeader()`；范围下拉项都拼完整命令回灌 `runCommand()`；`innerHTML` 仍 4 处且都是清空 |
| F13 / §3.8（一个数字两套口径） | **本版重点**：窗口解析抽成 `resolveWindow()` 供 `summary` / `chart` / `report` 共用；每个柱桶单独走 `collectWindow(桶起,桶止,类别)`，`test7.mjs` 把"桶合计 == 窗口总消费"写成恒等式断言；8 组新变异体（含把桶金额改回按 `r.date` 求和）全部被抓住 |
| F1（横向重复）/ F12（死代码漂移） | 合并迭代的重点：四个固定命令按钮 + 图表下拉删净，范围选择统一到 `data-range` + `onRangeMenuItem(kind,target)` + `RANGE_COMMANDS`；绘图统一到 `renderChartBody()`（`chart` / `report` 共用）；同一个 `#dateModal` 用 `dateModalTarget` 决定拼 `list` / `report`，没有第二份日期归一化或预览逻辑 |
| M5（工具栏 `data-cmd` 混装） | **略有改善**：新增范围项都走 `data-range` 而非 `data-cmd`，命令与伪动作进一步分开；但历史按钮未整体重构，M5 仍标记未修 |
| 输出重复（同版迭代） | `report` 的「预算总结」用 `compact` 跳过旧版「类别·X」行与迷你条（类别只由饼图图例呈现），分析用 `skipCore` 跳过总消费/日均/分摊占比；顺序固定为 预算总结 → 柱状图 → 饼图 → 数据明细 → 分析 → 结论。`test7` 用"出现次数 = 1"与 `indexOf` 顺序断言守住，`m_report_dup` 变异体证明护栏有效 |
| 预算对比口径（F13 变体） | 进行中的窗口原来用 `win.total`（含未来日期分摊）÷ 已过天数，使用率会虚高；本版抽 `spentUpToToday(win)` 统一"截至今天"的消费额，`report` 的日均/占用/结论改用它（`summary` 单命令保持原口径，T29.22 仍在守） |
| 术语 / 领域口径 | 新增一对**显式标注**的口径：柱高与饼图 = 消费口径，预算使用率 = 预算口径（消费 ÷ N = 占用），输出文案里写明换算；未改 `amount` 语义、`r2`/`r6`、13:2 拆池、存储格式 |
| 技术债 | 除上行的 M5 略有改善外，H3（类别 3 个真相来源）/ M3 / M4 / M6 / M7 / M8 状态全部不变 |

> §10.0 v0.0.9（合并 H4 + H5：统一提交点 + 双通道对称）、§10.1 v0.09-rev.1（H5 双通道对称 + 弹窗 edit 分支）、
> §10.2 v0.0.8（起始日期精确到日）、§10.3 v0.0.7（窗口口径修复）、§10.4 v0.0.6（分摊成本引入）。

### 10.0 v0.0.9：合并 H4（统一提交点）+ H5（双通道对称）

本次把两条并行修订线合到一起：`v0.09-rev.1` 的 H5（双通道补齐）与 `v0.09-rev.2` 的 H4（"改数据 → 落盘 → 刷新"收口到唯一提交点）。
两条线此前互不冲突（改的是不同区域），合并后唯一的交叉点是"全额投资的执行体"与"列表行渲染"——也是本版需要重新缝合的地方。

| 条目 | 影响 | 说明 |
| --- | --- | --- |
| **H4（缺统一提交点）** | ✅ **已修（P0）** | 命令函数不再自己 `save()`/`refreshHeader()`；`runCommand` 出口 `commitIfDirty()` 是命令路径唯一的落盘 + 刷新点。`save()` 从 25 处降到 2 处（`loadState` 启动 + `commit`），`refreshHeader()` 从 23 处降到 1 处（`refreshAll`） |
| **F10（无单一提交点）** | 🟢 **根除** | 与 H4 同一件事；新增命令只需改 `state`，出口自动落盘 + 刷新，"漏刷新"这一类缺陷不再可能由新命令引入 |
| **H5（双通道不对称）** | ✅ **已修** | 详见 §10.1：`pay full [mm\|idx]` 补上全额投资的命令通道；工具栏补 `config` 按钮；`openEdit` 接活弹窗 edit 分支 |
| **A2 / F1（横向重复）** | 🟢 **净减少** | 合并时把"全额投资的执行体"统一为 `investFullRun()`：命令与按钮共用同一份"执行 + 播报"，按钮回灌 `pay full`，不再是第二条路径 |
| **H3（分类三个真相来源）** | 🟡 **部分提前受益** | `refreshAll()` 内含 `refreshCatlist()`，因此"导入备份后自定义类别不进下拉"在**导入路径上顺带修好**（`restoreFromText` 走 `commit()`）；H3 的另两个来源仍未收敛，H3 保持未修 |
| **A6（改数据必须落盘并刷新）** | 🟢 **强化** | A6 从"每处自己记得调两个函数"升级为"出口保证"，约定更难破坏；配方见 HANDOVER §3 |
| **A8 / F7、M3、L4** | ⬜ 未变 | 归一化、解析入口、字段读写关系均未动 |
| **护栏** | 🟢 全绿 | 全量 **498 条断言**（`node tests/run-all.mjs`）全绿；变异脚本扩到 **19 组**，新增 4 组 H4 变异（`m_commit_exit` / `m_commit_refresh` / `m_commit_save` / `m_investfull_commit`）分别验证"出口提交 / 落盘 / 刷新 / 程序化入口"四个半边确实被守住（见 §7.4） |

**合并点（本版真正新增的工作）**：`investFullRun(kind)` 是全额投资的唯一执行体，只改 `state`、不落盘不刷新；
命令路径由 `runCommand` 出口的 `commitIfDirty()` 提交，程序化入口 `doInvestFull(kind)` 自己 `mutate` 后 `commitIfDirty()` ——
既保持"一次全额投资在撤销栈只压一步"，又不破坏 H4 的唯一提交点。

**给下一版的建议**：**P3 · H3**（分类真相来源收敛）+ **L6**（仓库规范），其次 **P4 · M3/M4**（解析入口与弹窗 ID 规范）。
H4 这条 P0 已完成，实施顺序表（§6）里 P0 之后的项可整体前移。

### 10.1 v0.09-rev.1：修掉 H5（双通道对称 + 弹窗 edit 分支）

本次是**通道补齐**（不加字段、不改口径、不动存储）：把审查项 H5 的三种不对称一次做完，
并用新套件 `test6.mjs` 把"两条通道能力等价"固化成断言。

| 条目 | 影响 | 说明 |
| --- | --- | --- |
| **H5（双通道不对称）** | ✅ **已修** | `pay full [mm\|idx]` 补上全额投资的命令通道；工具栏补 `config` 按钮；`openEdit` 接活弹窗 edit 分支。三条通道从此等价 |
| **A2 / F1（横向重复）** | 🟢 **净减少** | "全额投资的执行体"抽成 `investFullRun`，命令与按钮共用，按钮回灌 `pay full`（不再是第二条路径） |
| **H4（缺统一提交点）** | ✅ **已修** | 同一版由 §10.0 的 H4 收口完成（`commit()` / `commitIfDirty()`），此处不再是"局部改善" |
| **F12（死代码漂移）** | 🟢 **净减少** | `submitModal` 里长期不可达的 edit 分支现在有真实入口（列表行 ✎ 编辑），`test6` 守着它可达 |
| **B7（假成功）** | 🟢 沿用既有护栏 | 编辑按钮对"悬空行"（undo/del 之后）同样先判 `alive()`，失效行不可编辑 |
| **B3 / B4（兼容底线）** | 🟢 未触碰 | 不改 `LS_KEY`/备份头/字段名/`amount` 语义/精度/13:2；`pay full` 是纯加法 |

**给下一版的建议（v0.09-rev.1 时点）**：~~**P0 · H4**（统一 commit 出口）~~ —— **已在同一版（v0.0.9）完成**。

### 10.2 v0.0.8：分摊起始日期精确到日

本次是**UI 采集精度**的修补（不改数据结构、不加命令、不改派生口径），
但它同样是"同一个东西两处各写一遍"的老毛病：

| 条目 | 影响 | 说明 |
| --- | --- | --- |
| **A2 / F1（横向重复）** | 🟢 **净减少** | 修复前"月 → 日期"的拼接写在**两处**（`updateAmortHint` 预览里一次、`submitAmort` 提交里一次），都是 `month+"-01"`。修复后抽成**唯一解析入口** `amortPickDate()`，预览与提交共用 —— 这类"两处各拼一次"正是"预览说 A、提交成 B"的温床 |
| **B6 / B7（静默忽略输入 / 假成功）** | 🔴 **v0.0.6 埋的雷，本版拆掉** | 日期填了非法的 `2027-08` 时，老代码**静默**回落到"本月 1 号"（`submitAmort` 里 `: todayYMD()` 兜底），用户完全看不出被改过。现在解析失败 → 黄色提示 + 中止提交 + 弹窗不关（`M2.70b/c` 守着） |
| **M4（弹窗 ID/控件规范）** | 🟡 未变 | 仍用 `fa_*` 前缀；本版只是把 `type="month"` 换成 `type="date"`，没有引入第 4 套命名 |
| **H5（双通道对称）** | 🟢 更对称了 | 命令行 `amort … @YYYY-MM-DD` **本来就精确到日**；本版把 UI 通道补到同一精度，"命令行能做的按钮也能做"这一条恢复成立 |
| **A8 / F7（两条路径不一致）** | 🟢 未受影响 | 未动存储：`date` 一直是 `YYYY-MM-DD`，老记录/老备份/`localStorage` 全部不变，无需迁移 |
| **F4（测试随日历漂移）** | 🟢 守住 | 新增断言全部用冻结时钟（`loadApp` 默认 `2027-08-30`）；探针页 `gen-amort.mjs` 用固定日期 `2027-08-17`，不取真实当天 |

**给下一版的建议（v0.0.8 时点）**：~~**P0 · H4**（统一 commit 出口）~~ —— **已在 v0.09-rev.2 完成**。
本版再次印证同一条规律：**同一个语义只要写两遍，迟早会漂移**（这次漂的是"起始日期"）。

### 10.3 v0.0.7 变更对既有结论的影响

> 见下方 §10.3（v0.0.6 的结论）与本节：v0.0.7 是**纯派生口径修复**，
> 但它落在**共享统计抽象**上 —— `periodSnapshot` / `todaySnapshot` / `totalCharge` /
> `collectWindow` / `doList` 全部换成
> `recWindow()`/`recDaysInRange()`/`recInWindow()`/`recAmountInRange()`/`sumRange()` 这一套。

| 条目 | 影响 | 说明 |
| --- | --- | --- |
| **F13（一个数字两套口径）** | 🔴 **v0.0.6 埋下的真缺陷，v0.0.7 收口** | v0.0.6 只把"消费=每天"做进了 `amount`，**没有**做"窗口内的天数"：五处统计各自写 `filter(r.date…).reduce(r.amount)`，于是那笔钱除记账当天外全部消失。修复把"窗口内天数"变成**唯一入口**并从五处复用 |
| **A2 / F1（横向重复）** | 🟢 **净减少** | 修复前：5 处各写一遍"按日期求和"（三套 `reduce(s+r.amount)` + 两套行筛选）。修复后：`collectWindow` 是唯一窗口统计，`periodSnapshot` 也改为复用它；`investTotalsOf` 收掉 3 处应投/已投 `reduce` |
| **F12（死代码漂移）** | 🟢 已检查 + 顺手删了一个 | 收口窗口统计后 `inRange()` 失去调用点，已删除并加进 `app.mjs` 的 `deadSyms()`（`test3` D1 从此会抓住它被加回来） |
| **F14（变异没红 ≠ 护栏不行）** | 🟢 照做 | 新增两组变异分别打"金额求和"与"行筛选"两个**不同**的点，必须各自变红（实测 9 条 / 3 条） |
| **A8 / F7、H4、M3、L4** | ⬜ 未变（**H4 已在 v0.09-rev.2 修**） | 归一化、写盘出口、解析入口、字段读写关系均未动 |

### 10.4 v0.0.6 变更对既有结论的影响（保留）

本次是**加功能**（分摊成本 `amort` + 「记一笔」双选项卡），没有横向重构，因此 21 条的状态不变。
但新代码与既有 21 条有交叉，逐条说明：

| 条目 | 影响 | 说明 |
| --- | --- | --- |
| **A2 / F1（横向重复）** | 🟢 **未新增重复** | 新代码新加了两个单一数据源：`recDays()`/`recTotal()`/`recAmortized()`（分摊记录的唯一读取入口）与 `setModalTab()`/`updateAmortHint()`（选项卡切换/预览的唯一入口）。全文件没有第二处 `r.amortDays||1` 这种兜底写法 |
| **A3 / F2（命令登记表漂移）** | 🟢 护栏已抓住一次 | 新增 `amort` 时先漏了 README 行，`test4.mjs` M1.34 **立刻变红** —— 登记表机制按设计生效（这正是 M1 修复想要的效果） |
| **A8 / F7（两条路径不一致）** | 🟢 已加护栏 | `normalizeRecords()` 是唯一归一化入口；实测**同一份旧备份（153 条）在 v0.0.5 与 v0.0.6 下的归一化结果逐字段字节一致**（纯加法，无迁移） |
| **H3（分类三个真相来源）** | ⬜ 未变 | 分摊成本复用 `validateCategory()`，因此**继承**了同一个缺陷（自定义类别刷新后不在 datalist）。没有恶化，也没有修 |
| **H4（缺统一提交点）** | ⬜ 未变（**v0.09-rev.2 已修**） | `doAmort()` 照现有约定自己调 `save()` + `refreshHeader()`（`save()` 25 处 / `refreshHeader()` 23 处）。**新命令没有让它变好，也没有让它变坏** —— 但这是"再多一处需要收口的点"，P0 的收益随功能增加而上升。收口后：命令只改 `state`，出口 `commitIfDirty()` 统一落盘 + 刷新；`save()`/`refreshHeader()` 分别 25→2、23→1 |
| **H5（双通道不对称 / 死分支）** | 🟡 **部分缓解** | 新增功能**两条通道都做了**（`amort` 命令 ↔ 分摊选项卡，弹窗也拼串回灌 `runCommand`），没有制造新的不对称；但 `open-add` 的 edit 分支仍是死代码，本次未做编辑入口 |
| **M3（数字解析 4 套）** | ⚠ **+1 入口** | 新增 `parseDaysToken()`（天数/`12月`/`12m`），成为第 5 个解析入口。它只解析"天数"这一种语义、边界集中（`AMORT_MIN_DAYS`~`AMORT_MAX_DAYS`），未与金额解析混用；但 P4 做 M3 收敛时应把它**一起纳入**（建议 `parseDays()`） |
| **M4（弹窗 ID 命名 3 套）** | ⚠ **+1 套** | 新增字段用 `f_amt/f_cat/f_date/f_note` 的 `fa_*` 前缀（`fa_total`/`fa_days`/`fa_cat`/`fa_date`/`fa_note`）+ `.mtabs/.mpanel` 类。与既有三套并存，属于**已知变体**；P4 统一弹窗规范时应合并到 `#<name>Modal` + `.mbtns button.primary` 体系 |
| **M5（工具栏 `data-cmd` 混装）** | ⬜ 未变 | 「+ 记一笔」仍是 `open-add` 伪动作，未拆 `data-action` |
| **M6（24 个 catch 策略不统一）** | 🟢 未新增 | `amort` 路径没有新增 `catch`（`catch` 仍 24 处） |
| **L4（`created` 只写不读）** | 🟢 **未重演** | 新增的 `amortDays`/`amortTotal` 都有明确读取点（`recDays`/`recTotal` → 列表行、报告、`update`、`recalc`），并写了"新字段必须有读取点"的配方（HANDOVER §3.4） |
| **F13（一个数字两套口径）** | 🆕 **新失败模式** | 分摊成本让"消费=每天 / 投资=总价"这两个口径共存。**先写恒等式再写代码**（`Σ(每天÷N占比) ＝ 总价÷N占比`），并把它变成断言 T28.6 —— 这是本轮唯一真正的新风险面，已用断言封住 |
| **F14（变异没红 ≠ 护栏不行）** | 🆕 经验 | `m_amort_bounds` 第一次没红，因为被**另一条**护栏（每天不足 ¥0.01）顺手拦住；补"上限 3650 放行 / 99999 拒绝"后才真正守住 |

**给下一版的建议（v0.0.6 时点）**：~~**P0 · H4**（统一 commit 出口）~~ —— **已在 v0.09-rev.2 完成**。理由在 v0.0.6 反而更强：
新增 `amort` 又添了一处 `save()`/`refreshHeader()` 手工调用点 —— 功能越多，H4 的收益越大、成本越高。
