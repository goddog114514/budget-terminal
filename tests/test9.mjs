// v0.0.13 查找专项护栏: search 命令(类别/编号/关键词/金额/日期) + 工具栏单一搜索框。
// 重点: 查询解析与匹配是"条件组合", 结果行必须与消费列表完全同构(按钮/合计口径/文本一致)。
import fs from "node:fs";
import { loadApp } from "./app.mjs";
import { HTML_PATH } from "./env.mjs";

const html = fs.readFileSync(HTML_PATH, "utf8");
const js = html.slice(html.indexOf("<script>"));
const jsCode = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }

/* 冻结时钟 2027-08-30; 账本:
   #1 餐饮 午餐   ¥50      2027-08-18
   #2 交通 高铁票 ¥120     2027-08-20
   #3 购物 外套   ¥3000    2027-07-15
   #4 房租 年付   ¥3000/365 天(2027-08-30 ~ 2028-08-28)
   #5 餐饮 咖啡   ¥22.5    2027-08-30 · 地点=广东省深圳市南山区 */
function seed(){
  const A = loadApp(); A.boot();
  A.runCommand('add 50 餐饮 午餐 @2027-08-18');
  A.runCommand('add 120 交通 高铁票 @2027-08-20');
  A.runCommand('add 3000 购物 外套 @2027-07-15');
  A.runCommand('amort 3000 365 房租 年付 @2027-08-30');
  A.runCommand('add 22.5 餐饮 咖啡 @2027-08-30 #广东省深圳市南山区');
  A.clearTerm();
  return A;
}
const rowsOf = (A)=> A.term.children.filter(c=>String(c.className||"").split(/\s+/).includes("l")).map(c=>c.textContent);
const hlTexts = (A)=>{
  const out=[];
  const walk = (el)=>{
    if(!el || !el.children) return;
    for(const c of el.children.slice()){
      if(String(c.className||"").split(/\s+/).includes("hl")) out.push(c.textContent);
      walk(c);
    }
  };
  for(const c of A.term.children) walk(c);
  return out;
};

