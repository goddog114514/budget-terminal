// v0.0.14 类别余额(信封预算)专项护栏:
//   口径(总可用 = 当期预算 × N%) / set category(多类别·原子·off·reset) /
//   使用率与预警(阈值同今日·周期预算) / 顶栏与 budget 的圆点顺序与"未超额不显示" /
//   备份归一化与撤销 / 配置弹窗(浅色实时可配置余额 + 实时占比 + 单条命令回灌)。
import fs from "node:fs";
import { loadApp } from "./app.mjs";
import { HTML_PATH, README_PATH } from "./env.mjs";

const html = fs.readFileSync(HTML_PATH, "utf8");
const readme = fs.readFileSync(README_PATH, "utf8");

let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
function near(name, a, b, eps=1e-6){ ok(name, Math.abs(a-b)<=eps, "got "+a+" want "+b); }

const mk = ()=>{ const S = loadApp(); S.boot(); return S; };
/* 变异体下这些数组/元素可能为空 —— 裸下标会抛异常, 让变异脚本把"崩溃"当成"未抓住"。
   统一用 at()/txt() 取值, 断言失败而不是进程崩溃。 */
const at = (arr, i)=> (arr && arr[i]) || {};
const txt = (el)=> String((el && el.textContent) || "");

/* ---------- 1. 总量口径: 总可用余额 = 当期预算 × 可消费比例 ---------- */
{
  const S = mk();
  eq("CB1.1 默认总可用余额 = 1000 × 85%", S.catPool(), 850);
  eq("CB1.2 未配置时已配置合计为 0", S.catAllocated(), 0);
  eq("CB1.3 未配置时可配置余额 = 总可用余额", S.catPoolLeft(), 850);
  S.runCommand("config set invest 30");          // 投资 30% → 消费 70%
  eq("CB1.4 调投资比例后总可用余额跟着变(1000 × 70%)", S.catPool(), 700);
  S.runCommand("config set budget 2000 now");    // 只改当期
  eq("CB1.5 当期预算覆盖影响总可用余额(2000 × 70%)", S.catPool(), 1400);
  eq("CB1.6 默认预算不受当期覆盖影响", S.state.settings.budget, 1000);
}

/* ---------- 2. set category: 配置 / 多类别 / off / reset ---------- */
{
  const S = mk(); S.clearTerm();
  S.runCommand("set category 餐饮 400");
  eq("CB2.1 单类别写入", S.state.settings.categoryBudget, { "餐饮": 400 });
  eq("CB2.2 已配置合计", S.catAllocated(), 400);
  eq("CB2.3 可配置余额 = 850 − 400", S.catPoolLeft(), 450);
  const out = S.lines().join("\n");
  ok("CB2.4 输出含总可用/已配置/可配置三项",
     /总可用余额/.test(out) && /已配置/.test(out) && /可配置余额/.test(out), out.slice(0,200));
  ok("CB2.5 输出写明口径(当期预算 × 消费 85%)", /当期预算 ¥1000\.00 × 消费 85%/.test(out), out.slice(0,200));

  S.clearTerm(); S.runCommand("set category 餐饮 400 交通 300 购物 150");
  eq("CB2.6 一条命令配多个类别", S.state.settings.categoryBudget, { "餐饮":400, "交通":300, "购物":150 });
  eq("CB2.7 多类别合计", S.catAllocated(), 850);
  eq("CB2.8 合计等于总可用余额时允许(不越界)", S.catPoolLeft(), 0);

  S.clearTerm(); S.runCommand("set category 餐饮 900");
  ok("CB2.9 超过总可用余额被拒", /超过总可用余额/.test(S.lines().join("\n")), S.lines().join("|"));
  eq("CB2.10 被拒时不改任何配置", S.state.settings.categoryBudget, { "餐饮":400,"交通":300,"购物":150 });

  S.clearTerm(); S.runCommand("set category 交通 off");
  ok("CB2.11 off 取消该类别", !("交通" in S.state.settings.categoryBudget), JSON.stringify(S.state.settings.categoryBudget));
  S.runCommand("set category 购物 0");
  ok("CB2.12 金额 0 等同取消", !("购物" in S.state.settings.categoryBudget), JSON.stringify(S.state.settings.categoryBudget));

  S.clearTerm(); S.runCommand("set category reset");
  eq("CB2.13 reset 全部清除", S.state.settings.categoryBudget, {});
  ok("CB2.14 reset 给出确认文案", /已清空全部类别余额/.test(S.lines().join("\n")), S.lines().join("|"));
}

