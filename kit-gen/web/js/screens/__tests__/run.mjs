#!/usr/bin/env node
/**
 * web/js/screens/__tests__/run.mjs — chạy test của S3+S4: `node web/js/screens/__tests__/run.mjs`
 * Không dependency ngoài. Thoát mã 1 nếu có ca fail.
 */
import { run } from '../../core/__tests__/harness.mjs';

await import('./validate.test.mjs');
await import('./ops.test.mjs');
await import('./silhouette-mirror.test.mjs');
await import('./state.test.mjs');
await import('./run-store.test.mjs');
await import('./render.test.mjs');
await import('./security.test.mjs');
await import('./integration.test.mjs');

const ok = await run();
process.exit(ok ? 0 : 1);
