// 变异测试(§4.3): 证明 v0.0.6 新增的分摊成本护栏真的抓得住缺陷。
//   用法: node tests/mutate-amort.mjs        (只读 index.html, 变异体写到系统临时目录)
// 每个变异体只改一处("恰好命中一次"), 然后跑对应套件, 期望它变红。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HTML_PATH, REPO_ROOT } from "./env.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(HTML_PATH, "utf8");
/* 仓库里的 index.html 在本机工作区是 CRLF(仓库内仍存 LF), 变异模式写成 LF 后要按实际行尾归一,
   否则多行模式"命中 0 次" —— 那是变异脚本自己坏了, 不是护栏通过。 */
const EOL = src.includes("\r\n") ? "\r\n" : "\n";
const nl = (s)=> s.split("\n").join(EOL);

/* 变异体: [名字, 套件, 还原的缺陷, 旧写法→坏写法] */
const MUTANTS = [
  ["m_amort_dispatch", "test4.mjs", "抹掉 dispatch 里的 amort 分支(清单漂移 F2)",
   ['case "amort":    doAmort(tokens); break;\n', ""]],
  ["m_amort_invest", "test.mjs", "投资按『每天』算而不是按总价(投资被分摊, 少算 N 倍)",
   ["const inv = investOf(total);\n  return { id:state.seq, amount:daily,",
    "const inv = investOf(daily);\n  return { id:state.seq, amount:daily,"]],
  ["m_amort_days", "test.mjs", "天数写成月时按『月数』当『天数』(12月 只摊 12 天)",
   ["const days = Math.round(months * AMORT_DAYS_UNIT);",
    "const days = Math.round(months);"]],
  ["m_amort_bounds", "test.mjs", "放宽天数上限(越界天数不再被拒)",
   ["const AMORT_MIN_DAYS = 2, AMORT_MAX_DAYS = 3650;",
    "const AMORT_MIN_DAYS = 2, AMORT_MAX_DAYS = 99999999;"]],
  ["m_amort_tab", "test5.mjs", "setModalTab 切换时不换面板(选项卡点了没反应)",
   ['if(panel) panel.classList.remove("hide");\n  if(other) other.classList.add("hide");',
    'if(panel) panel.classList.add("hide");\n  if(other) other.classList.add("hide");']],
  ["m_amort_total", "test.mjs", "归一化时丢掉摊销总价(旧备份导入后总价/应投失真)",
   ["const total = (isFinite(totalRaw) && totalRaw>0) ? r2(totalRaw) : (days>1 ? r2(amount*days) : amount);",
    "const total = (days>1 ? r2(amount) : amount);"]],
  /* 下面两组还原的是一整类"按天窗口"缺陷 —— 分摊成本除记账当天外, 在每日预算/周期预算/
     消费列表/总结里全部消失(即本次修复前的真实缺陷)。两组要分别打中"金额"和"行筛选":
     只改金额的话列表里连行都看不到, 只改筛选的话列表里行在但金额不对。 */
  ["m_amort_window_sum", "test.mjs", "分摊只按记账当天求和(其余天数的钱不计入消费)",
   ["  const n = recDaysInRange(r, start, end);\n  return n > 0 ? r2(n * (Number(r.amount)||0)) : 0;",
    "  const w = recWindow(r);\n  const hit = (w.start >= start && w.start <= end);\n  return hit ? r2(Number(r.amount)||0) : 0;"]],
  ["m_amort_window_rows", "test.mjs", "只按 r.date 筛选窗口(窗口内其余天查不到这笔分摊)",
   ["function recInWindow(r, start, end){ return recDaysInRange(r, start, end) > 0; }",
    "function recInWindow(r, start, end){ return r.date >= start && r.date <= end; }"]],
  /* 这一组还原"起始日期只精确到月"的老行为: 提交时把日期吸到该月 1 号。
     护栏是 M2.68/70b/70d —— 日期非法必须被拦下、精确到日的日期必须原样落库。 */
  ["m_amort_day_precision", "test5.mjs", "弹窗起始日期吸到每月 1 号(丢失用户选的日)",
   ['  const picked = amortPickDate(document.getElementById("fa_date").value);\n  if(!picked){ alertModal("起始日期需为 YYYY-MM-DD 的合法日期（或留空 = 今天）"); return; }',
    '  const picked = { date: (document.getElementById("fa_date").value||todayYMD()).slice(0,7)+"-01", blank:false };']],
  /* v0.09-rev.1 · H5: 双通道对称 + 弹窗 edit 分支 —— 把缺陷改回去必须让 test6 变红 */
  ["m_payfull_cmd", "test6.mjs", "抹掉 doPay 的 full 分支(全额投资又只剩鼠标)",
   ['  if((tokens[0]||"").toLowerCase()==="full"){ doPayFull(tokens.slice(1)); return; }\n', ""]],
  ["m_config_btn", "test6.mjs", "拿掉工具栏 config 按钮(config 又只剩命令行)",
   ['  <button data-cmd="config">当前配置</button>\n', ""]],
  ["m_invest_button", "test6.mjs", "全额投资按钮绕过命令直调 doInvestFull(通道再次不对称)",
   ['  if(ready) btnFull.addEventListener("click", ()=>runCommand("pay full "+(m?"mm":"idx")));',
    '  if(ready) btnFull.addEventListener("click", ()=>doInvestFull(kind));']],
  ["m_edit_branch", "test6.mjs", "openEdit 不回 edit 模式(弹窗 edit 分支再次成为死代码)",
   ['  modalMode="edit"; modalId=r.id;\n  setModalTabsVisible(false);',
    '  modalMode="add"; modalId=null;']],
  ["m_edit_submit", "test6.mjs", "编辑提交拼成 add 命令(编辑变成新建一条)",
   ['  const cmd = modalMode==="edit"', '  const cmd = false']],
  ["m_edit_tab_lock", "test6.mjs", "编辑模式仍可切到分摊选项卡(编辑旧记录却新建 amort)",
   ['  modalTab = (tab==="amort" && modalMode!=="edit") ? "amort" : "add";',
    '  modalTab = (tab==="amort") ? "amort" : "add";']],
  /* v0.0.9 · H4: 唯一提交点 —— 拆掉"出口提交 / 落盘 / 刷新"的任一半边都必须变红 */
  ["m_commit_exit", "test2.mjs", "去掉 runCommand 出口的 commitIfDirty()(命令改了数据却不提交)",
   ['    commitIfDirty();     // 唯一出口: 数据确实变了才 落盘 + 刷新(H4)\n', ""]],
  ["m_commit_refresh", "test2.mjs", "commit() 只落盘不 refreshAll()(界面停在旧数字)",
   ['  const ok = save();     // P2 B-18: commit 感知持久化成败(save 内部负责提示/留痕)\n  refreshAll();\n  pendingCommit = false;\n  return ok;',
    '  const ok = save();     // P2 B-18: commit 感知持久化成败(save 内部负责提示/留痕)\n  pendingCommit = false;\n  return ok;']],
  ["m_commit_save", "test2.mjs", "commit() 只 refreshAll() 不 save()(刷新后数据丢失)",
   ['  const ok = save();     // P2 B-18: commit 感知持久化成败(save 内部负责提示/留痕)\n  refreshAll();\n  pendingCommit = false;\n  return ok;',
    '  const ok = true;\n  refreshAll();\n  pendingCommit = false;\n  return ok;']],
  ["m_investfull_commit", "test6.mjs", "doInvestFull 不自提交且执行体内提前 commit(程序化入口改了不落盘)",
   ['  scrollBottom();\n  return true;\n}\n/* 程序化入口(测试/外部脚本): 自带一次 mutate + 统一提交; 界面按钮统一走 pay full 命令。\n   命令路径(pay full)由 runCommand 出口的 commitIfDirty() 提交, 这里只兜住非命令调用,\n   避免"执行体"自己 commit 造成 mutate 重入 / 多次落盘。 */\nfunction doInvestFull(kind){ const r = mutate(()=>investFullRun(kind)); commitIfDirty(); return r; }',
    '  commitIfDirty();\n  scrollBottom();\n  return true;\n}\n/* 程序化入口(测试/外部脚本): 自带一次 mutate; 界面按钮统一走 pay full 命令 */\nfunction doInvestFull(kind){ return mutate(()=>investFullRun(kind)); }']],
  /* v0.0.10 · chart 图表总结: 新增护栏必须能被"把缺陷改回去"证明有效(§7.4) */
  ["m_chart_dispatch", "test7.mjs", "抹掉 dispatch 的 chart 分支(命令又只剩登记表)",
   ['    case "chart":    doChart(tokens); break;\n', ""]],
  ["m_chart_both", "test7.mjs", "both 退化成只画柱状图(饼图选项失效)",
   ['  if(type==="pie" || type==="both"){', '  if(type==="pie" && type==="both"){']],
  ["m_chart_bucket_window", "test7.mjs", "柱桶金额又按 r.date 求和(分摊成本除记账当天全漏, F13)",
   ["      const cw = collectWindow(s, e, cat);",
    "      const cw = { total: r2(state.records.filter(r=>r.date>=s && r.date<=e && (!cat||r.category===cat)).reduce((a,r)=>a+(Number(r.amount)||0),0)) };"]],
  ["m_chart_pie_count", "test7.mjs", "饼图占比按笔数而不是按金额(240 元与 60 元同宽)",
   ["      const pct = amt/win.total*100;", "      const pct = 100/win.cats.length;"]],
  /* v0.0.10 同版迭代 · 四个按钮合并成 report：新增护栏同样要能被"改回去"证明有效 */
  ["m_report_summary", "test7.mjs", "合并入口又丢掉总结报告(只剩图表)",
   ['  printSummaryReport(win, label, {isDay, catFilter:p.cat, noTitle:true, compact:true});\n', ""]],
  ["m_report_both", "test7.mjs", "合并入口退化成只画柱状图(要求同时出两图)",
   ['  renderChartBody(win, name, isDay, p.cat, "both", {hideMeta:true, skipCore:true});',
    '  renderChartBody(win, name, isDay, p.cat, "bar", {hideMeta:true, skipCore:true});']],
  ["m_report_date_modal", "test7.mjs", "手动输日期弹窗又拼回 list 命令(选了总结却跳去消费列表)",
   ['  const base = target==="report" ? "report" : "list";', '  const base = "list";']],
  ["m_report_date_window", "test7.mjs", "填了具体日期却按整月统计(指定日期窗口失效)",
   ['    out.kind = /^\\d{4}-\\d{1,2}-\\d{1,2}$/.test(out.ref) ? "date" : "month";',
    '    out.kind = "month";']],
  ["m_report_dup", "test7.mjs", "合并入口又把旧版类别行/迷你条打一遍(与饼图重复)",
   ['  printSummaryReport(win, label, {isDay, catFilter:p.cat, noTitle:true, compact:true});',
    '  printSummaryReport(win, label, {isDay, catFilter:p.cat, noTitle:true});']],
  /* v0.0.11 · 统一视觉: 新增护栏(§8 V1–V12)同样要能被"改回去"证明不是摆设 */
  ["m_visual_hbar_cap", "test3.mjs", "比例条超额时不再截断到 100%(填充溢出容器)",
   ['  const usedPct = Math.min(100, r*100);', '  const usedPct = r*100;']],
  ["m_visual_rest", "test3.mjs", "进度条剩余段与已用段同色(分色退化成一条纯色)",
   ['  rest.style.background = withAlpha(col, 0.16);', '  rest.style.background = col;']],
  ["m_visual_marker", "test3.mjs", "100% 刻度线钉死在最左边(越线位置失去意义)",
   ['  mk.style.left = (100/Math.max(r,1)).toFixed(2)+"%";', '  mk.style.left = "0";']],
  ["m_chart_pie_gap", "test7.mjs", "饼图切片之间又挖 0.5% 透明缺口(饼图不闭合/少一块)",
   ['      segs.push(col+" "+from.toFixed(2)+"% "+to.toFixed(2)+"%");',
    '      segs.push(col+" "+from.toFixed(2)+"% "+(to-0.5).toFixed(2)+"%");\n      segs.push("transparent "+(to-0.5).toFixed(2)+"% "+to.toFixed(2)+"%");']],
  ["m_visual_head", "test3.mjs", "章节标题丢掉 chart-h 类(标题层级又回到正文大小)",
   ['  el.className = "l chart-h";', '  el.className = "l";']],
  /* v0.0.12 同版迭代 · 启动预热重构: 地点护栏随模型整体更新(旧的异步回填组已无锚点) */
  ["m_geo_normalize", "test8.mjs", "归一化又丢掉 place(旧备份导入后地点全没了)",
   ["category:cat, note, place, date, created,", "category:cat, note, date, created,"]],
  ["m_geo_dispatch", "test8.mjs", "抹掉 dispatch 的 place 分支(手动补填只剩登记表)",
   ['    case "place":    doPlace(tokens); break;\n', ""]],
  ["m_geo_sync", "test8.mjs", "记账不再同步取预热缓存(地点又晚于落盘)",
   ["  else rec.place = normalizePlace(currentGeoPlace());   // 启动预热缓存: 同步写入, 随命令一次落盘\n", ""]],
  ["m_geo_prime_boot", "test8.mjs", "打开时不预热(左上角永不显示区名, 首笔没地点)",
   ["  primeGeoLocation();         // 每次打开只申请一次定位(结果只更新缓存 + 左上角, 不碰账本)\n", ""]],
  ["m_geo_prime_add", "test8.mjs", "每笔记账又发起一次定位(违背每次打开只申请一次)",
   ["  // 定位在 boot 时已预热完毕, 记账只同步取缓存; 此处不再发起任何异步请求\n", "  primeGeoLocation(true);\n"]],
  ["m_geo_amort", "test8.mjs", "分摊成本也自动带缓存地点(违反仅 add 自动)",
   ["  const end = addDaysYMD(date, rec.amortDays-1);\n",
    "  if(!rec.place) rec.place = normalizePlace(currentGeoPlace());\n  const end = addDaysYMD(date, rec.amortDays-1);\n"]],
  ["m_geo_coords", "test8.mjs", "缓存里写坐标(违反只存行政区地名)",
   ["JSON.stringify({place:geoCache.place, district:geoCache.district})",
    "JSON.stringify({place:geoCache.place, district:geoCache.district, latitude:22.5431, longitude:114.0579})"]],
  ["m_geo_manual", "test8.mjs", "全手动模式启动时仍发起定位",
   ["  if(state.settings.geoMode!==\"auto\"){\n    clearGeoCache(); setGeoStatus(\"off\",\"全手动\"); return;\n  }\n",
    "  if(state.settings.geoMode!==\"auto\"){\n    clearGeoCache(); setGeoStatus(\"off\",\"全手动\");\n  }\n"]],
  ["m_geo_fetch", "test8.mjs", "绕过官方 TMap.service.Geocoder 手写外部请求",
   ["    return new TMap.service.Geocoder().getAddress({ location: new TMap.LatLng(gcj.lat, gcj.lng) });\n",
    '    return Promise.reject(new Error("bypass-geocoder"));\n']],
  ["m_geo_key", "test8.mjs", "SDK URL 里预置一个可用 Key(前端硬编码密钥)",
   ['    s.src = GEO_SDK_BASE + "&key=" + encodeURIComponent(key);\n',
    '    s.src = GEO_SDK_BASE + "&key=ABCDEFGHIJKLMNOPQRSTUVWXYZ12345";\n']],
  ["m_geo_toolbar", "test8.mjs", "主页模式切换绕过命令直接改 state(双通道又不一致)",
   ["        runCommand(gc);\n", "        state.settings.geoMode = b.dataset.geo;\n"]],
  ["m_geo_badge_canvas", "test8.mjs", "左上角图标换回 Emoji(不用 Canvas 手绘)",
   ["    geoBadgeCanvasEl = document.createElement(\"canvas\");\n",
    "    geoBadgeCanvasEl = document.createElement(\"span\"); geoBadgeCanvasEl.textContent=\"📍\";\n"]],
  ["m_geo_badge_text", "test8.mjs", "左上角显示完整省市区而不是区名",
   ["setGeoStatus(\"ok\", geoCache.district || districtOf(geoCache.place));",
    "setGeoStatus(\"ok\", geoCache.place);"]],
  /* v0.0.12 同版 · P0 修复: 每个修复都要能被"把缺陷改回去"证明护栏有效 */
  ["m_p0_note_escape", "test8.mjs", "弹窗回灌不再转义 #/@ 备注(地点与备注互换、备注被吞)",
   [String.raw`  return quote((v[0]==="#"||v[0]==="@") ? "\\"+v : v);`, "  return quote(v);"]],
  ["m_p0_unescape", "test8.mjs", "splitRecordArgs 不还原转义备注(备注里留下反斜杠)",
   ["  return { tokens:b.tokens.map(unescapeArg), date:a.date, place:b.place };",
    "  return { tokens:b.tokens, date:a.date, place:b.place };"]],
  ["m_p0_date_last", "test8.mjs", "findDateToken 又取最后一个 @token(第二个 @备注吞掉日期)",
   ['    if(tk[0]==="@" && date===null){ date = tk.slice(1); }',
    '    if(tk[0]==="@"){ date = tk.slice(1); }']],
  ["m_geo_stale_guard", "test8.mjs", "预热结果回来不复查模式/Key(切全手动后缓存仍被写入)",
   ["      if(!state || state.settings.geoMode!==\"auto\" || !state.settings.geoKey) return;\n", ""]],
  ["m_p0_ratio", "test4.mjs", "config set ratio 又按投资比例解释(0.85 → 消费 99.15%)",
   ['    const asInvest = (what==="invest"||what==="investment");',
    '    const asInvest = (what!=="consume");']],
  ["m_p0_amount", "test4.mjs", "parseAmount 去掉 r2 后 >0 校验(0.001 又静默变 ¥0)",
   ["  return (isFinite(v) && v>0) ? v : null;", "  return isFinite(v) ? v : null;"]],
  ["m_p0_amort_preview", "test5.mjs", "分摊预览应投又按逐日累计算(预览 ≠ 实际记账)",
   ["  const inv = investOf(recTotal);", "  const inv = investOf(accrued);"]],
  /* v0.0.12 同版 · 浮层互斥: 把"打开新浮层不关旧的"改回去, CH10 必须变红 */
  ["m_dd_exclusive", "test7.mjs", "toggleDd 打开前不关其它浮层(多个下拉又叠在一起)",
   ["  if(willOpen) closeAllOverlays(id);   // 打开前先关掉其它所有浮层(含弹窗), 保持全局互斥\n", ""]],
  ["m_modal_exclusive", "test7.mjs", "openOverlay 不关其它浮层(弹窗/下拉又同时打开)",
   ["function openOverlay(id){\n  closeAllOverlays(id);\n", "function openOverlay(id){\n"]],
  /* v0.0.12 同版 · P1 修复: 每条护栏都要能被"把缺陷改回去"证明不是摆设 */
  ["m_p1_key_normalize", "test8.mjs", "config 写 Key 又绕过 normalizeGeoKey(占位符/提示文案写进 state)",
   ['    const key = clearing ? "" : normalizeGeoKey(raw);',
    '    const key = clearing ? "" : raw.slice(0,128);']],
  ["m_p1_key_quote", "test8.mjs", "弹窗回灌不 quote(含空格/引号的 Key 被 tokenize 吞掉)",
   ['  runCommand("config set geokey "+quote(v));', '  runCommand("config set geokey "+v);']],
  ["m_p1_echo_mask", "test8.mjs", "Key 打码只吃第一个 token(尾部明文泄漏)",
   [String.raw`  const km = /^(config\s+set\s+(?:geokey|mapkey|key)\s+)(.+)$/i.exec(raw);`,
    String.raw`  const km = /^(config\s+set\s+(?:geokey|mapkey|key)\s+)(\S+)/i.exec(raw);`]],
  ["m_p1_sdk_key_binding", "test8.mjs", "SDK 缓存不绑定 Key(改 Key 仍复用旧 SDK)",
   ['  if(tmapLoadPromise && tmapLoadedKey===key) return tmapLoadPromise;',
    '  if(tmapLoadPromise) return tmapLoadPromise;']],
  ["m_p1_sdk_fail_reset", "test8.mjs", "SDK 加载失败不清缓存(整个会话不再重试)",
   ['      if(!ok) resetTMapSDK();', '      if(!ok){}']],
  ["m_p1_sdk_timeout", "test8.mjs", "SDK script 没有超时(请求挂住永不结算)",
   ['    tmapTimer = setTimeout(()=>finish(false), GEO_SDK_TIMEOUT_MS);', '    tmapTimer = null;']],
  ["m_p1_geo_diag", "test8.mjs", "定位失败又静默吞掉(用户无法区分权限/Key/网络)",
   ['      const reason = geoWarnOnce(err);', '      const reason = "定位失败";']],
  ["m_p1_cat_source", "test8.mjs", "datalist 又只看 PREDEFINED(自定义类别/导入备份丢失)",
   ['  for(const c of knownCategories()){', '  for(const c of PREDEFINED.keys()){']],
  ["m_p1_cat_side_effect", "test8.mjs", "validateCategory 又往全局 PREDEFINED 写颜色(命令失败留副作用)",
   ['  return c;\n}\nfunction doAdd(tokens){',
    '  if(!PREDEFINED.has(c)) PREDEFINED.set(c, COLOR.catFallback);\n  return c;\n}\nfunction doAdd(tokens){']],
  ["m_p1_cat_completion", "test8.mjs", "add 类别补全又只给默认类别(自定义类别补不出来)",
   ['    if(arg===1) return knownCategories();', '    if(arg===1) return [...PREDEFINED.keys()];']],
  ["m_p1_place_split", "test8.mjs", "place 又不拆参数(@日期/#地点 混进地名)",
   ['  const args = splitRecordArgs(tokens.slice(1));',
    '  const args = {tokens:tokens.slice(1), place:null};']],
  ["m_p1_place_clear", "test8.mjs", "清除关键字又忽略大小写(地名 Clear/Off 被误清)",
   ['                  (args.place==null && only!==null && CLEAR_TOKENS.includes(only));',
    '                  (args.place==null && only!==null && CLEAR_TOKENS.includes(String(only).toLowerCase()));']],
  ["m_p1_place_quote", "test8.mjs", "弹窗地名又不转义首字符 @/#(被参数解析吞掉)",
   ['  const arg = (p==="-"||p==="off"||p==="清除") ? p : quoteNote(p);',
    '  const arg = (p==="-"||p==="off"||p==="清除") ? p : quote(p);']],
  ["m_p1_custom_palette", "test3.mjs", "自定义类别又共用兜底色(饼图/图例相邻同色)",
   ['function catColor(cat){ return PREDEFINED.get(cat) || customCatColor(cat); }',
    'function catColor(cat){ return PREDEFINED.get(cat) || COLOR.catFallback; }']],
  /* v0.0.12 同版 · P2 修复: 每条护栏都要能被"把缺陷改回去"证明不是摆设 */
  ["m_p2_import_hint", "test.mjs", "重复导入又提示「可 undo」(引诱用户回退更早的操作)",
   ['  const before = snapshotState();     // P2 B-16: 用于判断这次导入是否真的产生了变化',
    '  const before = null;']],
  ["m_p2_budget_token", "test4.mjs", "config set budget 的非法第四 token 又被静默放过(改当期变成改全局)",
   ['    if(tokens.length>4 || (tokens[3] && !onlyNow)){', '    if(false){']],
  ["m_p2_save_diag", "test.mjs", "localStorage 写失败又只剩一次终端提示, 控制台不留痕",
   ['    try{ console.warn("[save] localStorage 写入失败: "+(e&&e.message||e)); }catch(_e){}',
    '    try{ }catch(_e){}']],
  ["m_p2_autosave_fallback", "test.mjs", "自动写盘失败又不再回落 autosaveOn(UI 一直显示「开」)",
   ['    /* P2 B-18: 自动写盘失败不再被吞 —— 留痕、回落 autosaveOn、UI 同步; localStorage 仍兜底 */\n    autosaveOn = false;',
    '    /* P2 B-18: 自动写盘失败不再被吞 —— 留痕、回落 autosaveOn、UI 同步; localStorage 仍兜底 */']],
  ["m_p2_md_escape", "test.mjs", "导出 md 又不转义用户输入(**、#、| 破坏报告结构)",
   ['  return String(s==null?"":s).replace(/([\\\\`*_\\[\\]#<>|~])/g, "\\\\$1");',
    '  return String(s==null?"":s);']],
  ["m_p2_created_field", "test.mjs", "导出报告逐笔行又丢 created 字段",
   ['          +(r.created?"  创建:"+r.created:""));   // P2 B-19: 补 created 字段, 用户输入走 esc()',
    '          +(r.created?"":""));   // P2 B-19: 补 created 字段, 用户输入走 esc()']],
  ["m_p2_config_usage", "test4.mjs", "configUsage 又不暴露 consume/ratio/share 子名语义",
   ['  line([{t:"      config set consume|ratio|share <消费占比>   如 config set ratio 0.85 (与 set ratio 同解释)", c:COLOR.yellow}]);', '']],
  ["m_p2_config_complete", "test4.mjs", "config 子名又没有 Tab 补全候选",
   ['    if(arg===1) return ["budget","invest","consume","ratio","share","geo","geokey"];',
    '    if(arg===1) return [];']],
];

