// 生成"分摊窗口口径"浏览器探针页: 在真实 DOM/事件通道里复现"分摊成本查不到/不计入"的场景,
// 由 Edge --dump-dom 读取探针结果(真实渲染, 不靠肉眼)。
//   用法: node tests/gen-window.mjs [输出路径]
// 注意: 应用大量逻辑以 todayYMD() 为基准, 所以这里**冻结时钟**(与本装置的 loadApp({now}) 同理),
// 否则"换一天跑结果就变"(失败模式 F4)。冻结方式是在应用脚本**之前**钉住 Date。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HTML_PATH } from "./env.mjs";

const OUT = process.argv[2] || path.join(os.tmpdir(), "bt-window-probe.html");
const FROZEN = "2027-08-30";                       // 与 tests/app.mjs 的默认冻结时钟一致
const [FY, FM, FD] = FROZEN.split("-").map(Number);
let html = fs.readFileSync(HTML_PATH, "utf8");

/* 1) 冻结时钟(必须插在应用脚本之前) */
const clock = `<script>
(function(){
  var Real = Date, ms = new Real(${FY}, ${FM - 1}, ${FD}, 12, 0, 0).getTime();
  function Fake(){
    if(arguments.length === 0) return new Real(ms);
    return new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(arguments))))();
  }
  Fake.prototype = Real.prototype;
  Fake.now = function(){ return ms; };
  Fake.parse = Real.parse; Fake.UTC = Real.UTC;
  window.Date = Fake;
})();
</script>
`;
html = html.replace(/<script>/, clock + "<script>");

/* 2) 探针注入在应用脚本内部(才能访问闭包里的派生函数) */
const probeInside = `
window.__WIN = function(){
  const rec = state.records.find(r=>recAmortized(r));
  const st = periodSnapshot();
  const first = document.getElementById("term");
  return {
    version: APP_VERSION,
    today: todayYMD(),
    period: st.p.start+"~"+st.p.end,
    amount: rec ? rec.amount : null,
    amortDays: rec ? rec.amortDays : null,
    win: rec ? (recWindow(rec).start+"~"+recWindow(rec).end) : null,
    daysInPeriod: rec ? recDaysInRange(rec, st.p.start, st.p.end) : null,
    todayConsumption: todaySnapshot().consumption,     // 每日预算(右上角圆点 + budget 里的"今日预算")
    periodConsumption: st.consumption,                 // 周期预算/顶栏"本期消费"
    windowTotal0830_0831: collectWindow("2027-08-30","2027-08-31").total,
    windowTotal0831: collectWindow("2027-08-31","2027-08-31").total,
    totalCharge: totalCharge(),
    balance: availableBalance(),
    headerPeriod: (document.querySelectorAll("#statusbar .stat")[2]||{}).textContent || "",
    dotToday: (document.querySelector("#statusbar .mini-alert")||{}).textContent || "",
    termText: first ? first.textContent : ""
  };
};`;
html = html.replace(/<\/script>/, probeInside + "\n</script>");

/* 3) 外部驱动: 真实按键事件跑命令, 每条命令单独取文本(避免多条命令的输出混在一起) */
const probeOutside = `
<script>
window.addEventListener("load",()=>{
  const inp=document.getElementById("cmdline");
  const term=document.getElementById("term");
  const run=(c)=>{ inp.value=c; inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})); };
  /* 只取"命令的回显行"之后的输出: 否则正则匹配到的是回显的那条命令本身 */
  const grab=(c)=>{
    term.innerHTML="";
    run(c);
    return [...term.querySelectorAll("div.l")].filter(el=>!el.querySelector(".prompt")).map(el=>el.textContent).join("\\n");
  };
  /* 从某一行里取值(严格只匹配含 marker 的那一行, 避免误命中回显) */
  const lineVal=(s, marker, re)=>{
    const line = s.split("\\n").find(l=>l.indexOf(marker)>=0 && l.indexOf("user@budget")<0);
    if(!line) return "";
    const m = line.match(re);
    return m ? m[1] : "";
  };
  run("amort 3000 365 房租 年付 @2027-08-30");   // 记账当天
  run("add 100 餐饮 午餐 @2027-08-31");           // 普通消费对照(次日)
  const txtBudget = grab("budget");
  const txtList   = grab("list @2027-08-31");     // 窗口内、但**不是**记账日的那天
  const txtSum    = grab("summary");              // 整月窗口
  const txtDay    = grab("summary day");          // 今日窗口
  const p = window.__WIN ? window.__WIN() : {};
  delete p.termText;
  const pick = (s, re)=>{ const m = s.match(re); return m ? m[1] : ""; };
  p.listHasAmortRow  = txtList.indexOf("分摊365天") >= 0;
  p.listSaysNothing  = txtList.indexOf("暂无匹配记录") >= 0;
  p.listRowIds       = (txtList.match(/#\\d+/g)||[]).join(",");
  p.listSumSingleDay = lineVal(txtList, "合计", /合计 ¥([\\d.]+)/);
  p.listAmortNote    = lineVal(txtList, "其中分摊成本", /其中分摊成本 ¥([\\d.]+)/);
  p.summaryHasAmort  = txtSum.indexOf("其中分摊成本") >= 0;
  p.summaryWindowTot = lineVal(txtSum, "窗口总消费", /窗口总消费\\s*¥([\\d.]+)/);
  p.summaryDailyAvg  = lineVal(txtSum, "日均", /日均 ¥([\\d.]+)/);
  p.dayWindowTotal   = lineVal(txtDay, "窗口总消费", /窗口总消费\\s*¥([\\d.]+)/);
  p.budgetTodayDot   = txtBudget.indexOf("今日预算") >= 0;
  p.budgetPeriodLine = lineVal(txtBudget, "周期预算", /周期预算：●(.*)$/);
  const d=document.createElement("div"); d.id="PROBE";
  d.textContent = "PROBE::" + JSON.stringify(p) + "::END";
  document.body.appendChild(d);
});
</script>
</body>`;

html = html.replace(/<\/body>/, probeOutside);
fs.writeFileSync(OUT, html, "utf8");
console.log("written", OUT, html.length);
