// M1 修复的护栏: 命令清单四处一致 —— COMMANDS(登记表) ↔ dispatch 的 case ↔ help 输出 ↔ Tab 补全 ↔ README
import fs from "node:fs";
import path from "node:path";
import { loadApp } from "./app.mjs";
import { HTML_PATH, README_PATH } from "./env.mjs";

/* BT_HTML 可指向"变异体", 但 README 始终取本仓库的(否则变异测试会连 README 一起换掉) */
const HTML = HTML_PATH;
const README = README_PATH;
const html = fs.readFileSync(HTML, "utf8");
const readme = fs.readFileSync(README, "utf8");
const js = html.slice(html.indexOf("<script>"));
const jsCode = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }

const S = loadApp(); S.boot();

/* ---------- 1. dispatch 的 case 与登记表双向一致 ---------- */
{
  const body = jsCode.slice(jsCode.indexOf("function dispatch("), jsCode.indexOf("function dispatch(") + 2000);
  const cases = [...body.matchAll(/case\s+"([^"]+)"/g)].map(m=>m[1]);
  ok("M1.1 dispatch 里存在 case", cases.length > 0, JSON.stringify(cases));

  const canonical = S.COMMAND_NAMES;
  const orphans = cases.filter(c=>!canonical.includes(c));
  eq("M1.2 dispatch 没有登记表之外/不可达的 case(如旧的 \"budget show\")", orphans, []);
  const missing = canonical.filter(c=>!cases.includes(c));
  eq("M1.3 每个登记的主命令都有 dispatch 分支", missing, []);
  ok("M1.4 case 无多词标签(命令名只取第一个 token)", !cases.some(c=>/\s/.test(c)), JSON.stringify(cases.filter(c=>/\s/.test(c))));
  ok("M1.5 dispatch 只按主名分派(switch(canonicalCmd(cmd)))", /switch\(canonicalCmd\(cmd\)\)/.test(body));
}

/* ---------- 2. 登记表自身完整性 ---------- */
{
  const names = S.COMMAND_NAMES, alias = S.CMD_ALIAS;
  ok("M1.6 主名列表非空且无重复", new Set(names).size === names.length && names.length > 5, names.join(","));
  ok("M1.7 别名不与主名冲突", Object.keys(alias).every(a=>!names.includes(a)), JSON.stringify(Object.keys(alias).filter(a=>names.includes(a))));
  ok("M1.8 别名不重复指向多个主名", new Set(Object.values(alias)).size <= names.length);
  for(const [a,c] of Object.entries(alias)) eq("M1.9 canonicalCmd(" + a + ")", S.canonicalCmd(a), c);
  eq("M1.10 未知命令原样返回", S.canonicalCmd("nope"), "nope");
  // sub 行不得污染主名/别名
  const subs = S.COMMANDS.filter(c=>c.sub);
  ok("M1.11 sub 行(子用法)不参与补全与别名", subs.length > 0 && subs.every(c=>c.n.every(n=>names.includes(n)||!!alias[n])));
}

/* ---------- 3. Tab 补全词由登记表派生 ---------- */
{
  const expect = [...new Set([...S.COMMAND_NAMES, ...Object.keys(S.CMD_ALIAS)])];
  eq("M1.12 CMD_WORDS = 主名 + 别名", S.CMD_WORDS, expect);
  ok("M1.13 config 出现在补全词里", S.CMD_WORDS.includes("config"));
  // 补全函数在别名下也能给出参数候选(以前只认主名)
  const a1 = S.argCandidates("ls", 1, ["ls"], "").sort();
  const a2 = S.argCandidates("list", 1, ["list"], "").sort();
  eq("M1.14 别名 ls 的参数补全与 list 一致", a1, a2);
  const p1 = S.argCandidates("invest", 2, ["invest","1"], "").sort();
  const p2 = S.argCandidates("pay", 2, ["pay","1"], "").sort();
  eq("M1.15 别名 invest 的参数补全与 pay 一致", p1, p2);
}

