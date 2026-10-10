// 变异测试(§4.3): 证明 v0.0.6 新增的分摊成本护栏真的抓得住缺陷。
//   用法: node tests/mutate-amort.mjs        (只读 index.html, 变异体写到系统临时目录)
// 每个变异体只改一处("恰好命中一次"), 然后跑对应套件, 期望它变红。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HTML_PATH, REPO_ROOT } from "./env.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(HTML_PATH, "utf8");
/* 仓库里的 index.html 在本机工作区是 CRLF(仓库内仍存 LF), 变异模式写成 LF 后要按实际行尾归一,
   否则多行模式"命中 0 次" —— 那是变异脚本自己坏了, 不是护栏通过。 */
const EOL = src.includes("\r\n") ? "\r\n" : "\n";
const nl = (s)=> s.split("\n").join(EOL);

/* 变异体: [名字, 套件, 还原的缺陷, 旧写法→坏写法] */
const MUTANTS = [
  ["m_amort_dispatch", "test4.mjs", "抹掉 dispatch 里的 amort 分支(清单漂移 F2)",
   ['case "amort":    doAmort(tokens); break;\n', ""]],
  ["m_amort_invest", "test.mjs", "投资按『每天』算而不是按总价(投资被分摊, 少算 N 倍)",
   ["const inv = investOf(total);\n  return { id:state.seq, amount:daily,",
    "const inv = investOf(daily);\n  return { id:state.seq, amount:daily,"]],
  ["m_amort_days", "test.mjs", "天数写成月时按『月数』当『天数』(12月 只摊 12 天)",
   ["const days = Math.round(months * AMORT_DAYS_UNIT);",
    "const days = Math.round(months);"]],
  ["m_amort_bounds", "test.mjs", "放宽天数上限(越界天数不再被拒)",
   ["const AMORT_MIN_DAYS = 2, AMORT_MAX_DAYS = 3650;",
    "const AMORT_MIN_DAYS = 2, AMORT_MAX_DAYS = 99999999;"]],
  ["m_amort_tab", "test5.mjs", "setModalTab 切换时不换面板(选项卡点了没反应)",
   ['if(panel) panel.classList.remove("hide");\n  if(other) other.classList.add("hide");',
    'if(panel) panel.classList.add("hide");\n  if(other) other.classList.add("hide");']],
  ["m_amort_total", "test.mjs", "归一化时丢掉摊销总价(旧备份导入后总价/应投失真)",
   ["const total = (isFinite(totalRaw) && totalRaw>0) ? r2(totalRaw) : (days>1 ? r2(amount*days) : amount);",
    "const total = (days>1 ? r2(amount) : amount);"]],
  /* 下面两组还原的是一整类"按天窗口"缺陷 —— 分摊成本除记账当天外, 在每日预算/周期预算/
     消费列表/总结里全部消失(即本次修复前的真实缺陷)。两组要分别打中"金额"和"行筛选":
     只改金额的话列表里连行都看不到, 只改筛选的话列表里行在但金额不对。 */
  ["m_amort_window_sum", "test.mjs", "分摊只按记账当天求和(其余天数的钱不计入消费)",
   ["  const n = recDaysInRange(r, start, end);\n  return n > 0 ? r2(n * (Number(r.amount)||0)) : 0;",
    "  const w = recWindow(r);\n  const hit = (w.start >= start && w.start <= end);\n  return hit ? r2(Number(r.amount)||0) : 0;"]],
  ["m_amort_window_rows", "test.mjs", "只按 r.date 筛选窗口(窗口内其余天查不到这笔分摊)",
   ["function recInWindow(r, start, end){ return recDaysInRange(r, start, end) > 0; }",
    "function recInWindow(r, start, end){ return r.date >= start && r.date <= end; }"]],
];

const tmp = os.tmpdir();
let bad = 0;
for(const [name, suite, what, [from0, to0]] of MUTANTS){
  const from = nl(from0), to = nl(to0);
  const hits = src.split(from).length - 1;
  if(hits !== 1){                       // 命中 0 次 = 源已漂移, 变异无效, 不能当通过
    console.log(`✗ ${name.padEnd(18)} 变异点命中 ${hits} 次(应为 1) → 变异无效`);
    bad++; continue;
  }
  const file = path.join(tmp, name + ".html");
  fs.writeFileSync(file, src.split(from).join(to));
  const r = spawnSync(process.execPath, [path.join(DIR, suite)], {
    encoding:"utf8", cwd: REPO_ROOT, env: { ...process.env, BT_HTML: file },
  });
  const out = (r.stdout||"") + (r.stderr||"");
  const m = out.match(/PASS\s+(\d+)\s*\/\s*FAIL\s+(\d+)/);
  const fails = m ? Number(m[2]) : NaN;
  const caught = r.status !== 0 && fails > 0;
  console.log(`${caught?"✓":"✗"} ${name.padEnd(18)} ${suite.padEnd(10)} FAIL ${isNaN(fails)?"?":fails}  ${what}`);
  if(!caught){
    console.log("    ↑ 变异未被抓住 —— 护栏可能是摆设(检查变异点是否打在该护栏真正断言的东西上)");
    bad++;
  }
  fs.unlinkSync(file);
}
console.log("-".repeat(78));
console.log(bad ? `有 ${bad} 个变异未被抓住 / 无效` : `全部 ${MUTANTS.length} 个变异都被抓住了`);
process.exit(bad ? 1 : 0);
