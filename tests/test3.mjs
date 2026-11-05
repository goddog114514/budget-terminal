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

/* ---------- 8. v0.0.11 统一视觉: 标题 / 比例条 / 堆叠条 / 类别行 / 迷你柱 ----------
   这四类图形块是 budget / forecast / assets / summary / config 与图表共用的视觉语言,
   断言只看"结构 + 比例", 不看像素(像素要靠 tests/gen-chart.mjs 的浏览器探针)。 */
{
  const S = loadApp({ now:"2027-11-30" }); S.boot();
  S.runCommand("add 300 餐饮 x"); S.runCommand("add 100 交通 y"); S.runCommand("pay full");

  S.clearTerm();
  const h = S.sectionHead("测试标题", "副标题");
  ok("V1 sectionHead 以 ▓ 起头、带副标题与 chart-h 类",
     /▓ 测试标题/.test(h.textContent) && /副标题/.test(h.textContent) && /chart-h/.test(h.className),
     h.textContent + " | " + h.className);
  eq("V2 chartHead 与 sectionHead 同一套类名", S.chartHead("柱状图").className, "l chart-h");

  S.clearTerm();
  const rb = S.ratioBar(0.5, {label:"进度", sub:"说明"});
  const track = rb.children.find(c=>c.className==="hbar");
  const fill = track.children.find(c=>c.className==="hbar-fill");
  ok("V3 未超额: 填充宽 = ratio×100%", fill.style.width === "50.00%", fill.style.width);
  ok("V4 未超额: 100% 刻度落在轨道右端",
     track.children.some(c=>c.className==="hbar-100" && c.style.left==="100.00%"),
     JSON.stringify(track.children.map(c=>[c.className, c.style.left])));

  S.clearTerm();
  const rb2 = S.ratioBar(2, {label:"超额"});
  const t2 = rb2.children.find(c=>c.className==="hbar");
  ok("V5 超额: 填充拉满且刻度落在 1/r",
     t2.children.find(c=>c.className==="hbar-fill").style.width==="100.00%"
     && t2.children.some(c=>c.className==="hbar-100" && c.style.left==="50.00%"),
     JSON.stringify(t2.children.map(c=>[c.className, c.style.left, c.style.width])));

  S.clearTerm();
  const stk = S.stackBar([{label:"A",value:75,color:S.COLOR.green},
                          {label:"B",value:25,color:S.COLOR.cyan}], {title:"构成"});
  const segs = stk.children.find(c=>c.className==="stack").children;
  ok("V6 堆叠条按占比分配宽度",
     segs.length===2 && segs[0].style.width==="75.00%" && segs[1].style.width==="25.00%",
     JSON.stringify(segs.map(s=>s.style.width)));

  S.clearTerm();
  const cr = S.catRows([["餐饮",300],["交通",100]], 400);
  ok("V7 类别行 = 类别数, 含占比与金额",
     cr.children.length===2 && /75\.0%/.test(cr.textContent) && /300\.00/.test(cr.textContent),
     cr.textContent);

  S.clearTerm();
  const mb = S.miniBars([{label:"现在",value:100},{label:"第1年",value:200}]);
  const hh = mb.children.map(c=>c.children.find(x=>x.className==="chart-bar").style.height);
  ok("V8 迷你柱高与数值成比例(最高柱 = MINI_PLOT_H)",
     hh[0]==="64px" && hh[1]===S.MINI_PLOT_H+"px", JSON.stringify(hh));

  /* ---- 负值必须能画出来(v0.0.12 bug: 负值柱高算成负数被夹到 2px -> 图形"不显示") ---- */
  S.clearTerm();
  const mbNeg = S.miniBars([{label:"现在",value:-100},{label:"第1年",value:-50}]);
  const negBars = mbNeg.children.filter(c=>c.className==="chart-col")
    .map(c=>c.children.find(x=>x.className==="chart-bar"));
  const negH = negBars.map(b=>b.style.height);
  ok("V8b 全负数据仍有按比例可见的柱高(不再压成 2px)",
     negH.length===2 && negH[0]===S.MINI_PLOT_H+"px" && negH[1]===Math.round(S.MINI_PLOT_H*0.5)+"px",
     JSON.stringify(negH));
  ok("V8c 负值柱从零轴向下长(底边 >= 0 且依次上移)",
     negBars.every(b=>Number(String(b.style.bottom).replace("px","")) >= 0)
     && Number(negBars[0].style.bottom.replace("px","")) < Number(negBars[1].style.bottom.replace("px","")),
     JSON.stringify(negBars.map(b=>b.style.bottom)));
  ok("V8d 出现 0 刻度线", mbNeg.children.some(c=>c.className==="chart-zero"),
     mbNeg.children.map(c=>c.className).join("|"));

  S.clearTerm();
  const stkNeg = S.stackBar([{label:"现金",value:-75,color:S.COLOR.red},
                             {label:"货币基金",value:25,color:S.COLOR.cyan}], {title:"含负值构成"});
  const barNeg = stkNeg.children.find(c=>/^stack(\s|$)/.test(c.className));
  const segNeg = barNeg.children.filter(c=>c.tagName==="I");
  const zeroEl = barNeg.children.find(c=>c.className==="stack-zero");
  ok("V6b 负值段不再被过滤(现金 -75 仍参与绘制)", segNeg.length===2,
     JSON.stringify(segNeg.map(s=>[s.style.left,s.style.width])));
  ok("V6c 含负值时按零轴排版: 负段在左 75%、正段在右 25%",
     segNeg.length===2 && segNeg[0].style.left==="0.00%" && segNeg[0].style.width==="75.00%"
     && segNeg[1].style.left==="75.00%" && segNeg[1].style.width==="25.00%",
     JSON.stringify(segNeg.map(s=>[s.style.left,s.style.width])));
  ok("V6d 含负值时标出零轴位置", !!zeroEl && zeroEl.style.left==="75.00%",
     zeroEl ? zeroEl.style.left : "none");

  const clsOf = (cmd)=>{ S.clearTerm(); S.runCommand(cmd); return S.term.children.map(c=>String(c.className)).join("|"); };
  const bk = clsOf("budget"), fk = clsOf("forecast"), ak = clsOf("assets"), sk = clsOf("summary");
  ok("V9 budget 输出带比例条", /hbar/.test(bk), bk);
  ok("V10 forecast 输出带堆叠条 + 比例条", /stack/.test(fk) && /hbar/.test(fk), fk);
  ok("V11 assets 输出带资产构成堆叠条 + 迷你柱图", /stack/.test(ak) && /chart-bars mini/.test(ak), ak);
  ok("V12 summary 类别条改 DOM, 输出里不再有 █░ 字符条",
     /cat-rows/.test(sk) && !/[█░]/.test(S.lines().join("\n")), sk);
}