/* ---------- 4. help 输出覆盖全部命令 + 别名 ---------- */
{
  S.clearTerm(); S.runCommand("help");
  const help = S.lines().join("\n");
  const missing = S.COMMAND_NAMES.filter(n=>!new RegExp("(^|\\s)"+n.replace(/[?]/g,"\\?")+"(\\s|$)","m").test(help));
  eq("M1.16 help 里能找到每个主命令", missing, []);
  ok("M1.17 help 里有 config 行(旧版缺失)", /config\s+查看当前配置/.test(help), help.split("\n").filter(l=>l.includes("config")).join(" | "));
  ok("M1.18 help 里有别名对照块", help.includes("命令别名"), "");
  const aliases = Object.keys(S.CMD_ALIAS);
  const notShown = aliases.filter(a=>!help.includes(a));
  eq("M1.19 help 列出了全部别名", notShown, []);
  ok("M1.20 help 里保留了换算口径提示", help.includes("换算: 消费÷"), "");
  ok("M1.21 help 不再用 __HEADER/__INFO 哨兵", !/__HEADER|__INFO/.test(jsCode), "");
}

/* ---------- 5. 功能等价: 别名 == 主名(同一条命令) ---------- */
{
  const capture = (cmd)=>{
    const A = loadApp(); A.boot();
    A.runCommand("add 300 餐饮 午餐");
    A.clearTerm();
    A.runCommand(cmd);
    return A.lines().slice(1).join("\n");       // 去掉回显那一行
  };
  const pairs = [
    ["?", "help"], ["h", "help"],
    ["ls", "list"], ["rm", "del"], ["delete", "del"], ["edit", "update"],
    ["invest", "pay"], ["sum", "summary"], ["asset", "assets"], ["networth", "assets"],
    ["burn", "forecast"], ["predict", "forecast"], ["a", "add"],
    ["u", "undo"], ["settings", "config"], ["thresholds", "config"], ["alerts", "config"],
  ];
  const base = {};
  for(const [alias, canon] of pairs){
    if(!(canon in base)) base[canon] = capture(canon);
    const got = capture(alias);
    if(alias === "rm" || alias === "delete" || alias === "edit" || alias === "invest" || alias === "a" || alias === "u") continue;  // 需要参数, 单独测
    eq("M1.22 别名 " + alias + " 输出与 " + canon + " 一致", got, base[canon]);
  }
  // 需要参数/改数据的别名
  const del1 = capture("rm 1"), del2 = capture("del 1");
  eq("M1.23 rm 1 == del 1", del1, del2);
  const upd1 = capture("edit 1 50 交通 y"), upd2 = capture("update 1 50 交通 y");
  eq("M1.24 edit == update", upd1, upd2);
  const pay1 = capture("invest 1 all"), pay2 = capture("pay 1 all");
  eq("M1.25 invest == pay", pay1, pay2);
  const add1 = capture("a 50 餐饮 z"), add2 = capture("add 50 餐饮 z");
  eq("M1.26 a == add", add1, add2);
  const clr = (()=>{ const A = loadApp(); A.boot(); A.runCommand("clear"); return A.lines().length; })();
  eq("M1.27 clear == cls(都清屏)", clr, 0);
}

/* ---------- 6. 别名 u 不再破坏撤销栈(修复前会把 redo 清空) ---------- */
{
  const A = loadApp(); A.boot();
  A.runCommand("add 10 餐饮 x");
  eq("M1.28 记录已添加", A.state.records.length, 1);
  A.runCommand("u");
  eq("M1.29 u 撤销了记录", A.state.records.length, 0);
  eq("M1.30 u 之后 redo 仍可用(未被清空)", A.redoDepth, 1);
  eq("M1.31 u 没有把自己压成一条新的撤销", A.undoDepth, 0);
  A.runCommand("redo");
  eq("M1.32 redo 能恢复", A.state.records.length, 1);
  // 主名行为保持一致
  const B = loadApp(); B.boot();
  B.runCommand("add 10 餐饮 x"); B.runCommand("undo");
  eq("M1.33 undo 与 u 行为一致", [B.state.records.length, B.undoDepth, B.redoDepth], [A.state.records.length - 1, 0, 1]);
}

