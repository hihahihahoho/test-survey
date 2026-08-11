/** Test bảng lỗi — phải cover ĐỦ mã liệt kê ở UX-SPEC §3.9 và §6.1. */
import { describe, it, assert, eq } from './harness.mjs';
import { devDetails, imageGenReasonText, isKnownCode, knownCodes, lookup, present } from '../errors.js';

/** Mọi mã xuất hiện trong §3.9 (cột code) + §6.1 (cột Lỗi của 42 endpoint). */
const REQUIRED_CODES = [
  // §3.9
  'AGENT_NOT_RUNNING', 'AGENT_BLOCKED_BY_BROWSER', 'AGENT_PROTOCOL_OLD', 'AGENT_PROTOCOL_NEW',
  'ORIGIN_NOT_ALLOWED', 'BAD_HOST', 'WORKSPACE_CHANGED', 'WORKSPACE_UNWRITABLE', 'DISK_FULL',
  'CODEX_MISSING', 'PY_DEPS_MISSING', 'IMAGEGEN_UNAVAILABLE', 'QUOTA_SUSPECTED',
  'RUN_CONFLICT', 'RUN_ACTIVE', 'CONTRACT_CONFLICT', 'CONTRACT_INVALID', 'PROJECT_ID_TAKEN',
  'PROJECT_BROKEN', 'PROJECT_NOT_FOUND', 'PROJECT_IN_TRASH', 'REF_IN_USE', 'UNKNOWN_JOB',
  'TOO_LARGE', 'BAD_TYPE', 'CONFIRM_REQUIRED', 'CONFIRM_INVALID', 'CONFIRM_LOCKED',
  'IMPORT_INVALID', 'LOG_NOT_FOUND', 'RATE_LIMITED',
  // §6.1 / §6.2 bảng endpoint
  'STARTING', 'WORKSPACE_UNKNOWN', 'INVALID_NAME', 'INVALID_SLUG', 'CONTRACT_BROKEN',
  'IF_MATCH_REQUIRED', 'TRASH_NOT_FOUND', 'RUN_NOT_FOUND', 'RUN_FINISHED', 'CURSOR_GONE',
  'KIT_NOT_CUT', 'PATH_ESCAPE', 'NOT_SUPPORTED',
  // yêu cầu nhiệm vụ nêu tên trực tiếp
  'AGENT_OFFLINE',
];

describe('errors.js — cover đủ mã lỗi của §3.9 + §6.1', () => {
  for (const code of REQUIRED_CODES) {
    it(`biết mã ${code}`, () => {
      assert(isKnownCode(code), `bảng thiếu mã ${code}`);
      const v = lookup(code);
      assert(typeof v.title === 'string' && v.title.length > 0, 'phải có tiêu đề VI');
      assert(typeof v.explain === 'string' && v.explain.length > 0, 'phải có giải thích 1 câu');
      assert(Array.isArray(v.where) && v.where.length > 0, 'phải nói hiện ở đâu');
      assert(['info', 'warn', 'danger'].includes(v.severity), 'severity phải hợp lệ');
    });
  }
  it(`bảng có ${knownCodes().length} mã, tất cả đều tra được`, () => {
    for (const c of knownCodes()) assert(lookup(c).known === true, `mã ${c} tra không ra`);
  });
});

describe('errors.js — quy tắc bất di bất dịch', () => {
  it('mã LẠ → lỗi generic, không vỡ UI (§6.5-6)', () => {
    const v = lookup('BRAND_NEW_CODE_FROM_FUTURE_AGENT');
    eq(v.known, false);
    eq(v.title, 'Có lỗi từ công cụ local');
    assert(v.actions.length > 0, 'lỗi lạ vẫn phải có nút hành động');
  });
  it('lookup không bao giờ trả null/undefined kể cả input rác', () => {
    for (const bad of [null, undefined, '', '   ', 42, {}, []]) {
      const v = lookup(bad);
      assert(typeof v.title === 'string' && v.title.length > 0, `input ${JSON.stringify(bad)} phải có title`);
    }
  });
  it('present() KHÔNG chứa message kỹ thuật của agent', () => {
    const v = present({ code: 'CONTRACT_CONFLICT', message: 'Contract version 37 != 38' });
    const dump = JSON.stringify(v);
    assert(!dump.includes('37 != 38'), 'message kỹ thuật bị rò vào phần hiển thị!');
    assert(!Object.hasOwn(v, 'message'), 'present() không được có field message');
    eq(v.title, 'Bản thiết kế đã đổi ở nơi khác');
  });
  it('present() đọc được cả envelope {error:{...}} của §6.1', () => {
    eq(present({ error: { code: 'RUN_CONFLICT', message: 'x' } }).title, 'Project này đang chạy một lượt khác');
  });
  it('devDetails() là CHỖ DUY NHẤT có message/status/url', () => {
    const d = devDetails({
      code: 'CONTRACT_CONFLICT', message: 'Contract version 37 != 38', status: 409,
      method: 'PUT', url: 'http://127.0.0.1:8765/api/projects/x/contract',
      details: { serverVersion: 38 },
    });
    assert(d.includes('Contract version 37 != 38'), 'panel dev phải có message');
    assert(d.includes('409'), 'panel dev phải có status');
    assert(d.includes('serverVersion'), 'panel dev phải có details');
  });
  it('alias AGENT_OFFLINE → AGENT_NOT_RUNNING', () => {
    eq(lookup('AGENT_OFFLINE').code, 'AGENT_NOT_RUNNING');
    eq(lookup('agent-offline').code, 'AGENT_NOT_RUNNING');
  });
  it('lỗi kết nối/protocol đặt app vào chế độ chỉ-đọc (§2.5)', () => {
    for (const c of ['AGENT_NOT_RUNNING', 'AGENT_BLOCKED_BY_BROWSER', 'AGENT_PROTOCOL_OLD', 'AGENT_PROTOCOL_NEW']) {
      assert(lookup(c).readOnly === true, `${c} phải bật chế độ chỉ-đọc`);
    }
  });
  it('CONTRACT_CONFLICT có đủ 3 lựa chọn của §3.6 (So sánh/Tải lại/Lưu bản sao)', () => {
    eq(lookup('CONTRACT_CONFLICT').actions.map((a) => a.id),
      ['COMPARE', 'RELOAD_DATA', 'SAVE_AS_COPY']);
  });
  it('AGENT_BLOCKED_BY_BROWSER có nút [Mở bản chạy tại máy] đứng đầu', () => {
    eq(lookup('AGENT_BLOCKED_BY_BROWSER').actions[0].id, 'OPEN_MIRROR');
  });
  it('7 enum imageGen.reason đều có câu giải thích riêng (arch §6.3)', () => {
    const reasons = ['NO_CODEX', 'NOT_LOGGED_IN', 'FREE_PLAN', 'PROVIDER_NOT_OPENAI',
      'MODEL_NO_IMAGE_INPUT', 'FEATURE_OFF', 'UNKNOWN'];
    const seen = new Set();
    for (const r of reasons) {
      const t = imageGenReasonText(r);
      assert(t.length > 0, `${r} thiếu giải thích`);
      seen.add(t);
    }
    eq(seen.size, 7);
    eq(imageGenReasonText('SOMETHING_ELSE'), imageGenReasonText('UNKNOWN'));
  });
});
