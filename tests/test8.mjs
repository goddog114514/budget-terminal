// v0.0.12 地点专项护栏: 字段归一化 / 命令与弹窗双通道 / 启动预热一次 / 记账同步写入 / 合规定位 / 左上角 badge。
//   node tests/test8.mjs
// 通过 loadApp({seedStorage, navigator, TMap}) 注入已配置的 Key 与定位/SDK 桩, 全程不发网络请求。
import fs from "node:fs";
import { loadApp } from "./app.mjs";
import { HTML_PATH, README_PATH } from "./env.mjs";

const html = fs.readFileSync(HTML_PATH, "utf8");
const readme = fs.readFileSync(README_PATH, "utf8");
let pass = 0; const fails = [];
function ok(name, cond, detail){ if(cond) pass++; else fails.push(name + (detail!==undefined? ("  >> "+detail) : "")); }
function eq(name, a, b){ ok(name, JSON.stringify(a)===JSON.stringify(b), "got "+JSON.stringify(a)+" want "+JSON.stringify(b)); }

const tick = (ms=0)=> new Promise(r=>setTimeout(r,ms));
const DEFAULT_ADDR = { province:"广东省", city:"深圳市", district:"南山区" };

/* 浏览器定位 + 腾讯地图 GL JS 的最小桩。result 是 getAddress 的完整返回值;
   delay=true 时用宏任务返回, 便于验证"预热尚未完成时记账不事后回填"。 */
function mockGeo(opts={}){
  const calls = { locate:0, address:[], denied:0 };
  const nav = {
    userAgent:"node",
    geolocation:{ getCurrentPosition(success, fail){
      calls.locate++;
      if(opts.denied){ calls.denied++; fail({code:1,message:"denied"}); return; }
      success({ coords:{ latitude: opts.lat ?? 22.5431, longitude: opts.lng ?? 114.0579 } });
    }}
  };
  const TMap = {
    LatLng: class { constructor(lat,lng){ this.lat=lat; this.lng=lng; } },
    service:{ Geocoder: class {
      getAddress(params){
        calls.address.push(params && params.location);
        if(opts.reject) return Promise.reject(new Error("network"));
        /* results[] 按调用序号给不同地名: 用于验证"迟到结果不能写进 id 复用的另一笔" */
        const res = opts.results ? opts.results[Math.min(calls.address.length-1, opts.results.length-1)]
                  : (opts.result !== undefined ? opts.result : { result:{ address_component:DEFAULT_ADDR } });
        return opts.delay ? new Promise(r=>setTimeout(()=>r(res),5)) : Promise.resolve(res);
      }
    }}
  };
  return { nav, TMap, calls };
}
/* 用 seedStorage 把 Key / 模式在 boot 之前就注入, 这样启动预热能真正跑起来
   (与用户真实使用一致: Key 存在 localStorage 里, 打开页面即自动定位一次)。 */
function geoApp(opts={}){
  const m = mockGeo(opts);
  const seed = {
    budget_term_v1: JSON.stringify({
      settings:{ geoMode: opts.manual ? "manual" : "auto",
                 geoKey: opts.noKey ? "" : "TEST-KEY-1234" },
      seq:0, records:[]
    })
  };
  if(opts.seedGeoCache) seed.budget_term_geo_v1 = JSON.stringify(opts.seedGeoCache);
  const S = loadApp({ seedStorage:seed, navigator:m.nav, TMap:m.TMap });
  S.boot(); S.clearTerm();
  return { S, m, seed };
}

/* ---------- 1. 数据字段与归一化 ---------- */
{
  const S = loadApp(); S.boot(); S.clearTerm();
  ok("GEO.1 默认地点模式 auto", S.state.settings.geoMode==="auto", S.state.settings.geoMode);
  ok("GEO.2 默认没有地图 Key", S.state.settings.geoKey==="", S.state.settings.geoKey);
  S.runCommand("add 50 餐饮 午餐");
  const r = S.state.records[0];
  ok("GEO.3 新记录 place 默认为空串(不填则空着)", r.place==="", JSON.stringify(r.place));
  ok("GEO.4 记录确实带 place 字段", "place" in r);
  ok("GEO.5 无定位能力时记账不抛错且无定位输出",
     S.state.records.length===1 && !/已自动填充/.test(S.lines().join("\n")), S.lines().join("|"));
  const n1 = S.normalizeRecords([{amount:10,date:"2027-08-30",place:"广东省深圳市南山区"}]).records[0];
  ok("GEO.6 normalizeRecords 保留 place", n1.place==="广东省深圳市南山区", n1.place);
  const n2 = S.normalizeRecords([{amount:10,date:"2027-08-30"}]).records[0];
  ok("GEO.7 旧备份缺 place 回落空串(零迁移)", n2.place==="", JSON.stringify(n2.place));
  ok("GEO.8 地名控制字符被清洗", S.normalizePlace("  北京市\u0001海淀区  ")==="北京市 海淀区", S.normalizePlace("  北京市\u0001海淀区  "));
  ok("GEO.9 外部地名超长被截断", S.normalizePlace("X".repeat(200)).length===60);
  ok("GEO.10 normalizeSettings 非法模式回落默认", S.normalizeSettings({geoMode:"xxx"}).geoMode==="auto");
  ok("GEO.11 normalizeSettings 把占位符 Key 清空", S.normalizeSettings({geoKey:S.GEO_KEY_PLACEHOLDER}).geoKey==="");
  S.state.records[0].place = "北京市海淀区";
  const text = S.serializeState();
  const S2 = loadApp(); S2.boot(); S2.restoreFromText(text);
  ok("GEO.12 备份导出→导入往返不丢地点", S2.state.records[0].place==="北京市海淀区", JSON.stringify(S2.state.records[0].place));
}