/* ---------- 3. 参数校验: 原子性 / 用法 / 空值 ---------- */
{
  const S = mk(); S.clearTerm();
  S.runCommand("set category 餐饮 400");
  S.runCommand("set category 餐饮 500 交通 abc");
  eq("CB3.1 一对不合法 → 整条命令不生效(餐饮仍是 400)", S.state.settings.categoryBudget, { "餐饮": 400 });
  ok("CB3.2 非法金额给出说明", /金额无效/.test(S.lines().join("\n")), S.lines().join("|"));

  S.clearTerm(); S.runCommand("set category 餐饮");
  ok("CB3.3 参数个数为奇数 → 用法提示", /用法: set category/.test(S.lines().join("\n")), S.lines().join("|"));
  eq("CB3.4 用法提示同样不改配置", S.state.settings.categoryBudget, { "餐饮": 400 });

  S.clearTerm(); S.runCommand("set category");
  ok("CB3.5 无参数 = 查看列表", /▓ 类别余额/.test(S.lines().join("\n")), S.lines().join("|"));

  const B = mk(); B.clearTerm();
  B.runCommand("set category 餐饮 -20");
  ok("CB3.6 负数金额被拒", /金额无效/.test(B.lines().join("\n")) && B.catAllocated()===0, B.lines().join("|"));
  B.runCommand("set category 餐饮 0.001");
  ok("CB3.7 0.001 被拒(r2 后为 0)", B.catAllocated()===0, B.lines().join("|"));
  B.runCommand("set category list 100");
  eq("CB3.8a 名为 list/reset 的类别也能配额度(只有单 token 才当关键字)", B.state.settings.categoryBudget, { "list": 100 });
  B.runCommand("set category list off");
  const before = JSON.stringify(B.state.settings.categoryBudget);
  B.runCommand("set category " + "超".repeat(80) + " 100");
  ok("CB3.8b 超长类别名被拒(不静默截断成幽灵键)",
     /类别名过长/.test(B.lines().join("\n")) && JSON.stringify(B.state.settings.categoryBudget)===before, B.lines().slice(-2).join("|"));
  B.runCommand('set category "日常 采购" 120');
  eq("CB3.8 带空格的类别名可用引号", B.state.settings.categoryBudget, { "日常 采购": 120 });
}

/* ---------- 4. 已超额时只能减不能加 ---------- */
{
  const S = mk();
  S.runCommand("set category 餐饮 850");
  eq("CB4.1 先占满总可用余额", S.catPoolLeft(), 0);
  S.runCommand("config set budget 400 now");     // 总可用余额掉到 340
  eq("CB4.2 调低当期预算后总可用余额变小", S.catPool(), 340);
  eq("CB4.3 已配置合计仍是 850(允许暂时超额)", S.catAllocated(), 850);
  S.clearTerm(); S.runCommand("set category 餐饮 900");
  ok("CB4.4 超额状态下不能继续加", /超过总可用余额/.test(S.lines().join("\n")) && S.catAllocated()===850, S.lines().join("|"));
  S.clearTerm(); S.runCommand("set category 餐饮 800");
  eq("CB4.5 超额状态下允许下调", S.state.settings.categoryBudget, { "餐饮": 800 });
  ok("CB4.6 下调后仍有超额提示", /只能下调/.test(S.lines().join("\n")), S.lines().join("|"));
}

/* ---------- 5. 撤销/重做: 一条命令 = 一步 ---------- */
{
  const S = mk();
  S.runCommand("set category 餐饮 400 交通 300");
  eq("CB5.1 一次配置只压一步撤销", S.undoDepth, 1);
  S.runCommand("undo");
  eq("CB5.2 撤销后配置回到空", S.state.settings.categoryBudget, {});
  eq("CB5.3 redo 可恢复", (S.runCommand("redo"), S.state.settings.categoryBudget), { "餐饮":400, "交通":300 });
}

