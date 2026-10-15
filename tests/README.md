# tests/ —— BUDGET::TERM 无头回归装置

本目录是 `index.html` 的**自动化回归护栏**。装置原先散落在 `%TEMP%\bt-harness\`（临时目录随时会被清理），
现按 `HANDOVER.md` §1.3 移入仓库，并把 7 处硬编码绝对路径改为**相对仓库定位**：
换目录、换机器、换盘符都能直接跑。

**装置不属于应用本体**：`index.html` 仍是单文件、零依赖、无构建（`HANDOVER.md` §2.1 的形态约束不受影响）。

## 怎么跑

**按 `HANDOVER.md` §5.3 的两档政策**：日常小更新只跑**本次改动相关的套件**；
发版、或改动落在共享抽象/存储/领域口径上时才跑全量。

```powershell
# 全量（发版 / 跨模块改动）: 顺序跑全部 6 个套件, 汇总断言数并对照交付闸门基线
node tests/run-all.mjs

# 日常小更新: 只跑相关的那一个（同样满足低档闸门）
node tests/test5.mjs

# 变异测试: 只在你新增/改动护栏后重跑（19 组: 9 组分摊成本 + 6 组 H5 + 4 组 H4 提交点, 必须全部被抓住）
node tests/mutate-amort.mjs
```

`run-all.mjs` 会在任一套件失败、**或断言数与 `HANDOVER.md` §5.3 的基线不符**时以非 0 退出 ——
后者用来抓"护栏被悄悄删掉/改期望值"（失败模式 F4/B10）。增删断言后请同步更新 `run-all.mjs` 顶部的基线表。

> **`gen-window.mjs` 为什么要自己冻结时钟**：浏览器里 `todayYMD()` 取的是**真实当天**，
> 而断言场景（如"8/30 记的年付房租在 8/31 也要计入"）必须落在固定日期上。
> 它在应用脚本**之前**插了一段 `Date` 桩（`window.Date = Fake`）把时钟钉在 `2027-08-30`，
> 与 `tests/app.mjs` 的 `loadApp({now})` 同一思路 —— 否则"换一天跑，结果就变"（F4）。

> 注意：**单跑一个套件时没有"断言数 vs 基线"这道检查**，所以"护栏被悄悄删掉"只会在全量跑时暴露 ——
> 这就是把全量留给发版的代价，也是 §5.3 判定表里"动共享抽象算跨模块"的原因。

| 套件 | 断言 | 覆盖 |
| --- | --- | --- |
| `test.mjs` | 138 | 账本/周期/结转/投资池/导入导出/持久化/撤销重做 + **分摊成本 `amort`（T28）** + **分摊窗口口径（T29）** |
| `test2.mjs` | 55 | 端到端命令流/弹窗/备份数据冒烟/阈值与红黄绿圆点 |
| `test3.mjs` | 85 | P1 护栏：颜色令牌一致、`kvRow`、自适应列宽、死代码已删、响应式 CSS |
| `test4.mjs` | 85 | M1 护栏：`COMMANDS` ↔ `dispatch` ↔ `help` ↔ 补全 ↔ README ↔ 架构文件 §1.4 命令表 |
| `test5.mjs` | 92 | M2 护栏：语义槽位、`@日期` 位置无关、ghost 预览 + `amort` 补全与双选项卡（含起始日精确到日） |
| `test6.mjs` | 43 | **H5 护栏**：双通道对称（`pay full` 命令 / `config` 按钮 / 弹窗 edit 分支可达、提交走 `update`、失效行不可编辑） |
| **合计** | **498** | |

## 环境变量（都有默认值，通常不用设）

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `BT_HTML` | `<仓库>/index.html` | 换被测文件 —— **变异测试**就靠它指向改坏的副本 |
| `BT_README` | `<仓库>/README.md` | M1 护栏校验的命令表来源 |
| `BT_FIXTURE` | `tests/fixtures/user_backup.json` | 换账本夹具；指向真实备份即做"实弹冒烟" |

```powershell
# 拿真实账本跑一遍(不写入仓库, 只读)
$env:BT_FIXTURE="C:\...\budget_term_backup.json"; node tests/run-all.mjs
```

> ⚠️ **真实备份不会全绿，这是预期的**：一批断言把夹具的 `settings`（周期/锚点/预算）连同冻结时钟一起用
> （`T3.2`、`T24.1/2` 等），真实账本的周期配置与 2027 合成时间线天然不一致，必然红几条。
> `BT_FIXTURE` 只用来回答"**有没有新增崩溃/异常**"；要全绿请用默认的合成夹具。

## 夹具：`fixtures/user_backup.json` 是**全合成数据**

> 这一点与 `HANDOVER.md` §1.3 的描述不同，务必留意。

- 原装置里的 `fixture_user_backup.json` 经核对是**真实账本的未脱敏子集**（记录与真实账本逐条逐字节相同，
  备注是用户真实消费内容；`settings` 也是用户真实配置）。把它放进 git 跟踪路径等于把个人账目推上远端，
  违反 `HANDOVER.md` §5.2 B9 与 `.gitignore` 的立意，因此**未采用**。
- 现用的是**全合成**夹具，与任何真实账目无关：
  - `settings`：预算 `1200`、当期覆盖 `{"2027-08-15":900}`、阈值 `[80,100]`、日额 `50`、
    利率 `0.02/0.08`（应用默认）、锚点 `2027-07-30`、起点 `2027-08-04`（**故意不是周期边界**）——全部为编造/默认值；
  - 记录：`id` 重排为 `1..153`、日期全部编造在 `2027-07-15 .. 2027-08-30`、金额与备注编造，
    但**结构性边界照旧保留**：16 天滚动周期、跨两个周期、两种键形（有/无 `mmPaid`/`idxPaid`）、
    已投模式（全额/未投）、9 个通用类别。
  - 已核对：与真实账本**无任何一行相同**，且不含真实账本用到的任何日期。
- 关键点：**不要**为了省事把真实账本拷进 `tests/fixtures/`。`.gitignore` 只屏蔽仓库根目录的
  `budget_term_backup.json`，`tests/fixtures/*.json` 是会被提交的。
- 为什么这样够用：夹具相关断言（`T1.2` granted=2100、`T24.1` 周期链、`T3.x` 周期网格）都由
  **`settings`** 驱动，与记录金额/备注无关；命令冒烟只要求 id 1–4、`2027-08-04`、`2027-08` 的记录存在。
- 需要真实数据兜底时用 `BT_FIXTURE`（上表）：可以对着**当前**真实账本跑一遍，
  既不写入仓库也不回显内容，是真实数据冒烟的正规姿势。

## 冻结时钟（关键）

装置用 `loadApp({now:"2027-08-30"})` **冻结"今天"**。应用大量逻辑以 `todayYMD()` 为基准，
不冻结就会出现"换一天跑就全红"的假故障（`HANDOVER.md` §4.1 / 失败模式 F4）。
新增断言若依赖具体日期，**必须**用冻结时钟，不要写死当天日期。

## 真实浏览器验证（生成器）

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

# 生成演示页(默认写到系统临时目录, 不污染仓库; 也可以传第一个参数指定路径)
node tests/gen-clean.mjs $env:TEMP\bt-clean.html     # 只跑命令(含 amort) → 截图
node tests/gen-probe.mjs $env:TEMP\bt-probe.html     # 注入探针 → --dump-dom 取值
node tests/gen-tab.mjs   $env:TEMP\bt-tab.html       # 真实按键驱动 Tab 补全
node tests/gen-help.mjs  $env:TEMP\bt-help.html      # 只看 help 排版
node tests/gen-amort.mjs $env:TEMP\bt-amort.html     # 真实点击「分摊成本」选项卡 + input 事件 → 面板/预览探针
node tests/gen-window.mjs $env:TEMP\bt-window.html   # 分摊"窗口口径"端到端探针(冻结时钟 + 真实按键驱动)

# 取值探针: 读运行期 COLOR / 列宽 / 是否横向溢出
& $edge --headless=new --disable-gpu --no-first-run "--user-data-dir=$env:TEMP\bt-ep" `
  "--window-size=1400,900" --dump-dom "file:///$($env:TEMP -replace '\\','/')/bt-probe.html" |
  Select-String '>PROBE::(.*?)::END<'

# 截图(1400 与 520 两档)
& $edge --headless=new --disable-gpu --no-first-run "--user-data-dir=$env:TEMP\bt-sc" `
  "--window-size=520,900" --virtual-time-budget=3000 "--screenshot=$env:TEMP\bt-520.png" `
  "file:///$($env:TEMP -replace '\\','/')/bt-clean.html"
```

**三个坑（都踩过）**

1. `--window-size` 与 `--user-data-dir` / `--screenshot` 这类"值里有逗号或变量"的参数**必须整体加引号**：
   写成 `"--window-size=$w,900"`。不加引号时 PowerShell 会把 `$w,900` 当数组拆开，
   Edge 收不到宽度，量出来的是默认窗口（表现为三档宽度结果一模一样）。
2. `--virtual-time-budget` 与 `--dump-dom` 同时用可能拿不到输出；探针页不要在 `setTimeout` 里跑，
   在 `load` 事件里同步跑完再写 DOM。`--dump-dom` 会把 `<script>` 源码也打出来，
   正则要匹配渲染后的节点文本（`>PROBE::…::END<`），别匹配到脚本源码；
   取**最后一个** `PROBE::`（用 `LastIndexOf`）最稳。
3. **`--dump-dom` 的输出经管道会丢**：`& $edge ... | Select-String ...` 有时候返回 0 字节。
   改用重定向（实测稳定）：
   ```powershell
   $p = Start-Process -FilePath $edge -ArgumentList @("--headless=new","--disable-gpu","--no-first-run",
          "--user-data-dir=$dir","--window-size=1400,900","--dump-dom","$base/bt-probe.html") `
        -RedirectStandardOutput "$dir\dom.txt" -NoNewWindow -Wait -PassThru
   Get-Content "$dir\dom.txt" -Raw
   ```

## 变异测试（证明护栏真的有效）

把已知缺陷改回去，确认对应断言会红。装置已用此法验证 **26 组**（脚本 19 组 + 早期手工 7 组），覆盖全部 **6** 个套件。

**v0.0.6 起有脚本**（推荐照它加一组，别手搓）：`node tests/mutate-amort.mjs` 一次跑 19 组、
自动校验"变异点恰好命中一次"、并汇总哪些没被抓住。

| 变异体 | 套件 | 还原的缺陷 | 结果 |
| --- | --- | --- | --- |
| `m_color` | test3 | 只改 CSS 令牌、不动 JS 兜底值（颜色双轨，H1） | C2 红 |
| `m_responsive` | test3 | 删掉 `header` 的 `flex-wrap:wrap` | R header 换行 红 |
| `m_commands` | test4 | 登记表里抹掉 `config`（清单漂移，M1） | 6 条红 |
| `m_atdate` | test5 | 让 `@日期` 重新占槽位（M2） | 5 条红 |
| `m_ratio` | test | 比例区间改回开区间（端点被拒，F5） | 8 条红 |
| `m_stale` | test | 失效行不再提示失效（假成功，B7） | T12.2 红 |
| `m_header` | test2 | 拿掉 `set budget` 后的 `refreshHeader()`（H4/F10）—— **v0.09-rev.2 后该调用点已不存在**，改由下面 3 组守护 | T21.1 红 |
| `m_commit_exit` | test2 | 去掉 `runCommand` 出口的 `commitIfDirty()`（H4 复发） | 8 条红 |
| `m_commit_refresh` | test2 | `commit()` 只 `save()` 不 `refreshAll()` | T21.1/2/3 红 |
| `m_commit_save` | test2 | `commit()` 只 `refreshAll()` 不 `save()` | T27.x 红 5 条 |
| `m_investfull_commit` | test6 | `doInvestFull` 不自提交且执行体内提前 commit（程序化入口改了不落盘） | 1 条红 |
| `m_amort_dispatch` | test4 | 抹掉 `dispatch` 的 `amort` 分支（F2） | 1 条红 |
| `m_amort_invest` | test | 投资改按**每天**算（投资被分摊，少算 N 倍） | 3 条红 |
| `m_amort_days` | test | `12月` 只当 12 天（不按 30 天/月折算） | 3 条红 |
| `m_amort_bounds` | test | 放宽天数上限（越界天数不再被拒） | 3 条红 |
| `m_amort_tab` | test5 | 切选项卡时不换面板（点了没反应） | 4 条红 |
| `m_amort_total` | test | 归一化时丢掉摊销总价（旧备份导入失真） | 4 条红 |
| `m_amort_window_sum` | test | **只按记账当天求和**（其余天数的钱不计入消费，v0.0.7 修的缺陷） | 9 条红 |
| `m_amort_window_rows` | test | **只按 `r.date` 筛选窗口**（窗口内其余天查不到这笔分摊） | 3 条红 |
| `m_amort_day_precision` | test5 | **起始日期吸到每月 1 号**（丢掉用户选的日，v0.0.8 修的缺陷） | 4 条红 |
| `m_payfull_cmd` | test6 | 抹掉 `doPay` 的 `full` 分支（全额投资又只剩鼠标，H5） | 6 条红 |
| `m_config_btn` | test6 | 拿掉工具栏 `config` 按钮（H5） | 1 条红 |
| `m_invest_button` | test6 | 按钮绕过命令直调 `doInvestFull`（通道再次不对称，H5） | 2 条红 |
| `m_edit_branch` | test6 | `openEdit` 不回 edit 模式（edit 分支又成死代码，H5） | 9 条红 |
| `m_edit_submit` | test6 | 编辑提交拼成 `add` 命令（编辑变成新建一条，H5） | 2 条红 |
| `m_edit_tab_lock` | test6 | 编辑模式仍可切到分摊选项卡（H5） | 1 条红 |

做法：改一份副本 → `$env:BT_HTML` 指过去 → 跑对应套件，**必须变红**。新写的护栏也应做一次。

> **两条经验**：① 多行变异模式要按**实际行尾**归一（本机工作区是 CRLF），否则报"命中 0 次"——
> 那是脚本自己坏了，不能当通过；② 变异"没红"也可能是**被另一条护栏顺手拦住了**
> （`m_amort_bounds` 第一次就是被"每天不足 ¥0.01"拦下的），补一条**只针对该点**的断言才算真守住。

## 目录结构

```
tests/
├─ run-all.mjs            单一入口(6 套件 + 基线校验)
├─ mutate-amort.mjs       变异测试(19 组: 分摊成本 9 + H5 6 + H4 4, 含窗口口径 2 组 + 日精度 1 组)
├─ env.mjs                路径解析单一入口(仓库根 / HTML / README / 夹具)
├─ dom.mjs                极简 DOM stub(元素/classList/style/事件/localStorage)
├─ app.mjs                加载 index.html 内联脚本并暴露内部符号 loadApp({seedStorage, now})
├─ test.mjs test2..test6  6 个套件(含 test6 H5 专项)
├─ gen-clean/gen-help/gen-probe/gen-tab/gen-amort/gen-window/gen-h5.mjs   浏览器验证用页面生成器
└─ fixtures/user_backup.json                            合成账本夹具(无真实数据)
```
