// 生成 H5(双通道对称 + 弹窗编辑) 验证页: 真实点击工具栏「配置」、理财条「全额投资」、列表行「✎ 编辑」。
// 用于 Edge --dump-dom 取值(与截图)。H5 的三条通道都必须在真实浏览器里跑通。
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
  const term=document.getElementById("term");
  const run=(c)=>{ inp.value=c; inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})); };
  const termButtons=()=>[...document.querySelectorAll("#term button")];

  /* ---- 通道 1: 工具栏「配置」按钮(以前 config 只有命令行) ---- */
  const cfgBtn = document.querySelector('nav.toolbar button[data-cmd="config"]');
  out.push("config_btn_exists=" + !!cfgBtn);
  const beforeCfg = term.textContent.length;
  if(cfgBtn) cfgBtn.click();
  out.push("config_btn_runs=" + /当前配置/.test(term.textContent.slice(beforeCfg)));

  /* ---- 通道 2: 理财条「全额投资」按钮回灌 pay full 命令 ---- */
  run("add 850 购物 big");                    // 货币池 ~130 / 指数池 ~20 → 两个按钮点亮
  const fullBtn=termButtons().find(b=>b.textContent.indexOf("全额投资")>=0)
             || [...document.querySelectorAll("#investbar button")].find(b=>b.textContent.indexOf("全额投资")>=0);
  out.push("full_btn_ready=" + (!!fullBtn && !fullBtn.disabled));
  const beforeFull = term.textContent.length;
  if(fullBtn) fullBtn.click();
  const fullOut = term.textContent.slice(beforeFull);
  out.push("full_btn_echoes_payfull=" + /pay full (mm|idx)/.test(fullOut));
  out.push("full_btn_invested=" + /已全额投资/.test(fullOut));

  /* ---- 通道 3: 列表行「✎ 编辑」→ 弹窗编辑态 → 提交走 update ---- */
  run("add 50 餐饮 午餐");
  run("list");
  const editBtn=termButtons().find(b=>b.textContent.indexOf("✎ 编辑")>=0);
  out.push("edit_btn_exists=" + !!editBtn);
  if(editBtn) editBtn.click();
  out.push("edit_mode_title=" + document.getElementById("mTitle").textContent);
  out.push("edit_tabs_hidden=" + (document.getElementById("mTabs").style.display==="none"));
  out.push("edit_prefill_amt=" + document.getElementById("f_amt").value);
  out.push("edit_prefill_cat=" + document.getElementById("f_cat").value);
  out.push("edit_prefill_note=" + document.getElementById("f_note").value);
  const set=(id,v)=>{ const el=document.getElementById(id); el.value=v; el.dispatchEvent(new Event("input",{bubbles:true})); };
  set("f_amt","80"); set("f_cat","交通"); set("f_note","打车");
  const beforeUpd=term.textContent.length;
  document.getElementById("btnSubmit").click();
  const updOut=term.textContent.slice(beforeUpd);
  out.push("edit_submits_update=" + /update 1 80 交通/.test(updOut));
  out.push("edit_no_new_add=" + !/^\\s*add /m.test(updOut));
  const cntBefore = 0; void cntBefore;
  run("list");
  const cats=[...document.querySelectorAll("#term .l")].map(e=>e.textContent).filter(t=>t.indexOf("交通")>=0);
  const newest=cats.length? cats[cats.length-1] : "";
  out.push("edit_row_updated=" + (/交通/.test(newest) && /80\\.00/.test(newest)));
  run("add 1 餐饮 probe");     // 触发一次刷新, 确认新增仍走 add(不受编辑态影响)
  const addLine=[...document.querySelectorAll("#term .l")].map(e=>e.textContent).filter(t=>/add 1 餐饮 probe/.test(t));
  out.push("add_still_works=" + (addLine.length>0));

  const d=document.createElement("div"); d.id="PROBE";
  d.textContent = "PROBE::" + out.join(" ;; ") + "::END";
  document.body.appendChild(d);
});
</script>
</body>`;
const OUT = process.argv[2] || path.join(os.tmpdir(), "bt-h5.html");
fs.writeFileSync(OUT, html.replace(/<\/body>/, inject), "utf8");
console.log("written", OUT);
