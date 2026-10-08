// 生成只跑 help 的演示页, 用于截图核对命令表(别名/M1 修复后的排版)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HTML_PATH } from "./env.mjs";
const html = fs.readFileSync(HTML_PATH, "utf8");
const inject = `
<script>
window.addEventListener("load",()=>{
  const inp=document.getElementById("cmdline");
  const run=(c)=>{ inp.value=c; inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})); };
  run("help");
  const t=document.getElementById("term"); t.style.scrollBehavior="auto"; t.scrollTop = t.scrollHeight;   // 滚到底, 让表格进入截图
});
</script>
</body>`;
/* 输出默认落在系统临时目录, 不污染仓库; 需要固定路径就传第一个参数 */
const OUT = process.argv[2] || path.join(os.tmpdir(), "bt-demo-help.html");
fs.writeFileSync(OUT, html.replace(/<\/body>/, inject), "utf8");
console.log("written", OUT);


