// H5 修复的护栏: 双通道覆盖对称 + 弹窗 edit 分支可达。
//   背景(ARCHITECTURE-REVIEW §3 · H5): README 宣称"命令行 + 按钮双通道", 但
//     ①「全额投资」只有鼠标(没有命令); ② config 只有命令行(工具栏没有按钮);
//     ③ open-add 弹窗的 edit 分支不可达(modalMode 永远 "add" / modalId 永远 null),
//       于是 update 也只能走命令行 —— 死分支误导维护者。
//   本套件守住: pay full [mm|idx] 命令(等价"全额投资"按钮) / 工具栏 config 按钮 /
//     列表行 ✎ 编辑 打开的弹窗 edit 分支(提交走 update)。
import fs from "node:fs";
import { loadApp } from "./app.mjs";
import { HTML_PATH } from "./env.mjs";

const html = fs.readFileSync(HTML_PATH, "utf8");

let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }

/* ---------- 1. 命令登记表 / help / 补全 ---------- */
{
  const S = loadApp(); S.boot();
  const subs = S.COMMANDS.filter(c=>c.sub);
  ok("H5.1 COMMANDS 登记了 pay full 子用法", subs.some(c=>/pay full/.test(c.u)), JSON.stringify(subs.map(c=>c.u)));
  S.clearTerm(); S.runCommand("help");
  ok("H5.2 help 里能看到 pay full", /pay full/.test(S.lines().join("\n")), "");
  eq("H5.3 pay full 之后只给两种池(mm/idx)", S.argCandidates("pay", 2, ["pay","full"], "").sort(), ["idx","mm"]);
  eq("H5.4 别名 invest full 的补全与 pay full 一致",
     S.argCandidates("invest", 2, ["invest","full"], ""), S.argCandidates("pay", 2, ["pay","full"], ""));
}

/* ---------- 2. pay full 命令真的能全额投资 ---------- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 850 餐饮 big");                 // 货币池 ~130, 指数池 ~20
  const before = S.moneyPending();
  ok("H5.5 投资前货币未投池已 ≥ 阈值", before >= 100, String(before));
  S.clearTerm(); S.runCommand("pay full mm");
  ok("H5.6 pay full mm 清空货币未投池", S.moneyPending() <= 1e-6, String(S.moneyPending()));
  ok("H5.7 pay full mm 不动指数未投池", S.indexPending() > 0, String(S.indexPending()));
  ok("H5.8 命令输出含「已全额投资」", /已全额投资/.test(S.lines().join("\n")), S.lines().join("|"));
}

/* ---------- 3. 省略参数 = 两种池都投 ---------- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 850 餐饮 big");
  S.runCommand("pay full");
  ok("H5.9 pay full 默认两种池都清空", S.moneyPending() <= 1e-6 && S.indexPending() <= 1e-6,
     S.moneyPending()+" / "+S.indexPending());
}

/* ---------- 4. 别名 invest full 与 pay full 行为一致 ---------- */
{
  const capture = (cmd)=>{
    const A = loadApp(); A.boot();
    A.runCommand("add 850 餐饮 big");
    A.clearTerm();
    A.runCommand(cmd);
    return A.lines().slice(1).join("\n");           // 去掉回显那一行
  };
  eq("H5.10 invest full == pay full", capture("invest full money"), capture("pay full money"));
}

/* ---------- 5. 撤销栈单一提交点: 一次 pay full 只压一步 ---------- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 850 餐饮 big");
  const d0 = S.undoDepth;
  S.runCommand("pay full");
  eq("H5.11 一次 pay full 只压一步撤销(mutate 未重入)", S.undoDepth, d0 + 1);
  S.undo();
  ok("H5.12 撤销后两种已投都归零", S.moneyInvestedTotal() === 0 && S.indexInvestedTotal() === 0,
     S.moneyInvestedTotal()+" / "+S.indexInvestedTotal());
}

/* ---------- 6. 未满阈值: 只提示, 不落库 ---------- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 10 餐饮 small");                 // 货币池 ~1.53, 远低于 ¥100
  S.clearTerm(); S.runCommand("pay full mm");
  ok("H5.13 未满阈值时给出「需累计至」提示", /需累计至/.test(S.lines().join("\n")), S.lines().join("|"));
  ok("H5.14 未满阈值不写入任何已投", S.moneyInvestedTotal() === 0, String(S.moneyInvestedTotal()));
}

/* ---------- 7. 非法参数给用法提示 ---------- */
{
  const S = loadApp(); S.boot();
  S.clearTerm(); S.runCommand("pay full xx");
  ok("H5.15 非法池名给用法提示", /用法: pay full/.test(S.lines().join("\n")), S.lines().join("|"));
}

/* ---------- 8. config 有 UI 通道(工具栏按钮) ---------- */
{
  ok("H5.16 工具栏里有 data-cmd=\"config\" 按钮", /data-cmd="config"/.test(html), "");
  const S = loadApp(); S.boot();
  S.clearTerm(); S.runCommand("config");
  ok("H5.17 config 命令仍正常输出当前配置", /当前配置/.test(S.lines().join("\n")), S.lines().join("|"));
}