/* ---------- 2. 命令 / help / 补全 ---------- */
{
  const S = loadApp(); S.boot(); S.clearTerm();
  ok("GEO.13 登记表含 place 主名与 where 别名", S.COMMAND_NAMES.includes("place") && S.CMD_ALIAS.where==="place");
  ok("GEO.14 dispatch 有 place 分支", /case "place":\s+doPlace\(tokens\); break;/.test(html));
  S.runCommand("help");
  const h = S.lines().join("\n");
  ok("GEO.15 help 含 place 用法", /place <id>/.test(h));
  ok("GEO.16 help 含 config set geo", /config set geo auto\|manual/.test(h));
  ok("GEO.17 help 含 config set geokey", /config set geokey/.test(h));
  ok("GEO.18 README 命令表含 place", /`place`/.test(readme));
  ok("GEO.19 README 含 config set geo", /`config set geo/.test(readme));
  S.clearTerm();
  S.runCommand("place 1 广东省深圳市南山区");
  ok("GEO.20 账本为空时 place 给未找到提示", /未找到/.test(S.lines().join("\n")));
  S.runCommand("add 50 餐饮 午餐");
  S.runCommand("place 1 广东省深圳市南山区");
  ok("GEO.21 place <id> <地点> 生效", S.state.records[0].place==="广东省深圳市南山区", JSON.stringify(S.state.records[0].place));
  S.runCommand("place 1 -");
  ok("GEO.22 place <id> - 清除地点", S.state.records[0].place==="");
  S.clearTerm(); S.runCommand("place 99 某地");
  ok("GEO.23 不存在的 id 给提示", /未找到/.test(S.lines().join("\n")));
  S.clearTerm(); S.runCommand("place 1");
  ok("GEO.24 缺地点给用法提示", /用法: place/.test(S.lines().join("\n")));
  S.runCommand('add 50 餐饮 #"北京市 海淀区"');
  ok("GEO.25 add 的 #地点 生效(含空格)", S.state.records[1].place==="北京市 海淀区", JSON.stringify(S.state.records[1].place));
  S.runCommand('add #"北京市 海淀区" 60 交通 @2027-08-18 打车');
  ok("GEO.26 #地点 与 @日期 都位置无关",
     S.state.records[2].place==="北京市 海淀区" && S.state.records[2].date==="2027-08-18" && S.state.records[2].note==="打车",
     JSON.stringify([S.state.records[2].place,S.state.records[2].date,S.state.records[2].note]));
  S.runCommand("update 1 60 交通 #-");
  ok("GEO.27 update #- 清除地点", S.state.records[0].place==="");
  S.runCommand("update 1 60 交通 #广州市天河区");
  ok("GEO.28 update #地点 修改地点", S.state.records[0].place==="广州市天河区");
  S.runCommand("where 1 上海市浦东新区");
  ok("GEO.29 别名 where 等价于 place", S.state.records[0].place==="上海市浦东新区");
  ok("GEO.30 place 首槽补记录 id", S.argCandidates("place",1,["place"],"").includes("1"));
  ok("GEO.31 #地点 不占补全语义槽位",
     JSON.stringify(S.argCandidates("add",3,["add","50","#北京市",""],""))===JSON.stringify(S.argCandidates("add",2,["add","50",""],"")));
}

/* ---------- 3. 启动预热一次 + 记账同步写入(不再事后回填) ---------- */
{
  const { S, m } = geoApp();
  eq("GEO.32 打开时只申请一次定位", m.calls.locate, 1);
  await tick();
  eq("GEO.32b 预热得到完整行政区名", S.geoCache.place, "广东省深圳市南山区");
  eq("GEO.32c 左上角只显示区名", S.geoStatus.text, "南山区");
  ok("GEO.32d badge 状态为 ok", S.geoStatus.kind==="ok", S.geoStatus.kind);
  const statusbar = S.__doc.getElementById("statusbar");
  const hasCanvas = (function walk(n){
    for(const c of (n.children||[])){ if(c.tagName==="CANVAS") return true; if(walk(c)) return true; }
    return false;
  })(statusbar);
  ok("GEO.32e 左上角用 Canvas 绘制定位图标(无 Emoji)",
     hasCanvas && !/📍/.test(statusbar.textContent), statusbar.textContent.slice(0,80));
  S.runCommand("add 50 餐饮 午餐");
  ok("GEO.33 记账同步写入地名(无需等待异步)",
     S.state.records[0].place==="广东省深圳市南山区", JSON.stringify(S.state.records[0].place));
  const persisted = JSON.parse(S.__storage.getItem("budget_term_v1"));
  ok("GEO.33b 地名随命令一次落盘", persisted.records[0].place==="广东省深圳市南山区");
  eq("GEO.34 一次记账只压一步撤销", S.undoDepth, 1);
  ok("GEO.35 没有事后回填输出", !/已自动填充/.test(S.lines().join("\n")), S.lines().join("|"));
  S.runCommand("add 30 交通");
  eq("GEO.36 记账不再发起定位(仍只 1 次)", m.calls.locate, 1);
  eq("GEO.36b 逆地理编码也只 1 次", m.calls.address.length, 1);
  const loc = m.calls.address[0];
  ok("GEO.37 传给 SDK 的是 GCJ-02(与 WGS-84 输入不同)",
     !!loc && Math.abs(loc.lat-22.5431)>1e-4 && Math.abs(loc.lng-114.0579)>1e-4 && loc.lat>20 && loc.lat<25 && loc.lng>110 && loc.lng<120,
     JSON.stringify(loc));
  ok("GEO.38 坐标不写进账本/地名缓存",
     !/(latitude|longitude)/.test(JSON.stringify(persisted)) &&
     !/(latitude|longitude)/.test(String(S.__storage.getItem("budget_term_geo_v1"))) &&
     !Object.keys(persisted.records[0]).some(k=>/^(lat|lng|coords|latitude|longitude)$/i.test(k)),
     JSON.stringify(persisted.records[0]));
  ok("GEO.39 记录里没有坐标字段", !("lat" in S.state.records[0]) && !("lng" in S.state.records[0]));
}
{
  const res = { result:{ address_component:{ province:"北京市", city:"北京市", district:"海淀区" } } };
  const { S } = geoApp({ result:res });
  await tick();
  S.runCommand("add 50 餐饮");
  ok("GEO.40 直辖市 province===city 去重", S.state.records[0].place==="北京市海淀区", S.state.records[0].place);
  eq("GEO.40b 左上角显示海淀区", S.geoStatus.text, "海淀区");
}
{
  const res = { result:{ ad_info:{ province:"上海市", city:"上海市", district:"浦东新区" } } };
  const { S } = geoApp({ result:res });
  await tick();
  S.runCommand("add 50 餐饮");
  ok("GEO.41 address_component 缺失时回落 ad_info", S.state.records[0].place==="上海市浦东新区", S.state.records[0].place);
  eq("GEO.41b 左上角显示浦东新区", S.geoStatus.text, "浦东新区");
}
{
  const { S } = geoApp({ result:{ result:{ address_component:{ province:"", city:"", district:"" } } } });
  await tick();
  S.runCommand("add 50 餐饮");
  ok("GEO.42 空地址静默跳过(不阻断记账)", S.state.records.length===1 && S.state.records[0].place==="");
  ok("GEO.42b 空地址时 badge 显示定位失败", S.geoStatus.kind==="failed", S.geoStatus.kind);
}
{
  const { S, m } = geoApp({ denied:true });
  await tick();
  S.runCommand("add 50 餐饮");
  ok("GEO.43 拒绝定位授权静默跳过",
     S.state.records.length===1 && S.state.records[0].place==="" && m.calls.address.length===0 && S.geoStatus.kind==="failed");
}
{
  const { S, m } = geoApp();
  await tick();
  S.runCommand('add 50 餐饮 午餐 #"北京市 海淀区"');
  ok("GEO.44 用户手填优先于预热缓存",
     S.state.records[0].place==="北京市 海淀区" && m.calls.locate===1, JSON.stringify(S.state.records[0].place));
}
{
  const { S, m } = geoApp({ manual:true });
  await tick();
  ok("GEO.45 全手动模式启动即不定位", m.calls.locate===0 && m.calls.address.length===0);
  eq("GEO.45b 全手动 badge 显示", S.geoStatus.text, "全手动");
  S.runCommand("add 50 餐饮");
  ok("GEO.45c 全手动记账地点留空", S.state.records[0].place==="");
}
{
  const { S, m } = geoApp();
  await tick();
  S.runCommand("amort 300 30 会员");
  ok("GEO.46 amort 分摊成本不带自动地点",
     m.calls.address.length===1 && S.state.records[0].place==="", JSON.stringify(S.state.records[0].place));
  ok("GEO.46b 分摊仍可手填地点", (()=>{ S.runCommand('amort 600 30 会员 #"深圳市南山区"'); return S.state.records[1].place==="深圳市南山区"; })());
}
{
  const { S, m } = geoApp({ delay:true });
  S.runCommand("add 50 餐饮");                 // 预热尚未返回
  ok("GEO.47 预热未完成时首笔地点留空", S.state.records[0].place==="", JSON.stringify(S.state.records[0].place));
  await tick(30);
  ok("GEO.47b 迟到结果不回填已落盘的记录(问题根因已消除)",
     S.state.records[0].place==="" && m.calls.address.length===1, JSON.stringify(S.state.records[0].place));
  S.runCommand("add 30 交通");
  ok("GEO.47c 预热完成后下一笔同步带地名", S.state.records[1].place==="广东省深圳市南山区");
}
{
  ok("GEO.48 记账同步读缓存, 异步链路不再碰 state.records",
     /rec\.place = normalizePlace\(currentGeoPlace\(\)\)/.test(html) &&
     !/function startAutoPlace|function applyAutoPlace/.test(html) &&
     !/startAutoPlace\(rec\)/.test(html));
  const amFn = html.slice(html.indexOf("function doAmort("), html.indexOf("function doPay("));
  ok("GEO.49 预热只在 boot / 配置变更 / 点 badge 触发, doAmort 不触发",
     /primeGeoLocation\(\);\s+\/\/ 每次打开只申请一次定位/.test(html) &&
     (html.match(/primeGeoLocation\(true\)/g)||[]).length===3 &&
     !/primeGeoLocation\(/.test(amFn));
}
{
  const { S, m } = geoApp();
  await tick();
  const before = m.calls.locate;
  S.primeGeoLocation(true);                   // 等同点击左上角 badge
  await tick();
  eq("GEO.49b 手动重定位会再申请一次", m.calls.locate, before+1);
}
{
  const { S, m } = geoApp({ seedGeoCache:{place:"北京市海淀区", district:"海淀区"} });
  eq("GEO.49c 跨会话读回缓存, 打开即可显示区名", S.geoStatus.text, "海淀区");
  S.runCommand("add 50 餐饮");                // 不等定位返回
  ok("GEO.49d 缓存让首笔也同步带地名", S.state.records[0].place==="北京市海淀区", JSON.stringify(S.state.records[0].place));
}
{
  const { S, m } = geoApp({ noKey:true });
  await tick();
  eq("GEO.49e 未配 Key 时启动不定位", m.calls.locate, 0);
  eq("GEO.49f badge 提示未配置 Key", S.geoStatus.text, "未配置 Key");
  S.runCommand("config set geokey MY-KEY");
  await tick();
  eq("GEO.49g 填入 Key 后立即补一次定位", m.calls.locate, 1);
  eq("GEO.49h 填 Key 后缓存就绪", S.geoCache.place, "广东省深圳市南山区");
}

/* ---------- 4. 合规 / 安全(源码级) ---------- */
{
  ok("GEO.50 只用腾讯地图 GL JS, 无非合规地图源",
     /map\.qq\.com\/api\/gljs/.test(html) &&
     !/(googleapis\.com|openstreetmap|mapbox|restapi\.amap|api\.map\.baidu|maps\.google)/i.test(html));
  ok("GEO.51 代码含显式 key 占位符", html.includes('GEO_KEY_PLACEHOLDER = "请在腾讯位置服务开放平台申请自己的key并替换此占位符"'));
  const S = loadApp(); S.boot();
  ok("GEO.52 SDK 基址不含 key 参数", !/key=/.test(S.GEO_SDK_BASE), S.GEO_SDK_BASE);
  ok("GEO.53 模板 URL 带的是占位符而非有效 key",
     S.GEO_SDK_URL_TEMPLATE.includes(S.GEO_KEY_PLACEHOLDER) && S.GEO_SDK_URL_TEMPLATE.includes("libraries=service"));
  ok("GEO.54 没有硬编码可用 key", !/key=[A-Z0-9]{20,}/i.test(html));
  ok("GEO.55 逆地理编码走官方 TMap.service.Geocoder", /TMap\.service\.Geocoder\(\)\.getAddress\(/.test(html));
  ok("GEO.56 不手写 fetch / XHR 调位置服务", !/\bfetch\(|XMLHttpRequest/.test(html));
  eq("GEO.57 innerHTML 仍恰好 4 处且都是清空", (html.match(/innerHTML/g)||[]).length, 4);
  ok("GEO.58 外部地名只用 textContent 渲染(Canvas 段走 appendChild)",
     /sp\.textContent = s\.t/.test(html) && /if\(s\.node\)\{ div\.appendChild\(s\.node\)/.test(html) &&
     /geoPlaceSegs\(r\.place/.test(html));
  ok("GEO.59 WGS84→GCJ02 境外不偏移",
     JSON.stringify(S.wgs84ToGcj02(35.6895,139.6917))===JSON.stringify({lat:35.6895,lng:139.6917}));
  const g = S.wgs84ToGcj02(22.5431,114.0579);
  ok("GEO.60 境内坐标偏移在国内合理范围", g && g.lat>22.5 && g.lat<22.6 && g.lng>114.0 && g.lng<114.2, JSON.stringify(g));
  ok("GEO.61 placeFromAddressComponent 拒绝空对象", S.placeFromAddressComponent({})==="" && S.placeFromAddressComponent(null)==="");
  ok("GEO.62 Key 打码不泄露全文", S.maskGeoKey("ABCDEFGHIJKLMN")==="ABC…LMN");
  ok("GEO.62b 定位图标是 Canvas 2D 手绘, 非 Emoji/外部图片",
     /createElement\("canvas"\)/.test(html) && /getContext\("2d"\)/.test(html) &&
     /ctx\.arc\(8,8,5\.25/.test(html) && /ctx\.fillRect\(7,7,2,2\)/.test(html) &&
     /makeGeoIcon\(\)/.test(html) && !/📍/.test(html) && !/geo-ic[^}]*background-image/.test(html));
  ok("GEO.62c Canvas 缺 ctx 时静默降级(离线 DOM stub 不炸)", /if\(!ctx\) return;/.test(html));
  ok("GEO.62d 区名从 address_component.district 直取",
     S.districtFromAddressComponent({province:"广东省",city:"深圳市",district:"南山区"})==="南山区" &&
     S.districtOf("北京市海淀区")==="海淀区");
}

/* ---------- 5. UI 双通道(全部回灌命令) ---------- */
{
  const { S } = geoApp();
  ok("GEO.63 工具栏有「地点 ▾」下拉", /id="geoDd"/.test(html) && /id="btnGeoDd"/.test(html));
  ok("GEO.64 三个 data-geo 菜单项齐全", ["auto","manual","settings"].every(k=>html.includes('data-geo="'+k+'"')));
  ok("GEO.65 GEO_COMMANDS 回灌 config 命令",
     S.GEO_COMMANDS.auto==="config set geo auto" && S.GEO_COMMANDS.manual==="config set geo manual");
  ok("GEO.66 bindToolbar 的 geo 分支真的 runCommand", /runCommand\(gc\);/.test(html));
  S.state.settings.geoMode="manual"; S.refreshGeoUI();
  ok("GEO.67 主页按钮随模式刷新", S.__doc.getElementById("btnGeoDd").textContent.includes("手动"));
  S.state.settings.geoKey="ABCDEFGHIJKLMN"; S.openGeoModal();
  ok("GEO.68 设置弹窗不回显明文 Key",
     S.__doc.getElementById("g_key").value==="" && S.__doc.getElementById("g_key").placeholder.includes("…"));
  ok("GEO.69 设置弹窗给出 SDK 占位符模板",
     S.__doc.getElementById("g_key_hint").textContent.includes(S.GEO_KEY_PLACEHOLDER));
  S.__doc.getElementById("g_key").value="MY-KEY-XYZ";
  S.saveGeoKey();
  ok("GEO.70 保存 Key 回灌 config set geokey", S.state.settings.geoKey==="MY-KEY-XYZ");
  ok("GEO.71 终端不回显明文 Key", !/MY-KEY-XYZ/.test(S.lines().join("\n")), S.lines().join("|"));
  S.setGeoMode("manual");
  ok("GEO.72 弹窗切模式回灌命令并生效", S.state.settings.geoMode==="manual");
  S.__doc.getElementById("g_id").value="1";
  S.__doc.getElementById("g_place").value="广州市天河区";
  S.runCommand("add 50 餐饮");
  S.submitGeoPlace();
  ok("GEO.73 按 id 补填地点回灌 place 命令", S.state.records[0].place==="广州市天河区", JSON.stringify(S.state.records[0].place));
}
{
  const S = loadApp(); S.boot(); S.clearTerm();
  S.openAdd();
  S.__doc.getElementById("f_amt").value="50";
  S.__doc.getElementById("f_cat").value="餐饮";
  S.__doc.getElementById("f_date").value="2027-08-30";
  S.__doc.getElementById("f_note").value="";
  S.__doc.getElementById("f_place").value="北京市 海淀区";
  S.submitModal();
  ok("GEO.74 弹窗新增回灌 #地点", S.state.records[0].place==="北京市 海淀区", JSON.stringify(S.state.records[0].place));
  ok("GEO.75 回灌的命令把 # 包在引号内", S.__doc.getElementById("cmdline").value.includes('"#北京市 海淀区"'), S.__doc.getElementById("cmdline").value);
  S.openEdit(S.state.records[0]);
  ok("GEO.76 编辑弹窗预填地点", S.__doc.getElementById("f_place").value==="北京市 海淀区");
  S.__doc.getElementById("f_place").value="";
  S.submitModal();
  ok("GEO.77 编辑清空地点回灌 #- 并真的清掉",
     S.state.records[0].place==="" && S.__doc.getElementById("cmdline").value.includes("#-"), S.__doc.getElementById("cmdline").value);
  S.openAdd(); S.setModalTab("amort");
  S.__doc.getElementById("fa_total").value="300";
  S.__doc.getElementById("fa_days").value="30";
  S.__doc.getElementById("fa_cat").value="会员";
  S.__doc.getElementById("fa_date").value="";
  S.__doc.getElementById("fa_place").value="深圳市南山区";
  S.submitAmort();
  ok("GEO.78 分摊弹窗手填地点生效", S.state.records[1].place==="深圳市南山区", JSON.stringify(S.state.records[1].place));
  S.clearTerm(); S.runCommand("list");
  ok("GEO.79 列表行显示地名(Canvas 准星 + 文本)", /深圳市南山区/.test(S.lines().join("\n")) && /makeGeoIcon\(\)/.test(html), S.lines().join("|"));
  ok("GEO.80 导出报告用「地点:」文字降级带地名", /地点:深圳市南山区/.test(S.buildReportText(false)));
  ok("GEO.81 地点弹窗样式已覆盖", /#geoWrap\{/.test(html) || /#geoWrap,/.test(html));
  S.state.settings.geoKey = "ABCDEFGHIJKLMN";
  S.clearTerm(); S.runCommand("config");
  const cfg = S.lines().join("\n");
  ok("GEO.82 config 显示模式与打码 Key",
     /地点模式/.test(cfg) && /腾讯地图 Key/.test(cfg) && !/ABCDEFGHIJKLMN/.test(cfg) && /…/.test(cfg), cfg.slice(0,240));
}

/* ---------- 5. P0 修复护栏(v0.0.12 同版): 参数转义 / 异步回填身份与撤销 ---------- */
{
  const S = loadApp(); S.boot(); S.clearTerm();
  const d = S.__doc;
  const fillAdd = (note, place)=>{
    S.openAdd();
    d.getElementById("f_amt").value="50";
    d.getElementById("f_cat").value="餐饮";
    d.getElementById("f_date").value="2027-08-30";
    d.getElementById("f_note").value=note;
    d.getElementById("f_place").value=place;
  };
  fillAdd("#请客", "北京市");
  S.submitModal();
  const r0 = S.state.records[0] || {};
  ok("GEO.83 备注以 # 开头 + 手填地点: 地点与备注各归其位",
     r0.place==="北京市" && r0.note==="#请客", JSON.stringify([r0.place,r0.note]));
  ok("GEO.84 回灌命令对 # 备注做了转义",
     d.getElementById("cmdline").value.includes('"\\\\#请客"'), d.getElementById("cmdline").value);

  fillAdd("@朋友聚餐", "上海市");
  S.submitModal();
  const r1 = S.state.records[1] || {};
  ok("GEO.85 备注以 @ 开头不再被当日期吞掉",
     r1.place==="上海市" && r1.note==="@朋友聚餐" && r1.date==="2027-08-30",
     JSON.stringify([r1.place,r1.note,r1.date]));

  S.openEdit(S.state.records[0]);
  d.getElementById("f_note").value="#请客";
  d.getElementById("f_place").value="";
  S.submitModal();
  const e0 = S.state.records[0] || {};
  ok("GEO.86 编辑态清空地点 + # 备注: 清除生效且备注保留",
     e0.place==="" && e0.note==="#请客" && d.getElementById("cmdline").value.includes("#-"),
     JSON.stringify([e0.place,e0.note]));

  S.runCommand('add 50 交通 "\\#标签" @2027-08-18 "\\@朋友" "#广州市"');
  const r2 = S.state.records[2] || {};
  ok("GEO.87 命令行显式转义可用, 第二个 @token 保留为备注",
     r2.place==="广州市" && r2.note==="#标签 @朋友" && r2.date==="2027-08-18",
     JSON.stringify([r2.place,r2.note,r2.date]));
  S.runCommand("add 50 购物 @2027-08-18 @打车");
  const r3 = S.state.records[S.state.records.length-1] || {};
  ok("GEO.87b 第二个未转义 @token 保留为备注(不再覆盖日期)",
     r3.date==="2027-08-18" && r3.note==="@打车", JSON.stringify([r3.date,r3.note]));

  S.openAdd(); S.setModalTab("amort");
  d.getElementById("fa_total").value="300";
  d.getElementById("fa_days").value="30";
  d.getElementById("fa_cat").value="会员";
  d.getElementById("fa_date").value="";
  d.getElementById("fa_note").value="#团购";
  d.getElementById("fa_place").value="深圳市南山区";
  S.submitAmort();
  const ar = S.state.records[S.state.records.length-1] || {};
  ok("GEO.88 分摊弹窗的 # 备注与 #地点 同链路生效",
     ar.note==="#团购" && ar.place==="深圳市南山区", JSON.stringify([ar.note,ar.place]));
}
/* ---------- 6. 预热模型下的撤销 / 配置变更 / 导入(原异步竞态从根上消除) ---------- */
{
  const { S } = geoApp();
  await tick();
  S.runCommand("add 50 餐饮");
  S.runCommand("undo");
  S.runCommand("add 60 交通");
  ok("GEO.89 undo 后 id 复用不会串地名(异步回填已移除)",
     S.state.records.length===1 && S.state.records[0].category==="交通"
     && S.state.records[0].place==="广东省深圳市南山区", JSON.stringify(S.state.records));
}
{
  const { S } = geoApp();
  await tick();
  S.runCommand("add 50 餐饮");
  const placed = S.state.records[0]?.place;
  S.runCommand("undo");
  const afterUndo = S.state.records.length;
  S.runCommand("redo");
  const restored = S.state.records[0]?.place;
  ok("GEO.90 地名随记录一起进快照(undo 删整笔, redo 恢复地名)",
     placed==="广东省深圳市南山区" && afterUndo===0 && restored===placed,
     JSON.stringify([placed,afterUndo,restored]));
}
{
  const { S } = geoApp();
  await tick();
  S.runCommand("add 50 餐饮");
  eq("GEO.91 一次记账只压一步撤销", S.undoDepth, 1);
  S.runCommand("undo");
  ok("GEO.91b undo 撤掉整笔记录(地点不再单独成步)", S.state.records.length===0);
}
for(const cmd of ["config set geo manual", "config set geokey off"]){
  const { S } = geoApp({ delay:true });
  S.runCommand(cmd);
  await tick(40);
  S.runCommand("add 50 餐饮");
  ok("GEO.92/93 "+cmd+" 后迟到结果不改记录、缓存清空",
     S.state.records[0]?.place==="" && S.geoCache.place==="",
     JSON.stringify([S.state.records[0]?.place,S.geoCache.place]));
}
{
  const { S } = geoApp({ delay:true });
  await tick(40);
  S.runCommand("add 50 餐饮");
  const backup = JSON.parse(S.serializeState());
  backup.records[0].category = "交通";
  backup.records[0].place = "";
  S.restoreFromText(JSON.stringify(backup));
  ok("GEO.94 导入替换后无迟到回填, 地点保持导入值",
     S.state.records[0]?.category==="交通" && S.state.records[0]?.place==="",
     JSON.stringify(S.state.records[0]));
}

/* ---------- 7. P1 修复护栏(v0.0.12 同版): Key / SDK / 诊断 / 类别 / place ---------- */
{
  const S = loadApp(); S.boot(); S.clearTerm();
  ok("P1.1 normalizeGeoKey 拒绝占位符/提示文案/空白/引号",
     S.normalizeGeoKey(S.GEO_KEY_PLACEHOLDER)==="" && S.normalizeGeoKey("请填入自己的Key")==="" &&
     S.normalizeGeoKey("  ABC DEF  ")==="" && S.normalizeGeoKey('"ABC"')==="" &&
     S.normalizeGeoKey("  MY-KEY-1234  ")==="MY-KEY-1234");
  ok("P1.2 重启归一化与命令写入同规则",
     S.normalizeSettings({geoKey:"请填入自己的Key"}).geoKey==="" &&
     S.normalizeSettings({geoKey:"MY-KEY-1234"}).geoKey==="MY-KEY-1234");
  S.runCommand("config set geokey 请填入自己的Key");
  ok("P1.3 提示文案当场被拒, 不再存进 state",
     S.state.settings.geoKey==="" && /Key 无效/.test(S.lines().join("\n")));
  S.clearTerm(); S.runCommand('config set geokey "MY KEY WITH SPACE"');
  ok("P1.4 带空格的假 Key 不被写入",
     S.state.settings.geoKey==="" && /Key 无效/.test(S.lines().join("\n")));
  S.clearTerm(); S.runCommand("config set geokey MY-KEY-1234 EXTRA");
  ok("P1.5 多 token 脏 Key 被拒且终端不漏明文",
     S.state.settings.geoKey==="" && !/MY-KEY-1234/.test(S.lines().join("\n")));
  S.clearTerm(); S.runCommand("config set geokey ABCDEFGHIJKLMN SECRET-SUFFIX-1234");
  const echo = S.lines()[0] || "";
  ok("P1.6 打码覆盖整段 Key(含尾部 token)且不留明文",
     !/SECRET-SUFFIX-1234/.test(echo) && /…234/.test(echo), echo);
  S.state.settings.geoKey = "";
  S.__doc.getElementById("g_key").value = "MY KEY WITH SPACE";
  S.clearTerm(); S.saveGeoKey();
  ok("P1.7 弹窗带空格 Key 整串回灌后按同一规则拒绝",
     S.state.settings.geoKey==="" && /Key 无效/.test(S.lines().join("\n")));
  ok("P1.8 弹窗回灌走 quote() 整串(源码契约)",
     /runCommand\("config set geokey "\+quote\(v\)\)/.test(html) &&
     /km\[2\]\.trim\(\)/.test(html));
}
/* SDK 运行时分支: 故意不注入 TMap, 让 loadTMapSDK() 真的走 <script> 注入/失败/重试路径。 */
function sdkApp(key, injected){
  const seed = { budget_term_v1: JSON.stringify({
    settings:{ geoMode:"manual", geoKey:key }, seq:0, records:[] }) };
  const S = loadApp({ seedStorage:seed, navigator:{}, TMap:injected });
  S.boot(); S.clearTerm();
  return S;
}
const scriptsOf = (S)=> S.__doc.body.children.filter(c=>c.tagName==="SCRIPT");
{
  const S = sdkApp("OLD-KEY-1234", undefined);
  const before = scriptsOf(S).length;
  const p = S.loadTMapSDK();
  const sc = scriptsOf(S)[scriptsOf(S).length-1];
  ok("P1.9 SDK script URL 只带当前 Key",
     scriptsOf(S).length===before+1 && sc.id==="tmapSdkScript" && /key=OLD-KEY-1234/.test(sc.src));
  ok("P1.10 script 挂 onload/onerror 且有加载超时",
     typeof sc.onload==="function" && typeof sc.onerror==="function" &&
     /setTimeout\(\(\)=>finish\(false\), GEO_SDK_TIMEOUT_MS\)/.test(html));
  ok("P1.11 缓存绑定当前 Key", S.tmapLoadedKey==="OLD-KEY-1234");
  ok("P1.12 同 Key 复用同一 promise(不重复注入)", S.loadTMapSDK()===p && scriptsOf(S).length===before+1);
  sc.onerror(); await tick();
  ok("P1.13 onerror 清缓存并移除旧 script",
     S.tmapLoadedKey==="" && S.tmapScriptEl===null && scriptsOf(S).length===before);
  const p2 = S.loadTMapSDK();
  ok("P1.14 失败后重新注入 script(不永久缓存)",
     p2!==p && scriptsOf(S).length===before+1 && S.tmapLoadedKey==="OLD-KEY-1234");
  const p3 = S.loadTMapSDK();
  scriptsOf(S)[scriptsOf(S).length-1].onload();   // 脚本加载完但 TMap 没挂上 → 也必须清缓存
  await tick();
  ok("P1.15 onload 缺 Geocoder 也清缓存", (await p3)===false && S.tmapLoadedKey==="");
}
{
  const injected = { service:{ Geocoder: function(){} } };
  const S = sdkApp("KEY-A", injected);
  const pA = S.loadTMapSDK();
  ok("P1.16 页面已自带 SDK 时绑定当前 Key", S.tmapLoadedKey==="KEY-A" && (await pA)===true);
  S.state.settings.geoKey = "KEY-B";
  injected.service.Geocoder = undefined;          // 模拟 resetTMapSDK() 清掉旧全局 SDK
  const pB = S.loadTMapSDK();
  const sc = scriptsOf(S)[scriptsOf(S).length-1];
  ok("P1.17 换 Key 后重新加载, script URL 带新 Key",
     pB!==pA && !!sc && /key=KEY-B/.test(sc.src) && !/key=KEY-A/.test(sc.src));
  ok("P1.18 缓存键随新 Key 更新", S.tmapLoadedKey==="KEY-B");
  S.clearTerm(); S.runCommand("config set geokey KEY-C");
  ok("P1.19 config 换 Key 后旧 SDK 缓存作废",
     S.tmapLoadedKey==="" && S.tmapScriptEl===null);
}
{
  const { S } = geoApp({ denied:true });
  await tick();
  const txt = S.lines().join("\n");
  ok("P1.20 权限拒绝有终端诊断", /自动定位失败/.test(txt) && /权限/.test(txt));
  ok("P1.21 console.warn 每次留痕", S.__logs.some(l=>/\[geo\]/.test(l)));
  const badge = S.__doc.getElementById("statusbar").children.find(c=>c.id==="geoBadge");
  ok("P1.22 badge title 记具体原因", !!badge && /权限/.test(badge.title), badge && badge.title);
  S.primeGeoLocation(true); await tick();
  ok("P1.23 同一原因只提示一次(不刷屏)",
     (S.lines().join("\n").match(/自动定位失败/g)||[]).length===1);
}
{
  const { S: S2 } = geoApp({ reject:true });  await tick();
  ok("P1.24 网络失败能区分", /地图服务请求失败|Key 鉴权/.test(S2.lines().join("\n")));
  const { S: S3 } = geoApp({ result:{ result:{ address_component:{} } } });  await tick();
  ok("P1.25 空地址能区分", /逆地理编码/.test(S3.lines().join("\n")));
  const S4 = loadApp(); S4.boot(); S4.clearTerm();
  ok("P1.26 错误分类覆盖 SDK/超时/坐标",
     /SDK/.test(S4.geoErrorText(new Error("sdk-unavailable"))) &&
     /超时/.test(S4.geoErrorText({code:3})) &&
     /坐标/.test(S4.geoErrorText(new Error("bad-coords"))));
  ok("P1.27 无定位能力仍静默降级(不误报失败)",
     !/自动定位失败/.test(S4.lines().join("\n")) && S4.geoStatus.kind==="unsupported");
}
{
  const S = loadApp(); S.boot(); S.clearTerm();
  S.runCommand("add 50 我的自定义类别");
  const opts = (X)=> [...X.__doc.getElementById("catlist").children].map(o=>o.value);
  ok("P1.28 datalist 含账本里的自定义类别", opts(S).includes("我的自定义类别"));
  ok("P1.29 validateCategory 不再写全局 PREDEFINED", !S.PREDEFINED.has("我的自定义类别"));
  ok("P1.30 knownCategories 含默认与自定义",
     S.knownCategories().includes("餐饮") && S.knownCategories().includes("我的自定义类别"));
  ok("P1.31 Tab 补全三处都含自定义类别",
     S.argCandidates("add",2,["add","50",""],"").includes("我的自定义类别") &&
     S.argCandidates("amort",3,["amort","300","30",""],"").includes("我的自定义类别") &&
     S.argCandidates("update",3,["update","1","50",""],"").includes("我的自定义类别"));
  const text = S.serializeState();
  const S2 = loadApp(); S2.boot(); S2.restoreFromText(text);
  ok("P1.32 导入备份后 datalist 仍含自定义类别", opts(S2).includes("我的自定义类别"));
  ok("P1.33 datalist/补全/配色统一到 knownCategories()(源码契约)",
     /for\(const c of knownCategories\(\)\)/.test(html) &&
     (html.match(/return knownCategories\(\);/g)||[]).length>=3 &&
     !/PREDEFINED\.set\(/.test(html));
}
{
  const S = loadApp(); S.boot(); S.clearTerm();
  S.runCommand("add 50 餐饮");
  const place = ()=> S.state.records[0]?.place;
  S.runCommand("place 1 Clear");
  ok("P1.34 大写地名 Clear 不再被误清", place()==="Clear");
  S.runCommand("place 1 clear");
  ok("P1.35 小写 clear 仍兼容清除", place()==="");
  S.runCommand("place 1 北京市 @2027-08-30");
  ok("P1.36 位置无关的 @日期 参数被剥离", place()==="北京市");
  S.runCommand("place 1 #广州市");
  ok("P1.37 #地点 参数可用", place()==="广州市");
  S.runCommand("place 1 #-");
  ok("P1.38 #- 清除", place()==="");
  S.runCommand("place 1 北京市 海淀区");
  ok("P1.39 多 token 地名拼接", place()==="北京市 海淀区");
  S.runCommand("place 1 Off");
  ok("P1.40 大写 Off 不再被误清", place()==="Off");
  S.__doc.getElementById("g_id").value = "1";
  S.__doc.getElementById("g_place").value = "@南山区";
  S.submitGeoPlace();
  ok("P1.41 弹窗地名以 @ 开头不再被吞", place()==="@南山区");
  S.__doc.getElementById("g_place").value = "#某地";
  S.submitGeoPlace();
  ok("P1.42 弹窗地名以 # 开头不再被顶替", place()==="#某地");
  const dp = html.slice(html.indexOf("function doPlace("), html.indexOf("function doPlace(")+1400);
  ok("P1.43 doPlace 共用 splitRecordArgs 且清除大小写敏感(源码契约)",
     /splitRecordArgs\(tokens\.slice\(1\)\)/.test(dp) &&
     /CLEAR_TOKENS\.includes\(only\)/.test(dp) && !/toLowerCase\(\)/.test(dp));
}

console.log("PASS " + pass + " / FAIL " + fails.length);
for(const f of fails) console.log("  ✗ " + f);
process.exit(fails.length? 1 : 0);
