// 生成带"探针"的演示页: 在应用脚本内部暴露真实运行期的 COLOR / kvColWidth,
// 再由外部脚本把结果写进 DOM, 便可用 Edge --dump-dom 精确读取(而不是靠肉眼看截图)。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HTML_PATH } from "./env.mjs";
const SRC = HTML_PATH;
/* 输出默认落在系统临时目录, 不污染仓库; 需要固定路径就传第一个参数 */
const OUT = process.argv[2] || path.join(os.tmpdir(), "bt-demo-probe.html");
const CLEAN = process.argv[3] === "clean";   // clean = 不注入探针, 只用于截图

let html = fs.readFileSync(SRC, "utf8");

const probeInside = `
window.__PROBE = function(){
  let cs = null; try{ cs = getComputedStyle(document.documentElement); }catch(e){}
  const cssVar = (n)=>{ try{ return String(cs.getPropertyValue(n)||"").trim(); }catch(e){ return ""; } };
  const t = document.getElementById("term");
  return {
    js_green: COLOR.green,        css_green: cssVar("--green"),
    js_index: COLOR.index,        css_index: cssVar("--index"),
    js_pure:  COLOR.pure,         css_pure:  cssVar("--pure"),
    js_faint: COLOR.faint,        css_faint: cssVar("--faint"),
    js_cat_fallback: COLOR.catFallback, css_cat_fallback: cssVar("--cat-fallback"),
    kv_width: kvColWidth(), term_cols: termCols(), kv_min: KV_MIN, kv_max: KV_MAX,
    term_client: t ? t.clientWidth : -1, term_font: t ? getComputedStyle(t).fontSize : ""
  };
};`;

// 把探针注入到应用脚本内部(这样才能访问闭包里的 COLOR)
html = html.replace(/<\/script>/, probeInside + "\n</script>");

const probeOutside = `
<script>
window.addEventListener("load",()=>{
  const inp=document.getElementById("cmdline");
  const run=(c)=>{ inp.value=c; inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})); };
  run("add 300 餐饮 午餐");
  run("summary");
  run("forecast");
  run("assets 10");
  run("config");
  const p = window.__PROBE ? window.__PROBE() : {};
  const de = document.documentElement;
  p.inner_w = window.innerWidth;
  p.doc_scroll_w = de.scrollWidth;
  p.doc_client_w = de.clientWidth;
  p.overflow_x = de.scrollWidth > de.clientWidth;      // 是否出现横向滚动(适配性)
  p.toolbar_rows = new Set([...document.querySelectorAll("nav.toolbar button")].map(b=>Math.round(b.getBoundingClientRect().top))).size;
  p.header_rows  = new Set([...document.querySelectorAll("#statusbar .stat")].map(e=>Math.round(e.getBoundingClientRect().top))).size;
  const d=document.createElement("div"); d.id="PROBE";
  d.textContent = "PROBE::" + JSON.stringify(p) + "::END";
  document.body.appendChild(d);
});
</script>
</body>`;
html = html.replace(/<\/body>/, probeOutside);
fs.writeFileSync(OUT, html, "utf8");
console.log("written", OUT, html.length);

