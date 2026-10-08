// P1 重构护栏: 颜色令牌 / kvRow 统一渲染器 / 窗口自适应列宽 / 死代码已删除 / 响应式 CSS 未被破坏
import fs from "node:fs";
import { loadApp } from "./app.mjs";
import { HTML_PATH } from "./env.mjs";

const HTML = HTML_PATH;
const html = fs.readFileSync(HTML, "utf8");
const jsIdx = html.indexOf("<script>");
const css = html.slice(0, jsIdx);
const js  = html.slice(jsIdx);
const styleEnd = css.indexOf("</style>");
const cssBlock = css.slice(0, styleEnd);
/* 去掉注释后再做"还有没有旧写法"的断言, 否则说明性注释会被误判 */
const jsCode = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }

/* ---------- 1. 颜色令牌: CSS 与 JS 必须同名同值 ---------- */
{
  const cssVars = {};
  for(const m of cssBlock.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) cssVars[m[1]] = m[2].toLowerCase();

  const S = loadApp(); S.boot();
  const C = S.COLOR;
  const JOINT = { green:"--green", greenDim:"--green-dim", white:"--white", pure:"--pure",
                  yellow:"--yellow", orange:"--orange", red:"--red", cyan:"--cyan",
                  magenta:"--magenta", gray:"--gray", index:"--index", faint:"--faint",
                  catFallback:"--cat-fallback" };
  for(const [k, cssName] of Object.entries(JOINT)){
    ok("C1 CSS 定义了 " + cssName, typeof cssVars[cssName.replace("--","")] === "string", JSON.stringify(cssVars));
    eq("C2 COLOR." + k + " 与 CSS " + cssName + " 同值", String(C[k]).toLowerCase(), cssVars[cssName.replace("--","")]);
  }
  eq("C3 类别调色板 10 色", S.CAT_PALETTE.length, 10);
  ok("C4 默认类别取调色板", S.PREDEFINED.get("餐饮") === C.green, S.PREDEFINED.get("餐饮"));
  ok("C5 未登记类别兜底色一致", S.PREDEFINED.get("不存在的类别") === undefined);
}

