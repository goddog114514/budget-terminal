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
  /* 这一组还原"起始日期只精确到月"的老行为: 提交时把日期吸到该月 1 号。
     护栏是 M2.68/70b/70d —— 日期非法必须被拦下、精确到日的日期必须原样落库。 */
  ["m_amort_day_precision", "test5.mjs", "弹窗起始日期吸到每月 1 号(丢失用户选的日)",
   ['  const picked = amortPickDate(document.getElementById("fa_date").value);\n  if(!picked){ alertModal("起始日期需为 YYYY-MM-DD 的合法日期（或留空 = 今天）"); return; }',
    '  const picked = { date: (document.getElementById("fa_date").value||todayYMD()).slice(0,7)+"-01", blank:false };']],
  /* v0.09-rev.1 · H5: 双通道对称 + 弹窗 edit 分支 —— 把缺陷改回去必须让 test6 变红 */
  ["m_payfull_cmd", "test6.mjs", "抹掉 doPay 的 full 分支(全额投资又只剩鼠标)",
   ['  if((tokens[0]||"").toLowerCase()==="full"){ doPayFull(tokens.slice(1)); return; }\n', ""]],
  ["m_config_btn", "test6.mjs", "拿掉工具栏 config 按钮(config 又只剩命令行)",
   ['  <button data-cmd="config">配置</button>\n', ""]],
  ["m_invest_button", "test6.mjs", "全额投资按钮绕过命令直调 doInvestFull(通道再次不对称)",
   ['  if(ready) btnFull.addEventListener("click", ()=>runCommand("pay full "+(m?"mm":"idx")));',
    '  if(ready) btnFull.addEventListener("click", ()=>doInvestFull(kind));']],
  ["m_edit_branch", "test6.mjs", "openEdit 不回 edit 模式(弹窗 edit 分支再次成为死代码)",
   ['  modalMode="edit"; modalId=r.id;\n  setModalTabsVisible(false);',
    '  modalMode="add"; modalId=null;']],
  ["m_edit_submit", "test6.mjs", "编辑提交拼成 add 命令(编辑变成新建一条)",
   ['  const cmd = modalMode==="edit"', '  const cmd = false']],
  ["m_edit_tab_lock", "test6.mjs", "编辑模式仍可切到分摊选项卡(编辑旧记录却新建 amort)",
   ['  modalTab = (tab==="amort" && modalMode!=="edit") ? "amort" : "add";',
    '  modalTab = (tab==="amort") ? "amort" : "add";']],
  /* v0.0.9 · H4: 唯一提交点 —— 拆掉"出口提交 / 落盘 / 刷新"的任一半边都必须变红 */
  ["m_commit_exit", "test2.mjs", "去掉 runCommand 出口的 commitIfDirty()(命令改了数据却不提交)",
   ['    commitIfDirty();     // 唯一出口: 数据确实变了才 落盘 + 刷新(H4)\n', ""]],
  ["m_commit_refresh", "test2.mjs", "commit() 只落盘不 refreshAll()(界面停在旧数字)",
   ['  save();\n  refreshAll();\n  pendingCommit = false;', '  save();\n  pendingCommit = false;']],
  ["m_commit_save", "test2.mjs", "commit() 只 refreshAll() 不 save()(刷新后数据丢失)",
   ['  save();\n  refreshAll();\n  pendingCommit = false;', '  refreshAll();\n  pendingCommit = false;']],
  ["m_investfull_commit", "test6.mjs", "doInvestFull 不自提交且执行体内提前 commit(程序化入口改了不落盘)",
   ['  scrollBottom();\n  return true;\n}\n/* 程序化入口(测试/外部脚本): 自带一次 mutate + 统一提交; 界面按钮统一走 pay full 命令。\n   命令路径(pay full)由 runCommand 出口的 commitIfDirty() 提交, 这里只兜住非命令调用,\n   避免"执行体"自己 commit 造成 mutate 重入 / 多次落盘。 */\nfunction doInvestFull(kind){ const r = mutate(()=>investFullRun(kind)); commitIfDirty(); return r; }',
    '  commitIfDirty();\n  scrollBottom();\n  return true;\n}\n/* 程序化入口(测试/外部脚本): 自带一次 mutate; 界面按钮统一走 pay full 命令 */\nfunction doInvestFull(kind){ return mutate(()=>investFullRun(kind)); }']],
  /* v0.0.10 · chart 图表总结: 新增护栏必须能被"把缺陷改回去"证明有效(§7.4) */
  ["m_chart_dispatch", "test7.mjs", "抹掉 dispatch 的 chart 分支(命令又只剩登记表)",
   ['    case "chart":    doChart(tokens); break;\n', ""]],
  ["m_chart_both", "test7.mjs", "both 退化成只画柱状图(饼图选项失效)",
   ['  if(type==="pie" || type==="both"){', '  if(type==="pie" && type==="both"){']],
  ["m_chart_bucket_window", "test7.mjs", "柱桶金额又按 r.date 求和(分摊成本除记账当天全漏, F13)",
   ["      const cw = collectWindow(s, e, cat);",
    "      const cw = { total: r2(state.records.filter(r=>r.date>=s && r.date<=e && (!cat||r.category===cat)).reduce((a,r)=>a+(Number(r.amount)||0),0)) };"]],
  ["m_chart_pie_count", "test7.mjs", "饼图占比按笔数而不是按金额(240 元与 60 元同宽)",
   ["      const pct = amt/win.total*100;", "      const pct = 100/win.cats.length;"]],
  /* v0.0.10 同版迭代 · 四个按钮合并成 report：新增护栏同样要能被"改回去"证明有效 */
  ["m_report_summary", "test7.mjs", "合并入口又丢掉总结报告(只剩图表)",
   ['  printSummaryReport(win, label, {isDay, catFilter:p.cat, noTitle:true, compact:true});\n', ""]],
  ["m_report_both", "test7.mjs", "合并入口退化成只画柱状图(要求同时出两图)",
   ['  renderChartBody(win, name, isDay, p.cat, "both", {hideMeta:true, skipCore:true});',
    '  renderChartBody(win, name, isDay, p.cat, "bar", {hideMeta:true, skipCore:true});']],
  ["m_report_date_modal", "test7.mjs", "手动输日期弹窗又拼回 list 命令(选了总结却跳去消费列表)",
   ['  const base = target==="report" ? "report" : "list";', '  const base = "list";']],
  ["m_report_date_window", "test7.mjs", "填了具体日期却按整月统计(指定日期窗口失效)",
   ['    out.kind = /^\\d{4}-\\d{1,2}-\\d{1,2}$/.test(out.ref) ? "date" : "month";',
    '    out.kind = "month";']],
  ["m_report_dup", "test7.mjs", "合并入口又把旧版类别行/迷你条打一遍(与饼图重复)",
   ['  printSummaryReport(win, label, {isDay, catFilter:p.cat, noTitle:true, compact:true});',
    '  printSummaryReport(win, label, {isDay, catFilter:p.cat, noTitle:true});']],
  /* v0.0.11 · 统一视觉: 新增护栏(§8 V1–V12)同样要能被"改回去"证明不是摆设 */
  ["m_visual_hbar_cap", "test3.mjs", "比例条超额时不再截断到 100%(填充溢出容器)",
   ['  const usedPct = Math.min(100, r*100);', '  const usedPct = r*100;']],
  ["m_visual_rest", "test3.mjs", "进度条剩余段与已用段同色(分色退化成一条纯色)",
   ['  rest.style.background = withAlpha(col, 0.16);', '  rest.style.background = col;']],
  ["m_visual_marker", "test3.mjs", "100% 刻度线钉死在最左边(越线位置失去意义)",
   ['  mk.style.left = (100/Math.max(r,1)).toFixed(2)+"%";', '  mk.style.left = "0";']],
  ["m_chart_pie_gap", "test7.mjs", "饼图切片之间又挖 0.5% 透明缺口(饼图不闭合/少一块)",
   ['      segs.push(col+" "+from.toFixed(2)+"% "+to.toFixed(2)+"%");',
    '      segs.push(col+" "+from.toFixed(2)+"% "+(to-0.5).toFixed(2)+"%");\n      segs.push("transparent "+(to-0.5).toFixed(2)+"% "+to.toFixed(2)+"%");']],
  ["m_visual_head", "test3.mjs", "章节标题丢掉 chart-h 类(标题层级又回到正文大小)",
   ['  el.className = "l chart-h";', '  el.className = "l";']],
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