/* ---------- 1. 登记表 / help / 补全 ---------- */
{
  const A = loadApp();
  ok("SR.1 search 是主命令", A.COMMAND_NAMES.includes("search"), A.COMMAND_NAMES.join(","));
  ok("SR.2 find 是 search 的别名", A.CMD_ALIAS.find === "search", String(A.CMD_ALIAS.find));
  eq("SR.3 canonicalCmd(find)", A.canonicalCmd("find"), "search");
  A.boot(); A.clearTerm(); A.runCommand("help");
  const help = A.lines().join("\n");
  ok("SR.4 help 里有 search 用法", /search\s+<关键词\|#编号\|金额\|@日期>/.test(help), help.split("\n").filter(l=>l.includes("search")).join(" | "));
  ok("SR.5 help 别名块含 search = find", /search = find/.test(help), "");
  ok("SR.6 Tab 补全含 search/find", A.CMD_WORDS.includes("search") && A.CMD_WORDS.includes("find"), A.CMD_WORDS.join(","));
  const cand = A.argCandidates("search", 1, ["search"], "");
  ok("SR.7 参数补全给类别与日期关键字", cand.includes("餐饮") && cand.includes("@today"), JSON.stringify(cand));
  ok("SR.8 正在输入 @ 时给关键字候选", A.argCandidates("search", 2, ["search", "@"], "@").includes("@period"), "");
  ok("SR.9 别名 find 与 search 候选一致",
     JSON.stringify(A.argCandidates("find", 1, ["find"], "")) === JSON.stringify(cand), "");
}

/* ---------- 2. 查询解析(纯函数) ---------- */
{
  const A = loadApp();
  const q = A.parseSearchQuery(["餐饮", "#4", ">100", "100-200", "@2027-08"]);
  eq("SR.10 文本条件", q.text, ["餐饮"]);
  eq("SR.11 编号条件", q.id, 4);
  eq("SR.12 金额条件(比较 + 区间)", q.amount, [{op:">", v:100}, {op:"range", v:100, v2:200}]);
  eq("SR.13 月份条件", q.month, "2027-08");
  const q2 = A.parseSearchQuery(["2027-08-18"]);
  eq("SR.14 不带 @ 的 ISO 日期也能识别", q2.date, "2027-08-18");
  const q3 = A.parseSearchQuery(["今天"]);
  eq("SR.15 中文日期关键字", q3.date, "2027-08-30");
  const q4 = A.parseSearchQuery(["200-100"]);
  eq("SR.16 区间写反自动纠正", q4.amount, [{op:"range", v:100, v2:200}]);
  const q5 = A.parseSearchQuery(["#abc", "@2027-13-40"]);
  eq("SR.17 无法识别的条件进 bad(不静默忽略)", q5.bad.sort(), ["#abc", "@2027-13-40"].sort());
  const q6 = A.parseSearchQuery(["¥1,200"]);
  eq("SR.18 ¥ 前缀与千分位被归一", q6.amount, [{op:"=", v:1200}]);
  const q6b = A.parseSearchQuery(["50元"]);
  eq("SR.18b 结尾「元」被归一", q6b.amount, [{op:"=", v:50}]);
  const q7 = A.parseSearchQuery(["@2027-08", "@today"]);
  ok("SR.19 重复日期条件只取第一个并留提示",
     q7.month === "2027-08" && q7.notes.length === 1, JSON.stringify([q7.month, q7.notes]));
}

/* ---------- 3. 匹配语义 ---------- */
{
  const A = seed();
  const ids = (cmd)=>{ A.clearTerm(); A.runCommand(cmd); return rowsOf(A).filter(l=>/^#\d/.test(l)).map(l=>+l.slice(1).split(/\s/)[0]); };
  eq("SR.20 类别命中", ids("search 餐饮"), [1,5]);
  eq("SR.21 备注命中", ids("search 高铁票"), [2]);
  eq("SR.22 地点命中", ids("search 南山"), [5]);
  eq("SR.23 多关键词 AND", ids("search 餐饮 咖啡"), [5]);
  eq("SR.24 一个词也可命中另一字段(关键词间 AND)", ids("search 餐饮 南山区"), [5]);
  eq("SR.25 编号精确", ids("search #3"), [3]);
  eq("SR.26 纯数字同时按金额与编号匹配", ids("search 3000"), [3,4]);
  eq("SR.26b 纯数字命中编号(金额对不上也能按 #2 找到)", ids("search 2"), [2]);
  eq("SR.27 金额等值(小数)", ids("search 22.5"), [5]);
  eq("SR.28 金额比较 >100(按总价)", ids("search >100"), [3,2,4]);
  eq("SR.29 金额比较 <=50(分摊按总价, 不因每天 8 元混进小额)", ids("search <=50"), [1,5]);
  eq("SR.30 金额区间", ids("search 100-200"), [2]);
  eq("SR.31 分摊记录按总价命中", ids("search 3000").includes(4), true);
  eq("SR.32 日期窗口命中分摊的中间天", ids("search @2027-09-01"), [4]);
  eq("SR.33 窗口之外查不到", ids("search @2026-05-01"), []);
  eq("SR.34 月份窗口", ids("search @2027-07"), [3]);
  eq("SR.35 文本 + 日期 AND", ids("search 餐饮 @2027-08-18"), [1]);
  eq("SR.36 金额 + 日期 AND", ids("search >100 @2027-08"), [2,4]);
  eq("SR.37 编号 + 金额互相印证", ids("search #4 3000"), [4]);
  eq("SR.38 编号与金额冲突时无结果", ids("search #1 3000"), []);
  eq("SR.39 大小写不敏感(英文备注)", (()=>{
    const B = loadApp(); B.boot();
    B.runCommand("add 15 学习 Kindle");
    B.clearTerm(); B.runCommand("search kindle");
    return rowsOf(B).filter(l=>/^#\d/.test(l)).length;
  })(), 1);
}

/* ---------- 4. 输出与消费列表同构 ---------- */
{
  const A = seed();
  A.clearTerm(); A.runCommand("search 餐饮");
  const lines = A.lines();
  ok("SR.40 结果标题标明条数与条件", /▓ 查找结果\s+2 条\s+\[查找: 关键词=餐饮\]/.test(lines.join("\n")), lines.slice(0,4).join(" | "));
  const searchRows = rowsOf(A).filter(l=>/^#\d/.test(l));
  eq("SR.41 行数 = 命中数", searchRows.length, 2);

  A.clearTerm(); A.runCommand("list 餐饮");
  const listRows = rowsOf(A).filter(l=>/^#\d/.test(l));
  eq("SR.42 同行文本与 list 完全一致(高亮不改变文本)", searchRows, listRows);

  A.clearTerm(); A.runCommand("search 餐饮 咖啡");
  const hl = hlTexts(A);
  ok("SR.43 命中关键词有 .hl 高亮", hl.includes("餐饮") && hl.includes("咖啡"), JSON.stringify(hl));
  ok("SR.44 行内仍有两个按钮容器", A.term.children.filter(c=>/^#\d/.test(c.textContent)).every(c=>c.children.filter(x=>x.tagName==="BUTTON").length===2), "");

  A.clearTerm(); A.runCommand("search 餐饮");
  ok("SR.45 合计行给出金额", /合计 ¥72\.50/.test(A.lines().join("\n")), A.lines().join(" | "));

  // 带日期条件时合计按窗口天数(与 list / sumRange 同一口径)
  A.clearTerm(); A.runCommand("search @2027-09");
  const sepTotal = A.lines().find(l=>/合计 ¥/.test(l));
  const win = A.calendarMonthBounds("2027-09-01");
  const expect = A.sumRange(A.state.records.filter(r=>A.recInWindow(r,win.start,win.end)), win.start, win.end).total;
  ok("SR.46 日期条件合计 = 窗口内天数口径", sepTotal.includes("¥"+A.money(expect)), sepTotal + " vs " + expect);
  ok("SR.47 分摊合计有口径说明", /其中分摊成本/.test(A.lines().join("\n")), "");

  A.clearTerm(); A.runCommand("search 不存在的词");
  const none = A.lines().join("\n");
  ok("SR.48 无结果时提示并列出已有类别", /没有匹配的消费记录/.test(none) && /现有类别:/.test(none) && /餐饮/.test(none), none);
  A.clearTerm(); A.runCommand("search");
  ok("SR.49 空查询给用法提示", /用法: search/.test(A.lines().join("\n")), "");
  A.clearTerm(); A.runCommand("search #abc");
  const bad = A.lines().join("\n");
  ok("SR.50 非法条件黄色提示可用写法", /无法识别的查找条件/.test(bad) && /可用 #编号/.test(bad), bad);

  // 只读: 查找不产生撤销步、不改数据
  const before = [A.state.records.length, A.undoDepth, JSON.stringify(A.state.records)];
  A.runCommand("search 餐饮"); A.runCommand("search >1");
  eq("SR.51 查找不写账本、不压撤销栈", [A.state.records.length, A.undoDepth, JSON.stringify(A.state.records)], before);
}

/* ---------- 5. 结果行按钮可用(与 list 同一套) ---------- */
{
  const A = seed();
  A.clearTerm(); A.runCommand("search 咖啡");
  const row = A.term.children.find(c=>/^#5\s/.test(c.textContent));
  ok("SR.52 找到结果行", !!row, A.lines().join(" | "));
  const undoBefore = A.undoDepth;
  const btns = row.children.filter(x=>x.tagName==="BUTTON");
  btns[0].click();                       // = pay 5 all
  eq("SR.53 行内「标记已投资」在查找结果里生效", [A.state.records[4].moneyInv, A.state.records[4].indexInv].every(v=>v>0), true);
  eq("SR.54 行内按钮改动会压一步撤销", A.undoDepth, undoBefore + 1);
}

/* ---------- 6. 工具栏单一搜索框(UI 通道) ---------- */
{
  const A = seed();
  ok("SR.55 HTML 有且只有一个 id=searchBox 的输入框", (html.match(/id="searchBox"/g)||[]).length === 1, "");
  ok("SR.56 搜索框是 type=search 且占位文字覆盖四类条件",
     /<input id="searchBox" type="search"[^>]*placeholder="查找 类别\/编号\/金额\/日期…"/.test(html), "");
  ok("SR.57 搜索框在工具条内且靠右(margin-left:auto)", /nav\.toolbar \.searchbox\{margin-left:auto/.test(html), "");
  ok("SR.58 搜索框有聚焦态样式", /#searchBox:focus\{border-color:var\(--green\)/.test(html), "");
  ok("SR.59 搜索框走命令通道(源码里有 search 回灌)", /runCommand\(q \? \("search "\+q\) : "search"\)/.test(jsCode), "");

  const box = A.__doc.getElementById("searchBox");
  box._events.keydown = [];              // 同一进程里 loadApp 多次 boot 会重复绑定, 这里只留本实例
  A.bindSearch();
  A.clearTerm();
  box.value = "餐饮";
  box.dispatch("keydown", { key:"Enter", isComposing:true, preventDefault(){} });
  eq("SR.59b 输入法合成期间的回车不触发搜索(不抢跑半个词)", A.lines().length, 0);
  box.dispatch("keydown", { key:"Enter", preventDefault(){} });
  const uiLines = A.lines().slice(1).join("\n");   // 去掉命令回显
  ok("SR.60 搜索框回车显示匹配项目", /▓ 查找结果\s+2 条/.test(uiLines) && /#1\s/.test(uiLines), uiLines.slice(0,200));
  eq("SR.61 回车不会清空搜索框(方便改条件再搜)", box.value, "餐饮");
  eq("SR.62 命令输入行不被残留", A.__doc.getElementById("cmdline").value, "");

  A.clearTerm(); A.runCommand("search 餐饮");
  const cmdLines = A.lines().slice(1).join("\n");
  eq("SR.63 搜索框与命令行输出一致(双通道对称)", uiLines, cmdLines);

  box.dispatch("keydown", { key:"Escape", preventDefault(){} });
  eq("SR.64 Esc 清空搜索框", box.value, "");
  A.clearTerm();
  box.dispatch("keydown", { key:"Enter", preventDefault(){} });
  ok("SR.65 空内容回车给用法而不是错误", /用法: search/.test(A.lines().join("\n")), A.lines().join(" | "));
  ok("SR.66 搜索框不会自行改数据", A.state.records.length === 5, String(A.state.records.length));
}

/* ---------- 7. 与 list 的日期解析共用一份实现 ---------- */
{
  const A = seed();
  const D1 = A.dateCondOf("@2027-08"), D2 = A.dateCondOf("2027-08"), K = A.dateKeywordCond("本月");
  eq("SR.67 月份解析(带/不带 @ 一致)", [D1.kind, D1.month, D2.month], ["month", "2027-08", "2027-08"]);
  eq("SR.68 本月关键字仍解析成区间", K.kind, "range");
  ok("SR.69 list 仍认 @today", (()=>{ A.clearTerm(); A.runCommand("list @today"); return /筛选: 日期=2027-08-30/.test(A.lines().join("\n")); })(), A.lines().join(" | "));
  ok("SR.70 list 的错误 @ 条件仍会提示", (()=>{ A.clearTerm(); A.runCommand("list @nope"); return /无法识别的日期条件/.test(A.lines().join("\n")); })(), "");
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length? 1 : 0);