/* ---------- 6. 使用率: 已消费按本期统计(含分摊) ---------- */
{
  const S = mk();
  S.runCommand("set category 餐饮 400");
  S.runCommand("add 300 餐饮 午餐");
  const rows = S.catBudgetRows();
  eq("CB6.1 已配置类别进表", rows.map(r=>r.cat), ["餐饮"]);
  eq("CB6.2 已支出 = 本期该类别消费", at(rows,0).spent, 300);
  eq("CB6.3 剩余可用", at(rows,0).left, 100);
  near("CB6.4 使用率 = 已消费 ÷ 已分配", at(rows,0).ratio, 0.75);
  near("CB6.5 分配占比 = 已分配 ÷ 总可用余额", at(rows,0).share, 400/850);

  const A = mk();
  A.runCommand("set category 房租 100");
  A.runCommand("amort 3000 365 房租 年付");
  const ar = at(A.catBudgetRows(),0);
  /* 今天 2027-08-30, 本期 08-01~08-31: 分摊窗口与本期的交集是 08-30、08-31 两天 → 8.22 × 2 */
  near("CB6.6 分摊成本按落在本期的天数计入(2 天 × 8.22)", ar.spent, 16.44);
  near("CB6.7 分摊的使用率 = 16.44 ÷ 100", ar.ratio, 0.1644);

  const B = mk();
  B.runCommand("set category 餐饮 100 交通 100 购物 100");
  B.runCommand("add 90 购物 x"); B.runCommand("add 50 交通 y"); B.runCommand("add 10 餐饮 z");
  eq("CB6.8 明细按使用率降序", B.catBudgetRows().map(r=>r.cat), ["购物","交通","餐饮"]);
  eq("CB6.9 只列出已配置的类别(其它类别不进表)", B.catBudgetRows().length, 3);
}

/* ---------- 7. 预警: 阈值与今日/周期预算同一份, 未触发完全不出现 ---------- */
{
  const S = mk();
  S.runCommand("set category 餐饮 400 交通 200");
  S.runCommand("add 300 餐饮 a");                  // 75%
  eq("CB7.1 75% 未达最低阈值 → 不出现在预警列表", S.catAlertList().length, 0);

  S.runCommand("add 40 餐饮 b");                   // 340/400 = 85%
  const al = S.catAlertList();
  eq("CB7.2 85% 触发黄灯", al.map(a=>[a.cat,a.cls,a.text]), [["餐饮","y","85%"]]);
  eq("CB7.3 黄灯用 yellow", at(al,0).dot, S.COLOR.yellow);

  S.runCommand("add 100 餐饮 c");                  // 440/400 = 110%
  const al2 = S.catAlertList();
  eq("CB7.4 110% 转红灯", [at(al2,0).cls, at(al2,0).text], ["r","110%"]);
  eq("CB7.5 红灯用 red", at(al2,0).dot, S.COLOR.red);

  const T = mk();
  T.runCommand("set category 餐饮 400");
  T.runCommand("add 340 餐饮 a");                  // 85%: 默认阈值下是黄灯
  eq("CB7.6a 默认阈值下 85% 触发黄灯", T.catAlertList().map(a=>a.cls), ["y"]);
  T.runCommand("set alert 90,100");
  eq("CB7.6 自定义阈值(90)下 85% 不再预警", T.catAlertList().length, 0);
  T.runCommand("add 40 餐饮 b");                   // 380/400 = 95%
  eq("CB7.7 95% 在 90 阈值下变黄灯", T.catAlertList().map(a=>[a.cls,a.text]), [["y","95%"]]);

  const M = mk();
  M.runCommand("set category 餐饮 100 交通 100");
  M.runCommand("add 120 餐饮 a"); M.runCommand("add 85 交通 b");
  eq("CB7.8 多项触发时横向列出两条", M.catAlertList().map(a=>a.cat), ["餐饮","交通"]);
  eq("CB7.9 未触发的第三类完全不出现", M.catAlertList().length, 2);
}

