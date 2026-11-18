// v0.0.15 周期设置专项护栏:
//   命令从 set 收进 config(set period / periodstart / periodend), 新增「配置 ▾ → 配置周期」弹窗,
//   周期天数一律由起止日期自动算出并同步(命令与弹窗同一套 setter, 一步撤销)。
import fs from "node:fs";
import { loadApp } from "./app.mjs";
import { HTML_PATH, README_PATH } from "./env.mjs";

const html = fs.readFileSync(HTML_PATH, "utf8");
const readme = fs.readFileSync(README_PATH, "utf8");   // 变异体只换 HTML, README 始终取本仓库的

let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
const mk = () => { const S = loadApp(); S.boot(); return S; };
/* 冻结时钟: 所有套件都是 2027-08-30(见 tests/app.mjs), 断言里的日期必须按它写 */
const TODAY = "2027-08-30";

/* ---------- 1. 命令登记与 help ---------- */
{
  const S = mk();
  const subs = S.COMMANDS.filter(c=>c.sub).map(c=>c.u);
  ok("P1.1 登记了 config set period <N天>", subs.some(u=>/^config set period <N天>/.test(u)), subs.join(" | "));
  ok("P1.2 登记了 config set periodstart", subs.some(u=>/^config set periodstart/.test(u)), "");
  ok("P1.3 登记了 config set periodend", subs.some(u=>/^config set periodend/.test(u)), "");
  ok("P1.4 登记了 config set period <起> <止>", subs.some(u=>/^config set period <起> <止>/.test(u)), "");
  ok("P1.5 help 不再把 set period 当推荐写法", !subs.some(u=>/^set period/.test(u)), subs.filter(u=>/set period/.test(u)).join(" | "));

  S.clearTerm(); S.runCommand("help");
  const help = S.lines().join("\n");
  ok("P1.6 help 含 config set period", /config set period <N天>/.test(help), "");
  ok("P1.7 help 含 config set periodend", /config set periodend/.test(help), "");
  ok("P1.8 set 主行说明指向 config", /周期请用 config set/.test(help), help.split("\n").filter(l=>/^\s+set\s/.test(l)).join("|"));
}

/* ---------- 2. config set period <N天> / natural ---------- */
{
  const S = mk();
  S.clearTerm(); S.runCommand("config set period 15");
  const st = S.state.settings;
  eq("P2.1 切到滚动 15 天", [st.periodMode, st.lengthDays], ["rolling", 15]);
  eq("P2.2 起点缺省=今天", st.anchor, TODAY);
  eq("P2.3 当期天数=15", S.periodDayCount(S.currentPeriod()), 15);
  ok("P2.4 输出当前配置表(含周期模式)", /周期模式/.test(S.lines().join("\n")), S.lines().join("|").slice(0,120));

  S.clearTerm(); S.runCommand("config set period natural");
  eq("P2.5 natural 回到按月", S.state.settings.periodMode, "month");
  eq("P2.6 按月区间=自然月", S.currentPeriod().label, "2027-08-01 ~ 2027-08-31");

  S.clearTerm(); S.runCommand("config set period 1");
  ok("P2.7 天数 <2 被拒(提示用法)", /用法: config set period/.test(S.lines().join("\n")), S.lines().join("|"));
  eq("P2.8 被拒后设置不变", S.state.settings.periodMode, "month");
  S.clearTerm(); S.runCommand("config set period 91");
  ok("P2.9 快捷天数 >90 被拒", /用法: config set period/.test(S.lines().join("\n")), S.lines().join("|"));
}

/* ---------- 3. config set period <起> <止>: 天数自动算出 ---------- */
{
  const S = mk();
  S.clearTerm(); S.runCommand("config set period 2027-08-16 2027-09-15");
  const st = S.state.settings;
  eq("P3.1 起止日写入锚点", [st.periodMode, st.anchor], ["rolling", "2027-08-16"]);
  eq("P3.2 天数 = 止−起+1 自动算出", st.lengthDays, 31);
  eq("P3.3 当期就是所写区间", S.currentPeriod().label, "2027-08-16 ~ 2027-09-15");
  eq("P3.4 一步撤销(单条命令)", S.undoDepth, 1);

  /* 以前 normalizeSettings 把 lengthDays 钳在 2~90 —— 起止日直设出来的 120 天周期会"存得住、重启回落成 15 天" */
  const T = mk();
  T.runCommand("config set period 2027-08-01 2027-11-28");     // 120 天
  const dump = T.__storage.getItem("budget_term_v1");
  const U = loadApp({ seedStorage:{ budget_term_v1: dump } }); U.boot();
  eq("P3.5 120 天周期重启后仍保留(旧 90 天上限会回落 15)", [U.state.settings.lengthDays, U.state.settings.anchor], [120, "2027-08-01"]);
}

