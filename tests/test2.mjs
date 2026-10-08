import fs from "node:fs";
import { loadApp } from "./app.mjs";
import { doc } from "./dom.mjs";
import { FIXTURE_PATH } from "./env.mjs";

/* 默认夹具是**合成**账本(见 tests/README.md); BT_FIXTURE 可指向真实备份 */
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
function near(name, a, b, eps=1e-6){ ok(name, Math.abs(a-b)<=eps, "got "+a+" want "+b); }

/* ---- T21: header must refresh when settings that feed it change ---- */
{
  const S = loadApp(); S.boot();
  const header = ()=> doc.getElementById("statusbar").textContent;
  ok("T21.0 header initial budget 1000", header().includes("1000.00"), header());
  S.runCommand("set budget 2000");
  ok("T21.1 set budget refreshes header", header().includes("2000.00"), header());
  S.runCommand("budget set 3000");
  ok("T21.2 budget set refreshes header", header().includes("3000.00"), header());
  S.runCommand("set monthstart 15");
  ok("T21.3 set monthstart refreshes header", /月15日起|15 日/.test(header()), header());
  S.runCommand("set alert 90,100");
  ok("T21.4 alert thresholds drive dots", S.r2(S.state.settings.thresholds[0])===90, JSON.stringify(S.state.settings.thresholds));
}
/* ratioDot / alertWord thresholds */
{
  const D = loadApp(); D.boot(); D.runCommand("set alert 90,100");
  eq("T21.5 85% under 90/100 is green", D.ratioDot(0.85).cls, "g");
  eq("T21.6 95% under 90/100 is yellow", D.ratioDot(0.95).cls, "y");
  eq("T21.7 100% is red", D.ratioDot(1.0).cls, "r");
  eq("T21.8 unset daily budget is grey", D.ratioDot(null).cls, "n");
  const E = loadApp(); E.boot(); E.runCommand("set alert 70,80");
  eq("T21.9 custom thresholds respected", [E.ratioDot(0.72).cls, E.ratioDot(0.85).cls], ["y","r"]);
  const F = loadApp(); F.boot();
  F.restoreFromText(JSON.stringify({ app:"budget_term", settings:{ thresholds:null }, records:[] }));
  eq("T21.10 corrupt thresholds fall back", F.state.settings.thresholds, [80,100]);
}

/* ---- T22: daily budget live preview in the modal ---- */
{
  const S = loadApp(); S.boot();
  S.runCommand("set daily 100");
  S.runCommand("add 60 餐饮 lunch");
  const inp = doc.getElementById("b_daily");
  const hint = doc.getElementById("b_daily_hint");
  inp.value = "50";
  inp.dispatch("input", {target:inp});
  ok("T22.1 preview follows typed value", /保存后/.test(hint.textContent) && hint.textContent.includes("50.00"), hint.textContent);
  ok("T22.2 preview shows red-over state", /已超额/.test(hint.textContent), hint.textContent);
  inp.value = "";
  inp.dispatch("input", {target:inp});
  ok("T22.3 empty input falls back to saved value", hint.textContent.includes("100.00"), hint.textContent);
  inp.value = "0";
  inp.dispatch("input", {target:inp});
  ok("T22.4 invalid typed value falls back", /未设置|100.00/.test(hint.textContent), hint.textContent);
}

