import fs from "node:fs";
import { loadApp } from "./app.mjs";
import { FIXTURE_PATH } from "./env.mjs";

/* 默认夹具是**合成**账本: settings 与记录日期/金额/备注全部为编造值, 不含任何真实账目。
   要拿真实备份做"实弹冒烟": $env:BT_FIXTURE="C:\...\budget_term_backup.json" */
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
let pass = 0; const fails = [];
function ok(name, cond, detail){
  if(cond){ pass++; } else { fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
}
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
function near(name, a, b, eps=1e-6){ ok(name, Math.abs(a-b)<=eps, "got "+a+" want "+b); }

/* ============ T1: period/epoch coherence (合成夹具) ============ */
{
  const S = loadApp({ seedStorage:{ budget_term_v1: JSON.stringify(fixture) } });
  S.boot();
  const p = S.currentPeriod();
  const starts = S.periodStartsUpTo(p.start);
  ok("T1.1 current period start present in granted chain", starts.includes(p.start), JSON.stringify(starts));
  const granted = S.grantedTotal();
  near("T1.2 grantedTotal counts current period override (1200 + 900)", granted, 2100, 0.001);
  near("T1.3 availableBalance is consistent with grantedTotal",
       S.availableBalance(), S.r2(granted - S.totalCharge()), 0.001);
  const st = S.periodSnapshot();
  near("T1.4 periodSnapshot.B matches override", st.B, 900, 0.001);
}

/* ============ T2: override honoured after scheme changes ============ */
{
  const S = loadApp(); S.boot();
  S.runCommand("set period 16");
  S.runCommand("set periodstart 2027-07-30");
  S.runCommand("budget set 900");
  const p = S.currentPeriod();
  ok("T2.1 override is registered on current start", S.hasBudgetOverride(p), JSON.stringify(S.state.settings.periodBudget));
  ok("T2.2 current start in chain after scheme change", S.periodStartsUpTo(p.start).includes(p.start), JSON.stringify(S.periodStartsUpTo(p.start)));

  const T = loadApp(); T.boot();
  T.runCommand("set period 15");
  T.runCommand("budget set 1200");
  const q = T.currentPeriod();
  ok("T2.3 rolling chain hits real period grid", T.periodStartsUpTo(q.start).includes(q.start), JSON.stringify({epoch:T.state.settings.epoch, anchor:T.state.settings.anchor, chain:T.periodStartsUpTo(q.start), cur:q.start}));
}

/* ============ T3: rolling grid extends before anchor ============ */
{
  const S = loadApp({ seedStorage:{ budget_term_v1: JSON.stringify(fixture) } });
  S.boot();
  const a = S.periodBounds("2027-08-14");
  const b = S.periodBounds("2027-08-15");
  eq("T3.1 period containing 09-14", [a.start,a.end], ["2027-07-30","2027-08-14"]);
  eq("T3.2 period containing 09-15", [b.start,b.end], ["2027-08-15","2027-08-30"]);
  const before = S.periodBounds("2027-07-20");
  ok("T3.3 grid aligned before anchor", before.start <= "2027-07-20" && before.end >= "2027-07-20"
      && S.daysBetween(before.start, before.end) === 15, JSON.stringify(before));
}

/* ============ T4: documented ratio range boundaries ============ */
{
  const cases = [["set invest 15",0.85],["set invest 50",0.5],["set invest 0",1],["set consume 50",0.5],["set consume 100",1],["set consume 85",0.85],["set ratio 0.5",0.5],["set ratio 1",1]];
  for(const [cmd, want] of cases){
    const S = loadApp(); S.boot(); S.clearTerm(); S.runCommand(cmd);
    near("T4 "+cmd+" => consumeShare "+want, S.consumeShare(), want, 1e-9);
  }
  for(const cmd of ["set invest 51","set consume 49","set invest -1","set consume 0"]){
    const S = loadApp(); S.boot(); S.clearTerm(); S.runCommand(cmd);
    near("T4-reject "+cmd, S.consumeShare(), 0.85, 1e-9);
  }
  const S = loadApp(); S.boot();
  S.runCommand("set consume 100");
  S.runCommand("add 100 餐饮 x");
  eq("T4.5 N=100% => no investment needed", S.recStatus(S.state.records[0]).t, "无需");
  near("T4.6 N=100% => occupy == amount", S.periodSnapshot().usedUnits, 100, 0.001);
}

/* ============ T5: import (restoreFromText) parity with loadState ============ */
{
  const legacy = { app:"budget_term", version:1, settings:{ budget:1000, thresholds:[80,100] }, seq:1,
    records:[{ id:1, amount:850, category:"购物", note:"外套", date:"2027-08-04", mm:130, idx:20, mmPaid:true, idxPaid:false, created:"2027-08-04" }] };
  const viaLoad = loadApp({ seedStorage:{ budget_term_v1: JSON.stringify(legacy) } });
  viaLoad.boot();
  const L = viaLoad.state.records[0];
  const S = loadApp(); S.boot(); S.restoreFromText(JSON.stringify(legacy));
  const I = S.state.records[0];
  eq("T5.1 moneyInv parity (legacy mmPaid)", I.moneyInv, L.moneyInv);
  eq("T5.2 indexInv parity", I.indexInv, L.indexInv);
  eq("T5.3 status parity", S.recStatus(I).t, viaLoad.recStatus(L).t);
  eq("T5.4 imported record is fully normalized", [typeof I.moneyInv, typeof I.indexInv], ["number","number"]);
}

/* ============ T6: import replaces settings (no leakage) ============ */
{
  const S = loadApp({ seedStorage:{ budget_term_v1: JSON.stringify({ settings:{ budget:777, dailyBudget:9, consumeShare:0.5, thresholds:[50], periodMode:"rolling", lengthDays:3, anchor:"2027-08-01", epoch:"2027-08-01", monthStart:5, weekStart:"sun", periodBudget:{"2027-08-01":777} }, seq:0, records:[] }) } });
  S.boot();
  const backup = { app:"budget_term", version:2, settings:{ budget:1000 }, seq:0, records:[] };
  S.restoreFromText(JSON.stringify(backup));
  const s = S.state.settings;
  eq("T6.1 dailyBudget reset to default", s.dailyBudget, null);
  eq("T6.2 consumeShare reset to default", s.consumeShare, 0.85);
  eq("T6.3 thresholds reset to default", s.thresholds, [80,100]);
  eq("T6.4 periodMode reset to default", s.periodMode, "month");
  eq("T6.5 monthStart reset to default", s.monthStart, 1);
  eq("T6.6 weekStart reset to default", s.weekStart, "mon");
  eq("T6.7 budget from backup kept", s.budget, 1000);
  eq("T6.8 stale periodBudget overrides dropped", s.periodBudget, {});
}

/* ============ T7: hostile / corrupt imports must not break the app ============ */
{
  const S = loadApp(); S.boot();
  let threw = null;
  try{ S.restoreFromText(JSON.stringify({ app:"budget_term", settings:{ thresholds:null, consumeShare:"x", budget:-5, weekStart:42, periodBudget:null }, seq:"x", records:[{id:"a",amount:"9",category:null,date:"nope"},{id:2,amount:10,category:"餐饮",date:"2027-08-01"}] })); }
  catch(e){ threw = e.message; }
  ok("T7.1 corrupt import does not throw", threw===null, threw);
  let threw2 = null;
  try{ S.runCommand("budget"); S.runCommand("list"); S.runCommand("summary"); S.runCommand("assets"); S.runCommand("forecast"); }
  catch(e){ threw2 = e.message; }
  ok("T7.2 commands still run after corrupt import", threw2===null, threw2);
  const st = S.state.settings;
  ok("T7.3 thresholds sanitized to array", Array.isArray(st.thresholds) && st.thresholds.length>0, JSON.stringify(st.thresholds));
  ok("T7.4 consumeShare sanitized", typeof st.consumeShare==="number" && st.consumeShare>0 && st.consumeShare<=1, String(st.consumeShare));
  ok("T7.5 budget sanitized", typeof st.budget==="number" && st.budget>0, String(st.budget));
  ok("T7.6 bad records dropped or repaired",
     S.state.records.every(r=>typeof r.amount==="number" && r.amount>0 && r.category && /^\d{4}-\d{2}-\d{2}$/.test(r.date)),
     JSON.stringify(S.state.records));
}

/* ============ T8: import must not create duplicate ids ============ */
{
  const S = loadApp(); S.boot();
  S.restoreFromText(JSON.stringify({ app:"budget_term", settings:{}, seq:1, records:[
    {id:5,amount:10,category:"餐饮",date:"2027-08-01"}, {id:2,amount:10,category:"餐饮",date:"2027-08-01"} ] }));
  S.runCommand("add 3 餐饮 x");
  const ids = S.state.records.map(r=>r.id);
  eq("T8.1 no duplicate ids after import+add", ids.length, new Set(ids).size);
  ok("T8.2 new id greater than all existing", S.state.records[S.state.records.length-1].id > 5, JSON.stringify(ids));
}

/* ============ T9: invest pool invariants ============ */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 0.03 餐饮 tiny");
  S.runCommand("add 850 购物 big");
  const pool = S.moneyPending();
  S.doInvestFull("money");
  near("T9.1 money pool fully cleared", S.moneyPending(), 0, 1e-9);
  ok("T9.2 every record fully money-invested", S.state.records.every(r=>S.recFullyMoney(r)), JSON.stringify(S.state.records.map(r=>[r.mm,r.moneyInv])));
  ok("T9.3 sum allocated == pool (no rounding loss)", Math.abs(S.moneyInvestedTotal() - pool) < 0.005, S.moneyInvestedTotal()+" vs "+pool);
  eq("T9.4 index pool untouched", S.r6(S.indexPending()), 20.000706);
  // partial:
  const P = loadApp(); P.boot();
  P.runCommand("add 850 餐饮 big");
  P.investAmount("money", 40);
  near("T9.5 partial invest leaves pool", P.moneyPending(), 90, 1e-6);
  near("T9.6 partial invest recorded", P.moneyInvestedTotal(), 40, 1e-6);
}

