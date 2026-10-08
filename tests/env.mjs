// 测试装置的路径解析 —— 单一入口。
// 现象: 装置原先在 app.mjs / test3.mjs / test4.mjs / gen-*.mjs 里各写一份
//       "<家目录>\Desktop\budget-terminal\..." 本机绝对路径(共 7 处),
//       一旦移出 %TEMP% 或换台机器就整体跑不起来。
// 修复: 以本文件位置反推仓库根, 所有套件改为相对定位; 需要指向"变异体"时仍可用环境变量覆盖。
// 依据: HANDOVER §5.1 A2(复用既有抽象, 不得为同类问题写第二份实现)。
import path from "node:path";
import { fileURLToPath } from "node:url";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 仓库根 (= tests/ 的上一级) */
export const REPO_ROOT = path.resolve(TESTS_DIR, "..");

/** 被测文件: 默认仓库内的 index.html; BT_HTML 可指向变异体/别处的副本 */
export const HTML_PATH = process.env.BT_HTML || path.join(REPO_ROOT, "index.html");

/** README: 始终取本仓库的(与 BT_HTML 无关), 供 M1 护栏做双向校验; BT_README 可覆盖 */
export const README_PATH = process.env.BT_README || path.join(REPO_ROOT, "README.md");

/** 账本夹具: 默认是 tests/fixtures/user_backup.json —— **合成数据**, 不含任何真实账目。
 *  想做"真实备份实弹冒烟":  $env:BT_FIXTURE="C:\...\budget_term_backup.json" */
export const FIXTURE_PATH = process.env.BT_FIXTURE || path.join(TESTS_DIR, "fixtures", "user_backup.json");