/* ---- T23: fixture: full command smoke, no crash / no NaN ---- */
{
  const S = loadApp({ seedStorage:{ budget_term_v1: JSON.stringify(fixture) } });
  S.boot();
  const cmds = ["help","config","budget","forecast","assets 15","list","list @period","list @today","list @month",
                "list 餐饮","list 餐饮 @2027-08","list @2027-08-04","summary","summary day","summary week","summary month",
                "summary cat","summary 餐饮","summary month 2027-07","pay 1 all","pay 1 none","pay 2 mm","update 3 9 交通 地铁2",
                "del 4","undo","redo","set invest 20","set invest 15","set alert 75,90,100","budget reset"];
  let err = null;
  for(const c of cmds){
    try{ S.runCommand(c); }catch(e){ err = c + " -> " + e.message; break; }
  }
  ok("T23.1 fixture smoke: no exception", err===null, err);
  const out = S.lines().join("\n");
  ok("T23.2 fixture smoke: no NaN/Infinity", !/NaN|Infinity/.test(out), (out.match(/.*(NaN|Infinity).*/)||[""])[0]);
  ok("T23.3 fixture smoke: no [ERR] lines", !/\[ERR\]/.test(out), (out.match(/\[ERR\].*/)||[""])[0]);
  const rep = S.buildReportText(true);
  ok("T23.4 export has no NaN", !/NaN/.test(rep));
}

/* ---- T24: fixture ledger numbers are coherent ---- */
{
  const S = loadApp({ seedStorage:{ budget_term_v1: JSON.stringify(fixture) } });
  S.boot();
  const p = S.currentPeriod();
  eq("T24.1 chain is grid aligned", S.periodStartsUpTo(p.start), ["2027-07-30","2027-08-15"]);
  near("T24.2 granted = default + override", S.grantedTotal(), 2100, 0.001);
  ok("T24.3 balance = granted - charge", Math.abs(S.availableBalance() - S.r2(S.grantedTotal()-S.totalCharge())) < 0.005);
  S.clearTerm(); S.runCommand("budget");
  const out = S.lines().join("\n");
  ok("T24.4 printed balance matches availableBalance", out.includes("¥"+S.money(S.availableBalance())), out.split("\n").filter(l=>/累计可用余额/.test(l))[0]);
}

/* ---- T25: pay / update / del flows ---- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 850 餐饮 x");
  const r = S.state.records[0];
  S.runCommand("pay 1 all");
  eq("T25.1 pay all invests both", [r.moneyInv,r.indexInv], [r.mm,r.idx]);
  S.runCommand("pay 1 none");
  eq("T25.2 pay none resets", [r.moneyInv,r.indexInv], [0,0]);
  S.runCommand("pay 1 mm");
  eq("T25.3 pay mm only", [S.recFullyMoney(r), S.recFullyIndex(r)], [true,false]);
  eq("T25.4 status partial", S.recStatus(r).t, "部分");
  S.runCommand("update 1 100 餐饮 y");
  near("T25.5 update recomputes 应投", r.mm, S.investOf(100).mm, 1e-9);
  ok("T25.6 invested capped at new 应投", r.moneyInv <= r.mm + 1e-9, JSON.stringify([r.moneyInv,r.mm]));
  S.runCommand("del 1");
  eq("T25.7 del removes", S.state.records.length, 0);
  S.undo();
  eq("T25.8 undo restores deletion", S.state.records.length, 1);
}

/* ---- T26: list row button toggles and reflects state ---- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 100 餐饮 a");
  S.clearTerm(); S.runCommand("list");
  const row = S.term.children.find(c=>c.textContent.includes("#1") && c.children.some(x=>x.tagName==="BUTTON"));
  const btn = row.children.find(c=>c.tagName==="BUTTON");
  eq("T26.1 initial label", btn.textContent, "标记已投资");
  btn.click();
  eq("T26.2 after click label", btn.textContent, "已投资 ✓");
  ok("T26.3 state invested", S.recFullyMoney(S.state.records[0]) && S.recFullyIndex(S.state.records[0]));
  btn.click();
  eq("T26.4 toggles back", btn.textContent, "标记已投资");
  S.undo();                       // revert the toggle
  btn.click();                    // row is now stale
  ok("T26.5 stale row is marked dead", btn.textContent==="已失效" || /失效/.test(S.lines().join("\n")), btn.textContent);
}

/* ---- T27: persistence round trip through localStorage ---- */
{
  const S = loadApp(); S.boot();
  S.runCommand("set period 15");
  S.runCommand("set periodstart 2027-08-01");
  S.runCommand("budget set 1200");
  S.runCommand("set daily 100");
  S.runCommand("add 300 餐饮 x");
  const dump = S.__storage.getItem("budget_term_v1");
  const T = loadApp({ seedStorage:{ budget_term_v1: dump } });
  T.boot();
  eq("T27.1 settings survive reload", [T.state.settings.periodMode, T.state.settings.lengthDays, T.state.settings.anchor, T.state.settings.dailyBudget],
     ["rolling",15,"2027-08-01",100]);
  eq("T27.2 override survives reload", T.state.settings.periodBudget, {"2027-08-16":1200});
  eq("T27.2b current period owns the override", T.currentPeriod().start, "2027-08-16");
  near("T27.3 balance stable across reload", T.availableBalance(), S.availableBalance(), 0.005);
  eq("T27.4 records survive reload", T.state.records.length, 1);
  ok("T27.5 epoch is grid aligned after reload", T.periodBounds(T.state.settings.epoch).start === T.state.settings.epoch, T.state.settings.epoch + " -> " + T.periodBounds(T.state.settings.epoch).start);
}