/* ---------- 7. README 与登记表同步 ---------- */
{
  for(const n of S.COMMAND_NAMES){
    ok("M1.34 README 里能查到命令 " + n, new RegExp("`"+n+"(\\s|`|\\[|\\|)").test(readme), "");
  }
  ok("M1.35 README 记录了 config", /`config`/.test(readme), "");
  ok("M1.36 README 有别名说明", /别名/.test(readme) || /=\s*\?/.test(readme), "");
}

/* ---------- 8. 未知命令仍然报错 ---------- */
{
  S.clearTerm(); S.runCommand("nosuchcmd");
  ok("M1.37 未知命令提示", /未知命令/.test(S.lines().join("\n")), S.lines().join("|"));
}

/* ---------- 9. ARCHITECTURE-REVIEW §1.4 的命令表必须与登记表同步 ----------
   背景: 2026-10-10 把"命令速查"从 HANDOVER 附录搬进了 ARCHITECTURE-REVIEW §1.4。
   搬进被跟踪文件就要有护栏 —— 否则它会变成一份"没人守着的副本"(F1/F12 的老毛病)。
   做法: 以登记表(唯一数据源)为基准，要求每个主名/别名都能在那个代码块里查到；
         再反向查一遍"块里出现的命令名是否都还在登记表里"(防删了命令却留着文档)。
   注意 §1.4 是**两栏排版**(一 physical line 含两三条命令)，所以按"存在性"判定而不是按行解析。 */
{
  const arch = fs.readFileSync(path.join(path.dirname(README_PATH), "ARCHITECTURE-REVIEW.md"), "utf8");
  const start = arch.indexOf("### 1.4 命令表");
  const bs = start >= 0 ? arch.indexOf("```", start) : -1;
  const be = bs >= 0 ? arch.indexOf("```", bs + 3) : -1;
  const block = (bs >= 0 && be > bs) ? arch.slice(bs, be) : "";
  ok("M1.38 ARCHITECTURE-REVIEW §1.4 存在且含命令表代码块", start >= 0 && block.includes("help"), "start=" + start);

  const has = (n) => new RegExp("(^|[^a-z])" + n.replace(/[?]/g, "\\?") + "([^a-z]|$)").test(block);
  const missing = S.COMMAND_NAMES.filter(n => !has(n));
  eq("M1.39 架构文件 §1.4 列出了全部主命令", missing, []);
  const aliasMissing = Object.keys(S.CMD_ALIAS).filter(a => !has(a));
  eq("M1.40 架构文件 §1.4 列出了全部别名", aliasMissing, []);

  // 反向: 块里的命令名不得是"已删除的命令"(白名单 = 登记表 + set 子命令关键字)
  const subs = ["budget","daily","invest","consume","ratio","period","periodstart","monthstart",
                "weekstart","alert","rate","natural","off","mon","sun","money","index","md","txt",
                "day","week","month","cat","today"];
  const known = new Set([...S.COMMAND_NAMES, ...Object.keys(S.CMD_ALIAS), "?", "set", ...subs]);
  const inBlock = new Set();
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^([a-z?][a-z0-9?]*(?:\s*\([a-z0-9?]+\))*)/.exec(line);
    if (m) for (const n of m[1].matchAll(/[a-z]+|\?/g)) inBlock.add(n[0]);
    const col2 = /^\S.*?\s{2,}([a-z?][a-z0-9?]*(?:\s*\([a-z0-9?]+\))*)\s{2,}/.exec(line);
    if (col2) for (const n of col2[1].matchAll(/[a-z]+|\?/g)) inBlock.add(n[0]);
  }
  const extra = [...inBlock].filter(n => !known.has(n));
  eq("M1.41 架构文件 §1.4 没有已不存在的命令名", extra, []);
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length? 1 : 0);
