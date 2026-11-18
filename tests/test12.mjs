// v0.0.15 经常性支出 recur 专项护栏:
//   金额 / 起始日 / 持续(日·周·周期·月) / 频率(日·周·周期·月) / 可选自动分摊到每天。
//   不分摊 = 生成 N 笔独立记录(与 add 同构); 分摊 = 1 笔分摊成本(总价摊到整个持续期)。
import fs from "node:fs";
import { loadApp } from "./app.mjs";
import { HTML_PATH, README_PATH } from "./env.mjs";

const html = fs.readFileSync(HTML_PATH, "utf8");
const readme = fs.readFileSync(README_PATH, "utf8");

let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
function near(name, a, b, eps){ ok(name, Math.abs(a-b) <= (eps==null?0.01:eps), "got "+a+" want "+b); }
const mk = () => { const S = loadApp(); S.boot(); return S; };
const TODAY = "2027-08-30";

/* ---------- 1. 命令登记 / help / 别名 ---------- */
{
  const S = mk();
  ok("R1.1 登记了 recur 主命令", S.COMMAND_NAMES.includes("recur"), S.COMMAND_NAMES.join(","));
  eq("R1.2 别名 repeat 指向 recur", S.canonicalCmd("repeat"), "recur");
  S.clearTerm(); S.runCommand("help");
  const help = S.lines().join("\n");
  ok("R1.3 help 有 recur 用法行", /recur <金额> <类别> <持续> <频率>/.test(help), "");
  ok("R1.4 help 里列出了别名 repeat", /repeat/.test(help), "");
  S.clearTerm(); S.runCommand("recur");
  ok("R1.5 缺参数给用法而不是静默成功", /用法: recur/.test(S.lines().join("\n")) && S.state.records.length===0, S.lines().join("|"));
}

/* ---------- 2. 基础: 每月 ¥100 × 持续 12 个月 ---------- */
{
  const S = mk();
  S.clearTerm(); S.runCommand("recur 100 房租 12月 月 @2027-09-01 房租");
  const rs = S.state.records;
  eq("R2.1 生成 12 笔独立记录", rs.length, 12);
  eq("R2.2 每笔金额=每次金额", [...new Set(rs.map(r=>r.amount))], [100]);
  eq("R2.3 扣款日逐月(含跨年)", rs.map(r=>r.date),
     ["2027-09-01","2027-10-01","2027-11-01","2027-12-01","2028-01-01","2028-02-01",
      "2028-03-01","2028-04-01","2028-05-01","2028-06-01","2028-07-01","2028-08-01"]);
  eq("R2.4 记录不是分摊记录", [...new Set(rs.map(r=>r.amortDays))], [1]);
  ok("R2.5 回执写了笔数/期间/合计", /12 笔/.test(S.lines().join("\n")) && /合计 ¥1200\.00/.test(S.lines().join("\n")), S.lines().join("|"));
  /* 投资: 每笔按金额算, 合计与"总价一次算"在同一容差内 */
  const sumMM = S.r2(rs.reduce((s,r)=>s+r.mm,0));
  near("R2.6 应投货币合计 ≈ investOf(总价).mm", sumMM, S.investOf(1200).mm, 0.01);
  eq("R2.7 一次录入只压一步撤销", S.undoDepth, 1);
  S.runCommand("undo");
  eq("R2.8 撤销整批(不是逐笔)", S.state.records.length, 0);
}

/* ---------- 3. 频率 × 持续 的四种单位 ---------- */
{
  const S = mk();
  S.runCommand("recur 20 交通 4周 周 @2027-08-02");
  eq("R3.1 每周 × 4 周 = 4 笔", S.state.records.map(r=>r.date),
     ["2027-08-02","2027-08-09","2027-08-16","2027-08-23"]);

  const D = mk();
  D.runCommand("recur 5 餐饮 7日 日 @2027-08-01");
  eq("R3.2 每日 × 7 日 = 7 笔", D.state.records.length, 7);
  eq("R3.3 每日扣款连续", D.state.records.map(r=>r.date),
     ["2027-08-01","2027-08-02","2027-08-03","2027-08-04","2027-08-05","2027-08-06","2027-08-07"]);

  /* 月末夹取但不漂移: 1/31 起每月一次 → 2/28, 3/31, 4/30(不是 3/28) */
  const M = mk();
  M.runCommand("recur 30 会员 4月 月 @2027-01-31");
  eq("R3.4 月末夹取且不累积漂移", M.state.records.map(r=>r.date),
     ["2027-01-31","2027-02-28","2027-03-31","2027-04-30"]);

  /* 周期频率: 首笔在起始日, 之后落在每个记账周期首日 */
  const P = mk();
  P.runCommand("recur 50 话费 3周期 周期 @2027-08-10");
  eq("R3.5 每周期 × 3 周期(自然月)", P.state.records.map(r=>r.date),
     ["2027-08-10","2027-09-01","2027-10-01"]);
  eq("R3.6 持续 3 周期的终点 = 第 3 期最后一天", P.recurEndDate("2027-08-10", {n:3, unit:"period"}), "2027-10-31");
}
{
  /* 滚动周期下"周期"跟着周期网格走(15 天一期, 锚点 08-01) */
  const S = mk();
  S.runCommand("config set period 15");
  S.runCommand("config set periodstart 2027-08-01");
  S.runCommand("recur 50 话费 2周期 周期 @2027-08-16");
  eq("R3.7 滚动周期: 起始日 + 下一期首日", S.state.records.map(r=>r.date), ["2027-08-16","2027-08-31"]);
  eq("R3.8 滚动周期: 2 期终点", S.recurEndDate("2027-08-16", {n:2, unit:"period"}), "2027-09-14");
  eq("R3.9 滚动周期下不写回锚点(纯计算)", S.state.settings.anchor, "2027-08-01");
}

