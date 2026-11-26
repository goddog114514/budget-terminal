// v0.1.0 三页外壳(主页 / 钱包 / 设置)专项护栏:
//   A 钱包归一化与迁移 · B wallet 命令 · C 支出与钱包(付款口径) · D 「记一笔」支付钱包下拉
//   E 三页切换 · F 钱包页内联表单 · G 设置页(表单 DOM 共享挂载 + 页内直接改) · H 规范自检
import fs from "node:fs";
import { loadApp } from "./app.mjs";
import { HTML_PATH, README_PATH } from "./env.mjs";

const html = fs.readFileSync(HTML_PATH, "utf8");
const readme = fs.readFileSync(README_PATH, "utf8");

let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
function near(name, a, b){ ok(name, Math.abs(a-b) <= 0.01, "got "+a+" want "+b); }
const mk = () => { const S = loadApp(); S.boot(); return S; };
const $ = (S, id) => S.__doc.getElementById(id);
const TODAY = "2027-08-30";
/* 递归找: 按标签名 + 文本 / 类名 / dataset */
function findAll(el, pred, out){
  out = out || [];
  if(!el || !el.children) return out;
  for(const c of el.children){ if(pred(c)) out.push(c); findAll(c, pred, out); }
  return out;
}
const btn = (root, label) => findAll(root, c => String(c.tagName)==="BUTTON" && c.textContent===label)[0] || null;
const btnLike = (root, re) => findAll(root, c => String(c.tagName)==="BUTTON" && re.test(c.textContent))[0] || null;
const byCls = (root, cls) => findAll(root, c => String(c.className||"").split(/\s+/).includes(cls));
const has = (el, cls) => !!(el && el.classList && el.classList.contains(cls));
const hidden = (S, id) => has($(S, id), "page-hide");
const out = (S) => S.lines().join("\n");
const run = (S, c) => { S.clearTerm(); S.runCommand(c); return out(S); };
/* 造一个带两个钱包的标准账本: 默认钱包 ¥1000(默认) / 微信 ¥500 / 现金 ¥5000 */
function seeded(){
  const S = mk();
  run(S, 'wallet in 默认钱包 1000 启动资金');
  run(S, "wallet add 微信 500");
  run(S, "wallet add 现金 5000");
  S.clearTerm();
  return S;
}
const wid = (S, name) => (S.state.wallets.find(w => w.name===name) || {}).id;   // 变异下不能裸取 .id
const wtagOf = (cards) => { const c = cards.find(x => has(x, "default")); const t = byCls(c, "wtag")[0]; return t ? t.textContent : ""; };

/* ================= A. 归一化 / 迁移 / 备份 ================= */
{
  const S = mk();
  eq("A1 旧账本启动后自动有「默认钱包」", S.state.wallets, [{ id:1, name:"默认钱包" }]);
  eq("A2 默认钱包 id 写在 settings.walletDefault", S.state.settings.walletDefault, 1);
  eq("A3 wops 是数组", S.state.wops, []);
  eq("A4 loadState 返回记录/钱包两份丢弃计数", [typeof S.state.wallets, Array.isArray(S.state.wops)], ["object", true]);

  const old = { budget_term_v1: JSON.stringify({ settings:{ budget:900 }, seq:2,
    records:[{ id:1, amount:10, category:"餐饮", date:"2027-08-01" }, { id:2, amount:20, category:"交通", date:"2027-08-02", wallet:7 }] }) };
  const L = loadApp({ seedStorage: old }); L.boot();
  eq("A5 旧 localStorage(无 wallets)加载 → 默认钱包, 默认预算保留", [L.state.wallets.length, L.state.settings.budget], [1, 900]);
  eq("A6 旧记录 wallet=0(未指定); 指向不存在钱包的 id 归 0", L.state.records.map(r => r && r.wallet), [0, 0]);

  const n = S.normalizeWallets(
    [{ id:1, name:" 现金 " }, { id:1, name:"微信" }, { name:"微信" }, { name:"" }, { name:"x".repeat(30) }, "junk"],
    [{ wallet:1, amount:100, date:"2027-08-01", note:"a" }, { wallet:2, amount:-50 }, { wallet:3, amount:1 },
     { wallet:1, amount:0 }, { wallet:1, amount:"abc" }, { wallet:99, amount:5 }, null]);
  eq("A7 重名/空名/超长名/非对象的钱包丢弃, 重复 id 顺延", n.wallets, [{ id:1, name:"现金" }, { id:2, name:"微信" }]);
  eq("A8 流水只保留钱包存在且金额 ≠0 的项, 日期缺失回落今天",
     n.wops, [{ wallet:1, amount:100, date:"2027-08-01", note:"a", created:TODAY }, { wallet:2, amount:-50, date:TODAY, note:"", created:TODAY }]);
  eq("A9 丢弃计数 = 4 个钱包(重名/空名/超长/非对象) + 5 条流水(钱包不存在/金额为0/金额非法/钱包不存在/null)", n.dropped, 9);
  eq("A10 normalizeRecords: wallet 只认正数, 其余归 0", S.normalizeRecords([{ amount:1, date:"2027-08-01", wallet:3 }, { amount:1, date:"2027-08-01", wallet:-1 }, { amount:1, date:"2027-08-01", wallet:"x" }]).records.map(r => r && r.wallet), [3, 0, 0]);

  const R = mk();
  R.state.settings.walletDefault = 42;
  R.state.records.push({ id:99, amount:1, date:"2027-08-01", wallet:42 });
  R.ensureWallets();
  eq("A11 ensureWallets: 悬空的默认 id 回落第一个钱包", R.state.settings.walletDefault, 1);
  eq("A12 ensureWallets: 记录引用不存在的钱包 → 0", (R.state.records[0]||{}).wallet, 0);
  const Z = mk(); Z.state.wallets = []; Z.state.wops = null; Z.ensureWallets();
  eq("A13 ensureWallets: 钱包被清空 / wops 不是数组 → 就地修复", [Z.state.wallets, Array.isArray(Z.state.wops)], [[{ id:1, name:"默认钱包" }], true]);

  const B = seeded();
  run(B, "add 30 餐饮 午餐 $微信");
  const snap = JSON.parse(B.serializeState());
  eq("A14 备份带 wallets / wops", [snap.wallets.map(w => w.name), snap.wops.length, snap.records[0].wallet], [["默认钱包","微信","现金"], 3, wid(B,"微信")]);
  const C = mk();
  C.restoreFromText(JSON.stringify({ app:"budget_term", version:2, settings:{ budget:777 }, seq:0, records:[] }));
  eq("A15 旧备份(无 wallets 字段)仍能导入, 回到默认钱包", [C.state.wallets, C.state.settings.budget], [[{ id:1, name:"默认钱包" }], 777]);
  C.restoreFromText(B.serializeState());
  eq("A16 导入新备份后钱包/流水/记录钱包一致",
     [C.state.wallets.map(w => w.name), C.state.wops.length, C.state.records.map(r => r && r.wallet), C.state.settings.walletDefault],
     [B.state.wallets.map(w => w.name), B.state.wops.length, B.state.records.map(r => r && r.wallet), B.state.settings.walletDefault]);
  const U = mk(); const d0 = U.undoDepth;
  run(U, "wallet add 支付宝 300");
  run(U, "undo");
  eq("A17 钱包改动是一步撤销: add 后 undo 钱包与流水一起消失", [U.state.wallets.map(w => w.name), U.state.wops.length, U.undoDepth], [["默认钱包"], 0, d0]);
}

