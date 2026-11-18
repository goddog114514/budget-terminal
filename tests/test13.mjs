// v0.0.15 持久化容量专项护栏(test13):
//   1) localStorage 写满(QuotaExceededError)时, 全量数据还能不能落盘 budget_term_backup.json;
//   2) 落盘内容是不是"全量快照"(而不是增量/只写最近改动);
//   3) .json 的内容到底取自内存 state, 还是从 localStorage 复制;
//   4) 关掉自动写盘 + 写满时会发生什么(数据只存在内存 = 真实风险);
//   5) 用实测容量换算出"预计最大可记账条数"。
//
// 关键事实(源码 + 实测):
//   save() = localStorage.setItem(LS_KEY, JSON.stringify(state))  [catch 后仍继续]
//          + scheduleFileWrite() → writeToFolder() → serializeState() 读**内存 state**
//   两条写路径并行、同源, 不存在"先 localStorage 再复制到 .json"。
//
// 容量基准: 无头 Edge 142 在 file:// 下二分实测单键上限 5,241,856 字符(≈5 MiB 计费)。
//   本套件默认用小配额(300k 字符)复现溢出 —— 可复现、秒级; 真实容量只用于推算条数。
import fs from "node:fs";
import { loadApp } from "./app.mjs";
import { HTML_PATH } from "./env.mjs";

const html = fs.readFileSync(HTML_PATH, "utf8");

let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> " + detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got " + JSON.stringify(a) + " want " + JSON.stringify(b)); }
const near = (name, a, b, tol)=>{ const d=Math.abs(a-b); ok(name, d<=tol, "got "+a+" want "+b+" (Δ"+d.toFixed(3)+")"); };
const tick = (ms=40)=> new Promise(r=>setTimeout(r, ms));

const REAL_QUOTA_CHARS = 5241856;   // Edge 142 file:// 实测; Chrome 同源实现
const QUOTA = 300000;               // 测试用小配额(字符), 只为快速复现溢出
const FNAME = "budget_term_backup.json";

/* ---------- 假 File System Access 目录: 记录每次 write 的完整内容 ---------- */
function fakeFolder(){
  const files = new Map();      // name -> 最新内容(真实 createWritable 默认截断)
  const writes = [];            // 每次 write 一条 {name, chars, bytes}
  const names = new Set();
  const handle = {
    name: "bt-test-folder",
    requestPermission: async()=> "granted",
    getFileHandle: async(name)=>{
      names.add(name);
      return {
        name,
        createWritable: async()=>({
          write: async(s)=>{ const str = String(s); files.set(name, str); writes.push({ name, chars:str.length, bytes:Buffer.byteLength(str) }); },
          close: async()=>{},
        }),
      };
    },
  };
  return { handle, files, writes, names };
}
function mkRaw(n, extra){
  const out = [];
  for(let i=1; i<=n; i++){
    out.push({ id:i, amount: 12.34 + (i%7), category:"餐饮", note:"午餐 常规备注"+i, place:"",
               date:"2027-08-30", created:"2027-08-30",
               amortDays:1, amortTotal:12.34 + (i%7), mm:0, idx:0, moneyInv:0, indexInv:0 });
  }
  if(extra) out.push(extra);
  return out;
}
/* 装一个"只差落盘"的实例: boot 完 → 注入假目录 → 灌 N 条记录 */
function setup(n, opts={}){
  const S = loadApp({ storageQuota: (opts.quota==null? QUOTA : opts.quota), now:"2027-08-30" });
  S.boot();
  S.clearTerm();
  const fx = fakeFolder();
  S.__window.showDirectoryPicker = async ()=> fx.handle;
  S.state = { settings: S.normalizeSettings(opts.settings || {}), seq:0, records:[] };
  const norm = S.normalizeRecords(mkRaw(n));
  S.state = { settings: S.state.settings, seq: Math.max(0, ...norm.records.map(r=>r.id)), records: norm.records };
  /* 默认模拟"已选目录且自动写盘开着"; C6 显式关掉来验证风险路径 */
  S.autosaveOn = (opts.autosave !== false);
  return { S, fx };
}
const lastLines = (S, k=3)=> S.lines().slice(-k).join("\n");
/* 变异体可能写出 "{}"/空文件/非法 JSON —— 一律当"没有账本"处理, 让断言失败而不是抛异常
   (变异测试要求套件以 FAIL>0 退出, 崩溃会被判成"没跑出结果") */
