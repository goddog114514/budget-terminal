// 测试装置的单一入口: 顺序跑完整 5 个套件, 汇总断言数并对照交付闸门基线。
//   node tests/run-all.mjs
// 任一套件失败、或断言数与基线不符(护栏被悄悄删掉/改期望值), 都以非 0 退出。
// 依据: HANDOVER §5.3「验证闸门」——必须全绿, 不许"挑着跑"。
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/* 交付闸门基线(HANDOVER §5.3)。断言数变化 = 护栏被增删, 必须是有意为之, 再同步改这里。 */
const SUITES = [
  { file:"test.mjs",  expect:138, what:"账本/周期/结转/投资池/导入导出/持久化/撤销重做 + 分摊成本(amort) + 分摊窗口口径" },
  { file:"test2.mjs", expect:55,  what:"端到端命令流/弹窗/备份数据冒烟/阈值与圆点" },
  { file:"test3.mjs", expect:85,  what:"P1 护栏: 颜色令牌/kvRow/自适应列宽/死代码/响应式" },
  { file:"test4.mjs", expect:85,  what:"M1 护栏: 登记表 ↔ dispatch ↔ help ↔ 补全 ↔ README ↔ 架构文件 §1.4 命令表" },
  { file:"test5.mjs", expect:81,  what:"M2 护栏: 语义槽位/@日期位置无关/ghost 预览 + amort 补全与双选项卡" },
];

const indent = (s)=> (s||"").trim().split("\n").map(l=>"      "+l).join("\n");

let pass = 0, fail = 0, abnormal = 0;
for(const s of SUITES){
  const r = spawnSync(process.execPath, [path.join(DIR, s.file)], { encoding:"utf8" });
  const out = (r.stdout||"") + (r.stderr||"");
  const m = out.match(/PASS\s+(\d+)\s*\/\s*FAIL\s+(\d+)/);
  if(!m){
    abnormal++;
    console.log(`✗ ${s.file.padEnd(11)} 没跑出结果 (exit=${r.status})  ${s.what}`);
    if(out.trim()) console.log(indent(out));
    continue;
  }
  const p = Number(m[1]), f = Number(m[2]);
  pass += p; fail += f;
  const mismatch = p !== s.expect;
  if(mismatch) abnormal++;
  console.log(`${(f||mismatch)?"✗":"✓"} ${s.file.padEnd(11)} PASS ${String(p).padStart(3)} / FAIL ${f}` +
              `   (基线 ${s.expect}${mismatch?" ← 不符":""})  ${s.what}`);
  if(f || mismatch){
    const detail = out.trim().split("\n").filter(l=>/^\s*✗|FAIL|Error/.test(l)).join("\n");
    if(detail) console.log(indent(detail));
  }
}
console.log("-".repeat(78));
console.log(`合计 PASS ${pass} / FAIL ${fail}` + (abnormal ? ` · 异常套件 ${abnormal}` : ""));
if(!fail && !abnormal) console.log("闸门全绿 (HANDOVER §5.3)");
process.exit(fail || abnormal ? 1 : 0);