/* ---------- 4. 自动分摊到每天 ---------- */
{
  const S = mk();
  S.clearTerm(); S.runCommand("recur 100 房租 12月 月 @2027-09-01 分摊");
  eq("R4.1 分摊模式只生成 1 笔", S.state.records.length, 1);
  const r = S.state.records[0];
  eq("R4.2 分摊天数 = 整个持续期", r.amortDays, 366);            // 2027-09-01 ~ 2028-08-31(2028 闰年)
  eq("R4.3 总价 = 每次金额 × 次数", r.amortTotal, 1200);
  eq("R4.4 每天金额 = 总价 ÷ 天数(r2)", r.amount, 3.28);
  near("R4.5 投资按总价一次记入", r.mm, S.investOf(1200).mm, 1e-6);
  ok("R4.6 回执写明分摊", /分摊成本/.test(S.lines().join("\n")) && /每天 ¥3\.28/.test(S.lines().join("\n")), S.lines().join("|"));
  eq("R4.7 一步撤销", S.undoDepth, 1);

  /* 持续期只有 1 天 → 无法分摊, 自动回落成单笔记录并提示 */
  const F = mk();
  F.clearTerm(); F.runCommand("recur 99 快递 1日 日 分摊");
  eq("R4.8 单日 + 分摊 → 回落成普通记录", F.state.records.length, 1);
  eq("R4.9 回落记录不分摊", F.state.records[0].amortDays, 1);
  ok("R4.10 回落有明确提示", /无法分摊/.test(F.lines().join("\n")), F.lines().join("|"));

  /* 总价除以天数后不足 ¥0.01 → 拒绝(不写假数据) */
  const Z = mk();
  Z.clearTerm(); Z.runCommand("recur 0.01 餐饮 12月 月 分摊");
  ok("R4.11 每天不足 ¥0.01 被拒", /每天不足/.test(Z.lines().join("\n")) && Z.state.records.length===0, Z.lines().join("|"));
}

/* ---------- 5. 边界与非法输入 ---------- */
{
  const S = mk();
  S.clearTerm(); S.runCommand("recur 100 房租 12 月");
  ok("R5.1 持续时长缺单位被拒", /持续时长无效/.test(S.lines().join("\n")) && S.state.records.length===0, S.lines().join("|"));

  S.clearTerm(); S.runCommand("recur 100 房租 12月 年");
  ok("R5.2 频率单位非法被拒", /频率无效/.test(S.lines().join("\n")), S.lines().join("|"));

  S.clearTerm(); S.runCommand("recur 0 房租 12月 月");
  ok("R5.3 金额 0 被拒", /金额无效/.test(S.lines().join("\n")), S.lines().join("|"));

  S.clearTerm(); S.runCommand("recur 1 餐饮 4000日 日");
  ok("R5.4 持续期 > 3650 天被拒", /持续期过长/.test(S.lines().join("\n")), S.lines().join("|"));

  S.clearTerm(); S.runCommand("recur 1 餐饮 501日 日");
  ok("R5.5 超过 500 笔被拒(提示改用分摊)", /最多生成 500 笔/.test(S.lines().join("\n")) || /最多生成 500/.test(S.lines().join("\n")), S.lines().join("|"));

  const B = mk();
  B.runCommand("recur 1 餐饮 500日 日");
  eq("R5.6 恰好 500 笔是允许的", B.state.records.length, 500);

  const C = mk();
  C.clearTerm(); C.runCommand("recur 12 餐饮 1日 日");
  eq("R5.7 无 @日期 = 今天", C.state.records[0].date, TODAY);
}