const parseJson = (s)=>{ try{ const o = JSON.parse(s); return (o && typeof o==="object") ? o : {}; }catch(e){ return {}; } };
const recsOf = (o)=> Array.isArray(o.records) ? o.records : [];
/* 变异体可能一次都没写盘 —— 取不到就返回零值, 让断言失败而不是崩 */
const writeAt = (fx,i)=> fx.writes[i] || { name:"(none)", chars:0, bytes:0 };

/* ================= 1. 源码事实: 并行双写 / 同源 / 无增量 ================= */
{
  const saveBody = html.slice(html.indexOf("function save(){"), html.indexOf("const HISTORY_MAX"));
  ok("C1.1 save() 里 localStorage 写入被 try/catch 包住(写满不炸应用)", /try\{ localStorage\.setItem\(LS_KEY, JSON\.stringify\(state\)\); \}/.test(saveBody), saveBody.slice(0,120));
  ok("C1.2 save() 在 catch 之后仍调用 scheduleFileWrite()(落盘不依赖 localStorage 成功)",
     saveBody.indexOf("scheduleFileWrite()") > saveBody.indexOf("catch(e)"));

  const serBody = html.slice(html.indexOf("function serializeState(){"), html.indexOf("function restoreFromText"));
  ok("C1.3 serializeState() 直接读内存 state, 不读 localStorage", /state\.settings/.test(serBody) && !/localStorage/.test(serBody), serBody);

  const wfBody = html.slice(html.indexOf("async function writeToFolder(){"), html.indexOf("async function doAutosaveToggle"));
  ok("C1.4 writeToFolder() 写的是 serializeState(), 不是 localStorage 的值",
     /await w\.write\(serializeState\(\)\)/.test(wfBody) && !/localStorage/.test(wfBody));
  ok("C1.5 写盘是整文件覆盖, 无 keepExistingData/append 增量写法", !/keepExistingData/.test(html) && /createWritable\(\)/.test(wfBody));
  ok("C1.6 全程只有一个账本文件名", (html.match(/budget_term_backup\.json/g)||[]).length >= 1 && !/\.delta\.json|\.log\.json/.test(html));
  ok("C1.7 写盘受 autosaveOn 开关控制(不开就只写 localStorage)", /if\(!autosaveOn\) return;/.test(html));
}

/* ================= 2. 未超配额: 两条路径都写, 内容同源 ================= */
{
  const { S, fx } = setup(40, { quota: 10_000_000 });
  const okSave = S.save();
  await tick();
  const lsRaw = S.__storage.getItem("budget_term_v1");
  const store = parseJson(lsRaw);
  const parsed = parseJson(fx.files.get(FNAME));

  ok("C2.1 小数据 save() 返回 true", okSave === true);
  eq("C2.2 localStorage 存了完整账本(40 条)", recsOf(store).length, 40);
  eq("C2.3 同一次 save() 也写了 .json(不是失败才回退)", fx.writes.length, 1);
  eq("C2.4 .json 与 localStorage 记录数一致", recsOf(parsed).length, 40);
  eq("C2.5 两边首尾记录同源(内容一致)", [recsOf(parsed)[0], recsOf(parsed)[39]], [recsOf(store)[0], recsOf(store)[39]]);
  ok("C2.6 .json 带 app/version/savedAt 备份头", parsed.app==="budget_term" && parsed.version===2 && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(parsed.savedAt), parsed.savedAt);
  ok("C2.7 .json 因缩进比 localStorage 副本更大(全量 pretty)", writeAt(fx,0).chars > lsRaw.length * 1.3, writeAt(fx,0).chars + " vs " + lsRaw.length);
}

