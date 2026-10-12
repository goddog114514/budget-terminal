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

/* ---------- 10. 分摊成本 amort 的补全 + 「记一笔」双选项卡 ---------- */
{
  /* 补全: 总价位不提示, 天数位给天数, 类别位给类别; @日期 位置无关 */
  eq("M2.49 amort 总价位不提示", cand("amort "), []);
  ok("M2.50 amort 天数位给天数候选", cand("amort 3000 ").includes("365") && cand("amort 3000 ").includes("12月"), JSON.stringify(cand("amort 3000 ")));
  ok("M2.51 amort 类别位给类别", CAT.every(c=>has(cand("amort 3000 365 "), c)), JSON.stringify(cand("amort 3000 365 ")));
  eq("M2.52 amort 类别位前缀命中", cand("amort 3000 365 餐"), ["餐饮"]);
  eq("M2.53 amort 备注位不提示", cand("amort 3000 365 餐饮 "), []);
  ok("M2.54 amort @日期位置无关, 类别位仍正确", CAT.every(c=>has(cand("amort @2027-08-01 3000 365 "), c)));
  eq("M2.55 别名 amortize 与 amort 的类别位一致", cand("amortize 3000 365 餐"), cand("amort 3000 365 餐"));
  eq("M2.56 amort 正在输 @ 时不给关键字", cand("amort 3000 365 @"), []);

  /* 双选项卡: 面板切换 + 标题 + 实时预览。
     注意: DOM stub 不解析 HTML(querySelectorAll 返回空), 所以选项卡按钮的 click 处理器
     要在这里手工接上(复刻 bindModal 的做法), 而面板/预览逻辑走真实函数。 */
  const doc = S.__doc;
  const mtab = (t)=>{ const b = doc.createElement("button"); b.dataset.mtab = t; return b; };
  const btnAdd = mtab("add"), btnAmort = mtab("amort");
  btnAdd.addEventListener("click",()=>S.setModalTab(btnAdd.dataset.mtab));
  btnAmort.addEventListener("click",()=>S.setModalTab(btnAmort.dataset.mtab));
  const panelAdd = doc.getElementById("mp_add"), panelAmort = doc.getElementById("mp_amort");
  const hint = doc.getElementById("fa_hint");
  S.openAdd();
  ok("M2.57 openAdd 默认「单笔消费」", S.modalTab==="add" && !panelAdd.classList.contains("hide")
     && panelAmort.classList.contains("hide"), S.modalTab);
  btnAmort.click();
  ok("M2.58 点选项卡切到「分摊成本」", S.modalTab==="amort" && !panelAmort.classList.contains("hide")
     && panelAdd.classList.contains("hide"), S.modalTab);
  eq("M2.59 标题跟着选项卡变", doc.getElementById("mTitle").textContent, "记一笔分摊成本");
  btnAdd.click();
  ok("M2.60 再点回「单笔消费」面板互换", S.modalTab==="add" && !panelAdd.classList.contains("hide")
     && panelAmort.classList.contains("hide"), S.modalTab);
  eq("M2.61 标题跟着切回", doc.getElementById("mTitle").textContent, "记一笔消费");
  /* 实时预览(输入即刷新): 与终端同一口径; 起始日期**精确到日**(v0.0.8) */
  S.setModalTab("amort");
  doc.getElementById("fa_total").value = "3000";
  doc.getElementById("fa_days").value = "365";
  doc.getElementById("fa_date").value = "2027-08-17";     // 精确到日(type="date" 的 ISO 值)
  S.updateAmortHint();
  const shownTotal = S.r2(S.r2(3000/365)*365);
  ok("M2.62 预览显示每天金额 + 应投 + 起始日(与终端同口径)",
     hint.textContent.includes("每天 ¥"+S.money(S.r2(3000/365)))
     && hint.textContent.includes("¥"+S.money(S.investOf(shownTotal).mm))
     && hint.textContent.includes("从 2027-08-17 起"),
     hint.textContent);
  ok("M2.62b 预览给出精确到日的生效区间(含首尾)",
     hint.textContent.includes("2027-08-17 ~ 2028-08-15"), hint.textContent);
  ok("M2.62c 起始日期带日, 不再被吸到 1 号",
     !hint.textContent.includes("2027-08-01"), hint.textContent);
  /* 旧的"月份"写法必须被拒(以前会静默吸成该月 1 号), 且留空 = 今天 */
  doc.getElementById("fa_date").value = "2027-08";
  S.updateAmortHint();
  ok("M2.62d 月份写法被拒(不再悄悄算成 1 号)", hint.classList.contains("bad"), hint.textContent);
  doc.getElementById("fa_date").value = "";
  S.updateAmortHint();
  ok("M2.62e 留空 = 从今天起(冻结时钟 2027-08-30)",
     !hint.classList.contains("bad") && hint.textContent.includes("从 2027-08-30 起"), hint.textContent);
  doc.getElementById("fa_date").value = "2027-08-17";
  S.updateAmortHint();
  doc.getElementById("fa_days").value = "1";        // 越界 → 黄色说明并阻止提交
  S.updateAmortHint();
  ok("M2.63 天数越界时预览变黄色错误", hint.classList.contains("bad"), hint.textContent);
  doc.getElementById("fa_days").value = "12月";
  S.updateAmortHint();
  ok("M2.64 '12月' 被预览接受(按 30 天/月 = 360 天)", !hint.classList.contains("bad")
     && hint.textContent.includes("360 天"), hint.textContent);
  doc.getElementById("fa_days").value = "abc";
  S.updateAmortHint();
  ok("M2.65 天数非数字被拒", hint.classList.contains("bad"), hint.textContent);
  /* 提交走真实 submitModal → 拼 amort 命令回灌 runCommand */
  doc.getElementById("fa_total").value = "600";
  doc.getElementById("fa_days").value = "12月";
  doc.getElementById("fa_cat").value = "房租";
  doc.getElementById("fa_note").value = "年费";
  doc.getElementById("fa_date").value = "2027-08-17";
  const beforeCnt = S.state.records.length;
  S.submitModal();
  eq("M2.66 弹窗提交真的记入一条", S.state.records.length, beforeCnt+1);
  const ar = S.state.records[S.state.records.length-1];
  eq("M2.67 弹窗提交的天数/总价正确", [ar.amortDays, ar.amortTotal], [360, 600]);
  eq("M2.68 弹窗提交的日期精确到日(不再吸到 1 号)", ar.date, "2027-08-17");
  eq("M2.69 弹窗提交的类别/备注正确", [ar.category, ar.note], ["房租", "年费"]);
  ok("M2.70 提交后弹窗关闭", !doc.getElementById("modalWrap").classList.contains("open"));
  /* 日期非法时提交必须被拦下且**不落库**(不得静默回落到今天) */
  S.openAdd(); S.setModalTab("amort");
  doc.getElementById("fa_total").value = "600";
  doc.getElementById("fa_days").value = "360";
  doc.getElementById("fa_cat").value = "房租";
  doc.getElementById("fa_date").value = "2027-08";
  const cnt2 = S.state.records.length;
  S.submitModal();
  eq("M2.70b 日期非法时提交被拦下(不落库)", S.state.records.length, cnt2);
  ok("M2.70c 非法日期时弹窗保持打开", doc.getElementById("modalWrap").classList.contains("open"));
  /* 留空提交 = 不带 @参数(与命令行默认语义一致 = 今天) */
  doc.getElementById("fa_date").value = "";
  S.submitModal();
  eq("M2.70d 留空起始日 = 今天", S.state.records[S.state.records.length-1].date, S.todayYMD());
  /* amortPickDate 是预览与提交共用的唯一解析入口 */
  eq("M2.70e 空值解析为今天且标记 blank", S.amortPickDate(""), {date:S.todayYMD(), blank:true});
  ok("M2.70f 无法解析的日期返回 null(由调用方提示)", S.amortPickDate("2027-08")===null, JSON.stringify(S.amortPickDate("2027-08")));
  eq("M2.70g 宽容写法归一成 ISO", S.amortPickDate("2027/8/5").date, "2027-08-05");
  /* 再次打开回到默认选项卡并清空分摊字段 */
  S.openAdd();
  ok("M2.71 重新打开回到「单笔消费」", S.modalTab==="add" && !panelAdd.classList.contains("hide"), S.modalTab);
  ok("M2.72 openAdd 清空分摊字段", doc.getElementById("fa_total").value==="" && doc.getElementById("fa_days").value==="",
     doc.getElementById("fa_total").value+"|"+doc.getElementById("fa_days").value);
  eq("M2.73 openAdd 的起始日期默认精确到今天", doc.getElementById("fa_date").value, S.todayYMD());
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length? 1 : 0);