/* ---------- 6. 与既有统计口径一致(不新增特判) ---------- */
{
  const S = mk();
  S.runCommand("recur 100 房租 3月 月 @2027-09-01");
  eq("R6.1 list 能列出全部生成记录", (()=>{ S.clearTerm(); S.runCommand("list"); return S.state.records.filter(r=>S.lines().join("\n").includes("#"+r.id)).length; })(), 3);
  S.clearTerm(); S.runCommand("search 房租");
  ok("R6.2 search 能查到", /#1/.test(S.lines().join("\n")) && /#3/.test(S.lines().join("\n")), S.lines().join("|").slice(0,200));
  S.clearTerm(); S.runCommand("summary month @2027-09");
  ok("R6.3 summary 按月份统计到 9 月那笔", /¥100\.00/.test(S.lines().join("\n")), "");
  const win = S.collectWindow("2027-09-01","2027-09-30");
  eq("R6.4 窗口统计 = 该窗口内的扣款合计", win.total, 100);

  /* 分摊版: 整段窗口的消费 = 每天 × 天数 ≈ 总价 */
  const A = mk();
  A.runCommand("recur 100 房租 12月 月 @2027-09-01 分摊");
  const all = A.collectWindow("2027-09-01","2028-08-31");
  /* 每天金额是 r2 口径, 逐日累计与总价最多差 天数×¥0.005(与 amort 同一已有口径, 不是回归) */
  near("R6.5 分摊版整段消费 ≈ 总价", all.total, 1200, 2);
  eq("R6.6 分摊版整段天数", all.days, 366);
}

/* ---------- 7. 持久化 ---------- */
{
  const S = mk();
  S.runCommand("recur 100 房租 12月 月 @2027-09-01");
  const dump = S.__storage.getItem("budget_term_v1");
  const T = loadApp({ seedStorage:{ budget_term_v1: dump } }); T.boot();
  eq("R7.1 12 笔记录重启后仍在", T.state.records.length, 12);
  eq("R7.2 金额与日期不变", [T.state.records[0].date, T.state.records[11].date], ["2027-09-01","2028-08-01"]);
}

/* ---------- 8. 「记一笔」第三选项卡 ---------- */
{
  const S = mk();
  const d = (id)=>S.__doc.getElementById(id);
  ok("R8.1 选项卡里有「经常性支出」", /data-mtab="recur"[^>]*>经常性支出/.test(html), "");
  ok("R8.2 面板存在", /id="mp_recur"/.test(html), "");
  S.openAdd();
  S.setModalTab("recur");
  eq("R8.3 切到经常性支出", S.modalTab, "recur");
  ok("R8.4 只显示本面板", !d("mp_recur").classList.contains("hide")
     && d("mp_add").classList.contains("hide") && d("mp_amort").classList.contains("hide"), "");
  ok("R8.5 标题随选项卡变化", /经常性支出/.test(d("mTitle").textContent), d("mTitle").textContent);

  /* 预览与提交共用 recurPlan: 预览里的笔数/总价 == 提交后的结果 */
  d("fr_amt").value = "100"; d("fr_cat").value = "房租";
  d("fr_date").value = "2027-09-01"; d("fr_dur").value = "12";
  d("fr_dur_unit").value = "month"; d("fr_freq").value = "month"; d("fr_split").checked = false;
  S.updateRecurHint();
  const hint = d("fr_hint").textContent;
  ok("R8.6 预览写清笔数与总价", /12 笔/.test(hint) && /¥1200\.00/.test(hint), hint);
  ok("R8.7 预览写清期间", /2027-09-01 ~ 2028-08-31/.test(hint), hint);

  d("fr_split").checked = true; S.updateRecurHint();
  ok("R8.8 勾选分摊后预览改成每天金额", /每天 ¥3\.28/.test(d("fr_hint").textContent), d("fr_hint").textContent);

  d("fr_split").checked = false;
  S.submitRecur();
  eq("R8.9 弹窗提交 = 生成 12 笔", S.state.records.length, 12);
  eq("R8.10 弹窗提交只压一步撤销", S.undoDepth, 1);
  ok("R8.11 回灌的是 recur 命令(双通道同一条)", /^recur 100 房租 12月 月 @2027-09-01/.test(d("cmdline").value), d("cmdline").value);

  /* 编辑模式不能切到经常性支出(避免"假编辑") */
  const E = mk();
  const r0 = { id:1, amount:10, category:"餐饮", note:"", place:"", date:TODAY, amortDays:1, amortTotal:10, mm:0, idx:0, moneyInv:0, indexInv:0 };
  E.state.records.push(r0);
  E.openEdit(r0);
  E.setModalTab("recur");
  eq("R8.12 编辑模式强制回「单笔消费」", E.modalTab, "add");
}

/* ---------- 9. 非法输入不落库(弹窗) ---------- */
{
  const S = mk();
  const d = (id)=>S.__doc.getElementById(id);
  S.openAdd(); S.setModalTab("recur");
  d("fr_amt").value = "100"; d("fr_cat").value = "房租";
  d("fr_date").value = "2027-09-01"; d("fr_dur").value = "0";
  S.updateRecurHint();
  ok("R9.1 持续 0 给黄色提示", /bad/.test(d("fr_hint").className) && /≥1/.test(d("fr_hint").textContent), d("fr_hint").textContent);
  S.submitRecur();
  eq("R9.2 提交被拦下(零记录)", S.state.records.length, 0);
  ok("R9.3 弹窗没关", S.__doc.getElementById("modalWrap").classList.contains("open"), "");
}

/* ---------- 10. README 同步 ---------- */
{
  ok("R10.1 README 命令表有 recur", /`recur /.test(readme), "");
  ok("R10.2 README 记录了「经常性支出」", /经常性支出/.test(readme), "");
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length ? 1 : 0);