/* ================= 3. 超配额: localStorage 失败, .json 仍全量落盘 ================= */
{
  const { S, fx } = setup(1600);
  const compact = JSON.stringify(S.state);
  ok("C3.1 前置: 全量 JSON 超过测试配额", compact.length > QUOTA, compact.length + " > " + QUOTA);

  S.__storage.clear();                       // 保证"旧值不存在", 便于判定是否写坏
  const r1 = S.save();
  await tick();
  const warn = lastLines(S, 4);

  ok("C3.2 save() 明确返回 false(知道 localStorage 失败)", r1 === false);
  ok("C3.3 终端给出红色提示: 仅存内存 + 建议备份", /不允许写入本地存储/.test(warn) && /备份 \.json/.test(warn), warn);
  eq("C3.4 localStorage 里没有半截数据(键不存在)", S.__storage.getItem("budget_term_v1"), null);
  eq("C3.5 内存 state 完整无损", S.state.records.length, 1600);

  const written = fx.files.get(FNAME);
  ok("C3.6 配额溢出后 .json 仍然被写入", !!written && fx.writes.length === 1, "writes=" + fx.writes.length);
  const parsed = parseJson(written);
  eq("C3.7 .json 记录数 == 内存记录数(一条不少)", recsOf(parsed).length, 1600);
  ok("C3.8 .json 体积 > localStorage 配额(更大容器确实接住了)", writeAt(fx,0).chars > QUOTA, writeAt(fx,0).chars + " > " + QUOTA);
  ok("C3.9 .json 与内存逐条一致(同一真相源)", JSON.stringify(recsOf(parsed))===JSON.stringify(S.state.records), "records 不一致");
  eq("C3.10 .json 保留全部设置项", Object.keys(parsed.settings||{}).sort(), Object.keys(S.state.settings).sort());

  // 溢出是持续状态: 后续每次命令都应继续尝试, 且每次仍落盘
  S.clearTerm();
  S.runCommand("add 5 餐饮 追加测试");
  await tick();
  const after = parseJson(fx.files.get(FNAME));
  eq("C3.11 溢出后新增记录: 内存 1601", S.state.records.length, 1601);
  eq("C3.12 溢出后新增记录: .json 也是 1601(每次命令都重写全量)", recsOf(after).length, 1601);
  eq("C3.13 每次 commit 一次写盘(累计 2 次)", fx.writes.length, 2);
  ok("C3.14 溢出未阻断命令流程(没有抛异常/终端仍有回显)", S.lines().length > 0, "");
}

/* ================= 4. 全量快照 vs 增量: 体积线性, 无 delta 文件 ================= */
{
  const { S, fx } = setup(1600);
  S.save();                                  // 第 1 次: 1600 条
  await tick();
  S.clearTerm(); S.runCommand("add 5 餐饮 再加一条");
  await tick();
  const w1 = writeAt(fx,0), w2 = writeAt(fx,1);
  const p1 = parseJson(fx.files.get(FNAME));
  const ids = new Set(recsOf(p1).map(r=>r.id));

  ok("C4.1 第二次写盘仍包含全部旧记录(1..1601)", recsOf(p1).length === 1601 && ids.size === 1601);
  ok("C4.2 体积随条数线性增长(≈1 条记录的量级, 不是只写改动)",
     (w2.chars - w1.chars) > 100 && (w2.chars - w1.chars) < 2000, "Δ=" + (w2.chars - w1.chars));
  ok("C4.3 目录里只出现一个文件名(没有 .delta/.log)", fx.names.size === 1 && fx.names.has(FNAME), [...fx.names].join(","));
  ok("C4.4 每次写盘都是整文件: 无 append 语义(内容可独立解析)", parseJson(fx.files.get(FNAME)).app==="budget_term");
}

/* ================= 5. .json 不是从 localStorage 复制的(行为级证明) ================= */
{
  const { S, fx } = setup(500, { quota: 10_000_000 });
  S.save(); await tick();
  // 篡改 localStorage: 塞一份"空账本", 再把配额压到 0 → 之后 save 一定失败, 旧值留在存储里
  S.__storage.setItem("budget_term_v1", JSON.stringify({ settings:{}, seq:0, records:[] }));
  S.setStorageQuota(0);
  S.clearTerm(); S.runCommand("add 9 购物 内存为准");
  await tick();
  const lsStore = parseJson(S.__storage.getItem("budget_term_v1"));
  const fileData = parseJson(fx.files.get(FNAME));

  eq("C5.1 存储里是人为塞的 0 条(脏值留在原处)", recsOf(lsStore).length, 0);
  eq("C5.2 内存有 501 条", S.state.records.length, 501);
  eq("C5.3 .json 写的是内存的 501 条, 不是 localStorage 的 0 条", recsOf(fileData).length, 501);
  ok("C5.4 两边内容确实不同(排除巧合)", JSON.stringify(recsOf(fileData)) !== JSON.stringify(recsOf(lsStore)));
}