/* ---------- 4. 起止日必须包含今天 / 最长 366 天 ---------- */
{
  const S = mk();
  S.clearTerm(); S.runCommand("config set period 2027-07-01 2027-07-31");
  ok("P4.1 不含今天的区间被拒", /必须包含今天/.test(S.lines().join("\n")), S.lines().join("|"));
  eq("P4.2 被拒后仍是按月自然月", [S.state.settings.periodMode, S.currentPeriod().label], ["month", "2027-08-01 ~ 2027-08-31"]);

  S.clearTerm(); S.runCommand("config set period 2027-08-30 2028-12-31");
  ok("P4.3 超过 366 天被拒", /周期过长/.test(S.lines().join("\n")), S.lines().join("|"));

  S.clearTerm(); S.runCommand("config set period 2027-09-10 2027-09-20");
  ok("P4.4 区间不含今天(全在未来)同样被拒", /必须包含今天/.test(S.lines().join("\n")), S.lines().join("|"));

  S.clearTerm(); S.runCommand("config set period 2027-08-30 2027-08-30");
  ok("P4.5 同一天的 1 天周期被拒", /至少晚 1 天/.test(S.lines().join("\n")), S.lines().join("|"));
}

/* ---------- 5. config set periodstart / periodend ---------- */
{
  const S = mk();
  S.runCommand("config set period 2027-08-16 2027-09-15");   // 31 天
  S.clearTerm(); S.runCommand("config set periodend 2027-09-30");
  const st = S.state.settings;
  eq("P5.1 截止日精确等于输入", [S.currentPeriod().start, S.currentPeriod().end], ["2027-08-16", "2027-09-30"]);
  eq("P5.2 天数按新截止日回算", st.lengthDays, 46);
  eq("P5.3 锚点仍为本期起点", st.anchor, "2027-08-16");

  S.clearTerm(); S.runCommand("config set periodend 2027-12-31");
  eq("P5.4 拉到半年也允许(≤366 天)", S.state.settings.lengthDays, 138);

  S.clearTerm(); S.runCommand("config set periodend 2027-08-01");
  ok("P5.5 截止日早于起点被拒", /至少晚 1 天|不能早于今天/.test(S.lines().join("\n")), S.lines().join("|"));
  eq("P5.6 被拒后设置不变", [S.currentPeriod().start, S.currentPeriod().end], ["2027-08-16", "2027-12-31"]);

  S.clearTerm(); S.runCommand("config set periodstart 2027-08-20");
  eq("P5.7 只改起点: 天数不变", S.state.settings.lengthDays, 138);
  eq("P5.8 截止日随起点顺延", S.currentPeriod().label, "2027-08-20 ~ 2028-01-04");

  S.clearTerm(); S.runCommand("config set periodstart 2027-13-40");
  ok("P5.9 非法日期被拒(不静默落库)", /日期无效/.test(S.lines().join("\n")), S.lines().join("|"));
  eq("P5.10 非法日期不改变锚点", S.state.settings.anchor, "2027-08-20");
}

/* ---------- 6. 旧写法兼容(set period / set periodstart / set periodend) ---------- */
{
  const S = mk();
  S.clearTerm(); S.runCommand("set period 15");
  ok("P6.1 旧写法 set period 15 仍可用", S.state.settings.periodMode==="rolling" && S.state.settings.lengthDays===15);
  S.clearTerm(); S.runCommand("set periodstart 2027-08-01");
  eq("P6.2 旧写法 set periodstart 仍可用", S.state.settings.anchor, "2027-08-01");
  S.clearTerm(); S.runCommand("set periodend 2027-09-14");
  eq("P6.3 旧写法 set periodend 仍可用(天数回算)", [S.currentPeriod().start, S.currentPeriod().end, S.state.settings.lengthDays], ["2027-08-16", "2027-09-14", 30]);
  S.clearTerm(); S.runCommand("set period natural");
  eq("P6.4 旧写法 natural 仍回按月", S.state.settings.periodMode, "month");
}

