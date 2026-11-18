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

  /* opts.storageQuota(字符数) 用于模拟 localStorage 写满: 见 test13 容量/落盘专项 */
  const localStorage = makeLocalStorage(opts.seedStorage || {}, { quota: opts.storageQuota });
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
    /* v0.0.13: 预算行按窗口覆盖的记账周期合计(历史发放/结转快照) */
    grantedTotalAt, totalChargeAt, periodOfWindow, budgetPeriodsOfWindow, budgetOfWindow,
    effectiveBudget, hasBudgetOverride, periodSnapshot,
    /* v0.0.14 类别余额(信封): 总量/明细/预警 + 命令与配置弹窗 */
    catAllocMap, catAllocOf, catPool, catAllocated, catPoolLeft, catBudgetCats,
    catBudgetRows, catAlertList, catDotLine, catBudgetTable, printCategoryBudget,
    catMuteMap, catMuted,
    doSetCategory, catBudgetUsage, CAT_NAME_MAX, CAT_ALLOC_OFF, CAT_ALLOC_MUTE,
    openCatModal, closeCatModal, buildCatRows, readCatInputs, updateCatModal,
    saveCatBudgets, clearCatBudgets, catBudgetCommand, catRowParts,
    investOf, moneyPending, indexPending, moneyInvestedTotal, indexInvestedTotal,
    investAmount, investFull, recStatus, recFullyMoney, recFullyIndex, recNoNeed,
    recDays, recTotal, recAmortized, parseDaysToken, amortSplitLine,
    recWindow, recDaysInRange, recInWindow, recAmountInRange, recAmountUpTo, recAmountUpToToday,
    sumRange, collectWindow, investTotalsOf,
    setModalTab, updateAmortHint, submitModal, submitAmort, openAdd, amortPickDate,
    openEdit, setModalTabsVisible, doInvestFull, investFullRun, doPayFull,
    get modalTab(){ return modalTab; },
    get modalMode(){ return modalMode; },
    get modalId(){ return modalId; },
    filterByTokens, normDateText, parseSummaryArgs, forecastData,
    /* v0.0.13 查找: 命令入口 + 解析/匹配/描述 (测试直接驱动, 不靠输出文本猜) */
    doSearch, parseSearchQuery, searchAmountHit, searchTextHit, searchDesc, searchUsage,
    searchNumText, hlSegs, dateCondOf, dateKeywordCond, bindSearch,
    parseChartArgs, resolveWindow, chartBuckets, renderBarChart, renderPieChart,
    printChartAnalysis, renderChartBody, doChart, doReport, CHART_MAX_BUCKETS, CHART_PLOT_H,
    toggleDd, closeDd, onRangeMenuItem, RANGE_COMMANDS,
    DD_IDS, MODAL_IDS, closeAllOverlays, openOverlay, closeAllDd,
    openDateModal, closeDateModal, applyDateModal, updateDatePreview, dateModalCmd,
    get dateModalTarget(){ return dateModalTarget; },
    doConfig, openBudgetModal, closeBudgetModal, applyBudget,
    openInvestModal, closeInvestModal, saveInvest, updateInvestHint, INVEST_MAX_PCT,
    /* v0.0.15 周期设置: setter 单一入口 + 「配置周期」弹窗(天数由起止日自动算) */
    periodSetDays, periodSetStart, periodSetEnd, periodSetRange, periodErrText, periodRangeCheck,
    periodDaysBetween, monthPeriodBounds, periodStartOf, PERIOD_DAYS_MIN, PERIOD_DAYS_MAX, PERIOD_RANGE_MAX,
    openPeriodModal, closePeriodModal, savePeriodModal, updatePeriodModal, setPeriodModalMode,
    periodModalCheck, periodModalMsg,
    get periodModalMode(){ return periodModalMode; },
    /* v0.0.15 经常性支出: 计算入口(预览/提交共用) + 命令 + 弹窗选项卡 */
    doRecur, recurPlan, recurDates, recurEndDate, recurStep, addMonthsClamped,
    parseRecurUnit, parseRecurSpan, recurEveryLabel, RECUR_UNITS, RECUR_MAX_COUNT,
    updateRecurHint, submitRecur, MODAL_PANELS,
    buildReportText, serializeState, restoreFromText, recomputeAllInvest,
    doInvestFull, undo, redo, applyState,
    consumeShare, investShare, rateSplit, consumePct, invPct, mmPct, idxPct,
    ratioDot, todaySnapshot, normalizeSettings, normalizeRecords, repairDate, barLevel, alertWord,
    COLOR, CAT_PALETTE, CUSTOM_CAT_PALETTE, catColor, customCatColor, knownCategories,
    kvRow, kvColWidth, termCols, KV_MIN, KV_MAX,
    sectionHead, chartHead, ratioBar, hbarTrack, stackBar, catRows, miniBars, withAlpha,
    escapeMd, configUsage, scheduleFileWrite, refreshAutosaveUI,
    get autosaveOn(){ return autosaveOn; },
    set autosaveOn(v){ autosaveOn = !!v; },
    MINI_MAX, MINI_PLOT_H,
    COMMANDS, CMD_ALIAS, COMMAND_NAMES, CMD_WORDS, canonicalCmd, argCandidates, printHelp,
    completionCandidates, currentGhostSuffix,
    /* v0.0.12 地点专项: 允许注入 navigator.geolocation 与 TMap 来驱动「启动预热」链路 */
    normalizePlace, normalizeGeoKey, findPlaceToken, splitRecordArgs, quotePlace, quote, quoteNote, doPlace, maskGeoKey, geoModeLabel,
    wgs84ToGcj02, placeFromAddressComponent, districtFromAddressComponent, districtOf,
    loadTMapSDK, resetTMapSDK, geoLocate, geoReverse, geoErrorText, geoWarnOnce,
    GEO_SDK_TIMEOUT_MS, GEO_TIMEOUT_MS,
    get tmapLoadedKey(){ return tmapLoadedKey; },
    get tmapScriptEl(){ return tmapScriptEl; },
    loadGeoCache, saveGeoCache, clearGeoCache, setGeoStatus, renderGeoBadge, primeGeoLocation,
    paintGeoIcon, drawGeoIcon, makeGeoIcon, geoPlaceSegs,
    currentGeoPlace, geoHintOnce, refreshGeoUI, openGeoModal, closeGeoModal, updateGeoHint, setGeoMode,
    saveGeoKey, submitGeoPlace, GEO_COMMANDS, GEO_CACHE_KEY, GEO_SDK_BASE, GEO_SDK_URL_TEMPLATE, GEO_KEY_PLACEHOLDER,
    get geoCache(){ return geoCache; },
    get geoStatus(){ return geoStatus; },
    get geoPrimed(){ return geoPrimed; },
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

  /* opts.navigator 可注入 geolocation (测试自动定位链路); opts.TMap 可注入腾讯地图 SDK 桩。
     两者都不传时, 应用会走"无定位能力 → 静默降级"路径, 与既有 7 个套件完全一致。 */
  const factory = new Function(
    "window","document","localStorage","console","setTimeout","clearTimeout","URL","Blob","getComputedStyle","indexedDB","navigator","Date","TMap",
    code + expose
  );
  const nav = Object.assign({userAgent:"node"}, opts.navigator || {});
  const api = factory(window, doc, localStorage, consoleStub, setTimeout, clearTimeout, URLStub, Blob, getComputedStyle,
                      undefined, nav, FakeDate, opts.TMap);
  api.__doc = doc;
  api.__storage = localStorage;
  /* 模拟"写满 → 清理 → 恢复"的容量变化(test13) */
  api.setStorageQuota = q => localStorage._setQuota(q);
  api.storageUsage = () => localStorage._usage();
  api.storageQuota = () => localStorage._quota();
  api.__window = window;
  api.__logs = out;
  api.lines = () => dumpLines(api.term);
  api.lastLine = () => { const l = api.lines(); return l.length? l[l.length-1] : ""; };
  api.clearTerm = () => { api.term.innerHTML = ""; };
  return api;
}

export { doc, El };