/* ============ T10: carry / overspend ledger ============ */
{
  const S = loadApp(); S.boot();
  S.runCommand("set budget 1000");
  S.runCommand("add 850 餐饮 x");
  near("T10.1 occupy == budget", S.periodSnapshot().usedUnits, 1000, 0.01);
  near("T10.2 no carry", S.periodSnapshot().usedUnits - S.periodSnapshot().B, 0, 0.01);
  near("T10.3 balance 0", S.availableBalance(), 0, 0.01);
  S.runCommand("add 85 餐饮 y");
  near("T10.4 overspend carried negative", S.availableBalance(), -100, 0.01);
}

/* ============ T11: undo / redo integrity ============ */
{
  const S = loadApp(); S.boot();
  const before = JSON.stringify(S.state);
  S.runCommand("add 50 餐饮 a");
  ok("T11.1 changed after add", JSON.stringify(S.state)!==before);
  S.undo();
  eq("T11.2 undo restores exactly", JSON.stringify(S.state), before);
  S.redo();
  eq("T11.3 redo re-applies", S.state.records.length, 1);
  S.runCommand("budget set 1200");
  const withBudget = S.state.settings.periodBudget;
  S.undo();
  eq("T11.4 undo removes period override", Object.keys(S.state.settings.periodBudget||{}).length, 0, JSON.stringify(withBudget));
}