/* ---- T28: ratio change edge (N=100% then back) ---- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 850 餐饮 x");
  S.runCommand("pay 1 all");
  S.runCommand("set consume 100");
  eq("T28.1 no-invest mode", [S.state.records[0].mm, S.state.records[0].idx], [0,0]);
  eq("T28.2 status 无需", S.recStatus(S.state.records[0]).t, "无需");
  eq("T28.3 pools empty", [S.moneyPending(), S.indexPending()], [0,0]);
  S.clearTerm(); S.runCommand("budget");
  ok("T28.4 budget renders at N=100%", !/NaN/.test(S.lines().join("\n")), S.lines().join("\n"));
  S.runCommand("set invest 15");
  near("T28.5 back to 13%/2%", S.state.records[0].mm, 130, 1e-6);
  eq("T28.6 paid state dropped with 应投=0 baseline", S.state.records[0].moneyInv, 0);
}

/* ---- T29: duplicate ids never appear ---- */
{
  const S = loadApp(); S.boot();
  S.restoreFromText(JSON.stringify({ app:"budget_term", settings:{}, seq:"x", records:[
    {id:5,amount:10,category:"餐饮",date:"2027-08-01"},{id:5,amount:11,category:"餐饮",date:"2027-08-02"},
    {amount:12,category:"餐饮",date:"2027-08-03"},{id:-3,amount:13,category:"餐饮",date:"2027-08-04"}] }));
  const ids = S.state.records.map(r=>r.id);
  eq("T29.1 ids unique", ids.length, new Set(ids).size);
  ok("T29.2 ids positive", ids.every(i=>i>0), JSON.stringify(ids));
  S.runCommand("add 1 餐饮 z");
  const all = S.state.records.map(r=>r.id);
  eq("T29.3 add after import unique", all.length, new Set(all).size, JSON.stringify(all));
}

/* ---- T30: bad import keeps the app usable and warns ---- */
{
  const S = loadApp(); S.boot();
  S.clearTerm();
  S.restoreFromText(JSON.stringify({ app:"budget_term", settings:{}, records:[
    {id:1,amount:"oops",category:"餐饮",date:"2027-08-01"},
    {id:2,amount:20,category:null,date:"nope"},
    {id:3,amount:30,category:"交通",date:"2027-08-02"}] }));
  const txt = S.lines().join("\n");
  ok("T30.1 warns about skipped records", /跳过|无效/.test(txt), txt);
  eq("T30.2 only usable record kept", S.state.records.length, 1);
  eq("T30.3 category defaulted", S.state.records[0].category, "交通");
  let err=null; try{ S.runCommand("list"); S.runCommand("budget"); }catch(e){ err=e.message; }
  ok("T30.4 app still works", err===null, err);
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length? 1 : 0);


