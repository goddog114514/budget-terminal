// v0.0.10 图表总结(chart)护栏: 四种窗口 / 三种图型 / 分摊口径 / 预算口径 / 分析与结论 / 双通道。
//   口径纪律参照 HANDOVER §3.7 / §3.8: 任何"按日期算消费"都必须走 collectWindow(),
//   且恒等式要能写成断言 —— 这里的核心恒等式是「所有桶金额之和 == 窗口总消费」。
import fs from "node:fs";
import { loadApp } from "./app.mjs";
import { HTML_PATH, README_PATH } from "./env.mjs";

const html = fs.readFileSync(HTML_PATH, "utf8");
const readme = fs.readFileSync(README_PATH, "utf8");
const jsCode = html.slice(html.indexOf("<script>"));
const chartSrc = jsCode.slice(jsCode.indexOf("function parseChartArgs("),
                              jsCode.indexOf("/* ------------------------------ export"));

let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
function near(name, a, b, eps){ ok(name, Math.abs(a-b) <= (eps===undefined?0.011:eps), a+" vs "+b); }

/* 找到某次输出里的图形节点(DOM stub 的 children/className/dataset/style 都可读) */
function boxes(S){ return S.term.children.filter(e=>String(e.className).includes("chartbox")); }
function chartNode(S, kind){
  for(const b of boxes(S)) for(const c of (b.children||[])) if(c.dataset && c.dataset.chart===kind) return c;
  return null;
}
/* 图被变异掉时返回空壳, 让断言变成"失败"而不是脚本崩溃(§7.4 要求变异结果可读) */
function safeNode(S, kind){ return chartNode(S, kind) || {dataset:{}, style:{}, children:[]}; }
function chartVals(S){
  return safeNode(S,"bars").children.filter(c=>c.className==="chart-col")
    .map(c=>{ const bar=c.children.find(x=>x.dataset && x.dataset.value!==undefined); return bar?Number(bar.dataset.value):0; });
}
function seed(opts){
  const S = loadApp(opts||{}); S.boot();
  S.runCommand("add 100 餐饮 午餐");
  S.runCommand("add 60 交通 地铁");
  S.runCommand("add 240 购物 外套");
  return S;
}
function runChart(S, cmd){ S.clearTerm(); S.runCommand(cmd); return S.lines().join("\n"); }

