// 生成图表总结/统一视觉的浏览器探针页(v0.0.11): 冻结时钟 + 真实按键/点击 → 检查图形 DOM 是否真的渲染。
//   用法: node tests/gen-chart.mjs [输出路径]
//   配套: Edge --dump-dom 读 PROBE::…::END，或 --screenshot 看图形。
// 注意: 应用以 todayYMD() 为基准, 不冻结时钟就会"换一天结果变"(F4)。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HTML_PATH } from "./env.mjs";

const OUT = process.argv[2] || path.join(os.tmpdir(), "bt-chart-probe.html");
const FROZEN = "2027-08-30";
const [FY, FM, FD] = FROZEN.split("-").map(Number);
let html = fs.readFileSync(HTML_PATH, "utf8");

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

const probe = `
<script>
window.addEventListener("load",()=>{
  const out = [];
  const inp = document.getElementById("cmdline");
  const term = document.getElementById("term");
  const run = (c)=>{ inp.value=c; inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})); };
  const q = (s)=>document.querySelector(s);
  const qa = (s)=>[...document.querySelectorAll(s)];

  run("add 100 餐饮 午餐");
  run("add 60 交通 地铁");
  run("add 240 购物 外套");
  run("amort 300 10 居住 房租 @2027-08-25");
  run("cls");

  /* ---- 通道 1: 命令行 day + both ---- */
  run("chart day both");
  out.push("version=" + document.getElementById("statusbar").textContent.includes("v0.0.11"));
  out.push("day_title=" + /今日 2027-08-30/.test(term.textContent));
  out.push("day_bar_kind=" + (q(".chart-bars") ? q(".chart-bars").dataset.kind : "none"));
  out.push("day_pie_slices=" + (q(".chart-pie") ? q(".chart-pie").dataset.slices : "none"));
  out.push("day_pie_gradient=" + (q(".chart-pie") ? /conic-gradient/.test(getComputedStyle(q(".chart-pie")).backgroundImage) : false));
  out.push("day_legend=" + (q(".chart-legend") ? q(".chart-legend").textContent.replace(/\\s+/g," ").slice(0,90) : "none"));
  const bars0 = qa(".chart-bar");
  out.push("day_bar_count=" + bars0.length);
  out.push("day_bar_heights=" + bars0.map(b=>Math.round(parseFloat(getComputedStyle(b).height))).join(","));
  out.push("day_bar_colors=" + bars0.map(b=>getComputedStyle(b).backgroundColor).join("|"));
  out.push("day_refline=" + (q(".chart-refline") ? getComputedStyle(q(".chart-refline")).bottom : "none"));
  out.push("day_analysis=" + /自动分析/.test(term.textContent) + "/" + /总结与建议/.test(term.textContent));

  /* ---- 通道 2: 别名 + 单图型 ---- */
  run("cls"); run("viz week pie");
  out.push("viz_week_pie_only=" + (qa(".chart-pie").length===1 && qa(".chart-bars").length===0));
  out.push("viz_week_title=" + /本周 2027-08-30/.test(term.textContent));

  /* ---- 通道 3: 合并后的「总结与图表 ▾」下拉(真实点击) ---- */
  run("cls");
  const ddBtn = document.getElementById("btnReportDd");
  ddBtn.click();
  out.push("dd_open=" + document.getElementById("reportDd").classList.contains("open"));
  out.push("old_four_buttons_gone=" + (!q('button[data-cmd="summary"]') && !q("#chartDd")));
  const item = q('#reportDdMenu button[data-range="period"][data-range-target="report"]');
  if(item) item.click();
  const afterClick = term.textContent;
  out.push("dd_cmd_echo=" + /report period/.test(afterClick));
  out.push("dd_closed_after_click=" + !document.getElementById("reportDd").classList.contains("open"));
  out.push("dd_two_charts=" + (qa(".chart-bars").length===1 && qa(".chart-pie").length===1));
  out.push("dd_has_summary=" + /本期发放进度/.test(afterClick) + "/" + /▓ 自动分析/.test(afterClick));
  out.push("dd_date_buckets=" + (q(".chart-bars") ? q(".chart-bars").dataset.count : "none"));
  out.push("dd_no_hscroll=" + (document.documentElement.scrollWidth <= document.documentElement.clientWidth));

  /* ---- 通道 4: 「手动输日期…」复用消费列表的同一个弹窗 ---- */
  run("cls");
  document.getElementById("btnReportDd").click();
  const manual = q('#reportDdMenu button[data-range="manual"]');
  if(manual) manual.click();
  out.push("manual_modal_open=" + document.getElementById("dateWrap").classList.contains("open"));
  out.push("manual_modal_title=" + document.getElementById("d_title").textContent);
  const dInput = document.getElementById("d_date");
  dInput.value = "2027-08-18";
  dInput.dispatchEvent(new Event("input",{bubbles:true}));
  out.push("manual_preview=" + /将执行:\s+report @2027-08-18/.test(document.getElementById("d_preview").textContent));
  document.getElementById("d_ok").click();
  out.push("manual_echo_report=" + /report @2027-08-18/.test(term.textContent));
  out.push("manual_specified_day=" + /指定日期 2027-08-18/.test(term.textContent));

  const d=document.createElement("div"); d.id="PROBE";
  d.textContent = "PROBE::" + out.join(" ;; ") + "::END";
  document.body.appendChild(d);
});
</script>
</body>`;
fs.writeFileSync(OUT, html.replace(/<\/body>/, probe), "utf8");
console.log("written", OUT);
