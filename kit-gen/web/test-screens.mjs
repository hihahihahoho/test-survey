#!/usr/bin/env node
/**
 * web/test-screens.mjs — chạy toàn bộ test của 4 màn do team này sở hữu (S2, S2b, S5, S6):
 *     node web/test-screens.mjs
 * Không dependency ngoài (luật cứng: KHÔNG npm install). Thoát mã 1 nếu có ca fail.
 *
 * 3 bộ:
 *   lint.test.mjs     — quét mã: cấm màu thô, cấm fetch/storage trực tiếp, cấm innerHTML, <400 dòng
 *   screens.test.mjs  — S2/S2b/S5 mount THẬT dưới minidom + agent giả: DOM/ARIA/4 trạng thái
 *   settings.test.mjs — S6 5 tab: workspace, doctor, prefs, thùng rác, quyền riêng tư
 *   flows.test.mjs    — luồng nguy hiểm & tốn quota: xoá+hoàn tác, modal gen, doctor chặn, dọn cache
 *   registry.test.mjs — tích hợp thật với app-shell của team khác qua screen-registry.js
 *   a11y-responsive.test.mjs — ⌘K bảng lệnh, rail-drawer ≤1099px, banner <768, tương phản token
 */
import { spawnSync } from 'node:child_process';

const suites = [
  'js/screens/__tests__/lint.test.mjs',
  'js/screens/__tests__/screens.test.mjs',
  'js/screens/__tests__/settings.test.mjs',
  'js/screens/__tests__/flows.test.mjs',
  'js/screens/__tests__/registry.test.mjs',
  // lượt A11Y & RESPONSIVE: chống hồi quy cho ⌘K, rail-drawer, banner <768, tương phản
  'js/app-shell/__tests__/a11y-responsive.test.mjs',
];

let failed = 0;
for (const s of suites) {
  console.log(`\n\x1b[1m\x1b[36m>> ${s}\x1b[0m`);
  const r = spawnSync(process.execPath, [s], { cwd: new URL('.', import.meta.url).pathname, stdio: 'inherit' });
  if (r.status !== 0) failed += 1;
}
console.log(`\n${'='.repeat(70)}`);
console.log(failed === 0 ? '\x1b[32mTAT CA BO TEST PASS\x1b[0m' : `\x1b[31m${failed} bo test FAIL\x1b[0m`);
process.exit(failed === 0 ? 0 : 1);