/* ---------- 7. 「配置 ▾ → 配置周期」弹窗 ---------- */
{
  const S = mk();
  const d = (id)=>S.__doc.getElementById(id);
  ok("P7.1 下拉里有「配置周期」按钮", /data-config="period"[^>]*>配置周期/.test(html), "");
  ok("P7.2 周期弹窗在 MODAL_IDS 里(浮层互斥管得到)", S.MODAL_IDS.includes("periodWrap"), S.MODAL_IDS.join(","));

  S.openBudgetModal();
  S.openPeriodModal();
  ok("P7.3 打开周期弹窗会先关掉其它弹窗", !d("budgetWrap").classList.contains("open") && d("periodWrap").classList.contains("open"), "");

  // 默认设置是"按月" → 起止日只读, 由月起始日决定
  eq("P7.4 按月模式下周期模式标记", S.periodModalMode, "month");
  ok("P7.5 按月模式起止日只读", d("p_start").disabled===true && d("p_end").disabled===true, "");
  ok("P7.6 按月模式天数=当月天数", /共 31 天/.test(d("p_meta").textContent), d("p_meta").textContent);

  // 切到自定义: 起止日可编辑, 天数随输入实时重算
  S.setPeriodModalMode("rolling");
  ok("P7.7 自定义模式起止日可编辑", d("p_start").disabled===false && d("p_end").disabled===false, "");
  d("p_end").value = "2027-09-30";
  S.updatePeriodModal();
  ok("P7.8 天数随截止日实时重算(61 天)", /共 61 天/.test(d("p_meta").textContent), d("p_meta").textContent);
  d("p_start").value = "2027-08-20";
  S.updatePeriodModal();
  ok("P7.9 天数随起始日实时重算(42 天)", /共 42 天/.test(d("p_meta").textContent), d("p_meta").textContent);

  d("p_start").value = "2027-09-10";        // 起点跑到今天之后 → 不是"本期"
  S.updatePeriodModal();
  ok("P7.10 非法区间给红字提示", /必须包含今天/.test(d("p_hint").textContent) && /bad/.test(d("p_hint").className), d("p_hint").textContent);
  S.savePeriodModal();
  ok("P7.11 校验失败不关窗、不落数据", d("periodWrap").classList.contains("open") && S.state.settings.periodMode==="month", String(S.state.settings.periodMode));
  eq("P7.12 校验失败不压撤销栈", S.undoDepth, 0);

  // 合法保存: 一条命令、一步撤销、与命令行同一口径
  d("p_start").value = "2027-08-20"; S.updatePeriodModal();
  S.savePeriodModal();
  ok("P7.13 保存后关窗", !d("periodWrap").classList.contains("open"), "");
  eq("P7.14 弹窗保存 = config set period <起> <止>",
     [S.state.settings.periodMode, S.state.settings.lengthDays, S.currentPeriod().label],
     ["rolling", 42, "2027-08-20 ~ 2027-09-30"]);
  eq("P7.15 弹窗保存只压一步撤销", S.undoDepth, 1);

  // 按月模式保存 = config set period natural
  S.openPeriodModal();
  S.setPeriodModalMode("month");
  S.savePeriodModal();
  eq("P7.16 按月模式保存回到自然月", [S.state.settings.periodMode, S.currentPeriod().label], ["month", "2027-08-01 ~ 2027-08-31"]);
}

/* ---------- 8. config 输出与补全 ---------- */
{
  const S = mk();
  S.runCommand("config set periodend 2027-09-13");
  S.clearTerm(); S.runCommand("config");
  const out = S.lines().join("\n");
  ok("P8.1 config 输出「当前周期」行", /当前周期\s+2027-08-01 ~ 2027-09-13/.test(out), out.split("\n").filter(l=>/周期/.test(l)).join("|"));
  ok("P8.2 config 输出当前周期天数", /共 44 天/.test(out), out.split("\n").filter(l=>/周期/.test(l)).join("|"));
  ok("P8.3 config 的周期模式行指向配置周期入口", /配置 ▾ → 配置周期/.test(out), "");

  eq("P8.4 补全: config 首槽给 set", S.argCandidates("config",1,["config",""],""), ["set"]);
  const sub1 = S.argCandidates("config",2,["config","set",""],"");
  ok("P8.5 补全: 子名含 period/periodstart/periodend",
     ["period","periodstart","periodend"].every(x=>sub1.includes(x)), sub1.join(","));
  const pv = S.argCandidates("config",3,["config","set","period",""],"");
  ok("P8.6 补全: period 值槽含 natural 与天数", pv.includes("natural") && pv.includes("15"), pv.join(","));
  const ev = S.argCandidates("config",3,["config","set","periodend",""],"");
  ok("P8.7 补全: periodend 值槽给 ISO 日期", ev.every(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)) && ev.length>0, ev.join(","));
}

/* ---------- 9. 归一化护栏: 大周期不被 90 天旧上限吃掉 ---------- */
{
  const S = mk();
  const st = S.normalizeSettings({ periodMode:"rolling", lengthDays:120, anchor:"2027-08-01" });
  eq("P9.1 归一化保留 120 天周期", st.lengthDays, 120);
  const st2 = S.normalizeSettings({ periodMode:"rolling", lengthDays:500, anchor:"2027-08-01" });
  eq("P9.2 超过 366 天回落默认 15", st2.lengthDays, 15);
  const st3 = S.normalizeSettings({ periodMode:"rolling", lengthDays:1, anchor:"2027-08-01" });
  eq("P9.3 <2 天回落默认 15", st3.lengthDays, 15);
}

/* ---------- 10. README 同步 ---------- */
{
  ok("P10.1 README 命令表记录 config set period", /`config set period <N天>`/.test(readme), "");
  ok("P10.2 README 记录 config set periodend", /`config set periodend/.test(readme), "");
  ok("P10.3 README 记录「配置周期」入口", /配置 ▾ → 配置周期/.test(readme), "");
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length ? 1 : 0);