/* ---------- 8. 顶栏: 类别圆点在「今日预算/周期预算」之前, 未超额不渲染 ---------- */
function alertBoxes(S){
  const bar = S.__doc.getElementById("statusbar");
  const al = bar.children.find(c=>c && c.className==="mini-alert");
  if(!al) return [];
  return al.children.map(box=>{
    const kids = box.children || [];
    const lbl = kids.find(c=>String(c.className).indexOf("dlabel")>=0);
    const val = kids.find(c=>String(c.className).indexOf("dval")>=0);
    const dot = kids.find(c=>String(c.className).indexOf("dot ")===0);
    return { label: lbl?lbl.textContent:"", text: val?val.textContent:"", cls: dot?String(dot.className).replace("dot ",""):"" };
  });
}
{
  const S = mk();
  S.runCommand("set category 餐饮 400");
  S.runCommand("add 100 餐饮 a");                 // 25% → 不预警
  const clean = alertBoxes(S);
  ok("CB8.1 未超额时顶栏没有类别项(只有今日/周期两枚)", clean.length===2
     && clean.every(b=>/今日预算|周期预算/.test(b.label)), JSON.stringify(clean));

  S.runCommand("add 300 餐饮 b");                 // 400/400 = 100% → 红
  const boxes = alertBoxes(S);
  eq("CB8.2 超额后顶栏多出类别项", boxes.length, 3);
  eq("CB8.3 类别项排在今日预算之前", [at(boxes,0).label, at(boxes,1).label, at(boxes,2).label],
     ["餐饮：","今日预算：","周期预算："]);
  eq("CB8.4 类别项带同样的实心圆点与比例", [at(boxes,0).cls, at(boxes,0).text], ["r","100%"]);

  S.runCommand("set category 餐饮 off");
  eq("CB8.5 取消配置后类别项立即消失", alertBoxes(S).length, 2);
}
{
  /* budget 命令里的 dotLine 顺序与顶栏一致 */
  const S = mk();
  S.runCommand("set category 餐饮 100 交通 100");
  S.runCommand("add 130 餐饮 a"); S.runCommand("add 90 交通 b");
  S.clearTerm(); S.runCommand("budget");
  const lines = S.lines();
  const iCat = lines.findIndex(l=>l.indexOf("餐饮：")>=0);
  const iToday = lines.findIndex(l=>l.indexOf("今日预算：")>=0);
  const iPeriod = lines.findIndex(l=>l.indexOf("周期预算：")>=0);
  ok("CB8.6 类别行出现在今日预算之前", iCat>=0 && iToday>iCat, JSON.stringify([iCat,iToday]));
  ok("CB8.7 今日预算仍在周期预算之前", iToday>=0 && iPeriod>iToday, JSON.stringify([iToday,iPeriod]));
  ok("CB8.8 类别行同时给出比例", /交通：.*90%/.test(lines.join("\n")), lines.filter(l=>l.indexOf("交通：")>=0).join("|"));
}

/* ---------- 9. 持久化 / 归一化 ---------- */
{
  const S = mk();
  S.runCommand("set category 餐饮 400 交通 300");
  ok("CB9.1 备份里含 categoryBudget", /"categoryBudget"/.test(S.serializeState()), S.serializeState().slice(0,120));
  S.runCommand("config set budget 1000");
  const json = S.serializeState();
  const B = mk();
  B.restoreFromText(json);
  eq("CB9.2 导入备份后配置一致", B.state.settings.categoryBudget, { "餐饮":400, "交通":300 });

  const C = mk();
  C.restoreFromText(JSON.stringify({ app:"budget_term", version:2,
    settings:{ categoryBudget:{ "餐饮":400, "交通":0, "购物":-10, "娱乐":"abc", "":50, "教育":0.001 } },
    seq:0, records:[] }));
  eq("CB9.3 归一化只保留合法项(0/负数/非数字/空键/过小全丢)", C.state.settings.categoryBudget, { "餐饮":400 });

  const D = mk();
  D.restoreFromText(JSON.stringify({ app:"budget_term", version:2,
    settings:{ categoryBudget:{ ["长".repeat(80)]: 100 } }, seq:0, records:[] }));
  eq("CB9.4 手改备份里的超长类别名按 CAT_NAME_MAX 截断", String(Object.keys(D.state.settings.categoryBudget)[0]||"").length, D.CAT_NAME_MAX);

  const E = mk();
  E.restoreFromText(JSON.stringify({ app:"budget_term", version:2, settings:{}, seq:0, records:[] }));
  eq("CB9.5 旧备份(无该字段)回落空表", E.state.settings.categoryBudget, {});

  const F = mk();
  F.restoreFromText(JSON.stringify({ app:"budget_term", version:2,
    settings:{ categoryBudget: [1,2,3] }, seq:0, records:[] }));
  eq("CB9.6 数组/非法形状不炸, 回落空表", F.state.settings.categoryBudget, {});
}