/* ============ T12: stale list row after undo must not lie ============ */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 100 餐饮 a");
  S.clearTerm();
  S.runCommand("list");
  const btn = S.term.children[S.term.children.length-2].children.find(c=>c.tagName==="BUTTON");
  ok("T12.1 row button rendered", !!btn);
  S.undo();                      // record no longer exists in state
  S.clearTerm();
  btn.click();                   // clicking the stale row
  const out = S.lines().join("\n");
  ok("T12.2 stale row click warns instead of faking success", /失效|不存在|过期/.test(out), out);
  eq("T12.3 stale click does not resurrect record", S.state.records.length, 0);
}

/* ============ T13: note quoting round-trip ============ */
{
  const S = loadApp(); S.boot();
  S.runCommand('add 50 餐饮 "say \\"hi\\" now"');
  eq("T13.1 quoted note kept intact", S.state.records.length===1 && S.state.records[0].note, "say \"hi\" now");
  const S2 = loadApp(); S2.boot();
  S2.runCommand('add 50 餐饮 a\\\\b');
  eq("T13.2 unquoted backslashes kept literal", S2.state.records[0].note, "a\\\\b");
  const S3 = loadApp(); S3.boot();
  S3.runCommand('add 50 学习 C:\\temp\\a');
  eq("T13.3 windows path note untouched", S3.state.records[0].note, "C:\\temp\\a");
}

/* ============ T14: list filter robustness ============ */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 10 餐饮 a");
  S.clearTerm(); S.runCommand("list @bogus");
  const out = S.lines().join("\n");
  ok("T14.1 unparsable @date warns", /日期|无效|格式/.test(out), out);
}

/* ============ T15: summary with a bare month ref ============ */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 10 餐饮 @2027-07-15");
  S.runCommand("add 20 餐饮 @2027-08-15");
  S.clearTerm(); S.runCommand("summary 2027-07");
  const out = S.lines().join("\n");
  ok("T15.1 bare month selects that month", /2027-07-01 ~ 2027-07-31/.test(out), out);
}

