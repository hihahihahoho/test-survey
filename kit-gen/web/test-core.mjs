#!/usr/bin/env node
/**
 * web/test-core.mjs — chạy toàn bộ test của lớp core: `node web/test-core.mjs`
 * Không dependency ngoài (luật cứng: KHÔNG npm install).
 * Thoát mã 1 nếu có ca fail để dùng được trong CI.
 */

import { run } from './js/core/__tests__/harness.mjs';

await import('./js/core/__tests__/secrets.test.mjs');
await import('./js/core/__tests__/errors.test.mjs');
await import('./js/core/__tests__/agent.test.mjs');
await import('./js/core/__tests__/detect.test.mjs');
await import('./js/core/__tests__/router.test.mjs');
await import('./js/core/__tests__/idb.test.mjs');

const ok = await run();
process.exit(ok ? 0 : 1);