/* ---------- 10. 配置页 / help / 补全 ---------- */
{
  const S = mk();
  S.runCommand("set category 餐饮 400");
  S.runCommand("add 200 餐饮 x");
  S.clearTerm(); S.runCommand("config");
  const cfg = S.lines().join("\n");
  ok("CB10.1 配置页显示总可用余额与口径", /类别余额\(总可用\).*¥850\.00.*1000\.00 × 消费 85%/.test(cfg), cfg.slice(0,300));
  ok("CB10.2 配置页显示已配置/可配置", /已配置 ¥400\.00.*可配置 ¥450\.00/.test(cfg), cfg.slice(0,300));
  ok("CB10.3 配置页明细带实时使用率", /餐饮 ¥400\.00 已用50%/.test(cfg), cfg.slice(0,300));

  S.clearTerm(); S.runCommand("help");
  const help = S.lines().join("\n");
  ok("CB10.4 help 里有 set category 行", /set category <类别> <金额>/.test(help), help.split("\n").filter(l=>/category/.test(l)).join("|"));

  eq("CB10.5 set 首槽补全含 category", S.argCandidates("set",1,["set"],"").includes("category"), true);
  const cats = S.argCandidates("set",2,["set","category",""],"");
  ok("CB10.6 类别槽补全给出已知类别与 reset", cats.includes("reset") && cats.includes("餐饮"), JSON.stringify(cats));
  eq("CB10.7 别名 set cat 的补全与 set category 一致",
     S.argCandidates("set",2,["set","cat",""],""), cats);
}

/* ---------- 11. 配置弹窗: 浅色实时可配置余额 + 实时占比 + 单条命令回灌 ---------- */
{
  const S = mk();
  S.runCommand("set category 餐饮 300");
  S.openCatModal();
  const wrap = S.__doc.getElementById("catWrap");
  ok("CB11.1 弹窗打开", wrap.classList.contains("open"));

  const host = S.__doc.getElementById("c_rows");
  eq("CB11.2 每个已知类别一行", host.children.length, S.knownCategories().length);
  const first = host.children[0];
  const parts = S.catRowParts(first);
  ok("CB11.3 行内有 输入框 / 浅色余额 / 占比 三件套",
     !!parts.input && !!parts.left && !!parts.pc, JSON.stringify(Object.keys(parts)));
  eq("CB11.4 已有配置回填到输入框", String(parts.input.value), "300");
  ok("CB11.5 浅色余额文案是「可配置 ¥…」", /可配置 ¥550\.00/.test(txt(parts.left)), txt(parts.left));
  ok("CB11.6 行尾是该类别占比(300 ÷ 850)", /35\.3%/.test(txt(parts.pc)), txt(parts.pc));

  /* 输入即预览: 改第一个类别为 500, 可配置余额与占比同步变化 */
  parts.input.value = "500";
  parts.input.dispatch("input");
  ok("CB11.7 输入后浅色余额实时扣减(850 − 500)", /可配置 ¥350\.00/.test(txt(parts.left)), txt(parts.left));
  ok("CB11.8 输入后占比实时刷新(500 ÷ 850)", /58\.8%/.test(txt(parts.pc)), txt(parts.pc));
  ok("CB11.9 其它行显示同一个可配置余额", host.children.slice(1).every(r=>/可配置 ¥350\.00/.test(txt(S.catRowParts(r).left))),
     host.children.slice(1).map(r=>txt(S.catRowParts(r).left)).join("|"));

  S.saveCatBudgets();
  eq("CB11.10 保存后写入 state", S.state.settings.categoryBudget, { "餐饮": 500 });
  ok("CB11.11 保存后弹窗关闭", !wrap.classList.contains("open"));
  const cmdLine = S.lines().find(l=>/set category/.test(l));
  ok("CB11.12 回灌的是 set category 命令(双通道同一入口)", !!cmdLine, S.lines().slice(-4).join("|"));
  eq("CB11.13 保存只压一步撤销", S.undoDepth>0, true);
}
{
  /* 清空输入 → 保存时显式发 off, 旧额度不残留 */
  const S = mk();
  S.runCommand("set category 餐饮 400");
  S.openCatModal();
  const parts = S.catRowParts(S.__doc.getElementById("c_rows").children[0]);
  parts.input.value = "";
  ok("CB11.14 清空后命令里带 off", /"餐饮" off|餐饮 off/.test(S.catBudgetCommand()), S.catBudgetCommand());
  S.saveCatBudgets();
  eq("CB11.15 保存后该类别被清除", S.state.settings.categoryBudget, {});
}
{
  /* 超出总可用余额时保存被拦下, 状态不变、弹窗仍开 */
  const S = mk();
  S.openCatModal();
  const parts = S.catRowParts(S.__doc.getElementById("c_rows").children[0]);
  parts.input.value = "5000";
  S.saveCatBudgets();
  eq("CB11.16 超额保存被拒(state 不变)", S.state.settings.categoryBudget, {});
  ok("CB11.17 弹窗保持打开并给出黄色说明",
     S.__doc.getElementById("catWrap").classList.contains("open")
     && /超过总可用余额/.test(S.__doc.getElementById("c_hint").textContent),
     S.__doc.getElementById("c_hint").textContent);

  S.clearCatBudgets();
  ok("CB11.18 「全部清除」清空并关闭弹窗",
     JSON.stringify(S.state.settings.categoryBudget)==="{}" && !S.__doc.getElementById("catWrap").classList.contains("open"));
}
{
  /* 入口: 工具栏「配置 ▾」里必须有这一项, 且与其它浮层互斥 */
  ok("CB11.19 配置 ▾ 下拉里有「配置类别余额」按钮", /data-config="category"/.test(html) && /配置类别余额/.test(html));
  ok("CB11.20 类别弹窗进 MODAL_IDS(浮层互斥/点空白关闭共用一份清单)", /MODAL_IDS\s*=\s*\[[^\]]*"catWrap"/.test(html));
  const S = mk();
  S.openBudgetModal();
  S.openCatModal();
  ok("CB11.21 打开类别弹窗会先关掉预算弹窗(全局最多一个浮层)",
     !S.__doc.getElementById("budgetWrap").classList.contains("open")
     && S.__doc.getElementById("catWrap").classList.contains("open"));
}