/* ============ T16: settings shown / config ============ */
{
  const S = loadApp(); S.boot();
  S.clearTerm(); S.runCommand("config");
  const out = S.lines().join("\n");
  ok("T16.1 config prints version", out.includes(S.APP_VERSION), out.split("\n")[1]);
}

/* ============ T17: rolling + month windows, summaries ============ */
{
  const S = loadApp(); S.boot();
  S.runCommand("set period 15");
  S.runCommand("set periodstart 2027-08-01");
  S.runCommand("add 10 餐饮 @2027-08-01");
  S.runCommand("add 20 交通 @2027-08-16");
  const p = S.currentPeriod();
  eq("T17.1 rolling window", [p.start,p.end], ["2027-08-16","2027-08-30"]);
  const w = S.collectWindow(p.start,p.end);
  near("T17.2 window total", w.total, 20, 1e-9);
  const m = S.calendarMonthBounds("2027-08-16");
  eq("T17.3 calendar month", [m.start,m.end], ["2027-08-01","2027-08-31"]);   // 8 月为 31 天
}

/* ============ T18: assets / forecast robustness ============ */
{
  const S = loadApp(); S.boot();
  S.clearTerm(); S.runCommand("assets 10");
  let out = S.lines().join("\n");
  ok("T18.1 assets renders without NaN", !/NaN|Infinity/.test(out), out);
  S.clearTerm(); S.runCommand("forecast");
  out = S.lines().join("\n");
  ok("T18.2 forecast renders without NaN", !/NaN|Infinity/.test(out), out);
  S.runCommand("set rate index 8");
  S.runCommand("set rate money 2");
  S.clearTerm(); S.runCommand("assets 20");
  ok("T18.3 assets with rates ok", !/NaN|Infinity/.test(S.lines().join("\n")));
}

/* ============ T19: export report sanity ============ */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 100 餐饮 x");
  const md = S.buildReportText(true), txt = S.buildReportText(false);
  ok("T19.1 markdown has heading", md.startsWith("# BUDGET::TERM"));
  ok("T19.2 txt has no markdown bold", !txt.includes("**"));
  ok("T19.3 no NaN in export", !/NaN/.test(md+txt));
}

/* ============ T20: persistence round trip ============ */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 100 餐饮 x");
  const text = S.serializeState();
  const T = loadApp(); T.boot();
  T.restoreFromText(text);
  eq("T20.1 records survive export/import", T.state.records.length, 1);
  eq("T20.2 amount survives", T.state.records[0].amount, 100);
}

