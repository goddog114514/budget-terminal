// 生成"分摊成本选项卡"验证页: 真实点击 [+ 记一笔] → 切到「分摊成本」→ 填总价/天数/起始日期,
// 再由真实 input 事件驱动实时预览。用于 Edge 截图(三档宽度)与 --dump-dom 取值。
// v0.0.8 起起始日期**精确到日**(type="date" + ISO 值), 本页同时核对预览里的生效区间。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HTML_PATH } from "./env.mjs";
const html = fs.readFileSync(HTML_PATH, "utf8");

const inject = `
<script>
window.addEventListener("load",()=>{
  const out = [];
  const inp=document.getElementById("cmdline");
  const run=(c)=>{ inp.value=c; inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})); };
  run("add 300 餐饮 午餐");                       // 先造一条普通记录做对照
  run("amort 3600 365 房租 年付");                // 再用命令行记一条分摊成本
  run("list");                                   // 行里应出现 [总3600.00 ÷ 365天]

  /* 走真实 UI: 工具栏按钮 → 选项卡点击 → 真实 input 事件 → 实时预览 */
  document.querySelector('nav.toolbar button[data-cmd="open-add"]').click();
  const tab = document.querySelector('#modal .mtabs .mtab[data-mtab="amort"]');
  tab.click();
  const set=(id,v)=>{ const el=document.getElementById(id); el.value=v; el.dispatchEvent(new Event("input",{bubbles:true})); };
  set("fa_total","3600");
  set("fa_days","12月");
  set("fa_date","2027-08-17");                    // 精确到日(不再用 YYYY-MM)
  set("fa_cat","房租");
  set("fa_note","年付房租");

  const m = document.getElementById("modal");
  const wrap = document.getElementById("modalWrap");
  const fa = document.getElementById("fa_hint");
  const de = document.documentElement;
  const r = m.getBoundingClientRect();
  out.push("tab_on=" + tab.classList.contains("on"));
  out.push("add_hidden=" + document.getElementById("mp_add").classList.contains("hide"));
  out.push("amort_visible=" + !document.getElementById("mp_amort").classList.contains("hide"));
  out.push("title=" + document.getElementById("mTitle").textContent);
  out.push("hint_bad=" + fa.classList.contains("bad"));
  out.push("hint=" + fa.textContent.replace(/\\n/g," | "));
  /* 起始日期精确到日: 面板里的控件类型 + 预览里的起始日/生效区间 */
  out.push("fa_date_type=" + document.getElementById("fa_date").type);
  out.push("hint_from_day=" + /从 2027-08-17 起/.test(fa.textContent));
  out.push("hint_range=" + /2027-08-17 ~ 2028-08-10/.test(fa.textContent));   // 360 天含首尾 = 起 + 359
  out.push("hint_no_first_of_month=" + !/2027-08-01/.test(fa.textContent));
  out.push("modal_in_viewport=" + (r.left>=0 && r.top>=0 && r.right<=window.innerWidth+0.5 && r.bottom<=window.innerHeight+0.5));
  out.push("modal=" + [Math.round(r.width),Math.round(r.height)].join("x"));
  out.push("viewport=" + window.innerWidth + "x" + window.innerHeight);
  out.push("overflow_x=" + (de.scrollWidth > de.clientWidth));
  out.push("fa_total=" + document.getElementById("fa_total").value);
  out.push("fa_days=" + document.getElementById("fa_days").value);
  /* 真正提交一次(真实按钮): 拼出来的命令与列表行里都必须是选中的那一天
     (以前会被吸到该月 1 号 —— 这里直接看终端回显的命令串, 不用翻内部 state) */
  const termEl = document.getElementById("term");
  const before = termEl.textContent.length;
  document.getElementById("btnSubmit").click();
  const added = termEl.textContent.slice(before);
  out.push("echo_has_day=" + added.includes("amort 3600 360 房租"));
  out.push("echo_has_at_day=" + added.includes("@2027-08-17"));
  out.push("no_first_of_month=" + !added.includes("@2027-08-01"));
  out.push("modal_closed=" + !document.getElementById("modalWrap").classList.contains("open"));
  const d=document.createElement("div"); d.id="PROBE";
  d.textContent = "PROBE::" + out.join(" ;; ") + "::END";
  document.body.appendChild(d);
});
</script>
</body>`;
const OUT = process.argv[2] || path.join(os.tmpdir(), "bt-demo-amort.html");
fs.writeFileSync(OUT, html.replace(/<\/body>/, inject), "utf8");
console.log("written", OUT);