/* ---------- 12. 文档同步 ---------- */
{
  ok("CB12.1 README 记录 set category", /`set category/.test(readme), "");
  ok("CB12.2 README 当前版本 = v0.0.14", /当前版本：\*\*v0\.0\.14\*\*/.test(readme), "");
  ok("CB12.3 README 有类别余额章节", /类别余额/.test(readme), "");
  ok("CB12.4 版本号 v0.0.14", S_version(), "");
  function S_version(){ const S = loadApp(); return S.APP_VERSION === "v0.0.14"; }
}

/* ---------- 13. 静默开关: 只关掉该类别的超额警告, 不动金额/排序/合计 ---------- */
{
  const S = mk();
  S.runCommand("set category 餐饮 100 交通 100");
  S.runCommand("add 120 餐饮 a");                  // 120% → 红
  S.runCommand("add 85 交通 b");                   // 85% → 黄

  eq("CB13.1 默认两个类别都进入预警", S.catAlertList().map(a=>a.cat), ["餐饮","交通"]);
  eq("CB13.2 默认没有静默标记", S.state.settings.categoryMute, {});

  const before = S.catBudgetRows().map(r=>[r.cat,r.alloc,r.spent,r.left,r.ratio]);
  S.runCommand("set category 餐饮 100 nowarn");
  eq("CB13.3 nowarn 后该类别不再预警", S.catAlertList().map(a=>a.cat), ["交通"]);
  eq("CB13.4 静默不影响明细数值与排序", S.catBudgetRows().map(r=>[r.cat,r.alloc,r.spent,r.left,r.ratio]), before);
  eq("CB13.5 静默标记写入 settings.categoryMute", S.state.settings.categoryMute, { "餐饮": true });

  const boxes = alertBoxes(S);
  ok("CB13.6 顶栏不再出现静默类别", boxes.length===3 && !boxes.some(b=>b.label.indexOf("餐饮")>=0),
     JSON.stringify(boxes));

  S.clearTerm(); S.runCommand("budget");
  const bl = S.lines();
  ok("CB13.7 budget 输出里也没有它的圆点行",
     !bl.some(l=>l.indexOf("餐饮：")>=0) && bl.some(l=>l.indexOf("交通：")>=0),
     bl.filter(l=>/餐饮|交通/.test(l)).join("|"));

  S.clearTerm(); S.runCommand("set category");
  const table = S.term.children.find(c=>String(c.className).indexOf("cb-table")>=0);
  const rows = table ? table.children.filter(r=>r.dataset && r.dataset.cat) : [];
  const dr = rows.find(r=>r.dataset.cat==="餐饮");
  const jr = rows.find(r=>r.dataset.cat==="交通");
  const dLast = (dr && dr.children.length) ? dr.children[dr.children.length-1] : null;
  const jLast = (jr && jr.children.length) ? jr.children[jr.children.length-1] : null;
  ok("CB13.8 明细里静默类别带「静默」标记", txt(dr).indexOf("静默")>=0, txt(dr));
  eq("CB13.9 静默类别使用率用灰色", dLast && dLast.style ? dLast.style.color : null, S.COLOR.gray);
  eq("CB13.10 未静默类别仍用警告色", jLast && jLast.style ? jLast.style.color : null, S.COLOR.yellow);

  S.runCommand("set category 餐饮 off");
  eq("CB13.11 取消分配同时删掉静默标记", S.state.settings.categoryMute, {});
  S.runCommand("set category 交通 100 nowarn");
  eq("CB13.12 reset 一并清掉静默标记", (S.runCommand("set category reset"), S.state.settings.categoryMute), {});
}
{
  /* 弹窗: 类别名后的勾选框(默认勾选) → 保存时回灌 nowarn, 重新打开保持未勾选 */
  const S = mk();
  S.runCommand("set category 餐饮 100");
  S.openCatModal();
  const host = S.__doc.getElementById("c_rows");
  const row = host.children.find(r=>r.dataset && r.dataset.cat==="餐饮");
  const parts = S.catRowParts(row || { children: [] });
  ok("CB13.13 每行在类别名后有勾选框", !!parts.warn && String(parts.warn.className).indexOf("cwarn")>=0,
     JSON.stringify(Object.keys(parts)));
  eq("CB13.14 勾选框默认勾选", !!(parts.warn && parts.warn.checked), true);
  const item = S.readCatInputs().find(x=>x.cat==="餐饮");
  eq("CB13.15 默认 mute=false(照常提示)", item ? item.mute : null, false);

  if(parts.warn) parts.warn.checked = false;
  ok("CB13.16 取消勾选后回灌命令带 nowarn", /nowarn/.test(S.catBudgetCommand()), S.catBudgetCommand());
  S.saveCatBudgets();
  eq("CB13.17 保存后 settings.categoryMute 正确", S.state.settings.categoryMute, { "餐饮": true });

  S.openCatModal();
  const row2 = S.__doc.getElementById("c_rows").children.find(r=>r.dataset && r.dataset.cat==="餐饮");
  const p2 = S.catRowParts(row2 || { children: [] });
  eq("CB13.18 重新打开保持未勾选", !!(p2.warn && p2.warn.checked), false);
}
{
  /* 归一化: 值非 true / 类别已不在 categoryBudget → 丢弃; 旧备份无字段 → {} */
  const C = mk();
  C.restoreFromText(JSON.stringify({ app:"budget_term", version:2,
    settings:{ categoryBudget:{ "餐饮":400 }, categoryMute:{ "餐饮":"1" } }, seq:0, records:[] }));
  eq("CB13.19 truthy 非布尔值归一成 true", C.state.settings.categoryMute, { "餐饮":true });

  const D = mk();
  D.restoreFromText(JSON.stringify({ app:"budget_term", version:2,
    settings:{ categoryBudget:{ "餐饮":400, "交通":300 }, categoryMute:{ "餐饮":false, "交通":true } },
    seq:0, records:[] }));
  eq("CB13.20 值非 true 的项被丢弃", D.state.settings.categoryMute, { "交通":true });

  const E = mk();
  E.restoreFromText(JSON.stringify({ app:"budget_term", version:2,
    settings:{ categoryBudget:{ "餐饮":400 }, categoryMute:{ "购物":true } }, seq:0, records:[] }));
  eq("CB13.21 不在 categoryBudget 里的类别被丢弃", E.state.settings.categoryMute, {});

  const F = mk();
  F.restoreFromText(JSON.stringify({ app:"budget_term", version:2, settings:{ categoryBudget:{ "餐饮":400 } },
    seq:0, records:[] }));
  eq("CB13.22 旧备份(无 categoryMute)回落空表", F.state.settings.categoryMute, {});

  const G = mk();
  G.restoreFromText(JSON.stringify({ app:"budget_term", version:2,
    settings:{ categoryBudget:{ "餐饮":400 }, categoryMute:[1,2,3] }, seq:0, records:[] }));
  eq("CB13.23 非法形状(数组)回落空表", G.state.settings.categoryMute, {});
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length? 1 : 0);