/* ============ T28: 分摊成本 (amort) —— 每天计消费, 投资只按总价记一次 ============ */
{
  const S = loadApp(); S.boot();          // 冻结时钟默认 2027-08-30
  S.runCommand("amort 3000 365 房租 年付");
  eq("T28.1 只记一条记录", S.state.records.length, 1);
  const r = S.state.records[0];
  eq("T28.2 记入的是每天金额(总价÷天数)", r.amount, S.r2(3000/365));
  eq("T28.3 天数与总价字段", [r.amortDays, r.amortTotal], [365, 3000]);
  ok("T28.4 类别/备注/日期照常", r.category==="房租" && r.note==="年付" && r.date==="2027-08-30", JSON.stringify(r));
  eq("T28.5 应投按总价一次记入(不分摊)", [r.mm, r.idx], [S.investOf(3000).mm, S.investOf(3000).idx]);
  /* 核心恒等式: Σ(每天 ÷ 消费占比) == 总价 ÷ 消费占比, 即"投资只记总数"不会少算 */
  near("T28.6 等额普通消费记录应投与摊消失相等",
       r.mm + r.idx, S.investOf(3000).mm + S.investOf(3000).idx, 1e-9);
  eq("T28.7 投资池按总数累计", [S.moneyPending(), S.indexPending()], [r.mm, r.idx]);
  const st = S.periodSnapshot();
  eq("T28.8 本期消费只计一天(不是总价)", st.consumption, r.amount);
  eq("T28.9 状态与普通记录同一套", S.recStatus(r).t, "未投");
  /* 每天/总价读取入口对旧记录必须等价(amount 本身就是总额) */
  S.runCommand("add 500 餐饮 普通");
  const plain = S.state.records[1];
  eq("T28.10 普通记录的 recTotal 就是 amount", S.recTotal(plain), 500);
  eq("T28.11 普通记录的 recDays 是 1", S.recDays(plain), 1);
  ok("T28.12 只有分摊记录被标记为已分摊", S.recAmortized(r) && !S.recAmortized(plain));

  /* 天数写法: 天数 / 月 / 边界 / 非法 */
  const A = loadApp(); A.boot();
  A.runCommand("amort 600 12月 会员");
  eq("T28.13 '12月' = 12×30 天", A.state.records[0].amortDays, 360);
  eq("T28.14 '12月' 的每天金额", A.state.records[0].amount, A.r2(600/360));
  A.runCommand("amort 300 3m 会员");
  eq("T28.15 '3m' 也按 30 天/月", A.state.records[1].amortDays, 90);
  A.clearTerm(); A.runCommand("amort 100 1 餐饮");    // 天数 < 2
  ok("T28.16 天数过小被拒", !/✓/.test(A.lines().join("\n")) && A.state.records.length===2, A.lines().join("|"));
  A.clearTerm(); A.runCommand("amort 4000000 99999 餐饮");  // 天数超上限(而且大到"每天也够")
  ok("T28.17 天数超上限被拒(不是靠每天金额拦下来的)", !/✓/.test(A.lines().join("\n")) && A.state.records.length===2, A.lines().join("|"));
  A.clearTerm(); A.runCommand("amort 3650 3650 餐饮");       // 上限本身必须放行
  ok("T28.17b 上限 3650 天放行", /✓/.test(A.lines().join("\n")) && A.state.records.length===3, A.lines().join("|"));
  A.clearTerm(); A.runCommand("amort 0.05 100 餐饮");   // 每天 < 0.01 → 会被记成 0
  ok("T28.18 每天不足 ¥0.01 被拒", !/✓/.test(A.lines().join("\n")) && A.state.records.length===3, A.lines().join("|"));
  A.clearTerm(); A.runCommand("amort 300 365");         // 缺类别
  ok("T28.19 缺参数给用法提示", /用法: amort/.test(A.lines().join("\n")), A.lines().join("|"));

  /* set invest 后按总价重算应投额, 且已投金额被正确封顶 */
  const B = loadApp(); B.boot();
  B.runCommand("amort 3000 365 房租");
  B.runCommand("pay 1 all");
  B.runCommand("set invest 10");                       // 消费占比 0.90 → 应投变小
  const br = B.state.records[0];
  eq("T28.20 改比例后按总价重算应投", br.mm, B.investOf(br.amortTotal).mm);
  ok("T28.21 已投金额被新应投封顶", br.moneyInv <= br.mm + 1e-9, JSON.stringify([br.moneyInv, br.mm]));

  /* update: 金额位对分摊记录解释为"每天", 总价同步重算 */
  const C = loadApp(); C.boot();
  C.runCommand("amort 3000 365 房租");
  C.runCommand("update 1 12 房租 改价");
  const cr = C.state.records[0];
  eq("T28.22 update 改的是每天金额", cr.amount, 12);
  eq("T28.23 总价随每天金额同步重算", cr.amortTotal, C.r2(12*365));
  eq("T28.24 应投按新总价重算", cr.mm, C.investOf(C.r2(12*365)).mm);
  eq("T28.25 update 不丢分摊天数", cr.amortDays, 365);

  /* 归一化: 旧记录/坏字段都不得变形(老备份必须永远能导入) */
  const legacy = S.normalizeRecords([{ id:1, amount:100, category:"餐饮", date:"2027-08-01" }]).records[0];
  eq("T28.26 旧记录按 1 天处理", [legacy.amortDays, legacy.amortTotal, legacy.amount], [1, 100, 100]);
  const bad = S.normalizeRecords([{ id:1, amount:10, category:"餐饮", date:"2027-08-01", amortDays:0, amortTotal:0 }]).records[0];
  eq("T28.27 非法天数回落普通消费", [bad.amortDays, bad.amortTotal], [1, 10]);
  const noTotal = S.normalizeRecords([{ id:1, amount:10, category:"餐饮", date:"2027-08-01", amortDays:30 }]).records[0];
  eq("T28.28 缺总价时按每天×天数补回", [noTotal.amortDays, noTotal.amortTotal], [30, 300]);
  eq("T28.29 缺总价的应投按补回的总价算", noTotal.mm, S.investOf(300).mm);
  /* 备份往返: 分摊字段必须原样保留 */
  const D = loadApp(); D.boot();
  D.runCommand("amort 3000 365 房租 年付");
  const txt = D.serializeState();
  const E = loadApp(); E.boot(); E.restoreFromText(txt);
  const er = E.state.records[0];
  eq("T28.30 备份往返后分摊字段不变", [er.amortDays, er.amortTotal, er.amount], [365, 3000, D.r2(3000/365)]);
  eq("T28.31 备份往返后应投不变", [er.mm, er.idx], [D.state.records[0].mm, D.state.records[0].idx]);
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length? 1 : 0);
