// 测试装置的单一入口: 顺序跑完整套件, 汇总断言数并对照交付闸门基线。
//   node tests/run-all.mjs
// 任一套件失败、或断言数与基线不符(护栏被悄悄删掉/改期望值), 都以非 0 退出。
// 依据: HANDOVER §5.3「验证闸门」——必须全绿, 不许"挑着跑"。
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/* 交付闸门基线(HANDOVER §5.3)。断言数变化 = 护栏被增删, 必须是有意为之, 再同步改这里。 */
const SUITES = [
  { file:"test.mjs",  expect:152, what:"账本/周期/结转/投资池/导入导出/持久化/撤销重做 + 分摊成本(amort) + 分摊窗口口径 + P2 导入提示/持久化诊断/导出转义" },
  { file:"test2.mjs", expect:59,  what:"端到端命令流/弹窗/备份数据冒烟/阈值与圆点 + v0.0.14 首屏自动输出预算/工具栏不再留「预算进度」按钮" },
  { file:"test3.mjs", expect:123,  what:"P1 护栏: 颜色令牌/kvRow/自适应列宽/死代码/响应式 + v0.0.11 统一视觉组件(标题/比例条/堆叠条/类别行/迷你柱) + v0.0.12 P1 自定义类别独立色板(B-15)" },
  { file:"test4.mjs", expect:125,  what:"M1 护栏: 登记表 ↔ dispatch ↔ help ↔ 补全 ↔ README ↔ 架构文件 §1.4 命令表 + P0 config/set 比例与金额边界 + P2 config 第四 token/help 与补全暴露 (+v0.0.13 search/find 登记)" },
  { file:"test5.mjs", expect:92,  what:"M2 护栏: 语义槽位/@日期位置无关/ghost 预览 + amort 补全与双选项卡(含起始日精确到日) + P0 分摊预览口径(config 不再整体返回空)" },
  { file:"test6.mjs", expect:59,  what:"H5 护栏: 双通道对称(pay full 命令/按钮同通道、config 按钮、弹窗 edit 分支可达) + 程序化入口统一提交" },
  { file:"test7.mjs", expect:241, what:"v0.0.10/0.11 图表总结 + 合并入口 report: 四窗口/三图型/饼图闭合/分摊口径/预算口径/分析与结论/空数据/双通道/日期弹窗复用/输出去重与排序/规范自检 + 浮层互斥(下拉/弹窗全局最多一个 open) + v0.0.13 预算行按窗口覆盖的各期合计(跨两个记账周期 = 两期之和)" },
  { file:"test8.mjs", expect:163, what:"v0.0.12 地点: 字段归一化/place 命令/弹窗双通道/启动预热一次/记账同步写入/左上角 Canvas 准星/GCJ-02/缓存与撤销/合规源码断言/Key 打码 + P0 备注转义 + P1 Key 归一化/SDK 重试/失败诊断/类别真相来源/place 参数(B-09/B-10/B-12/B-13/B-14)" },
  { file:"test9.mjs", expect:73,  what:"v0.0.13 查找 search: 关键词(类别/备注/地点)/#编号/金额(等值/比较/区间/分摊总价)/日期窗口/多条件 AND/非法条件/无结果/合计口径/结果行与 list 同构/行内按钮/工具栏搜索框双通道/日期解析共用" },
  { file:"test10.mjs", expect:127, what:"v0.0.14 类别余额(信封): 总可用=当期预算×N%/可配置余额/set category 多类别原子性与 off·reset/超额只能减/使用率(含分摊)/预警阈值与未超标不渲染/顶栏与 budget 顺序/归一化与撤销/配置弹窗实时预览与单命令回灌 + 静默开关(nowarn 只关警告不改口径)" },
  { file:"test11.mjs", expect:70,  what:"v0.0.15 周期设置: config set period|periodstart|periodend 三种写法与边界(不含今天/1 天/>366 天/非法日期)/旧写法兼容/「配置周期」弹窗天数自动同步与校验不落库/补全/归一化放宽到 366/README 同步" },
  { file:"test12.mjs", expect:65,  what:"v0.0.15 经常性支出 recur: 持续×频率(日/周/周期/月)/月末夹取不漂移/分摊与回落/500 笔上限/一次撤销/统计口径/持久化/「记一笔」第三选项卡预览与回灌命令" },
  { file:"test13.mjs", expect:50,  what:"持久化容量: localStorage 写满(QuotaExceededError)时 .json 仍全量落盘/内容取自内存 state(非复制)/每次全量非增量/关闭自动写盘的真实风险/最大可记账条数换算" },
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