/* ---------- 2. JS 里不再有散落的颜色字面量(只允许 COLOR 定义块 + 调色板 2 个扩展色) ---------- */
{
  const quoted = js.match(/"#[0-9a-fA-F]{6}"/g) || [];
  eq("C6 JS 内引号 hex 只剩 15 个(13 个 COLOR 默认值 + 2 个调色板扩展色)", quoted.length, 15);
  ok("C7 终端输出里没有 c:\"#...\" 形式", !/c:\s*"#/.test(js));
  ok("C8 style.color 不再直接赋 hex", !/style\.color\s*=\s*"#/.test(js));
}

/* ---------- 3. kvRow: 唯一渲染器 + 列宽行为 ---------- */
{
  const S = loadApp(); S.boot();
  ok("K1 kvRow 存在", typeof S.kvRow === "function");
  ok("K2 KV_MIN/KV_MAX 合理", S.KV_MIN === 14 && S.KV_MAX === 24, [S.KV_MIN,S.KV_MAX].join("/"));

  const el = S.kvRow("键", "值", 20);
  eq("K3 行由 2 个 span 组成", el.children.length, 2);
  eq("K4 标签列总宽 = width(含 2 空格缩进)", el.children[0].textContent.length, 20);
  eq("K5 标签内容", el.children[0].textContent.trim(), "键");
  eq("K6 值内容", el.children[1].textContent, "值");
  eq("K7 标签用 gray", el.children[0].style.color, S.COLOR.gray);
  eq("K8 值默认用 white", el.children[1].style.color, S.COLOR.white);
  eq("K9 自定义颜色生效", S.kvRow("k","v",20,S.COLOR.red).children[1].style.color, S.COLOR.red);
  eq("K10 glow 类生效", S.kvRow("k","v",20,S.COLOR.red,true).children[1].className, "glow");

  // 无布局信息(Node stub)时用默认列宽
  eq("K11 无布局时用 KV_MAX", S.kvColWidth(), S.KV_MAX);
  eq("K12 无布局时 termCols()=0", S.termCols(), 0);
}

/* ---------- 4. 四条输出路径列宽统一(summary/forecast/assets/config) ---------- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 300 餐饮 x");
  const colOf = (cmd, needle)=>{
    S.clearTerm(); S.runCommand(cmd);
    const ln = S.lines().find(l=>l.includes(needle));
    return ln ? ln.indexOf("¥") : -1;
  };
  const cols = {
    summary:  colOf("summary", "窗口总消费"),
    forecast: colOf("forecast", "日均消费"),
    assets:   colOf("assets", "货币基金 本金"),
    config:   colOf("config", "默认周期预算"),
  };
  ok("U1 四类输出都能定位到值列", Object.values(cols).every(c=>c>0), JSON.stringify(cols));
  eq("U2 四条路径列宽完全一致", new Set(Object.values(cols)).size, 1, JSON.stringify(cols));
  eq("U3 宽屏列宽 = KV_MAX", cols.summary, S.KV_MAX);
}

/* ---------- 5. 窄窗口自适应(分辨率/窗口大小适配) ---------- */
{
  const S = loadApp(); S.boot();
  const term = S.term;
  const resize = (w)=>{ term.clientWidth = w; (S.__window._listeners.resize||[]).forEach(f=>f()); };
  ok("A1 宽屏(1400px)列宽取上限", (resize(1400), S.kvColWidth()) === S.KV_MAX, S.kvColWidth());
  const narrow = (resize(500), S.kvColWidth());
  ok("A2 窄屏(500px)自动收窄", narrow < S.KV_MAX && narrow >= S.KV_MIN, String(narrow));
  eq("A3 500px 下按 26% 计算", narrow, Math.max(S.KV_MIN, Math.round(500/8*0.26)), String(narrow));
  eq("A4 极窄(200px)不低于下限", (resize(200), S.kvColWidth()), S.KV_MIN);

  // 窄屏下重新输出, 值列应真的跟着变窄, 且标签不会被挤到下一行
  resize(500);
  S.clearTerm(); S.runCommand("config");
  const ln = S.lines().find(l=>l.includes("默认周期预算"));
  eq("A5 窄屏输出使用新列宽", ln.indexOf("¥"), narrow);
  ok("A6 窄屏下标签未被截断", ln.includes("默认周期预算"), ln);
  resize(1400);
  S.clearTerm(); S.runCommand("config");
  eq("A7 恢复宽屏后列宽回弹", S.lines().find(l=>l.includes("默认周期预算")).indexOf("¥"), S.KV_MAX);
}

/* ---------- 6. 死代码/死 CSS 已删除 ---------- */
{
  const S = loadApp(); S.boot();
  const syms = S.deadSyms();
  for(const [k,v] of Object.entries(syms)) eq("D1 已删除 " + k, v, "undefined");
  for(const sel of ["table.kv", ".bar-track", ".bar-fill", ".lvl-0", ".line0,", ".tag{", ".error{"]){
    ok("D2 CSS 已删除 " + sel, !cssBlock.includes(sel), sel);
  }
  ok("D3 只剩一个 kvRow 渲染器实现", (jsCode.match(/function kvRow\(/g)||[]).length === 1);
  ok("D4 不再有 4 套 padEnd 表格", !/padEnd\(2[0-9]/.test(jsCode));
  ok("D5 不再有重复的本地 row() 实现", (jsCode.match(/const row=\(k,v,c\)=>line\(/g)||[]).length === 0);
  ok("D6 保留的 row() 只是 kvRow 的别名", (jsCode.match(/const row=\(k,v,c\)=>kvRow\(/g)||[]).length === 2);
}

/* ---------- 7. 响应式布局规则必须保留 ---------- */
{
  const must = [
    ["header 换行",      /header\{[\s\S]{0,200}flex-wrap:wrap/],
    ["工具栏换行",        /nav\.toolbar\{[\s\S]{0,200}flex-wrap:wrap/],
    ["理财条换行",        /#investbar\{[\s\S]{0,200}flex-wrap:wrap/],
    ["弹窗宽度自适应",     /width:min\(560px,94vw\)/],
    ["弹窗高度自适应",     /max-height:90vh/],
    ["终端垂直滚动",      /#term\{[\s\S]{0,200}overflow-y:auto/],
    ["长行自动换行",      /\.l\{white-space:pre-wrap/],
    ["输入区不撑破布局",   /\.inwrap\{[\s\S]{0,120}overflow:hidden/],
    ["日期输入可收缩",     /min-width:0/],
    ["整体不出现双滚动条", /body\{[\s\S]{0,220}overflow:hidden/],
    ["终端字号固定",      /#term\{[\s\S]{0,120}font-size:14px/],
  ];
  for(const [name, re] of must) ok("R " + name, re.test(cssBlock), String(re));
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length? 1 : 0);