/* ================= B. wallet 命令 ================= */
{
  const S = mk();
  const o1 = run(S, "wallet add 微信 500 零钱");
  eq("B1 wallet add 微信 500 → 新钱包 + 一条初始流水", [S.state.wallets.map(w => w.name), S.state.wops], [["默认钱包","微信"], [{ wallet:2, amount:500, date:TODAY, note:"零钱", created:TODAY }]]);
  ok("B2 回执含钱包名与初始余额", /已新建钱包 微信/.test(o1) && /初始余额 ¥500\.00/.test(o1), o1);
  eq("B3 wallet add 不写金额 → 余额 0 且不造流水", (()=>{ run(S, "wallet add 现金"); return [S.walletBalance(wid(S,"现金")), S.state.wops.length]; })(), [0, 1]);
  const before = S.state.wallets.length;
  ok("B4 重名被拒", /已有同名钱包/.test(run(S, "wallet add 微信 100")) && S.state.wallets.length===before);
  ok("B5 空名被拒", /名称不能为空/.test(run(S, 'wallet add ""')) && S.state.wallets.length===before);
  ok("B6 超长名被拒(不截断成幽灵钱包)", /名称不能为空/.test(run(S, "wallet add " + "x".repeat(30))) && S.state.wallets.length===before);
  ok("B7 初始金额非数字被拒", /初始金额无效/.test(run(S, "wallet add 支付宝 abc")) && S.state.wallets.length===before);
  ok("B8 负的初始金额被拒", /初始金额无效/.test(run(S, "wallet add 支付宝 -5")) && S.state.wallets.length===before);
  ok("B9 溢出的初始金额被拒(Infinity 不会落盘)", /初始金额无效/.test(run(S, "wallet add 支付宝 " + "9".repeat(320))) && S.state.wallets.length===before);

  run(S, 'wallet in 微信 1000 工资');
  near("B10 wallet in 存入", S.walletBalance(wid(S,"微信")), 1500);
  run(S, "wallet out 微信 200");
  near("B11 wallet out 取出", S.walletBalance(wid(S,"微信")), 1300);
  const w0 = S.state.wops.length;
  ok("B12 不存在的钱包: 拒绝且不落流水", /未找到钱包/.test(run(S, "wallet in 支付宝 100")) && S.state.wops.length===w0);
  for(const [name, c] of [["B13 金额 0", "wallet in 微信 0"], ["B14 金额 0.001", "wallet in 微信 0.001"], ["B15 金额为负", "wallet out 微信 -5"], ["B16 金额非数字", "wallet in 微信 abc"], ["B17 缺金额", "wallet in 微信"]]){
    ok(name + " 被拒", /金额无效/.test(run(S, c)) && S.state.wops.length===w0, out(S));
  }
  ok("B18 非法日期被拒", /日期无效/.test(run(S, "wallet in 微信 50 @2027-13-40")) && S.state.wops.length===w0);
  run(S, "wallet in 微信 300 @2027-12-01");
  near("B19 未来日期的流水不提前计入余额", S.walletBalance(wid(S,"微信")), 1300);
  ok("B20 未来流水有提示", /晚于今天/.test(out(S)));
  run(S, "wallet in 微信 -0"); run(S, "wallet use 微信");
  eq("B21 wallet use 设默认钱包", S.defaultWallet().name, "微信");
  run(S, "wallet name 微信 微信钱包");
  eq("B22 wallet name 重命名", S.state.wallets.map(w => w.name), ["默认钱包","微信钱包","现金"]);
  eq("B23 重命名后默认钱包仍是同一个(id 没变)", [S.defaultWallet().name, S.state.settings.walletDefault], ["微信钱包", 2]);
  ok("B24 重命名成已存在的名字被拒", /同名钱包/.test(run(S, "wallet name 微信钱包 现金")) && S.state.wallets.map(w => w.name).join()==="默认钱包,微信钱包,现金");
  ok("B25 重命名成空名被拒", /新名称不能为空/.test(run(S, "wallet name 微信钱包")));
  ok("B26 名字没变化时不动数据", /没有变化/.test(run(S, "wallet name 现金 现金")));

  const D = seeded();
  run(D, "add 30 餐饮 午餐 $微信"); run(D, "add 40 交通 地铁 $微信");
  const oD = run(D, "wallet del 微信");
  eq("B27 wallet del: 钱包与流水一并删除", [D.state.wallets.map(w => w.name), D.state.wops.length], [["默认钱包","现金"], 2]);
  eq("B28 由它支付的支出改记到默认钱包", D.state.records.map(r => r && r.wallet), [1, 1]);
  ok("B29 删除回执说明改记与可撤销", /已删除钱包 微信/.test(oD) && /2 笔支出改记到默认钱包「默认钱包」/.test(oD), oD);
  ok("B30 最后一个钱包不能删", (()=>{ run(D, "wallet del 现金"); return /至少要保留一个钱包/.test(run(D, "wallet del 默认钱包")) && D.state.wallets.length===1; })());
  const E = seeded(); run(E, "wallet use 微信");
  run(E, "wallet del 微信");
  eq("B31 删掉的是默认钱包 → 默认落到剩下的第一个", [E.defaultWallet().name, E.state.settings.walletDefault], ["默认钱包", 1]);
  ok("B32 删不存在钱包被拒", /未找到钱包/.test(run(E, "wallet del 微信")));

  const V = seeded();
  const ov = run(V, "wallet");
  ok("B33 wallet 总览: 每个钱包一行(余额 + 本期支出)", /默认钱包 ★/.test(ov) && /余额 ¥1000\.00/.test(ov) && /本期支出 ¥0\.00/.test(ov) && /微信/.test(ov) && /¥5000\.00/.test(ov), ov);
  ok("B34 总览含合计与预算对照", /合计/.test(ov) && /余额 ¥6500\.00/.test(ov) && /与预算对照/.test(ov) && /钱包余额 ¥6500\.00/.test(ov) && /可用余额\(含结转\)/.test(ov), ov);
  ok("B35 总览写明口径(手动维护 / 不参与预算 / ★=默认)", /手动维护, 不参与预算/.test(ov) && /★ = 默认钱包/.test(ov), ov);
  const one = run(V, "wallet 现金");
  ok("B36 wallet <钱包> 只看单个钱包", /¥5000\.00/.test(one) && !/微信/.test(one), one);
  const lg = run(V, "wallet log");
  ok("B37 wallet log 列出流水(倒序)", /钱包流水 · 全部/.test(lg) && /现金/.test(lg) && /微信/.test(lg) && /初始余额/.test(lg), lg);
  const lg2 = run(V, "wallet log 现金 1");
  ok("B38 wallet log <钱包> <N> 限量", /钱包流水 · 现金/.test(lg2) && /最近 1 条/.test(lg2) && !/微信/.test(lg2), lg2);
  ok("B39 wallet log 参数不合法给提示", /未识别的参数/.test(run(V, "wallet log 现金 abc")));
  ok("B40 未知的子命令给用法", /用法: wallet/.test(run(S, "wallet foobar")) && /wallet add <名称> \[初始金额\]/.test(out(S)));
  const a1 = mk(); const a2 = mk();
  run(a1, "acct"); run(a2, "wallet");
  eq("B41 别名 acct 输出与 wallet 一致", out(a1).replace(/user@budget:~\$ \S+/g, ""), out(a2).replace(/user@budget:~\$ \S+/g, ""));
  ok("B42 wallet 不进撤销栈(只读)", (()=>{ const d = V.undoDepth; run(V, "wallet"); return V.undoDepth===d; })());
  ok("B43 余额为负时提示", (()=>{ const N = mk(); run(N, "wallet out 默认钱包 50"); return /余额为负/.test(out(N)) && /¥-50\.00/.test(out(N)); })());
}