const tmp = os.tmpdir();
let bad = 0;
for(const [name, suite, what, [from0, to0]] of MUTANTS){
  const from = nl(from0), to = nl(to0);
  const hits = src.split(from).length - 1;
  if(hits !== 1){                       // 命中 0 次 = 源已漂移, 变异无效, 不能当通过
    console.log(`✗ ${name.padEnd(18)} 变异点命中 ${hits} 次(应为 1) → 变异无效`);
    bad++; continue;
  }
  const file = path.join(tmp, name + ".html");
  fs.writeFileSync(file, src.split(from).join(to));
  const r = spawnSync(process.execPath, [path.join(DIR, suite)], {
    encoding:"utf8", cwd: REPO_ROOT, env: { ...process.env, BT_HTML: file },
  });
  const out = (r.stdout||"") + (r.stderr||"");
  const m = out.match(/PASS\s+(\d+)\s*\/\s*FAIL\s+(\d+)/);
  const fails = m ? Number(m[2]) : NaN;
  const caught = r.status !== 0 && fails > 0;
  console.log(`${caught?"✓":"✗"} ${name.padEnd(18)} ${suite.padEnd(10)} FAIL ${isNaN(fails)?"?":fails}  ${what}`);
  if(!caught){
    console.log("    ↑ 变异未被抓住 —— 护栏可能是摆设(检查变异点是否打在该护栏真正断言的东西上)");
    bad++;
  }
  fs.unlinkSync(file);
}
console.log("-".repeat(78));
console.log(bad ? `有 ${bad} 个变异未被抓住 / 无效` : `全部 ${MUTANTS.length} 个变异都被抓住了`);
process.exit(bad ? 1 : 0);
