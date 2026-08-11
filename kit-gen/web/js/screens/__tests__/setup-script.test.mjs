/* S0 · script cài: SHA256 phải là hash THẬT của đúng bytes tải về, và script
   không được chứa những thứ spec cấm (curl|bash, sudo, đọc auth.json). */
import { createHash } from 'node:crypto';
import { assert, describe, eq, it } from '../../core/__tests__/harness.mjs';
import { SCRIPT_NAME, SEVEN_THINGS, scriptBytes, scriptSha256, scriptText } from '../setup/installer-script.js';
import { STEPS, stepIndex } from '../setup/stepper.js';
import { imageGenOutcome } from '../setup/step-imagegen.js';
import { INSTALL_CMD, IMG_HOME_LOGIN_CMD, updateCmd } from '../../app-shell/commands.js';

describe('S0 · script .sh (§3-S0 bước 1)', () => {
  it('tên file đúng như UI hiện', () => { eq(SCRIPT_NAME, 'kit-gen-setup.sh'); });
  it('accordion liệt kê ĐÚNG 7 việc', () => { eq(SEVEN_THINGS.length, 7); });
  it('SHA256 khớp hash thật của bytes sẽ tải (không phải hằng số chép tay)', async () => {
    const hex = await scriptSha256();
    const expect = createHash('sha256').update(Buffer.from(scriptBytes())).digest('hex');
    eq(hex, expect);
  });
  it('KHÔNG có kiểu curl … | bash trong script (§3-S0)', () => {
    const s = scriptText();
    assert(!/curl[^\n]*\|\s*(bash|sh)\b/.test(s), 'script không được tự tải rồi chạy');
    assert(!/wget[^\n]*\|\s*(bash|sh)\b/.test(s));
  });
  it('KHÔNG gọi sudo ở bất cứ đâu (chỉ được nhắc trong câu giải thích)', () => {
    const cmdLines = scriptText().split('\n').filter((l) => !l.trim().startsWith('#'));
    for (const l of cmdLines) {
      assert(!/(^|[;&|(]\s*)sudo\s/.test(l), `dòng gọi sudo: ${l}`);
    }
    assert(scriptText().includes('KHÔNG cần sudo'), 'phải nói rõ với user là không cần sudo');
  });
  it('KHÔNG đọc nội dung auth.json — chỉ kiểm tra file tồn tại (arch §4.3)', () => {
    const s = scriptText();
    assert(/-f "\$CODEX_HOME_DIR\/auth\.json"/.test(s), 'phải kiểm bằng test -f');
    assert(!/(cat|grep|jq|head|awk|sed)[^\n]*auth\.json/.test(s), 'không được đọc nội dung auth.json');
  });
  it('KHÔNG tải chương trình lạ từ Internet', () => {
    const s = scriptText();
    const urls = s.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
    // Chỉ được phép nhắc tới trang chủ Node và không có lệnh tải nào.
    for (const u of urls) assert(/nodejs\.org/.test(u), `URL lạ trong script: ${u}`);
    assert(!/\b(curl|wget)\s+-/.test(s), 'không có lệnh tải file');
  });
  it('có in ra lệnh chạy agent để user copy', () => {
    assert(scriptText().includes('kitgen-agent --workspace'));
    assert(scriptText().includes('node agent/server.mjs --workspace'));
  });
  it('lệnh đếm image_gen không sinh ảnh (chỉ debug prompt-input | grep -c)', () => {
    assert(/codex debug prompt-input[^\n]*grep -c image_gen/.test(scriptText()));
  });
});

describe('S0 · stepper 4 bước', () => {
  it('đúng 4 bước, có nhãn chữ', () => {
    eq(STEPS.length, 4);
    for (const s of STEPS) assert(typeof s.label === 'string' && s.label.length > 0);
  });
  it('stepIndex an toàn với id lạ', () => { eq(stepIndex('không-có'), 0); eq(stepIndex('imagegen'), 3); });
});

describe('S0 bước 4 · 3 kết cục của "Tạo ảnh AI" (§3-S0)', () => {
  it('available + default-home → Sẵn sàng (cấu hình mặc định)', () => {
    const o = imageGenOutcome({ imageGen: { available: true, mode: 'default-home' } });
    eq(o.tone, 'ok');
    assert(o.title.includes('mặc định'), o.title);
    eq(o.needsFallback, false);
  });
  it('available + img-home → Sẵn sàng (home riêng)', () => {
    const o = imageGenOutcome({ imageGen: { available: true, mode: 'img-home', codexHomeLabel: '~/.codex-img' } });
    assert(o.title.includes('home riêng'), o.title);
    eq(o.detail, 'Cấu hình: ~/.codex-img');
  });
  it('không available → Chưa tạo được ảnh + giải thích theo enum reason + cần fallback', () => {
    const o = imageGenOutcome({ imageGen: { available: false, reason: 'NOT_LOGGED_IN', needsFallbackHome: true } });
    eq(o.tone, 'warn');
    eq(o.title, 'Chưa tạo được ảnh');
    assert(o.detail.includes('chưa đăng nhập'), o.detail);
    eq(o.needsFallback, true);
  });
  it('reason lạ vẫn có câu giải thích (§6.5-6 không vỡ UI)', () => {
    const o = imageGenOutcome({ imageGen: { available: false, reason: 'CÁI_GÌ_ĐÓ_MỚI' } });
    assert(typeof o.detail === 'string' && o.detail.length > 0);
  });
});

describe('Lệnh terminal hiện cho user', () => {
  it('không chứa đường dẫn tuyệt đối kiểu /Users/... (arch §4.3-5)', () => {
    const all = [...Object.values(INSTALL_CMD), IMG_HOME_LOGIN_CMD, updateCmd(null)].join('\n');
    assert(!/\/Users\//.test(all) && !/\/home\/[a-z]/.test(all), all);
  });
  it('updateCmd ưu tiên chuỗi do agent khai ở /health', () => {
    eq(updateCmd({ updateCommand: 'brew upgrade kitgen' }), 'brew upgrade kitgen');
    eq(updateCmd({}), 'npm i -g kitgen-agent');
  });
});
