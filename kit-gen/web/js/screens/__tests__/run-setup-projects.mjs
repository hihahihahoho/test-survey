#!/usr/bin/env node
/**
 * run-setup-projects.mjs — test của màn SETUP (S0) + DANH SÁCH PROJECT (S1) + app-shell.
 * Chạy:  node web/js/screens/__tests__/run-setup-projects.mjs
 * Tên file riêng vì `run.mjs` trong thư mục này là của team S3/S4 (thư mục __tests__ dùng chung).
 * Không dependency ngoài. Thoát mã 1 nếu có ca fail.
 */
import './dom-patch.mjs';
import { run } from '../../core/__tests__/harness.mjs';

await import('./projects-data.test.mjs');
await import('./setup-script.test.mjs');
await import('./mount.test.mjs');
await import('./crud.test.mjs');
await import('./shell.test.mjs');
await import('./lint-setup-projects.test.mjs');
// E2E cuối cùng: nối THẬT với agent (dựng workspace tạm trong /tmp rồi dọn sạch).
await import('./e2e-agent.test.mjs');

const ok = await run();
process.exit(ok ? 0 : 1);
