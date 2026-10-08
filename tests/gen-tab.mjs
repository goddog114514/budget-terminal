// 真实浏览器里验证 Tab 补全(M2): 用真实 keydown 事件驱动, 结果写进 DOM 供 --dump-dom 读取
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
  run("add 100 餐饮 午餐");
  run("add 200 交通 打车");
  const R={};
  const tabOnce=(text)=>{
    inp.focus();
    // 复位补全循环状态: 真实输入时每敲一个普通字符都会把 comp 清空, 这里用一次普通 keydown 模拟
    inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Shift",bubbles:true}));
    inp.value=text;
    inp.dispatchEvent(new Event("input",{bubbles:true}));      // 触发淡色 ghost 预览
    const ghostBefore = document.getElementById("ghost").textContent||"";
    inp.dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true}));
    return { value: inp.value, ghostBefore, ghostAfter: (document.getElementById("ghost").textContent||"") };
  };
  // 1) update 的类别位(修复前此处补不出来)
  R.update_cat   = tabOnce("update 1 60 餐");
  // 2) update 的金额位(不应提示类别)
  R.update_amt   = tabOnce("update 1 餐");
  // 3) add 金额位(不应提示类别)
  R.add_amt      = tabOnce("add 餐");
  // 4) add 类别位
  R.add_cat      = tabOnce("add 50 餐");
  // 5) 别名 a 的类别位
  R.alias_cat    = tabOnce("a 50 交");
  // 6) @日期 在中间: 类别位仍正确
  R.at_middle    = tabOnce("add @2027-08-18 50 餐");
  // 7) list 的 @关键字
  R.list_at      = tabOnce("list @t");
  // 8) 多候选时打印候选清单
  const before = document.getElementById("term").children.length;
  tabOnce("add 50 ");
  R.multi_hint   = document.getElementById("term").children.length > before;
  R.multi_value  = inp.value;
  R.ghost_left   = document.getElementById("ghost").style.left;
  const d=document.createElement("div"); d.id="TABPROBE";
  d.textContent="TAB::"+JSON.stringify(R)+"::END";
  document.body.appendChild(d);
});
</script>
</body>`;
/* 输出默认落在系统临时目录, 不污染仓库; 需要固定路径就传第一个参数 */
const OUT = process.argv[2] || path.join(os.tmpdir(), "bt-demo-tab.html");
fs.writeFileSync(OUT, html.replace(/<\/body>/, inject), "utf8");
console.log("written", OUT);