/* ---------- 9. 全额投资按钮回灌命令(源码级: DOM stub 不解析 HTML) ---------- */
{
  ok("H5.18 全额投资按钮回灌 runCommand(\"pay full …\")", /runCommand\("pay full "/.test(html), "");
  ok("H5.19 全额投资按钮不再直接调用 doInvestFull", !/addEventListener\("click", \(\)=>doInvestFull/.test(html), "");
}

/* ---------- 10. 弹窗 edit 分支可达: openEdit ---------- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 50 餐饮 午餐");
  const rec = S.state.records[0];
  S.openEdit(rec);
  eq("H5.20 openEdit 进入编辑模式", S.modalMode, "edit");
  eq("H5.21 modalId 指向被编辑的记录", S.modalId, rec.id);
  eq("H5.22 标题显示「编辑记录 #id」", S.__doc.getElementById("mTitle").textContent, "编辑记录 #"+rec.id);
  eq("H5.23 表单预填金额", S.__doc.getElementById("f_amt").value, rec.amount);
  eq("H5.24 表单预填类别", S.__doc.getElementById("f_cat").value, rec.category);
  eq("H5.25 表单预填日期", S.__doc.getElementById("f_date").value, rec.date);
  eq("H5.26 编辑模式隐藏选项卡(不让它新建 amort)", S.__doc.getElementById("mTabs").style.display, "none");
  S.setModalTab("amort");
  eq("H5.27 编辑模式不能切到分摊选项卡", S.modalTab, "add");
}

/* ---------- 11. 编辑提交走 update: 改同一条, 不新增 ---------- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 50 餐饮 午餐");
  const id = S.state.records[0].id, cnt = S.state.records.length;
  S.openEdit(S.state.records[0]);
  S.__doc.getElementById("f_amt").value = "80";
  S.__doc.getElementById("f_cat").value = "交通";
  S.__doc.getElementById("f_note").value = "打车";
  S.submitModal();
  eq("H5.28 编辑提交不新增记录", S.state.records.length, cnt);
  const r = S.state.records[0];
  eq("H5.29 编辑提交改的是同一条 id", r.id, id);
  eq("H5.30 金额/类别/备注都更新", [r.amount, r.category, r.note], [80, "交通", "打车"]);
  ok("H5.31 提交后弹窗关闭", !S.__doc.getElementById("modalWrap").classList.contains("open"), "");
}

/* ---------- 12. openAdd 复位(不残留编辑模式) ---------- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 50 餐饮 午餐");
  S.openEdit(S.state.records[0]);
  S.openAdd();
  eq("H5.32 openAdd 复位为新增模式", S.modalMode, "add");
  eq("H5.33 openAdd 恢复选项卡显示", S.__doc.getElementById("mTabs").style.display, "");
  eq("H5.34 openAdd 标题复位", S.__doc.getElementById("mTitle").textContent, "记一笔消费");
}

/* ---------- 13. 列表行: 第二个按钮是 ✎ 编辑, 点击进入 edit ---------- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 50 餐饮 午餐");
  S.clearTerm(); S.runCommand("list");
  const row = S.term.children[S.term.children.length-2];
  const btns = row.children.filter(c=>c.tagName==="BUTTON");
  eq("H5.35 行内有两个按钮", btns.length, 2);
  eq("H5.36 第一个仍是投资按钮(既有约定不变)", btns[0].textContent, "标记已投资");
  eq("H5.37 第二个是编辑按钮", btns[1].textContent, "✎ 编辑");
  btns[1].click();
  eq("H5.38 点编辑进入编辑模式", S.modalMode, "edit");
  eq("H5.39 编辑的是该行记录", S.modalId, S.state.records[0].id);
}

/* ---------- 14. 失效行不得进入编辑(悬空行不能"假成功") ---------- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 50 餐饮 午餐");
  S.clearTerm(); S.runCommand("list");
  const row = S.term.children[S.term.children.length-2];
  const eb = row.children.filter(c=>c.tagName==="BUTTON")[1];
  S.undo();                                        // 记录已不在 state 里
  S.clearTerm();
  eb.click();
  ok("H5.40 失效行点编辑会提示已失效", /已失效/.test(S.lines().join("\n")), S.lines().join("|"));
  eq("H5.41 失效行不会进入编辑模式", S.modalMode, "add");
  eq("H5.42 失效行的编辑按钮被标记失效", eb.textContent, "已失效");
}

/* ---------- 15. 程序化入口 doInvestFull 也走唯一提交点(结果落盘) ---------- */
{
  const S = loadApp(); S.boot();
  S.runCommand("add 850 餐饮 big");
  S.doInvestFull("money");
  const persisted = S.__storage.getItem("budget_term_v1");
  const obj = persisted ? JSON.parse(persisted) : null;
  const invested = obj ? (obj.records||[]).reduce((a,r)=>a+(r.moneyInv||0), 0) : 0;
  ok("H5.43 doInvestFull 之后结果已落盘(非命令入口也走 commit)", invested > 0, String(invested));
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length? 1 : 0);