/* ================= 6. 风险路径: 自动写盘关闭 + 配额写满 ================= */
{
  const { S, fx } = setup(1600, { autosave:false });
  eq("C6.1 关掉自动写盘时 autosaveOn=false", S.autosaveOn, false);
  const r = S.save();
  await tick();
  ok("C6.2 save() 返回 false", r === false);
  eq("C6.3 没有任何 .json 写入(数据只在内存)", fx.writes.length, 0);
  eq("C6.4 localStorage 里没有这 1600 条(仍是空账本, boot 留下)", recsOf(parseJson(S.__storage.getItem("budget_term_v1"))).length, 0);
  ok("C6.5 终端提示用户手动备份", /备份 \.json/.test(lastLines(S,4)), lastLines(S,4));
  ok("C6.6 提示文案明确说\"仅存在于内存\"", /仅存在于内存/.test(lastLines(S,4)), lastLines(S,4));
}

/* ================= 7. 容量恢复 ================= */
{
  const { S } = setup(1600);
  S.save(); await tick();
  S.clearTerm();
  S.setStorageQuota(10_000_000);
  const r = S.save();
  await tick();
  ok("C7.1 配额恢复后 save() 成功", r === true);
  ok("C7.2 终端提示\"本地存储写入已恢复\"", /本地存储写入已恢复/.test(lastLines(S,3)), lastLines(S,3));
  eq("C7.3 恢复后完整落库 1600 条", recsOf(parseJson(S.__storage.getItem("budget_term_v1"))).length, 1600);
}

/* ================= 8. 容量评估: 最大可记账条数 / 每次写多少 ================= */
{
  const { S, fx } = setup(1000, { quota: 10_000_000 });
  const compact1 = JSON.stringify(S.state);
  const perRec = compact1.length / S.state.records.length;
  ok("C8.1 单条记录体积在合理量级(100~600 字符)", perRec > 100 && perRec < 600, perRec.toFixed(1));

  const header = 600;                                        // settings + seq + 包装的粗略占用
  const maxRec = Math.floor((REAL_QUOTA_CHARS - header) / perRec);
  console.log(`      · 单条 compact ≈ ${perRec.toFixed(1)} 字符; 实测配额 ${REAL_QUOTA_CHARS} 字符 → 预计上限 ≈ ${maxRec} 条`);
  ok("C8.2 推算上限落在 1 万~4 万条(与真实账本 371 条/77KB 的实测一致)",
     maxRec > 10000 && maxRec < 40000, String(maxRec));

  // 2 倍记录 → 2 倍体积(线性, 不是指数/带冗余日志)
  const { S: S2 } = setup(2000, { quota: 10_000_000 });
  const compact2 = JSON.stringify(S2.state);
  near("C8.3 记录数翻倍时体积也翻倍(线性)", compact2.length / compact1.length, 2, 0.02);

  // 该规模下 .json 体积与"每次全量写"的代价
  S.save(); await tick();
  const perRecPretty = writeAt(fx,0).chars / S.state.records.length;
  const estPrettyMB = maxRec * perRecPretty / 1048576;
  console.log(`      · 每条约 ${perRecPretty.toFixed(1)} 字符(json 缩进); 上限规模下 .json ≈ ${estPrettyMB.toFixed(1)} MB / 每次全量重写`);
  ok("C8.4 上限规模下 .json 体积仍远小于磁盘常见容量(< 50MB)", estPrettyMB < 50, estPrettyMB.toFixed(1));

  const t0 = Date.now();
  JSON.stringify(S2.state);                                 // compact(写 localStorage 用)
  S2.serializeState();                                      // pretty(写 .json 用)
  const ms = Date.now() - t0;
  console.log(`      · 2000 条双序列化耗时 ${ms}ms(上限规模约 ${(ms * maxRec / 2000).toFixed(0)}ms/次)`);
  ok("C8.5 双序列化不至于卡死主线程(2000 条 < 500ms)", ms < 500, ms + "ms");
}

/* ================= 汇总 ================= */
if(fails.length){
  console.log(`PASS ${pass} / FAIL ${fails.length}`);
  for(const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
console.log(`PASS ${pass} / FAIL 0`);
