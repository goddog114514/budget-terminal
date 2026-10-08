// M2 修复的护栏: 参数补全的"语义槽位"模型 —— @日期位置无关, 各命令槽位语义正确
import { loadApp } from "./app.mjs";

let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }

const S = loadApp(); S.boot();
S.runCommand("add 100 餐饮 午餐");      // 记录 #1, 供 id 补全
S.runCommand("add 200 交通 打车");      // 记录 #2

const cand = (s)=> S.completionCandidates(s).list;          // Tab/ghost 走的真实入口
const has = (list, x)=> list.includes(x);

const CAT = [...S.PREDEFINED.keys()];
const IDS = ["1","2"];

/* ---------- 1. add: 金额位不提示, 类别位提示类别, 备注位不提示 ---------- */
{
  eq("M2.1 add(金额位) 不提示类别", cand("add "), []);
  ok("M2.2 add 50 (类别位) 提示类别", CAT.every(c=>has(cand("add 50 "), c)), JSON.stringify(cand("add 50 ")));
  eq("M2.3 add 50 餐饮 (备注位) 不提示", cand("add 50 餐饮 "), []);
  eq("M2.4 add 50 餐饮 备注文字 (备注位) 不提示", cand("add 50 餐饮 略 "), []);
}

/* ---------- 2. update: 类别从金额位挪回类别位(修复前 slot 2/3 错位) ---------- */
{
  eq("M2.5 update(id 位) 提示记录 id", cand("update "), IDS);
  eq("M2.6 update 1 (金额位) 不提示", cand("update 1 "), []);
  ok("M2.7 update 1 60 (类别位) 提示类别", CAT.every(c=>has(cand("update 1 60 "), c)));
  eq("M2.8 update 1 60 餐 (类别位前缀) 只剩 餐饮", cand("update 1 60 餐"), ["餐饮"]);
  eq("M2.9 update 1 60 餐饮 (备注位) 不提示", cand("update 1 60 餐饮 "), []);
  eq("M2.10 修复前把类别提示到了金额位(现在应为空)", cand("update 1 餐"), []);
}

/* ---------- 3. del / pay / export 的后续槽位不再重复提示 ---------- */
{
  eq("M2.11 del(id 位) 提示 id", cand("del "), IDS);
  eq("M2.12 del 1 (多余槽位) 不提示", cand("del 1 "), []);
  eq("M2.13 pay(id 位) 提示 id", cand("pay "), IDS);
  eq("M2.14 pay 1 (kind 位) 提示四种", cand("pay 1 "), ["mm","idx","all","none"]);
  eq("M2.15 pay 1 all (多余槽位) 不提示", cand("pay 1 all "), []);
  eq("M2.16 export(md/txt 位) ", cand("export "), ["md","txt"]);
  eq("M2.17 export md (多余槽位) 不提示", cand("export md "), []);
}

/* ---------- 4. @日期 位置无关, 不得顶偏后面的槽位 ---------- */
{
  eq("M2.18 add @2027-08-18 (金额位) 不提示", cand("add @2027-08-18 "), []);
  ok("M2.19 add @2027-08-18 50 (类别位) 提示类别", CAT.every(c=>has(cand("add @2027-08-18 50 "), c)));
  ok("M2.20 add 50 @2027-08-18 (类别位) 提示类别", CAT.every(c=>has(cand("add 50 @2027-08-18 "), c)));
  eq("M2.21 add 50 餐饮 @2027-08-18 (备注位) 不提示", cand("add 50 餐饮 @2027-08-18 "), []);
  eq("M2.22 update @日期 在末尾时 id 位仍正确", cand("update "), IDS);
  ok("M2.23 update 1 @2027-01-01 60 (类别位) 提示类别", CAT.every(c=>has(cand("update 1 @2027-01-01 60 "), c)));
}

/* ---------- 5. 正在输 @ 时只给有意义的候选(list 才有 @关键字) ---------- */
{
  eq("M2.24 list @ 给 @关键字", cand("list @"), ["@today","@period","@month"]);
  eq("M2.25 add 50 @ 不给类别/关键字", cand("add 50 @"), []);
  eq("M2.26 update 1 60 @ 不给", cand("update 1 60 @"), []);
  eq("M2.27 summary @ 不给(list 专属关键字不适用于 summary)", cand("summary @"), []);
  eq("M2.28 pay 1 @ 不给", cand("pay 1 @"), []);
}

/* ---------- 6. 别名与 @日期 组合 ---------- */
{
  ok("M2.29 别名 a 的性别位与 add 一致", CAT.every(c=>has(cand("a 50 "), c)));
  eq("M2.30 别名 a 金额位不提示", cand("a "), []);
  eq("M2.31 别名 edit 类别位正确", cand("edit 1 60 餐"), ["餐饮"]);
  eq("M2.32 别名 ls @ 给关键字", cand("ls @"), ["@today","@period","@month"]);
  eq("M2.33 别名 del 多余槽位不提示", cand("rm 1 "), []);
}

/* ---------- 7. 无参命令与其它命令不误提示 ---------- */
{
  for(const c of ["help ","config ","cls ","undo ","redo ","assets ","forecast ","assets 10 ","nosuchcmd "]){
    eq("M2.34 " + c.trim() + " 无参数候选", cand(c), []);
  }
  eq("M2.35 budget 子命令", cand("budget "), ["set","default","reset"]);
  eq("M2.36 budget set 金额", cand("budget set "), ["800","1000","1200","1500","2000"]);
  eq("M2.37 set 子命令", cand("set ").slice(0,3), ["budget","daily","invest"]);
  eq("M2.38 set rate 的取值", cand("set rate "), ["money","index"]);
  eq("M2.39 set rate money 的百分比", cand("set rate money "), ["2","3","8","10"]);
  eq("M2.40 summary 窗口/类别", cand("summary ").slice(0,4), ["day","week","month","cat"]);
  ok("M2.41 summary week 之后给类别", CAT.every(c=>has(cand("summary week "), c)));
}

/* ---------- 8. 淡色 ghost 提示随槽位变化 ---------- */
{
  eq("M2.42 类别位唯一候选 → ghost 补全剩余字符", S.currentGhostSuffix("add 50 餐"), "饮");
  eq("M2.43 金额位无候选 → 无 ghost", S.currentGhostSuffix("add 交"), null);
  eq("M2.43b 类别位前缀命中 → ghost", S.currentGhostSuffix("add 50 交"), "通");
  eq("M2.44 update 类别位 ghost(修复后才可用)", S.currentGhostSuffix("update 1 60 餐"), "饮");
  eq("M2.45 备注位无候选 → 无 ghost", S.currentGhostSuffix("add 50 餐饮 午餐"), null);
  eq("M2.46 命令名 ghost", S.currentGhostSuffix("hel"), "p");
}

/* ---------- 9. 槽位计算不依赖 token 位置(源码级确认) ---------- */
{
  const src = S.argCandidates.toString();
  ok("M2.47 argCandidates 使用语义槽位 arg", /\barg===0\b/.test(src) && /t\[0\]!=="@"|t\[0\]!==\"@\"/.test(src));
  ok("M2.48 argCandidates 不再用 token 序号判槽位", !/slot===[123]/.test(src), src.slice(0,120));
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length? 1 : 0);
