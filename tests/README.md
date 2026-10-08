# tests/ —— BUDGET::TERM 无头回归装置

本目录是 `index.html` 的**自动化回归护栏**。装置原先散落在 `%TEMP%\bt-harness\`（临时目录随时会被清理），
现按 `HANDOVER.md` §1.3 移入仓库，并把 7 处硬编码绝对路径改为**相对仓库定位**：
换目录、换机器、换盘符都能直接跑。

**装置不属于应用本体**：`index.html` 仍是单文件、零依赖、无构建（`HANDOVER.md` §2.1 的形态约束不受影响）。

## 怎么跑

```powershell
# 单一入口: 顺序跑全部 5 个套件, 汇总断言数并对照交付闸门基线
node tests/run-all.mjs

# 也可以单独跑某一个(排查时用)
node tests/test3.mjs
```

`run-all.mjs` 会在任一套件失败、**或断言数与 `HANDOVER.md` §5.3 的基线不符**时以非 0 退出 ——
后者用来抓"护栏被悄悄删掉/改期望值"（失败模式 F4/B10）。增删断言后请同步更新 `run-all.mjs` 顶部的基线表。

| 套件 | 断言 | 覆盖 |
| --- | --- | --- |
| `test.mjs` | 78 | 账本/周期/结转/投资池/导入导出/持久化/撤销重做 |
| `test2.mjs` | 55 | 端到端命令流/弹窗/备份数据冒烟/阈值与红黄绿圆点 |
| `test3.mjs` | 84 | P1 护栏：颜色令牌一致、`kvRow`、自适应列宽、死代码已删、响应式 CSS |
| `test4.mjs` | 79 | M1 护栏：`COMMANDS` ↔ `dispatch` ↔ `help` ↔ 补全 ↔ README 双向校验 |
| `test5.mjs` | 57 | M2 护栏：语义槽位、`@日期` 位置无关、ghost 预览 |
| **合计** | **353** | |

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
node tests/gen-clean.mjs $env:TEMP\bt-clean.html     # 只跑命令 → 截图
node tests/gen-probe.mjs $env:TEMP\bt-probe.html     # 注入探针 → --dump-dom 取值
node tests/gen-tab.mjs   $env:TEMP\bt-tab.html       # 真实按键驱动 Tab 补全
node tests/gen-help.mjs  $env:TEMP\bt-help.html      # 只看 help 排版

# 取值探针: 读运行期 COLOR / 列宽 / 是否横向溢出
& $edge --headless=new --disable-gpu --no-first-run "--user-data-dir=$env:TEMP\bt-ep" `
  "--window-size=1400,900" --dump-dom "file:///$($env:TEMP -replace '\\','/')/bt-probe.html" |
  Select-String '>PROBE::(.*?)::END<'

# 截图(1400 与 520 两档)
& $edge --headless=new --disable-gpu --no-first-run "--user-data-dir=$env:TEMP\bt-sc" `
  "--window-size=520,900" --virtual-time-budget=3000 "--screenshot=$env:TEMP\bt-520.png" `
  "file:///$($env:TEMP -replace '\\','/')/bt-clean.html"
```

**两个坑（都踩过）**

1. `--window-size` 与 `--user-data-dir` / `--screenshot` 这类"值里有逗号或变量"的参数**必须整体加引号**：
   写成 `"--window-size=$w,900"`。不加引号时 PowerShell 会把 `$w,900` 当数组拆开，
   Edge 收不到宽度，量出来的是默认窗口（表现为三档宽度结果一模一样）。
2. `--virtual-time-budget` 与 `--dump-dom` 同时用可能拿不到输出；探针页不要在 `setTimeout` 里跑，
   在 `load` 事件里同步跑完再写 DOM。`--dump-dom` 会把 `<script>` 源码也打出来，
   正则要匹配渲染后的节点文本（`>PROBE::…::END<`），别匹配到脚本源码。

## 变异测试（证明护栏真的有效）

把已知缺陷改回去，确认对应断言会红。装置已用此法验证 7 组（覆盖全部 5 个套件）：

| 变异体 | 套件 | 还原的缺陷 | 结果 |
| --- | --- | --- | --- |
| `m_color` | test3 | 只改 CSS 令牌、不动 JS 兜底值（颜色双轨，H1） | C2 红 |
| `m_responsive` | test3 | 删掉 `header` 的 `flex-wrap:wrap` | R header 换行 红 |
| `m_commands` | test4 | 登记表里抹掉 `config`（清单漂移，M1） | 6 条红 |
| `m_atdate` | test5 | 让 `@日期` 重新占槽位（M2） | 5 条红 |
| `m_ratio` | test | 比例区间改回开区间（端点被拒，F5） | 8 条红 |
| `m_stale` | test | 失效行不再提示失效（假成功，B7） | T12.2 红 |
| `m_header` | test2 | 拿掉 `set budget` 后的 `refreshHeader()`（H4/F10） | T21.1 红 |

做法：改一份副本 → `$env:BT_HTML` 指过去 → 跑对应套件，**必须变红**。新写的护栏也应做一次。

## 目录结构

```
tests/
├─ run-all.mjs            单一入口(5 套件 + 基线校验)
├─ env.mjs                路径解析单一入口(仓库根 / HTML / README / 夹具)
├─ dom.mjs                极简 DOM stub(元素/classList/style/事件/localStorage)
├─ app.mjs                加载 index.html 内联脚本并暴露内部符号 loadApp({seedStorage, now})
├─ test.mjs test2..test5  5 个套件
├─ gen-clean/gen-help/gen-probe/gen-tab.mjs   浏览器验证用页面生成器
└─ fixtures/user_backup.json                  合成账本夹具(无真实数据)
```