/* ---------- 1. 命令登记 / help / 补全 / 版本 / 双通道 ---------- */
{
  const S = loadApp(); S.boot();
  ok("CH1.1 COMMANDS 登记了 chart", S.COMMAND_NAMES.includes("chart"), S.COMMAND_NAMES.join(","));
  eq("CH1.2 别名 charts → chart", S.canonicalCmd("charts"), "chart");
  eq("CH1.3 别名 viz → chart", S.canonicalCmd("viz"), "chart");
  ok("CH1.4 dispatch 有 chart 分支", /case "chart":\s+doChart\(tokens\);/.test(jsCode), "");
  S.clearTerm(); S.runCommand("help");
  ok("CH1.5 help 里能查到 chart 用法", /chart \[day\|week\|period\|month\]/.test(S.lines().join("\n")), "");
  ok("CH1.6 help 里列出 chart 别名", /chart = charts\/viz/.test(S.lines().join("\n")), "");
  const cands = S.argCandidates("chart", 1, ["chart"], "");
  for(const w of ["day","week","period","month","bar","pie","both"]) ok("CH1.7 补全含 "+w, cands.includes(w), cands.join(","));
  eq("CH1.8 别名 charts 的参数补全与 chart 一致",
     S.argCandidates("charts", 1, ["charts"], ""), cands);
  eq("CH1.9 第二槽位仍给候选(顺序自由)", S.argCandidates("chart", 2, ["chart","week"], ""), cands);
  eq("CH1.10 版本号已升到 v0.0.12", S.APP_VERSION, "v0.0.12");
  ok("CH1.11 README 当前版本同步", /当前版本：\*\*v0\.0\.12\*\*/.test(readme), "");
  ok("CH1.12 README 命令表含 chart", /`chart \[/.test(readme), "");
  /* 工具栏(v0.0.10 同版迭代): 周期/日/周总结 + 图表总结 四个入口合成一个 */
  ok("CH1.13 旧的四个总结按钮与图表下拉已移除",
     !/data-cmd="summary/.test(html) && !/data-cmd="chart /.test(html) && !/id="chartDd"/.test(html), "");
  ok("CH1.14 只剩一个合并入口「总结与图表 ▾」", /id="btnReportDd"/.test(html), "");
  for(const k of ["today","week","period","month","manual"]){
    ok("CH1.15 总结下拉含范围 "+k,
       html.includes('data-range="'+k+'" data-range-target="report"'), "");
  }
  ok("CH1.16 消费列表下拉复用同一套 data-range",
     html.includes('data-range="today" data-range-target="list"') &&
     html.includes('data-range="manual" data-range-target="list"'), "");
  ok("CH1.17 通用下拉函数 toggleDd/closeDd/onRangeMenuItem",
     /function toggleDd\(/.test(jsCode) && /function closeDd\(/.test(jsCode) && /function onRangeMenuItem\(/.test(jsCode), "");
  ok("CH1.18 没有留下第二套下拉实现",
     !/toggleListDd|toggleChartDd|onListMenuItem|closeChartDd/.test(jsCode), "");
}

/* ---------- 2. 参数解析: 窗口 / 图型 / 类别 / 月份 ---------- */
{
  const S = loadApp(); S.boot();
  const P = S.parseChartArgs;
  eq("CH2.1 无参数 = 当前周期 + 双图", P([]), {kind:"",type:"both",cat:null,ref:null,bad:null});
  eq("CH2.2 week + pie 顺序无关", P(["pie","week"]), {kind:"week",type:"pie",cat:null,ref:null,bad:null});
  eq("CH2.3 period 归一成默认窗口", P(["周期","柱状图"]), {kind:"",type:"bar",cat:null,ref:null,bad:null});
  eq("CH2.4 类别 + 图型 + 月份", P(["both","餐饮","@2027-07"]), {kind:"month",type:"both",cat:"餐饮",ref:"2027-07",bad:null});
  eq("CH2.5 中文关键字也识别", P(["周","饼图"]), {kind:"周",type:"pie",cat:null,ref:null,bad:null});
  ok("CH2.6 两个窗口关键字被拒", !!P(["day","week"]).bad, JSON.stringify(P(["day","week"])));
  ok("CH2.7 非法 @参数被拒(不静默忽略)", !!P(["@bogus"]).bad, JSON.stringify(P(["@bogus"])));
  ok("CH2.8 两个类别被拒", !!P(["餐饮","交通"]).bad, JSON.stringify(P(["餐饮","交通"])));
  ok("CH2.9 指定月份不能配 day 窗口", !!P(["day","@2027-07"]).bad, JSON.stringify(P(["day","@2027-07"])));
  const txt = runChart(S, "chart day week");
  ok("CH2.10 非法参数只给用法提示、不画图", /用法: chart/.test(txt) && boxes(S).length===0, txt.slice(0,120));
  ok("CH2.11 非法参数说明具体原因", /只能指定一个统计窗口/.test(txt), txt.slice(0,160));
}

/* ---------- 3. 四种窗口与 summary 同源(唯一窗口解析入口) ---------- */
{
  const S = seed();
  const cases = [
    ["day",   "今日",       "chart day"],
    ["week",  "本周",       "chart week"],
    ["month", "本月(自然月", "chart month"],
    ["",      "本月周期",   "chart period"],
  ];
  for(const [kind, needle, cmd] of cases){
    const w = S.resolveWindow(kind, null, null);
    const direct = S.collectWindow(w.win.start, w.win.end);
    eq("CH3.1 "+cmd+" 窗口总额 == collectWindow", w.win.total, direct.total);
    eq("CH3.2 "+cmd+" 窗口边界一致", [w.win.start,w.win.end], [direct.start,direct.end]);
    const txt = runChart(S, cmd);
    ok("CH3.3 "+cmd+" 标题含 "+needle, txt.includes(needle), txt.split("\n")[1]);
    ok("CH3.4 "+cmd+" 分析里的总额与窗口一致", txt.includes("¥"+S.money(w.win.total)), "");
    ok("CH3.5 "+cmd+" 画出了柱状图", !!chartNode(S,"bars"), "");
    eq("CH3.6 "+cmd+" 桶合计 == 窗口总消费(F13 恒等式)",
       S.r2(chartVals(S).reduce((s,v)=>s+v,0)), w.win.total);
  }
  const july = runChart(S, "chart month 2027-07");
  ok("CH3.7 指定自然月边界正确", /2027-07-01 ~ 2027-07-31/.test(july), july.split("\n")[2]);
  ok("CH3.8 指定月份的窗口无消费时给出零值结论", /没有消费记录/.test(july), "");
  /* 别名与主名输出完全一致(去掉回显行) */
  const cap = (c)=>{ const A=seed(); A.clearTerm(); A.runCommand(c); return A.lines().slice(1).join("\n"); };
  eq("CH3.9 charts == chart", cap("charts week pie"), cap("chart week pie"));
  eq("CH3.10 viz == chart", cap("viz day bar"), cap("chart day bar"));
}

/* ---------- 4. 图型三选: bar / pie / both ---------- */
{
  const S = seed();
  const shape = (cmd)=>{ runChart(S,cmd); return [!!chartNode(S,"bars"), !!chartNode(S,"pie"), boxes(S).length]; };
  eq("CH4.1 默认 = 双图", shape("chart"), [true,true,2]);
  eq("CH4.2 both = 双图", shape("chart both"), [true,true,2]);
  eq("CH4.3 bar 只画柱状图", shape("chart bar"), [true,false,1]);
  eq("CH4.4 pie 只画饼图", shape("chart pie"), [false,true,1]);
  eq("CH4.5 图型与窗口顺序自由", shape("chart pie week"), [false,true,1]);
  runChart(S, "chart day");
  eq("CH4.6 单日窗口按类别分桶", safeNode(S,"bars").dataset.kind, "category");
  runChart(S, "chart week");
  eq("CH4.7 周窗口按时间分桶", safeNode(S,"bars").dataset.kind, "date");
  const bars = safeNode(S,"bars");
  ok("CH4.8 柱数不超过上限", Number(bars.dataset.count) <= S.CHART_MAX_BUCKETS, bars.dataset.count);
  ok("CH4.9 柱数 = 子元素里的 chart-col 数",
     Number(bars.dataset.count) === bars.children.filter(c=>c.className==="chart-col").length, bars.dataset.count);
  ok("CH4.10 存在预算参考虚线", bars.children.some(c=>c.className==="chart-refline"), "");
  ok("CH4.11 参考额度为正数", Number(bars.dataset.refQuota) > 0, bars.dataset.refQuota);
  ok("CH4.12 柱高用像素且与数值成比例", bars.children.filter(c=>c.className==="chart-col")
     .every(c=>{ const bar=c.children.find(x=>x.className==="chart-bar"); return !!bar && /^\d+px$/.test(bar.style.height); }), "");
  const pie = safeNode(S,"pie");
  eq("CH4.13 饼图切片数 = 类别数", Number(pie.dataset.slices), 3);
  ok("CH4.14 饼图用 conic-gradient 绘制", /conic-gradient\(/.test(String(pie.style.background)), String(pie.style.background).slice(0,80));
  ok("CH4.15 饼图配色取自 COLOR 表", [S.COLOR.green,S.COLOR.cyan,S.COLOR.yellow,S.COLOR.orange,
      S.COLOR.magenta,S.COLOR.red].some(c=>String(pie.style.background).includes(c)), "");
  /* 闭合(v0.0.11 修复): 切片必须严格首尾相接 —— 一旦为了"分隔线"插入 transparent 段,
     饼图上就被挖掉一个 1.8° 的缺口; 相邻两片同色时看起来就是"少了一块"(用户报的 bug)。 */
  const arc = String(pie.style.background).replace(/^conic-gradient\(\s*from -?[\d.]+deg\s*,/, "").replace(/\)$/, "");
  const stops = arc.split(",").map(x=>x.trim()).filter(Boolean);
  const spans = stops.map(x=>{ const m = /^(#[0-9a-fA-F]{3,8}|transparent|rgba?\([^)]*\))\s+([\d.]+)%\s+([\d.]+)%$/.exec(x); return m ? [m[1], Number(m[2]), Number(m[3])] : null; });
  let t = 0, closed = stops.length === spans.filter(Boolean).length, hasHole = false;
  for(const sp of spans){
    if(!sp){ break; }
    if(Math.abs(sp[1]-t) > 0.011){ closed = false; }   // 上一片结束 == 这一片开始(容差 = 两位小数取整)
    if(sp[0] === "transparent"){ hasHole = true; }
    t = sp[2];
  }
  ok("CH4.19 饼图严格闭合(无透明缺口, 0%→100% 连续)", closed && !hasHole && Math.abs(t-100) < 0.011,
     "closed="+closed+" hole="+hasHole+" end="+t);
  const legend = boxes(S).map(b=>b.children.find(c=>c.className==="chart-legend")).filter(Boolean)[0];
  const legendText = legend ? legend.textContent : "";
  ok("CH4.16 图例含类别名", /餐饮/.test(legendText) && /购物/.test(legendText), legendText);
  ok("CH4.17 图例含金额与占比", /60\.0%/.test(legendText) && /240\.00/.test(legendText), legendText);
  ok("CH4.18 类别名用 textContent(不是 innerHTML)", (legend?legend.children:[]).length>0 && (legend?legend.children:[]).every(li=>
     li.children.some(sp=>sp.className==="nm" && typeof sp.textContent==="string")), "");
}

/* ---------- 5. 口径: 分摊成本 / 类别筛选 / 预算 / 精度 ---------- */
{
  const S = seed();
  S.runCommand("amort 300 10 居住 房租 @2027-08-25");   // 30/天, 生效 08-25 ~ 09-03
  const w = S.resolveWindow("week", null, null);          // 冻结时钟 2027-08-30 → 08-30 ~ 09-05
  const data = S.chartBuckets(w.win, false, null);
  eq("CH5.1 分摊窗口里 5 天 × ¥30 = ¥150", w.win.total, S.r2(400+150));
  eq("CH5.2 桶合计仍等于窗口总额(分摊不漏算)",
     S.r2(data.buckets.reduce((s,b)=>s+b.total,0)), w.win.total);
  eq("CH5.3a 分摊生效首日(08-30)按当天计入", data.buckets[0].total, 430);
  eq("CH5.3b 09-03 仍在生效窗口内, 照常计入", data.buckets[4].total, 30);
  eq("CH5.3c 09-04 起窗口结束, 不再计入", data.buckets[5].total, 0);
  eq("CH5.4 每日参考额度 = 本期日均发放 × 消费占比",
     data.perDaySpend, S.r2(data.perDay*S.consumeShare()));
  eq("CH5.5 本期日均发放 = 当期预算 ÷ 本期天数",
     data.perDay, S.r2(S.effectiveBudget(S.currentPeriod())/((S.daysBetween(S.currentPeriod().start,S.currentPeriod().end)+1))));
  ok("CH5.6 桶参考额度按桶天数线性放大",
     Math.abs(data.buckets[0].quota - S.r2(data.perDaySpend*data.buckets[0].days)) < 0.011,
     String(data.buckets[0].quota));
  /* 类别筛选: 窗口、柱、饼全部收缩到该类别 */
  const f = S.resolveWindow("", null, "餐饮");
  eq("CH5.7 类别筛选后的窗口总额", f.win.total, 100);
  const fd = S.chartBuckets(f.win, false, "餐饮");
  eq("CH5.8 类别筛选后桶合计仍等于窗口总额",
     S.r2(fd.buckets.reduce((s,b)=>s+b.total,0)), 100);
  const txt = runChart(S, "chart 餐饮");
  ok("CH5.9 标题带类别标记", /\[类别: 餐饮\]/.test(txt), "");
  eq("CH5.10 类别筛选后饼图只有 1 片", Number(safeNode(S,"pie").dataset.slices), 1);
  /* 饼占比按金额(不是按笔数) */
  const T = seed();                       // 100 餐饮 / 60 交通 / 240 购物
  runChart(T, "chart pie");
  const legBox = boxes(T)[0];
  const leg = (legBox ? legBox.children.find(c=>c.className==="chart-legend") : null)
            || {textContent:"", children:[]};
  const legAt = (i)=> (leg.children[i] ? leg.children[i].textContent : "");
  ok("CH5.11 占比按金额: 购物 60% / 餐饮 25% / 交通 15%",
     /购物/.test(legAt(0)) && /60\.0%/.test(legAt(0))
     && /25\.0%/.test(legAt(1)) && /15\.0%/.test(legAt(2)), leg.textContent);
  /* 预算变化会传导到参考线, 但消费口径的柱值不变 */
  runChart(T, "chart bar");
  const before = Number(safeNode(T,"bars").dataset.refQuota || 0);
  T.runCommand("budget set 600");
  runChart(T, "chart bar");
  const after = Number(safeNode(T,"bars").dataset.refQuota || 0);
  ok("CH5.12 改当期预算后参考额度同步变小", after < before, before+" → "+after);
  /* 消费占比可调: 参考额度按消费口径缩放 */
  T.runCommand("set invest 10");
  const d3 = T.chartBuckets(T.resolveWindow("",null,null).win, false, null);
  eq("CH5.13 投资比例改为 10% 后消费占比 = 90%", T.consumeShare(), 0.9);
  eq("CH5.14 消费口径参考额度随消费占比缩放",
     d3.perDaySpend, T.r2(d3.perDay*T.consumeShare()));
}

/* ---------- 6. 长窗口 / 空数据 / 边界 ---------- */
{
  const S = seed();
  S.runCommand("set period 90");           // 滚动 90 天 → 窗口远多于 12 天
  runChart(S, "chart bar");
  const bars = safeNode(S,"bars");
  ok("CH6.1 90 天窗口自动合并成 ≤12 柱", Number(bars.dataset.count||999) <= S.CHART_MAX_BUCKETS, bars.dataset.count);
  const cols = bars.children.filter(c=>c.className==="chart-col");
  ok("CH6.2 每柱覆盖多天", cols.length>0 && chartVals(S).length===cols.length, "");
  const w = S.resolveWindow("", null, null);
  const d = S.chartBuckets(w.win, false, null);
  ok("CH6.3 合并桶覆盖整个窗口(首尾闭合)",
     d.buckets[0].start===w.win.start && d.buckets[d.buckets.length-1].end===w.win.end,
     d.buckets[0].start+" ~ "+d.buckets[d.buckets.length-1].end);
  eq("CH6.4 合并后桶合计仍等于窗口总额",
     S.r2(d.buckets.reduce((s,b)=>s+b.total,0)), w.win.total);

  const E = loadApp(); E.boot();
  const empty = runChart(E, "chart");
  ok("CH6.5 空账本不崩且给零值结论", /没有消费记录/.test(empty), "");
  ok("CH6.6 空账本仍画两张图", boxes(E).length===2, String(boxes(E).length));
  eq("CH6.7 空账本饼图 0 片", Number(safeNode(E,"pie").dataset.slices), 0);
  ok("CH6.8 空账本分析里窗口总消费为 0", /窗口总消费\s+¥0\.00/.test(empty), "");
  const miss = runChart(seed(), "chart 不存在的类别");
  ok("CH6.9 不存在的类别给提示且不静默当 0 通过", /该窗口内没有/.test(miss) && /现有类别/.test(miss), "");
  const day = runChart(seed(), "chart day both");
  ok("CH6.10 日窗口标注 1 天", /（1 天）/.test(day), "");
}

/* ---------- 7. 分析与总结文本 ---------- */
{
  const S = seed();
  const txt = runChart(S, "chart");
  for(const k of ["自动分析","总结与建议","窗口总消费","平均每日消费","窗口占用","参考发放额度",
                  "预算使用率","峰值时段","超参考额度","零消费","Top1 类别","Top3 集中度","前后半段趋势"]){
    ok("CH7.1 分析含 "+k, txt.includes(k), "");
  }
  ok("CH7.2 结论含总额与预算占比", /消费 ¥400\.00，占参考预算/.test(txt), "");
  ok("CH7.3 结论含主要支出类别", /主要支出为 购物（60\.0%）/.test(txt), "");
  ok("CH7.4 附口径说明(分摊按落入桶内天数)", /分摊成本按落入桶内的天数计入/.test(txt), "");
  ok("CH7.5 建议里提示未完全投资", /未完全投资/.test(txt), "");
  ok("CH7.6 建议里指出类别过度集中", /支出集中在/.test(txt), "");
  /* 超预算场景 */
  const B = seed(); B.runCommand("add 2000 购物 大额");
  const over = runChart(B, "chart");
  ok("CH7.7 超预算时使用率 >100%", /预算使用率\s+([1-9]\d{2,}|100)\./.test(over) || /已超额/.test(over), "");
  ok("CH7.8 超预算时给出削减建议", /已超出参考发放额度/.test(over), over.slice(-500));
  /* 分摊成本占比提示 */
  const A = seed(); A.runCommand("amort 3000 30 居住 房租 @2027-08-25");
  const am = runChart(A, "chart");
  ok("CH7.9 分摊成本单列在分析里", /其中分摊成本/.test(am), "");
  ok("CH7.10 分摊占比高时给固定支出建议", /分摊成本占/.test(am), "");
}

/* ---------- 8. 规范自检: 单一渲染器 / 无 innerHTML / 无颜色字面量 ---------- */
{
  ok("CH8.1 图表区没有 innerHTML(用户数据只走 textContent)", !/innerHTML/.test(chartSrc), "");
  ok("CH8.2 图表区表格一律走 kvRow", /kvRow\(/.test(chartSrc) && !/padEnd\(2[0-9]/.test(chartSrc), "");
  ok("CH8.3 图表区没有写死的颜色 hex", !/"#[0-9a-fA-F]{6}"/.test(chartSrc), "");
  ok("CH8.4 图表区所有金额统计走 collectWindow", /collectWindow\(s, e, cat\)/.test(chartSrc), "");
  ok("CH8.5 resolveWindow 是唯一窗口入口(summary/chart 共用)",
     /doSummary[\s\S]{0,300}resolveWindow\(/.test(jsCode) && /doChart[\s\S]{0,400}resolveWindow\(/.test(jsCode), "");
  ok("CH8.6 图表区没有独立按 r.date 求和的窗口实现", !/records\.filter\(r=>r\.date/.test(chartSrc), "");
}

/* ---------- 9. 合并入口 report: 一次输出 总结 + 柱状图 + 饼图 + 分析 ---------- */
{
  const S = seed();
  ok("CH9.1 COMMANDS 登记了 report", S.COMMAND_NAMES.includes("report"), S.COMMAND_NAMES.join(","));
  eq("CH9.2 别名 overview → report", S.canonicalCmd("overview"), "report");
  ok("CH9.3 dispatch 有 report 分支", /case "report":\s+doReport\(tokens\);/.test(jsCode), "");
  S.clearTerm(); S.runCommand("help");
  const help = S.lines().join("\n");
  ok("CH9.4 help 里能查到 report", /report \[day\|week\|period\|month\]/.test(help), "");
  ok("CH9.5 help 里列出 report 别名", /report = overview/.test(help), "");
  ok("CH9.6 README 命令表含 report", /`report \[/.test(readme), "");
  const rc = S.argCandidates("report", 1, ["report"], "");
  for(const w of ["day","week","period","month"]) ok("CH9.7 补全含 "+w, rc.includes(w), rc.join(","));
  ok("CH9.8 report 补全不含图型(固定双图)", !rc.includes("bar") && !rc.includes("pie") && !rc.includes("both"), rc.join(","));
  eq("CH9.9 版本号随视觉改造升到 v0.0.12", S.APP_VERSION, "v0.0.12");

  /* 一次输出必须同时含总结表 / 柱状图 / 饼图 / 自动分析 / 结论 */
  const txt = runChart(S, "report week");
  for(const k of ["总结与图表 ·","▓ 预算总结","窗口总消费","本期发放进度","▓ 柱状图","▓ 饼图","▓ 数据明细","▓ 自动分析","▓ 总结与建议"]){
    ok("CH9.10 report 输出含 "+k, txt.includes(k), "");
  }
  eq("CH9.11 report 固定画两张图", [!!chartNode(S,"bars"), !!chartNode(S,"pie"), boxes(S).length], [true,true,2]);
  eq("CH9.12 report 的柱状图按时间分桶", safeNode(S,"bars").dataset.kind, "date");
  eq("CH9.13 report 的饼图切片数 = 类别数", Number(safeNode(S,"pie").dataset.slices), 3);
  /* 去重(v0.0.10 同版迭代): 旧版 summary 的「类别·X」行与「类别占比」迷你条,
     与饼图图例是同一份数据 —— report 里只在饼图出现一次。 */
  ok("CH9.14 report 不再重复旧版类别明细(交给饼图图例)", !/类别·/.test(txt) && !/类别占比\(按消费\)/.test(txt), "");
  eq("CH9.14b 窗口总消费只出现一次", (txt.match(/窗口总消费/g)||[]).length, 1);
  eq("CH9.14c 平均每日消费只出现一次", (txt.match(/平均每日消费/g)||[]).length, 1);
  const amortS = seed(); amortS.runCommand("amort 300 10 居住 房租 @2027-08-25");
  const amortTxt = runChart(amortS, "report week");
  eq("CH9.14d 分摊成本只出现一次", (amortTxt.match(/其中分摊成本/g)||[]).length, 1);
  const pos = (k)=>txt.indexOf(k);
  ok("CH9.14e 输出顺序: 预算总结 → 柱状图 → 饼图 → 数据明细 → 分析 → 结论",
     pos("▓ 预算总结")>=0 && pos("▓ 预算总结")<pos("▓ 柱状图") && pos("▓ 柱状图")<pos("▓ 饼图")
     && pos("▓ 饼图")<pos("▓ 数据明细") && pos("▓ 数据明细")<pos("▓ 自动分析")
     && pos("▓ 自动分析")<pos("▓ 总结与建议"),
     [pos("▓ 预算总结"),pos("▓ 柱状图"),pos("▓ 饼图"),pos("▓ 数据明细"),pos("▓ 自动分析"),pos("▓ 总结与建议")].join(","));
  /* 预算对比口径: 进行中的窗口只算"截至今天", 未来日期的分摊不能把使用率抬高 */
  ok("CH9.14f 预算使用率按截至今天的消费算(不含未来分摊)",
     /窗口占用\(截至今天/.test(amortTxt), "");

  /* 四种窗口 + 指定日期 / 指定月份 */
  for(const [cmd, needle] of [["report day","今日"],["report week","本周"],
                              ["report period","本月周期"],["report month","本月(自然月"]]){
    const t = runChart(S, cmd);
    ok("CH9.15 "+cmd+" 标题含 "+needle, t.includes(needle), t.split("\n")[1]);
    ok("CH9.16 "+cmd+" 仍同时有两张图", !!chartNode(S,"bars") && !!chartNode(S,"pie"), "");
  }
  const dayCmd = runChart(S, "report 2027-08-18");
  ok("CH9.17 完整日期 → 指定日期窗口(不是整月)", /指定日期 2027-08-18/.test(dayCmd), dayCmd.split("\n")[1]);
  eq("CH9.18 指定日期按类别分桶(单日)", safeNode(S,"bars").dataset.kind, "category");
  const monCmd = runChart(S, "report 2027-07");
  ok("CH9.19 月份 → 自然月窗口", /2027-07-01 ~ 2027-07-31/.test(monCmd), monCmd.split("\n")[2]);
  const catCmd = runChart(S, "report 餐饮");
  ok("CH9.20 类别筛选标记", /\[类别: 餐饮\]/.test(catCmd), "");
  eq("CH9.21 类别筛选后饼图只剩 1 片", Number(safeNode(S,"pie").dataset.slices), 1);

  /* 范围下拉: 与「消费列表」共用一套映射, 但拼的是 report 命令 */
  eq("CH9.22 report 范围映射", S.RANGE_COMMANDS.report,
     {today:"report day", week:"report week", period:"report period", month:"report month"});
  eq("CH9.23 list 范围映射保持不变", S.RANGE_COMMANDS.list,
     {today:"list @today", period:"list @period", month:"list @month"});
  const viaMenu = (()=>{ const A=seed(); A.clearTerm(); A.onRangeMenuItem("today","report"); return A.lines().slice(1).join("\n"); })();
  const viaCmd  = (()=>{ const A=seed(); A.clearTerm(); A.runCommand("report day");    return A.lines().slice(1).join("\n"); })();
  eq("CH9.24 下拉选「当日」与命令行 report day 完全等价", viaMenu, viaCmd);
  const L = seed(); L.clearTerm(); L.onRangeMenuItem("period","list");
  ok("CH9.25 消费列表下拉仍拼 list @period", /list @period/.test(L.lines().join("\n")), "");

  /* 手动输日期弹窗: 同一个 #dateModal, target 决定命令名与标题 */
  S.openDateModal("report");
  eq("CH9.26 弹窗 target = report", S.dateModalTarget, "report");
  eq("CH9.27 弹窗标题切换为总结与图表", S.__doc.getElementById("d_title").textContent, "按日期 / 月份生成总结与图表");
  S.__doc.getElementById("d_date").value = "2027-08-18";
  S.__doc.getElementById("d_month").value = "";
  S.__doc.getElementById("d_cat").value = "餐饮";
  const pv = S.updateDatePreview();
  ok("CH9.28 预览显示 report 命令", /将执行:\s+report 餐饮 @2027-08-18/.test(S.__doc.getElementById("d_preview").textContent), pv.when);
  S.clearTerm(); S.applyDateModal();
  ok("CH9.29 提交回灌 report 命令", /report 餐饮 @2027-08-18/.test(S.lines()[0]), S.lines()[0]);
  S.openDateModal("list");
  eq("CH9.30 弹窗 target 可切回 list", S.dateModalTarget, "list");
  eq("CH9.31 弹窗标题切回消费列表", S.__doc.getElementById("d_title").textContent, "按日期 / 月份查看消费");
  S.__doc.getElementById("d_date").value = "2027-08-18";
  S.__doc.getElementById("d_month").value = "";
  S.__doc.getElementById("d_cat").value = "";
  S.updateDatePreview();
  ok("CH9.32 list 目标仍预览 list 命令", /将执行:\s+list @2027-08-18/.test(S.__doc.getElementById("d_preview").textContent), "");

  /* 规范: 共用绘图实现 + 纯只读 */
  ok("CH9.33 chart 与 report 共用 renderChartBody",
     /doChart[\s\S]{0,900}renderChartBody\(/.test(jsCode) && /doReport[\s\S]{0,1600}renderChartBody\(/.test(jsCode), "");
  ok("CH9.34 report 区没有第二份绘图代码", !/function doReport[\s\S]{0,900}renderBarChart\(/.test(jsCode), "");
  const R = seed();
  const before = {u:R.undoDepth, ls:R.__storage.getItem("budget_term_v1")};
  runChart(R, "report");
  ok("CH9.35 report 纯只读: 不进撤销栈、不写盘",
     R.undoDepth===before.u && R.__storage.getItem("budget_term_v1")===before.ls, "");
}

/* ---------- 10. 浮层互斥(v0.0.12 同版修复): 全局同时最多一个下拉/弹窗 open ---------- */
{
  const S = loadApp(); S.boot(); S.clearTerm();
  const d = S.__doc;
  S.closeAllOverlays();                       // doc 是共享 stub, 先清场
  const openIds = ()=> S.DD_IDS.concat(S.MODAL_IDS)
    .filter(id=> d.getElementById(id).classList.contains("open"));

  eq("CH10.1 下拉/弹窗清单齐全(4 + 5)", [S.DD_IDS.length, S.MODAL_IDS.length], [4,5]);
  ok("CH10.2 所有浮层打开收口到 openOverlay(), toggleDd 打开前先互斥",
     /if\(willOpen\) closeAllOverlays\(id\);/.test(jsCode)
     && /function openOverlay\(id\)\{\s*closeAllOverlays\(id\);/.test(jsCode)
     && (jsCode.match(/classList\.add\("open"\)/g)||[]).length===1
     && (jsCode.match(/openOverlay\("/g)||[]).length>=6, "");

  S.toggleDd("geoDd");
  ok("CH10.3 打开第一个下拉", openIds().length===1 && openIds()[0]==="geoDd", openIds().join(","));
  S.toggleDd("reportDd");
  ok("CH10.4 打开第二个下拉 → 第一个自动关闭(不再叠在一起)",
     openIds().length===1 && openIds()[0]==="reportDd", openIds().join(","));

  S.openGeoModal();
  ok("CH10.5 下拉开着时打开地点弹窗 → 下拉全关, 只剩弹窗",
     openIds().length===1 && openIds()[0]==="geoWrap", openIds().join(","));
  S.openDateModal("report");
  ok("CH10.6 弹窗 A 开着时打开弹窗 B → A 自动关闭",
     openIds().length===1 && openIds()[0]==="dateWrap", openIds().join(","));
  S.toggleDd("listDd");
  ok("CH10.7 弹窗开着时打开下拉 → 弹窗自动关闭",
     openIds().length===1 && openIds()[0]==="listDd", openIds().join(","));

  S.toggleDd("listDd");
  ok("CH10.8 同一个按钮二次点击仍可关掉自己(toggle 语义保留)",
     openIds().length===0, openIds().join(","));
  S.toggleDd("configDd");
  for(const fn of (d._documentListeners.click||[])) fn({ target:d.createElement("div") });
  ok("CH10.9 点空白处收起全部下拉", openIds().length===0, openIds().join(","));
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length? 1 : 0);
