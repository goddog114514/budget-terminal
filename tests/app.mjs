// Loads budget-terminal/index.html, executes its inline script against the DOM stub,
// and exposes internal functions so tests can drive the app headlessly.
import fs from "node:fs";
import { doc, makeLocalStorage, dumpLines, El } from "./dom.mjs";
/* 路径解析集中在 env.mjs: 原先 app/test3/test4/gen-* 各写了一份绝对路径 */
import { HTML_PATH } from "./env.mjs";

export function loadApp(opts = {}){
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if(!m) throw new Error("no <script> block found");
  const code = m[1];

  const localStorage = makeLocalStorage(opts.seedStorage || {});
  const window = {
    _listeners: {},
    addEventListener(t,fn){ (this._listeners[t]=this._listeners[t]||[]).push(fn); },
    removeEventListener(){},
  };
  const out = [];
  const consoleStub = { log:(...a)=>out.push(a.join(" ")), error:(...a)=>out.push("ERR "+a.join(" ")), warn:(...a)=>out.push("WARN "+a.join(" ")) };
  const getComputedStyle = () => ({ font:"15px monospace" });
  const URLStub = { createObjectURL:()=> "blob:stub", revokeObjectURL(){} };

  /* 冻结"今天": 这个应用大量逻辑以 todayYMD() 为基准(周期窗口/摘要/燃尽),
     测试里必须可复现 —— 否则换一天跑就会出现"随日历漂移"的假失败。 */
  const frozen = opts.now || "2027-08-30";
  const FakeDate = (function(){
    const Real = Date;
    const [Y,M,D] = frozen.split("-").map(Number);
    const frozenMs = new Real(Y, M-1, D, 12, 0, 0).getTime();
    return class FakeDate extends Real {
      constructor(...args){ if(args.length===0) super(frozenMs); else super(...args); }
      static now(){ return frozenMs; }
      static UTC(...a){ return Real.UTC(...a); }
      static parse(s){ return Real.parse(s); }
    };
  })();

  const expose = `
  ;return {
    get state(){ return state; },
    set state(v){ state = v; },
    runCommand, dispatch, boot, loadState, save,
    periodBounds, currentPeriod, calendarMonthBounds, weekBounds, periodDayCount,
    grantedTotal, availableBalance, totalCharge, periodStartsUpTo, nextPeriodStart, ensureEpoch,
    effectiveBudget, hasBudgetOverride, periodSnapshot,
    investOf, moneyPending, indexPending, moneyInvestedTotal, indexInvestedTotal,
    investAmount, investFull, recStatus, recFullyMoney, recFullyIndex, recNoNeed,
    recDays, recTotal, recAmortized, parseDaysToken, amortSplitLine,
    recWindow, recDaysInRange, recInWindow, recAmountInRange, recAmountUpToToday,
    sumRange, collectWindow, investTotalsOf,
    setModalTab, updateAmortHint, submitModal, submitAmort, openAdd,
    get modalTab(){ return modalTab; },
    filterByTokens, normDateText, parseSummaryArgs, forecastData,
    buildReportText, serializeState, restoreFromText, recomputeAllInvest,
    doInvestFull, undo, redo, applyState,
    consumeShare, investShare, rateSplit, consumePct, invPct, mmPct, idxPct,
    ratioDot, todaySnapshot, normalizeSettings, normalizeRecords, repairDate, barLevel, alertWord,
    COLOR, CAT_PALETTE, kvRow, kvColWidth, termCols, KV_MIN, KV_MAX,
    COMMANDS, CMD_ALIAS, COMMAND_NAMES, CMD_WORDS, canonicalCmd, argCandidates, printHelp,
    completionCandidates, currentGhostSuffix,
    money, r2, r6, daysBetween, addDaysYMD, addMonths, lastDay, parseYMD, todayYMD, mkYMD,
    get term(){ return term; },
    get undoDepth(){ return undoStack.length; },
    get redoDepth(){ return redoStack.length; },
    PREDEFINED, APP_VERSION,
    /* 死代码检查: typeof 对未声明标识符是安全的, 删除后应全部为 "undefined"
       (inRange 是 v0.0.7 收口窗口统计后失去调用点、被有意删除的 —— 别再把它加回来) */
    deadSyms: ()=>({ boxLines: typeof boxLines, tableRow: typeof tableRow, hr: typeof hr,
                     periodSpend: typeof periodSpend, catNameOfRecord: typeof catNameOfRecord,
                     recordMoneyInv: typeof recordMoneyInv, recordHistory: typeof recordHistory,
                     INVEST_SHARE: typeof INVEST_SHARE, inRange: typeof inRange })
  };`;

  const factory = new Function(
    "window","document","localStorage","console","setTimeout","URL","Blob","getComputedStyle","indexedDB","navigator","Date",
    code + expose
  );
  const api = factory(window, doc, localStorage, consoleStub, setTimeout, URLStub, Blob, getComputedStyle, undefined, {userAgent:"node"}, FakeDate);
  api.__doc = doc;
  api.__storage = localStorage;
  api.__window = window;
  api.__logs = out;
  api.lines = () => dumpLines(api.term);
  api.lastLine = () => { const l = api.lines(); return l.length? l[l.length-1] : ""; };
  api.clearTerm = () => { api.term.innerHTML = ""; };
  return api;
}

export { doc, El };