/* ================= C. 支出与钱包(付款口径 = 总价, 截至今天) ================= */
{
  const S = seeded();
  run(S, "add 30 餐饮 午餐");
  eq("C1 不写 $钱包 → 由默认钱包付款", (S.state.records[0]||{}).wallet, 1);
  near("C2 默认钱包余额扣 30", S.walletBalance(1), 970);
  const o2 = run(S, "add 50 购物 $微信");
  eq("C3 add $微信 → 记录指向微信", (S.state.records[1]||{}).wallet, wid(S,"微信"));
  near("C4a 微信余额扣 50", S.walletBalance(wid(S,"微信")), 450);
  near("C4b 默认钱包不再扣", S.walletBalance(1), 970);
  ok("C5 回执带 [钱包]", /\[微信\]/.test(o2), o2);
  run(S, "add $现金 20 交通 公交"); run(S, "add 20 交通 公交 $现金 @2027-08-29");
  eq("C6 $钱包 位置无关(在前 / 在后)", S.state.records.slice(2).map(r => r && r.wallet), [wid(S,"现金"), wid(S,"现金")]);
  run(S, 'wallet add "招商 卡" 100'); run(S, 'add 10 其他 手续费 $"招商 卡"');
  eq("C7 带空格的钱包名写 $\"…\"", (S.state.records[4]||{}).wallet, wid(S,"招商 卡"));
  const n0 = S.state.records.length, b0 = S.walletBalance(wid(S,"微信"));
  ok("C8 $不存在的钱包 → 整笔不入账", /未找到钱包/.test(run(S, "add 99 餐饮 $支付宝")) && S.state.records.length===n0 && S.walletBalance(wid(S,"微信"))===b0);
  eq("C9 tokenize 保留 $ 前缀(与 #地点 同一机制)", S.splitRecordArgs(["3000","365","房租","$微信","#上海"]).wallet, "微信");

  const M = seeded();
  run(M, "amort 3000 365 房租 年付 $现金");
  near("C10 分摊成本对钱包按**总价**一次扣款(不是每天 ¥8.22)", M.walletBalance(wid(M,"现金")), 2000);
  near("C10b 微信与默认钱包不受影响", M.walletBalance(1), 1000);
  ok("C10c 回执写明按总价付款", /按总价付款/.test(out(M)));
  const amt = (M.state.records[0]||{}).amount;
  near("C10d 记录本身仍是「每天金额」(amount 语义不变)", amt, 8.22);
  run(M, "add 100 餐饮 聚餐 $微信 @2027-12-01");
  near("C11 未来日期的支出不提前扣款", M.walletBalance(wid(M,"微信")), 500);
  near("C11b 未来支出截至今天不计, 但默认钱包的分摊起始日已到 → 已扣", M.walletBalance(1), 1000);
  run(M, "del 2");
  near("C12 删除记录 → 余额自动恢复(余额是派生值)", M.walletBalance(wid(M,"微信")), 500);

  const Q = seeded();
  run(Q, "recur 100 房租 3月 月 @2027-08-01 $微信");
  eq("C13 recur 不分摊: 整批记录都由指定钱包付款", Q.state.records.map(r => r && r.wallet), [wid(Q,"微信"),wid(Q,"微信"),wid(Q,"微信")]);
  near("C13b 只扣已发生的 1 笔(3 笔里 2 笔在未来)", Q.walletBalance(wid(Q,"微信")), 400);
  run(Q, "recur 100 房租 3月 月 @2027-08-01 分摊 $现金");
  near("C13c recur 分摊: 只记 1 笔, 钱包按总价扣 300", Q.walletBalance(wid(Q,"现金")), 4700);
  const q0 = Q.state.records.length;
  ok("C13d recur $不存在的钱包 → 一笔都不生成", /未找到钱包/.test(run(Q, "recur 100 房租 3月 月 $支付宝")) && Q.state.records.length===q0);

  const U = seeded();
  run(U, "add 60 餐饮 晚饭 $微信");
  const id = (U.state.records[0]||{}).id;
  const oU = run(U, "update " + id + " 60 餐饮 晚饭 $现金");
  eq("C14 update … $现金 改付款钱包", (U.state.records[0]||{}).wallet, wid(U,"现金"));
  eq("C14a 新钱包扣 / 旧钱包回", [U.walletBalance(wid(U,"现金")), U.walletBalance(wid(U,"微信"))], [4940, 500]);
  ok("C14b 回执写明 付款钱包 →", /付款钱包 → 现金/.test(oU), oU);
  run(U, "update " + id + " 70 餐饮 夜宵");
  eq("C15 update 不带 $ → 付款钱包不变", (U.state.records[0]||{}).wallet, wid(U,"现金"));
  const rec0 = JSON.stringify(U.state.records[0]);
  ok("C16 update $不存在 → 整条中止(金额/备注也不改, 不留半更新)",
     /未找到钱包/.test(run(U, "update " + id + " 999 其他 xx $支付宝")) && JSON.stringify(U.state.records[0])===rec0);
  run(U, "wallet mv " + id + " 微信");
  eq("C17 wallet mv 把支出改由另一钱包支付", (U.state.records[0]||{}).wallet, wid(U,"微信"));
  eq("C17a 余额随之重算", [U.walletBalance(wid(U,"微信")), U.walletBalance(wid(U,"现金"))], [430, 5000]);
  ok("C17b mv 回执含 原钱包 → 新钱包", /付款钱包: 现金 → 微信/.test(out(U)), out(U));
  ok("C17c mv 到它本来就在的钱包: 提示且不动数据", /本来就是由/.test(run(U, "wallet mv " + id + " 微信")));
  ok("C17d mv 不存在的记录 / 钱包被拒", /未找到 #/.test(run(U, "wallet mv 9999 微信")) && /未找到钱包/.test(run(U, "wallet mv " + id + " 支付宝")));

  /* 本期支出用与预算同一套消费口径(collectWindow): 分摊按落在本期的天数计 */
  const W = seeded();
  run(W, "add 100 餐饮 $现金"); run(W, "amort 3000 365 房租 $现金 @2027-08-15"); run(W, "add 40 交通 $微信 @2027-07-20");
  const p = W.currentPeriod(), wr = W.walletRows(p), win = W.collectWindow(p.start, p.end);
  near("C18 本期支出 = 消费口径: 分摊按落在本期的天数计", (wr.rows.find(r => r.name==="现金")||{}).spent, 100 + 8.22*17);
  near("C18b 各钱包本期支出之和 = 本期消费", W.r2(wr.rows.reduce((s,r)=>s+r.spent,0)), win.total);
  eq("C18c 上个月的支出不算进本期", (wr.rows.find(r => r.name==="微信")||{}).spent, 0);
  const bc = W.walletBudgetCompare();
  near("C19 与预算对照: 钱包合计 = 各钱包余额之和", bc.total, 1000 + 500 + 5000 - 100 - 3000 - 40);
  near("C19b diff = 钱包合计 − 可用余额(含结转)", bc.diff, W.r2(bc.total - bc.bal));
  near("C19c 可用余额仍是预算口径, 没被钱包余额影响", bc.bal, W.availableBalance());
  const L0 = seeded();
  L0.state.records.push({ id:501, amount:5, category:"其他", date:"2027-08-10", wallet:0,
    amortDays:1, amortTotal:5, mm:0, idx:0, moneyInv:0, indexInv:0, created:TODAY });
  ok("C20 未指定钱包的旧记录单列, 不算进任何钱包", (()=>{ const x = L0.walletRows(); return x.unassigned===5 && x.rows.every(r => r.spent===0); })());

  const X = seeded();
  run(X, "add 30 餐饮 午餐 $微信");
  const lst = run(X, "list");
  ok("C21 列表行显示 [微信]", /#1 .*¥\s+30\.00.*\[微信\]/.test(lst), lst);
  const rep = X.buildReportText(false);
  ok("C22 导出报告带 钱包: 微信", /钱包:微信/.test(rep), rep.slice(0, 200));
  const sr = run(X, "search 微信");
  ok("C23 search 关键词可命中付款钱包", /#1/.test(sr), sr);
  const bd = run(X, "budget");
  ok("C24 budget 输出含钱包余额合计与预算对照", /钱包余额合计/.test(bd) && /¥6470\.00/.test(bd) && /3 个钱包/.test(bd), bd);
  const cf = run(X, "config");
  ok("C25 config 输出含钱包行(默认标记 + 余额)", /钱包\s+默认钱包\(默认\) ¥1000\.00/.test(cf), cf.split("\n").filter(l => l.includes("钱包")).join("|"));

}

/* ================= E. 三页切换 ================= */
{
  const S = mk();
  eq("E1 启动在主页: 主页五个元素不在 .page-hide 里", [S.currentPage, S.HOME_IDS.map(id => hidden(S,id))], ["home", [false,false,false,false,false]]);
  S.showPage("wallet");
  eq("E2 钱包页: 主页五个元素全部收起", [S.currentPage, S.HOME_IDS.map(id => hidden(S,id)), hidden(S,"pageWallet"), hidden(S,"pageSettings")],
     ["wallet", [true,true,true,true,true], false, true]);
  S.showPage("settings");
  eq("E3 设置页: 钱包页收起", [S.currentPage, hidden(S,"pageWallet"), hidden(S,"pageSettings")], ["settings", true, false]);
  S.showPage("home");
  eq("E4 回主页: 全部恢复", [S.currentPage, S.HOME_IDS.some(id => hidden(S,id)), hidden(S,"pageWallet"), hidden(S,"pageSettings")], ["home", false, true, true]);
  S.showPage("wallet"); S.showPage("nope");
  eq("E5 无法识别的页名回落主页", S.currentPage, "home");
  eq("E6 页面清单与快捷键一致", [S.PAGE_IDS, S.PAGE_KEYS], [{ wallet:"pageWallet", settings:"pageSettings" }, { "1":"home", "2":"wallet", "3":"settings" }]);
  S.showPage("home"); S.openBudgetModal();
  ok("E7 前置: 弹窗已打开", has($(S,"budgetWrap"), "open"));
  S.toggleDd("listDd", null); S.showPage("wallet");
  ok("E8 换页时关闭所有浮层(不留任何弹窗/下拉)", !has($(S,"budgetWrap"), "open") && !has($(S,"listDd"), "open"));


  const W = seeded();
  run(W, "add 30 餐饮 午餐 $微信");
  W.showPage("wallet");
  const body = $(W, "walletBody"), cards = byCls(body, "wcard").filter(c => c.dataset.wallet);
  eq("E9 钱包页每个钱包一张卡(另有一张新建卡)", [cards.length, byCls(body, "wcard").length], [3, 4]);
  eq("E10 只有默认钱包带 default 样式", cards.map(c => has(c, "default")), [true, false, false]);
  eq("E10b 默认标记只有「默认」两个字(不与钱包名重复)", wtagOf(cards), "默认");
  const wx = cards.find(c => c.dataset.wallet===String(wid(W,"微信")));
  ok("E11 卡片显示余额(支出后自动扣减)", /¥470\.00/.test(wx.textContent) && /1 笔支出/.test(wx.textContent), wx.textContent);
  ok("E12 余额为负的卡片带 neg 样式", (()=>{ const N = mk(); N.showPage("wallet"); run(N, "wallet out 默认钱包 10"); return byCls($(N,"walletBody"), "wbal").some(e => has(e, "neg")); })());
  W.showPage("wallet");   // 桩的 document 是共享的: 上面那个实例重画过同一个 walletBody, 这里再画回来
  ok("E13 概览条: 余额合计 / 可用余额 / 本期预算", (()=>{ const t = byCls($(W,"walletBody"), "wsum")[0].textContent; return /钱包余额合计/.test(t) && /¥6470\.00/.test(t) && /可用余额\(含结转\)/.test(t) && /本期预算 \/ 已消费/.test(t) && /¥30\.00/.test(t); })(), byCls($(W,"walletBody"), "wsum")[0].textContent);
  ok("E14 本期有支出 → 各钱包支出占比堆叠条", byCls($(W,"walletBody"), "stack").length===1 && /本期各钱包支出占比/.test($(W,"walletBody").textContent), $(W,"walletBody").textContent.slice(0, 120));
  const wx2 = byCls($(W,"walletBody"), "wcard").find(c => c.dataset.wallet===String(wid(W,"微信")));
  ok("E15 本期支出占比进度条挂在卡片里(不是主页终端)", byCls(wx2, "hbar-wrap").length===1);
  ok("E15b 占比条固定青色、且不画 100% 预算刻度(否则 100% 会被读成超支)", (()=>{ const bar = byCls(wx2, "hbar-wrap")[0]; const fill = byCls(bar, "hbar-fill")[0]; return byCls(bar, "hbar-100").length===0 && !!fill && /^rgb\(77, 232, 255\)|^#4de8ff$/i.test(String(fill.style.background||"")); })());
  const lines0 = W.term.children.length;
  W.renderWalletPage();
  ok("E16 渲染钱包页不往主页终端里写东西", W.term.children.length===lines0);
  ok("E18 流水区列出最近流水", /钱包流水/.test($(W,"walletBody").textContent) && /初始余额/.test($(W,"walletBody").textContent) && /支出 餐饮 午餐/.test($(W,"walletBody").textContent), $(W,"walletBody").textContent.slice(-200));
  const W0 = mk(); W0.showPage("wallet");
  ok("E17 本期没有支出时给引导文案, 不画空堆叠条", /本期还没有支出/.test($(W0,"walletBody").textContent) && byCls($(W0,"walletBody"), "stack").length===0);
  W.showPage("wallet");
  ok("E19 主页上执行命令不产生回显", (()=>{ const H = seeded(); run(H, "wallet in 微信 5"); return !has($(H,"walletEcho"), "has") && $(H,"walletEchoBody").children.length===0; })());
  run(W, 'wallet in "微信" 500');
  const eb = $(W, "walletEchoBody");
  eq("E20 钱包页上的命令: 输出镜像到页底回显条", [has($(W,"walletEcho"), "has"), eb.children.length > 0, /✓ 存入/.test(eb.textContent), /wallet in "微信" 500/.test(eb.textContent)], [true, true, true, true]);
  ok("E20b 回显里是命令输出行本身(.l 行)", eb.children.every(c => String(c.className).split(/\s+/).includes("l")));
  near("E21 数据变了钱包页自动重算(卡片余额更新)", W.walletBalance(wid(W,"微信")), 970);
  ok("E21b 卡片文本已是新余额", /¥970\.00/.test(byCls($(W,"walletBody"), "wcard").find(c => c.dataset.wallet===String(wid(W,"微信"))).textContent));
  run(W, "wallet in 微信 0");
  ok("E22 校验失败的命令也会回显(用户看得到原因)", /金额无效/.test($(W,"walletEchoBody").textContent));
  W.showPage("settings");
  ok("E23 换页清空上一页的回显", !has($(W,"walletEcho"), "has") && $(W,"walletEchoBody").children.length===0);
  run(W, "config");
  ok("E24 设置页回显镜像 config 的输出", /换算\(占用\)/.test($(W,"settingsEchoBody").textContent) && has($(W,"settingsEcho"), "has"));
  W.showPage("home"); W.showPage("home"); run(W, "config set budget 1234");
  ok("E25 回主页后命令只进终端(回显条保持清空)", !has($(W,"settingsEcho"), "has") && $(W,"walletEchoBody").children.length===0 && /¥1234\.00/.test(out(W)));
  const long = seeded(); long.showPage("wallet");
  for(let i=0;i<6;i++) run(long, "wallet add w"+i+" 1");
  run(long, "help");   // 回显 = 最近一条命令的输出, 最多 30 行
  ok("E26 回显条最多保留最近 30 行", $(long,"walletEchoBody").children.length===30, String($(long,"walletEchoBody").children.length));
}

/* ================= F. 钱包页内联表单(全部回灌命令) ================= */
{
  const S = mk();
  S.showPage("wallet");
  const body = $(S, "walletBody");
  const nc = byCls(body, "wcard").find(c => has(c, "new"));
  const inputs = findAll(nc, c => String(c.tagName)==="INPUT");
  eq("F1 新建卡: 名称 / 初始金额 / 备注 三个输入", inputs.length, 3);
  const okBtn = btn(nc, "新建钱包");
  ok("F1b 有「新建钱包」按钮", !!okBtn);
  const d0 = S.undoDepth;
  okBtn.click();
  ok("F2 名称为空: 页内提示, 不执行命令(撤销栈不变)", /名称不能为空/.test(nc.textContent) && S.state.wallets.length===1 && S.undoDepth===d0, nc.textContent);
  inputs[0].value = "默认钱包"; okBtn.click();
  ok("F3 重名: 页内提示, 不执行命令", /已有同名钱包/.test(nc.textContent) && S.state.wallets.length===1 && S.undoDepth===d0);
  inputs[0].value = "微信"; inputs[1].value = "abc"; okBtn.click();
  ok("F4 初始金额非法: 页内提示", /初始金额需为/.test(nc.textContent) && S.state.wallets.length===1);
  inputs[1].value = "500"; inputs[2].value = "#零钱"; okBtn.click();
  eq("F5 新建成功: 钱包 + 初始流水(备注以 # 开头也原样入库)", [S.state.wallets.map(w => w.name), S.state.wops[S.state.wops.length-1]], [["默认钱包","微信"], { wallet:2, amount:500, date:TODAY, note:"#零钱", created:TODAY }]);
  near("F5b 余额", S.walletBalance(2), 500);
  const inputs2 = findAll(byCls(body, "wcard").find(c => has(c, "new")), c => String(c.tagName)==="INPUT");
  eq("F5c 新建后表单被重置(数据变了 → 钱包页重画)", inputs2.map(i => i.value), ["", "", ""]);
  run(S, "wallet add 支付宝");
  const fresh = byCls(body, "wcard").find(c => has(c, "new"));
  findAll(fresh, c => String(c.tagName)==="INPUT")[0].value = "现金"; findAll(fresh, c => String(c.tagName)==="INPUT")[1].value = ""; findAll(fresh, c => String(c.tagName)==="INPUT")[2].value = "备用";
  btn(fresh, "新建钱包").click();
  eq("F6 不填金额只填备注: 显式补 0, 备注不会被当成金额", [S.state.wallets.map(w => w.name), S.state.wops.filter(o => o.wallet===wid(S,"现金")).length], [["默认钱包","微信","支付宝","现金"], 0]);

  const card = () => byCls($(S,"walletBody"), "wcard").find(c => c.dataset.wallet==="2");
  btn(card(), "存入").click();
  let fi = findAll(card(), c => String(c.tagName)==="INPUT");
  eq("F7 「存入」展开内联表单(金额 + 备注)", fi.length, 2);
  btn(card(), "确认存入").click();
  ok("F8 金额为空: 页内提示, 不执行命令", /金额需为/.test(card().textContent) && S.state.wops.filter(o => o.wallet===2).length===1);
  fi[0].value = "200"; fi[1].value = "红包"; btn(card(), "确认存入").click();
  eq("F9 确认存入 → 回灌 wallet in(可撤销的一步)", [S.state.wops.filter(o => o.wallet===2).length, S.state.wops[S.state.wops.length-1].note, S.undoDepth > 0], [2, "红包", true]);
  near("F9b 余额更新", S.walletBalance(2), 700);
  btn(card(), "取出").click();
  fi = findAll(card(), c => String(c.tagName)==="INPUT"); fi[0].value = "0.001"; btn(card(), "确认取出").click();
  ok("F10 取出 0.001 被页内拦下(r2 后为 0)", /金额需为/.test(card().textContent) && S.walletBalance(2)===700);
  fi[0].value = "100"; btn(card(), "确认取出").click();
  near("F11 确认取出 → wallet out", S.walletBalance(2), 600);
  btn(card(), "重命名").click();
  fi = findAll(card(), c => String(c.tagName)==="INPUT");
  eq("F12 「重命名」预填当前名称", fi[0].value, "微信");
  fi[0].value = "支付宝"; btn(card(), "确认重命名").click();
  eq("F13 重命名成已有名称: 页内提示", S.state.wallets.map(w => w.name), ["默认钱包","微信","支付宝","现金"]);
  fi[0].value = "微信零钱"; btn(card(), "确认重命名").click();
  eq("F14 确认重命名 → wallet name", S.state.wallets.map(w => w.name), ["默认钱包","微信零钱","支付宝","现金"]);
  btn(card(), "重命名").click(); btn(card(), "取消").click();
  ok("F15 取消收起表单", findAll(card(), c => has(c, "wform")).length===0);
  btn(card(), "设为默认").click();
  eq("F16 「设为默认」→ wallet use", [S.defaultWallet().name, S.state.settings.walletDefault], ["微信零钱", 2]);
  ok("F17 默认钱包的卡片没有「设为默认」按钮", !btn(byCls($(S,"walletBody"), "wcard").find(c => c.dataset.wallet==="2"), "设为默认"));
  const cash = () => byCls($(S,"walletBody"), "wcard").find(c => c.dataset.wallet===String(wid(S,"现金")));
  const del = btn(cash(), "删除");
  del.click();
  ok("F18 删除是两步确认: 第一次只变红, 不执行", has(del, "armed") && del.textContent==="确认删除?" && S.state.wallets.length===4);
  del.click();
  eq("F19 第二次才真的删除 → wallet del", S.state.wallets.map(w => w.name), ["默认钱包","微信零钱","支付宝"]);
  ok("F20 只剩一个钱包时不显示「删除」", (()=>{ const N = mk(); N.showPage("wallet"); return !btn(byCls($(N,"walletBody"), "wcard").find(c => c.dataset.wallet==="1"), "删除"); })());

  /* 转账: 转入口的下拉只列其它钱包, 回灌 wallet tr, 页面重画后余额更新 */
  const T = mk(); T.showPage("wallet");
  run(T, "wallet in 默认钱包 1000");
  run(T, "wallet add 微信 500");
  const tcard = () => byCls($(T,"walletBody"), "wcard").find(c => c.dataset.wallet==="1");
  ok("F21 每个钱包卡片都有「转账」按钮", !!btn(tcard(), "转账") && !!btn(byCls($(T,"walletBody"),"wcard").find(c=>c.dataset.wallet==="2"), "转账"));
  btn(tcard(), "转账").click();
  const tsel = findAll(tcard(), c => String(c.tagName)==="SELECT")[0];
  const tfi = findAll(tcard(), c => String(c.tagName)==="INPUT");
  eq("F22 转账表单: 转入钱包下拉(排除自己) + 金额 + 备注", [!!tsel, tsel.children.map(x=>x.value), tfi.length], [true, ["微信"], 2]);
  btn(tcard(), "确认转账").click();
  ok("F23 金额为空: 页内提示, 不执行命令", /金额需为/.test(tcard().textContent) && T.state.wops.length===2);
  tfi[0].value = "100"; tfi[1].value = "还钱"; btn(tcard(), "确认转账").click();
  eq("F24 确认转账 → 回灌 wallet tr, 两条流水一步撤销",
     [T.state.wops.length, T.state.wops.slice(-2).map(x=>x.amount), T.undoDepth>0], [4, [-100,100], true]);
  eq("F25 转账后两侧余额更新", [T.walletBalance(1), T.walletBalance(2)], [900, 600]);
  ok("F26 回显条能看到转账输出", /✓ 转账 默认钱包 → 微信 ¥100\.00/.test($(T,"walletEchoBody").textContent), $(T,"walletEchoBody").textContent);
  const one = mk(); one.showPage("wallet");
  ok("F27 只有一个钱包时不显示「转账」按钮", !btn(byCls($(one,"walletBody"),"wcard").find(c=>c.dataset.wallet==="1"), "转账"));
}

/* ================= G. 设置页: 同一份表单 DOM 在主页弹窗 ↔ 设置页卡片之间搬动 ================= */
{
  const S = mk();
  const cards = S.SETTING_CARDS;
  eq("G1 六张卡: 周期预算 / 周期持续时间 / 投资比例 / 类别余额 / 地点与地图 Key / 预警与收益", cards.map(c => c.title), ["周期预算","周期持续时间","投资比例","类别余额","地点与地图 Key","预警与收益参数"]);
  ok("G2 进设置页之前: 五个面板都在各自的遮罩层里(主页弹窗照常)", cards.filter(c => c.modal).every(c => $(S, c.wrap).children.indexOf($(S, c.modal))>=0));
  S.showPage("settings");
  eq("G3 进设置页: 五个面板被搬进对应卡片的槽位(是同一个节点, 不是副本, 遮罩层里已没有它)",
     cards.filter(c => c.modal).map(c => $(S, "sf_"+c.key).children[0]===$(S, c.modal) && $(S, c.wrap).children.indexOf($(S, c.modal))<0),
     [true,true,true,true,true]);
  eq("G4 卡片数与顺序", findAll($(S,"settingsCards"), c => has(c, "scard")).map(c => c.dataset.key), ["budget","period","invest","category","geo","other"]);
  ok("G5 每张卡标题旁有实时摘要", cards.every(c => String($(S,"sl_"+c.key).textContent).length > 0), cards.map(c => $(S,"sl_"+c.key).textContent).join(" | "));
  ok("G6 周期预算卡摘要", /默认 ¥1000\.00 · 当期 ¥1000\.00/.test($(S,"sl_budget").textContent), $(S,"sl_budget").textContent);
  ok("G7 周期持续时间卡摘要", /按自然月 · 本期 2027-08-01 ~ 2027-08-31 · 共 31 天/.test($(S,"sl_period").textContent), $(S,"sl_period").textContent);
  ok("G8 投资比例卡摘要", /消费 85% · 投资 15%/.test($(S,"sl_invest").textContent), $(S,"sl_invest").textContent);
  ok("G9 地点与地图 Key 卡摘要", /地点: 自动 · 地图 Key 未配置/.test($(S,"sl_geo").textContent), $(S,"sl_geo").textContent);
  eq("G10 表单回填 = 当前已保存的值", [Number($(S,"b_amt").value), Number($(S,"i_pct").value), $(S,"p_start").value, $(S,"p_end").value, $(S,"o_monthstart").value, $(S,"o_alert").value, Number($(S,"o_rate_money").value), Number($(S,"o_rate_index").value), has($(S,"o_week_mon"),"on")],
     [1000, 15, "2027-08-01", "2027-08-31", 1, "80,100", 2, 8, true]);
  ok("G10b 页内专属小表单的 id 都在", ["o_monthstart","o_alert","o_week_mon","o_week_sun","o_rate_money","o_rate_index"].every(id => !!$(S,id)));

  $(S,"b_amt").value = "1234"; S.applyBudget("default");
  eq("G11 页内改预算 → 回灌 config set budget, 表单回填成新值", [S.state.settings.budget, Number($(S,"b_amt").value), /默认 ¥1234\.00/.test($(S,"sl_budget").textContent)], [1234, 1234, true]);
  ok("G11b 回显条能看到 config 的输出", /钱包\s+默认钱包\(默认\)/.test($(S,"settingsEchoBody").textContent), $(S,"settingsEchoBody").textContent.slice(-160));
  $(S,"b_amt").value = "777";
  run(S, "config set nothing");
  eq("G12 命令失败(数据没变)时不回填: 正在输入的值不会被冲掉", [$(S,"b_amt").value, S.state.settings.budget], ["777", 1234]);
  $(S,"i_pct").value = "20"; S.saveInvest();
  eq("G13 页内改投资比例 → config set invest", [S.state.settings.consumeShare, Number($(S,"i_pct").value)], [0.8, 20]);
  S.setPeriodModalMode("rolling"); $(S,"p_start").value = "2027-08-20"; $(S,"p_end").value = "2027-09-02"; S.savePeriodModal();
  eq("G14 页内改周期 → config set period <起> <止>, 天数自动同步", [S.state.settings.periodMode, S.state.settings.anchor, S.state.settings.lengthDays, $(S,"p_start").value, $(S,"p_end").value, /每 14 天一期/.test($(S,"sl_period").textContent)],
     ["rolling", "2027-08-20", 14, "2027-08-20", "2027-09-02", true]);
  S.setPeriodModalMode("rolling"); $(S,"p_start").value = "2027-07-01"; $(S,"p_end").value = "2027-07-14";
  const st0 = JSON.stringify(S.state.settings);
  S.savePeriodModal();
  eq("G15 校验失败: 不执行命令、不落数据、输入保留、卡片里给黄字原因", [JSON.stringify(S.state.settings)===st0, $(S,"p_end").value, has($(S,"p_hint"),"bad")], [true, "2027-07-14", true]);

  run(S, "config set monthstart 15");
  eq("G16 config set monthstart 15 → 月起始日 15 且切到按月", [S.state.settings.monthStart, S.state.settings.periodMode, $(S,"o_monthstart").value], [15, "month", 15]);
  ok("G16b 输出的是 config 表(与其它 config set 一致)", /换算\(占用\)/.test($(S,"settingsEchoBody").textContent), $(S,"settingsEchoBody").textContent.slice(-120));
  const ms0 = S.state.settings.monthStart;
  for(const [name, c] of [["G17 29 越界", "config set monthstart 29"], ["G17b 0", "config set monthstart 0"], ["G17c 小数", "config set monthstart 15.5"], ["G17d 非数字", "config set monthstart abc"], ["G17e 缺参数", "config set monthstart"], ["G17f 多余参数", "config set monthstart 5 6"]]){
    ok(name + " 被拒且不改状态", /用法: config set monthstart/.test(run(S, c)) && S.state.settings.monthStart===ms0);
  }
  run(S, "config set monthstart natural");
  eq("G18 natural = 自然月", S.state.settings.monthStart, 1);


  $(S,"o_monthstart").value = "25"; S.saveMonthStartRow();
  eq("G21 页内月起始日行 → config set monthstart", [S.state.settings.monthStart, $(S,"o_monthstart").value], [25, 25]);
  $(S,"o_monthstart").value = "abc"; S.saveMonthStartRow();
  ok("G22 页内月起始日非法: 卡片里黄字提示, 不执行命令", has($(S,"sh_period"),"bad") && /月起始日需为/.test($(S,"sh_period").textContent) && S.state.settings.monthStart===25);

  $(S,"o_alert").value = "90,95"; S.saveAlertRow();
  eq("G23 页内预警阈值 → set alert", S.state.settings.thresholds, [90,95]);
  for(const v of ["abc", "0", "101", ""]){ $(S,"o_alert").value = v; S.saveAlertRow(); }
  ok("G24 非法阈值被页内拦下", has($(S,"sh_other"),"bad") && /预警阈值/.test($(S,"sh_other").textContent) && S.state.settings.thresholds.join()==="90,95");
  $(S,"o_rate_money").value = "2.5"; S.saveRateRow("money");
  $(S,"o_rate_index").value = "101"; S.saveRateRow("index");
  eq("G25 页内年化 → set rate(非法的拦下)", [S.state.settings.rateMoney, S.state.settings.rateIndex, Number($(S,"o_rate_money").value)], [0.025, 0.08, 2.5]);
  S.buildSettingsCards(); S.fillSettingsCards();   // 前面 mk() 过别的实例, 动态节点在共享 id 表里被覆盖过 → 先重建
  $(S,"o_week_sun").click();
  eq("G26 周起始日按钮 → set weekstart", [S.state.settings.weekStart, has($(S,"o_week_sun"),"on"), has($(S,"o_week_mon"),"on")], ["sun", true, false]);

  ok("G27 类别余额卡在页内生成了类别行", $(S,"c_rows").children.length >= 10, String($(S,"c_rows").children.length));
  const rows = $(S,"c_rows").children; const parts0 = S.catRowParts(rows[0]);
  parts0.input.value = "300"; S.saveCatBudgets();
  ok("G28 页内保存类别余额 → set category(输入框回填已保存值)", S.state.settings.categoryBudget[rows[0].dataset.cat]===300 && String(S.catRowParts($(S,"c_rows").children[0]).input.value)==="300", JSON.stringify(S.state.settings.categoryBudget));
  ok("G29 地点卡: 模式按钮随 geoMode 点亮", has($(S,"g_auto"),"on") && !has($(S,"g_manual"),"on"));

  S.showPage("wallet");
  eq("G30 离开设置页: 面板搬回各自的遮罩层", cards.filter(c => c.modal).map(c => $(S, c.wrap).children.indexOf($(S, c.modal))>=0), [true,true,true,true,true]);
  S.showPage("settings");
  eq("G31 再进设置页: 面板再次挂进卡片(同一个节点)", cards.filter(c => c.modal).map(c => $(S, "sf_"+c.key).children[0]===$(S, c.modal)), [true,true,true,true,true]);
  eq("G32 卡片没有被重建出第二份", findAll($(S,"settingsCards"), c => has(c, "scard")).length, 6);
  S.showPage("home");
  S.openBudgetModal(); S.openPeriodModal(); S.openCatModal();
  ok("G33 回主页后配置面板已回到遮罩层(仍可以浮层形式打开; 主页 UI 不再有「配置 ▾」入口)", has($(S,"catWrap"),"open") && !has($(S,"budgetWrap"),"open"));
  eq("G34 弹窗里的值仍是页内改过的已保存值", [Number($(S,"b_amt").value), $(S,"p_start").value], [1234, "2027-08-25"]);
  const sub = $(S, "settingsSub").textContent;
  ok("G35 设置页副标题带版本号与撤销提示", sub.includes(S.APP_VERSION) && /撤销/.test(sub), sub);
}

/* ================= G2. 月起始日两条入口等价(独立实例, 不碰页面 DOM) ================= */
{
  const a = mk(), b = mk();
  run(a, "set monthstart 20"); run(b, "config set monthstart 20");
  eq("G19 set monthstart 与 config set monthstart 同一个校验入口", [a.state.settings.monthStart, b.state.settings.monthStart, a.state.settings.periodMode, b.state.settings.periodMode], [20, 20, "month", "month"]);
  ok("G20 旧写法 set monthstart 15.5 现在也被拒(以前会写入非整数, 重启回落)", /用法: set monthstart/.test(run(a, "set monthstart 15.5")) && a.state.settings.monthStart===20);
}

/* ================= I. 钱包间转账 ================= */
{
  const S = seeded();                       // 默认 ¥1000 / 微信 ¥500 / 现金 ¥5000
  const o = run(S, "wallet tr 微信 现金 300 提现");
  eq("I1 两条流水成对落账(转出 − / 转入 +, 同一 xid)",
     S.state.wops.slice(-2).map(x => [x.wallet, x.amount]), [[wid(S,"微信"), -300], [wid(S,"现金"), 300]]);
  eq("I2 同一 xid, 备注带对方钱包名与自定义备注",
     (()=>{ const [a,b] = S.state.wops.slice(-2); return [a.xid===b.xid, !!a.xid, a.note, b.note]; })(),
     [true, true, "转出至 现金 · 提现", "转入自 微信 · 提现"]);
  eq("I3 两侧余额各自变化, 钱包总额不变",
     [S.walletBalance(wid(S,"微信")), S.walletBalance(wid(S,"现金")), S.walletBalance(1)+S.walletBalance(wid(S,"微信"))+S.walletBalance(wid(S,"现金"))],
     [200, 5300, 6500]);
  ok("I4 回执含双方 / 金额 / 一步撤销", /✓ 转账 微信 → 现金 ¥300\.00/.test(o) && /两条流水成对记录\(一步撤销\)/.test(o), o);
  const lg = run(S, "wallet log 微信 2");
  ok("I5 流水里标出转出 / 转入", /转出至 现金/.test(lg) && /300\.00/.test(lg), lg);
  const before = S.state.wops.length;
  ok("I6 同一个钱包互转被拒且不落流水", /同一个钱包/.test(run(S, "wallet tr 微信 微信 100")) && S.state.wops.length===before);
  for(const [name, cmd] of [
    ["I7 转出钱包不存在", "wallet tr 支付宝 现金 100"],
    ["I8 转入钱包不存在", "wallet tr 微信 支付宝 100"],
    ["I9 金额 0", "wallet tr 微信 现金 0"],
    ["I10 金额 0.001", "wallet tr 微信 现金 0.001"],
    ["I11 金额为负", "wallet tr 微信 现金 -1"],
    ["I12 金额非数字", "wallet tr 微信 现金 abc"],
    ["I13 缺金额", "wallet tr 微信 现金"],
    ["I14 非法日期", "wallet tr 微信 现金 10 @2027-13-40"],
    ["I15 余额不足(整笔不落)", "wallet tr 微信 现金 99999"],
  ]){
    ok(name + " 被拒且不落流水", /未找到|金额无效|日期无效|不够转出/.test(run(S, cmd)) && S.state.wops.length===before, out(S));
  }
  eq("I16 一次撤销同时撤掉两条流水与两侧余额",
     (()=>{ S.runCommand("undo"); return [S.state.wops.length, S.walletBalance(wid(S,"微信")), S.walletBalance(wid(S,"现金"))]; })(),
     [before-2, 500, 5000]);
  eq("I17 redo 恢复两条流水", (()=>{ S.runCommand("redo"); return S.state.wops.slice(-2).map(x => x.amount); })(), [-300, 300]);
  const F = seeded();
  run(F, "wallet tr 微信 现金 100 @2027-09-01");
  eq("I18 未来日期的转账不计入今天的余额", [F.walletBalance(wid(F,"微信")), F.walletBalance(wid(F,"现金"))], [500, 5000]);
  eq("I19 截至该日余额已包含转账", [F.walletBalanceAt(wid(F,"微信"),"2027-09-01"), F.walletBalanceAt(wid(F,"现金"),"2027-09-01")], [400, 5100]);
  ok("I20 未来日期有提示", /晚于今天/.test(out(F)));
  const B = seeded();
  run(B, "wallet tr 微信 现金 50");
  const snap = JSON.parse(B.serializeState());
  eq("I21 备份带 xid, 导入后成对保留",
     (()=>{ const R = mk(); R.restoreFromText(B.serializeState()); const [a,b] = R.state.wops.slice(-2);
            return [snap.wops.slice(-2).every(x=>!!x.xid), a.xid===b.xid, R.walletBalance(wid(R,"微信")), R.walletBalance(wid(R,"现金"))]; })(),
     [true, true, 450, 5050]);
  const n = B.normalizeWallets(
    [{id:1,name:"默认钱包"},{id:2,name:"微信"}],
    [{wallet:1,amount:-10,date:TODAY,xid:"x1-20270830-0"},{wallet:2,amount:10,date:TODAY,xid:"x1-20270830-0"},
     {wallet:1,amount:5,date:TODAY,xid:"bad id!"}]);
  eq("I22 归一化只保留合法短 ASCII xid", n.wops.map(x=>x.xid||""), ["x1-20270830-0", "x1-20270830-0", ""]);
  const D = seeded();
  run(D, "wallet tr 微信 现金 200");
  const del = run(D, "wallet del 现金");
  eq("I23 删除参与转账的钱包: 对方那半笔一并删除, 不会留下凭空转入",
     [D.state.wallets.map(w=>w.name), D.state.wops.filter(x=>x.xid).length, D.walletBalance(wid(D,"微信"))],
     [["默认钱包","微信"], 0, 500]);
  ok("I24 删除回执说明流水条数包含成对的两条", /流水 3 条一并删除/.test(del), del);
  const H = seeded(); H.clearTerm(); H.runCommand("help");
  ok("I25 help 里列出 wallet tr 转账子命令", /wallet tr <转出钱包>/.test(out(H)), "");
  const A = seeded(); A.clearTerm(); A.runCommand("wallet foobar");
  ok("I26 wallet 用法里包含 tr", /wallet tr <转出钱包>/.test(out(A)), "");
}

/* ================= H. 规范自检 ================= */
{
  eq("H1 版本号 v0.1.1", mk().APP_VERSION, "v0.1.1");
  ok("H2 README 当前版本 = v0.1.1", /当前版本：\*\*v0\.1\.1\*\*/.test(readme), "");
  ok("H3 README 有钱包章节与三页说明", /^## 钱包/m.test(readme) && /主页 \/ 钱包 \/ 设置|三页|三个页面/.test(readme) && /设置页/.test(readme), "");
  ok("H4 .page-hide 带 !important(主页元素自带 display:flex, 会盖掉原生 [hidden])", /\.page-hide\{display:none !important;\}/.test(html), "");
  ok("H5 页面导航有三项且 data-page 齐全", ['data-page="home"','data-page="wallet"','data-page="settings"'].every(s => html.includes(s)), "");
  ok("H5b 两个页面容器在 HTML 里默认带 .page-hide", /<main id="pageWallet" class="page page-hide"/.test(html) && /<main id="pageSettings" class="page page-hide"/.test(html));
  /* 非空 innerHTML 赋值 = 把用户数据拼进 HTML 的风险面; 全文件只允许"清空" */
  const bad = [...html.matchAll(/innerHTML\s*=\s*([^;]+);/g)].map(m => m[1].trim()).filter(v => v !== '""' && v !== "''" && !/^String\(v==null\?""\:v\)$/.test(v));
  eq("H6 新增代码没有引入非空 innerHTML 赋值", bad, []);
  ok("H7 五个「取消/关闭」按钮带 data-close(设置页里隐藏)", ['b_cancel','i_cancel','p_cancel','g_cancel','c_cancel'].every(id => new RegExp('id="'+id+'"[^>]*data-close="1"').test(html)), "");
  ok("H8 「记一笔」三个面板都有支付钱包下拉", ['f_wallet','fa_wallet','fr_wallet'].every(id => new RegExp('<select id="'+id+'"').test(html)), "");
  ok("H9 主页五个顶层元素都有 id(showPage 靠它收起/恢复)", ['id="statusbar"','id="toolbar"','id="investbar"','id="term"','id="pageFooter"'].every(s => html.includes(s)), "");
  ok("H10 help 里有 wallet 与 config set monthstart", (()=>{ const S = mk(); S.clearTerm(); S.runCommand("help"); const h = out(S); return /wallet \[子命令\]/.test(h) && /wallet add <名称>/.test(h) && /config set monthstart <1-28>/.test(h); })(), "");
  ok("H11 用法串都标了 [$钱包]", /add <金额> <类别> \[备注\.\.\] \[@日期\] \[#地点\] \[\$钱包\]/.test(html) && /amort <总价> <天数> <类别> \[备注\.\.\] \[@开始日期\] \[#地点\] \[\$钱包\]/.test(html) && /update <id> <金额> <类别> \[备注\.\.\] \[@日期\] \[#地点\] \[\$钱包\]/.test(html), "");
  ok("H12 config 用法列出 monthstart 与 wallet 指引", (()=>{ const S = mk(); S.clearTerm(); S.runCommand("config xyz"); return /config set monthstart <1-28>/.test(out(S)) && /钱包用 wallet/.test(out(S)); })(), "");
  {
    /* 钱包页 / 设置页的每个写入口都必须回灌命令(H5 双通道对称), 不得直接改 state */
    const fn = (name) => { const i = html.indexOf("function "+name+"("); const j = html.indexOf("\nfunction ", i+1); return html.slice(i, j>i ? j : undefined); };
    for(const n of ["buildWalletNewCard","openWalletForm","buildWalletCard","saveMonthStartRow","saveAlertRow","saveRateRow","buildOtherCard"]){
      ok("H13 " + n + " 回灌 runCommand 且不直接改 state", /runCommand\(/.test(fn(n)) && !/state\.(settings|records|wallets|wops)\s*(\[[^\]]*\])?\.[A-Za-z_]+\s*=|state\.(records|wallets|wops)\.(push|splice)/.test(fn(n)), fn(n).slice(0, 80));
    }
  }
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length ? 1 : 0);
