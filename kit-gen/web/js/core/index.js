/**
 * web/js/core/index.js — điểm nhập của lớp core cho các team màn hình.
 * Import từ đây để không phụ thuộc vào đường dẫn nội bộ của core.
 *
 *   import { agent, api, errors, store, idb, detect, router } from '../core/index.js';
 *
 * Ranh giới sở hữu: mọi thứ trong web/js/core/** do TRANSPORT & STATE quản.
 * Màn hình KHÔNG được: gọi fetch trực tiếp, chạm localStorage/indexedDB trực tiếp,
 * hay tự viết copy lỗi (§6.5-1, §6.5-2, §3.9).
 */

export * as constants from './constants.js';
export * as agent from './agent.js';
export * as api from './api.js';
export * as errors from './errors.js';
export * as store from './store.js';
export * as idb from './idb.js';
export * as detect from './detect.js';
export * as router from './router.js';
export * as ndjson from './ndjson.js';

export { AgentError } from './agent.js';
export { SecretLeakError, StoreKeyError } from './secrets.js';
export { APP_PROTOCOL, JOB_STATUS, JOB_STATUS_PRIORITY, PILL, RUN_STATUS } from './constants.js';