/* ---------- 9. v0.0.11 同版迭代: 进度条改"方形 + 分色" ----------
   形状: 直角方形(无圆角)、无点阵/斜纹; 配色: 已用=语义色实心, 剩余=同色 16% 实色块。
   顶部栏的「发放进度」与终端里的 ratioBar 必须用同一份 hbarTrack()。 */
{
  ok("V13 .hbar/.hbar-fill 是直角方形(无 border-radius)",
     /\.hbar\{[^}]*border-radius:0/.test(cssBlock) && /\.hbar-fill\{[^}]*border-radius:0/.test(cssBlock)
     && !/\.hbar\{[^}]*border-radius:[1-9]/.test(cssBlock), "");
  ok("V14 进度条不再用点阵/斜纹背景(剩余段是实色块)",
     !/\.hbar\{[^}]*repeating-(linear|radial)-gradient/.test(cssBlock)
     && /\.hbar-rest\{[^}]*border-radius:0/.test(cssBlock), "");

  const S = loadApp({ now:"2027-11-30" }); S.boot();
  S.clearTerm();
  const rb = S.ratioBar(0.25, {label:"进度"});
  const track = rb.children.find(c=>c.className==="hbar");
  const fill = track.children.find(c=>c.className==="hbar-fill");
  const rest = track.children.find(c=>c.className==="hbar-rest");
  ok("V15 已用 / 剩余两段宽度互补且都带在 DOM 上",
     fill.style.width==="25.00%" && rest && rest.style.width==="75.00%",
     JSON.stringify([fill.style.width, rest && rest.style.width]));
  ok("V16 剩余段用同色低透明度(分色, 不是纯色/点阵)",
     rest.style.background === S.withAlpha(S.COLOR.green, 0.16), rest.style.background);

  /* 顶部栏: 发放进度必须是 DOM 方形条 + 百分比, 不再是 █░ 字符 */
  const bar = S.__doc.getElementById("statusbar");
  const all = [];
  const walk = (n)=>{ for(const c of (n.children||[])){ all.push(c); walk(c); } };
  walk(bar);
  ok("V17 顶部栏「发放进度」用 hbar-mini(不是字符条)",
     all.some(e=>String(e.className).includes("hbar-mini"))
     && all.some(e=>String(e.className).includes("hbar-pct"))
     && !/█|░/.test(bar.textContent), bar.textContent.slice(0,120));
  ok("V18 顶部栏与终端共用 hbarTrack(只有一份实现)",
     (jsCode.match(/function hbarTrack\(/g)||[]).length === 1
     && /hbarTrack\(st\.ratio/.test(jsCode), "");
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
    /* v0.0.12: 资产看板堆叠条与柱状图必须随屏幕分辨率伸缩, 不许再写死宽度/高度 */
    ["柱状图占满可用宽度", /\.chart-bars\{[\s\S]{0,320}width:100%/],
    ["柱列均分宽度",      /\.chart-col\{[\s\S]{0,120}flex:1 1 0/],
    ["柱宽随列宽收放",    /\.chart-bar\{[\s\S]{0,200}width:clamp\(/],
    ["柱高由 --plot-h 驱动", /height:calc\(var\(--plot-h/],
    ["堆叠条不再有 640px 上限", /\.stack-wrap\{[^}]*max-width:100%/],
  ];
  for(const [name, re] of must) ok("R " + name, re.test(cssBlock), String(re));
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length? 1 : 0);
