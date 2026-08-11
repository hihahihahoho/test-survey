/** Test bộ dò secret + allowlist store — YC#7, architecture §4.3/§4.4. */
import { describe, it, assert, eq, throws } from './harness.mjs';
import { SecretLeakError, assertNoSecret, findSecret, looksHighEntropy, shannonEntropy } from '../secrets.js';
import * as store from '../store.js';
import { LS_KEYS } from '../constants.js';
import { allowedKeys } from '../schemas.js';

describe('secrets.js — chặn theo TÊN FIELD (từng nhóm secret)', () => {
  const byName = [
    ['token', { token: 'abc' }],
    ['accessToken', { accessToken: 'abc' }],
    ['refresh_token', { refresh_token: 'abc' }],
    ['id_token', { id_token: 'abc' }],
    ['apiKey', { apiKey: 'abc' }],
    ['api_key', { api_key: 'abc' }],
    ['key', { key: 'abc' }],
    ['secret', { secret: 'abc' }],
    ['clientSecret', { clientSecret: 'abc' }],
    ['authorization', { authorization: 'abc' }],
    ['Authorization (hoa)', { Authorization: 'abc' }],
    ['bearer', { bearer: 'abc' }],
    ['password', { password: 'abc' }],
    ['passphrase', { passphrase: 'abc' }],
    ['cookie', { cookie: 'abc' }],
    ['authJson', { authJson: 'x' }],
    ['auth.json (key có dấu chấm)', { 'auth.json': 'x' }],
    ['auth_json', { auth_json: 'x' }],
    ['credentials', { credentials: 'x' }],
    ['sessionId', { sessionId: 'x' }],
    ['auth_mode', { auth_mode: 'chatgpt' }],
    ['account_id', { account_id: 'x' }],
    ['last_refresh', { last_refresh: 'x' }],
    ['OPENAI_API_KEY', { OPENAI_API_KEY: 'x' }],
    ['confirmCode (mã 4 số huỷ diệt)', { confirmCode: '4821' }],
  ];
  for (const [label, value] of byName) {
    it(`chặn field: ${label}`, () => {
      const e = throws(() => assertNoSecret(value), 'SECRET_BLOCKED', `phải chặn ${label}`);
      assert(e.kind === 'field-name', `kind phải là field-name, nhận ${e.kind}`);
      assert(!String(e.message).includes('abc'), 'thông điệp lỗi KHÔNG được chứa giá trị');
    });
  }
  it('cho phép authPresent (boolean của doctor, không phải nội dung auth.json)', () => {
    assertNoSecret({ authPresent: true });
  });
});

describe('secrets.js — chặn theo PATTERN GIÁ TRỊ (từng nhóm)', () => {
  const byValue = [
    ['OpenAI sk-', { note: 'sk-abcdefghijklmnop12345678' }, 'V-SK'],
    ['OpenAI sk-proj-', { note: 'sk-proj-AAAABBBBCCCCDDDDEEEE1234' }, 'V-SK'],
    ['JWT eyJ', { note: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0' }, 'V-JWT'],
    ['Bearer header', { note: 'Bearer abcdef1234567890xyz' }, 'V-BEARER'],
    ['kv access_token=', { note: 'access_token=zzzzzzzzzzzz' }, 'V-AUTHKV'],
    ['path tuyệt đối /Users (PII)', { note: '/Users/tungnt2/KitGen' }, 'V-ABSPATH'],
    ['path /home (PII)', { note: '/home/tung/kitgen' }, 'V-ABSPATH'],
    ['private key PEM', { note: '-----BEGIN OPENSSH PRIVATE KEY-----' }, 'V-PRIVKEY'],
    ['GitHub token', { note: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123' }, 'V-GHTOKEN'],
    ['set-cookie', { note: 'Set-Cookie: a=b' }, 'V-SETCOOKIE'],
  ];
  for (const [label, value, rule] of byValue) {
    it(`chặn giá trị: ${label}`, () => {
      const e = throws(() => assertNoSecret(value), 'SECRET_BLOCKED', `phải chặn ${label}`);
      assert(e.rule === rule, `rule phải là ${rule}, nhận ${e.rule}`);
    });
  }
  it('chặn chuỗi entropy cao ≥32 ký tự (bí mật không rõ dạng)', () => {
    const e = throws(() => assertNoSecret({ note: 'Xk92Lm4PqR7tYw1ZbN5cVh8JdF3sGa6K' }), 'SECRET_BLOCKED');
    assert(e.kind === 'entropy', `kind phải là entropy, nhận ${e.kind}`);
  });
  it('cho phép nhãn workspace rút gọn ~/KitGen', () => {
    assertNoSecret({ label: '~/KitGen' });
  });
  it('cho phép sha256: fingerprint (entropy cao nhưng có tiền tố rõ)', () => {
    assertNoSecret({ fingerprint: 'sha256:3f9a1cd02e' });
  });
  it('chặn secret nằm SÂU trong mảng lồng object', () => {
    const e = throws(() => assertNoSecret({ items: [{ a: 1 }, { deep: { note: 'sk-abcdefghijklmnop12345678' } }] }), 'SECRET_BLOCKED');
    assert(e.path.includes('items[1]'), `path phải chỉ đúng chỗ, nhận ${e.path}`);
  });
  it('findSecret trả về null khi sạch', () => {
    eq(findSecret({ theme: 'dark', maxJobs: 4 }), null);
  });
  it('shannonEntropy/looksHighEntropy hoạt động', () => {
    assert(shannonEntropy('aaaaaaaa') === 0, 'chuỗi 1 ký tự lặp phải có entropy 0');
    assert(looksHighEntropy('Xk92Lm4PqR7tYw1ZbN5cVh8JdF3sGa6K'), 'phải nhận ra entropy cao');
    assert(!looksHighEntropy('dark'), 'chuỗi ngắn không phải entropy cao');
  });
});

describe('store.js — allowlist khoá tường minh', () => {
  it('allowlist đúng 8 khoá của architecture §4.1', () => {
    eq(allowedKeys().sort(), [
      'kitgen.agent.v1', 'kitgen.hints.v1', 'kitgen.prefs.v1', 'kitgen.projects.cache.v1',
      'kitgen.recent.v1', 'kitgen.setup.v1', 'kitgen.ui.v1', 'kitgen.workspace.v1',
    ]);
  });
  it('từ chối GHI khoá lạ', () => {
    store._setBackend(store._memoryBackend());
    throws(() => store.set('kitgen.evil.v1', { a: 1 }), 'STORE_KEY_NOT_ALLOWED');
    throws(() => store.set('random', { a: 1 }), 'STORE_KEY_NOT_ALLOWED');
  });
  it('từ chối ĐỌC khoá lạ', () => {
    throws(() => store.get('kitgen.nope.v1'), 'STORE_KEY_NOT_ALLOWED');
  });
  it('loại bỏ field lạ (schema strict) chứ không ghi bừa', () => {
    store._setBackend(store._memoryBackend());
    const r = store.set(LS_KEYS.ui, { theme: 'light', hackerField: 'x' });
    assert(r.value.hackerField === undefined, 'field lạ phải bị loại bỏ');
    assert(r.dropped.includes('$.hackerField'), `phải báo dropped, nhận ${JSON.stringify(r.dropped)}`);
    eq(store.get(LS_KEYS.ui).theme, 'light');
  });
  it('enum sai → về mặc định, không vỡ', () => {
    store._setBackend(store._memoryBackend());
    const r = store.set(LS_KEYS.ui, { theme: 'neon' });
    eq(r.value.theme, 'dark');
  });
  it('số bị kẹp vào khoảng cho phép', () => {
    store._setBackend(store._memoryBackend());
    eq(store.set(LS_KEYS.prefs, { maxJobs: 999 }).value.maxJobs, 8);
    eq(store.set(LS_KEYS.prefs, { maxJobs: 0 }).value.maxJobs, 1);
  });
  it('CHẶN ghi secret qua store.set (khoá hợp lệ, giá trị bẩn)', () => {
    store._setBackend(store._memoryBackend());
    throws(() => store.set(LS_KEYS.workspace, { label: '/Users/tungnt2/KitGen' }), 'SECRET_BLOCKED');
    throws(() => store.set(LS_KEYS.ui, { filterQuery: 'sk-abcdefghijklmnop12345678' }), 'SECRET_BLOCKED');
  });
  it('CHẶN ghi secret qua store.patch dù field sẽ bị coerce loại bỏ', () => {
    store._setBackend(store._memoryBackend());
    throws(() => store.patch(LS_KEYS.setup, { access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0' }), 'SECRET_BLOCKED');
  });
  it('không ghi gì vào backend khi bị chặn', () => {
    const be = store._memoryBackend();
    store._setBackend(be);
    throws(() => store.set(LS_KEYS.workspace, { label: '/Users/x/y' }), 'SECRET_BLOCKED');
    eq(Object.keys(be._dump()), []);
  });
  it('baseUrl chỉ nhận loopback + cổng 8765/8766/8767 (§6.5-3)', () => {
    store._setBackend(store._memoryBackend());
    assert(store.isAllowedBaseUrl('http://127.0.0.1:8765'), '8765 phải hợp lệ');
    assert(store.isAllowedBaseUrl('http://localhost:8767'), '8767 phải hợp lệ');
    assert(!store.isAllowedBaseUrl('http://127.0.0.1:8125'), 'KHÔNG được nhận 8125 (server v1)');
    assert(!store.isAllowedBaseUrl('http://evil.com:8765'), 'host ngoài loopback phải bị từ chối');
    assert(!store.isAllowedBaseUrl('http://127.0.0.1:8765/../x'), 'path lạ phải bị từ chối');
    throws(() => store.set(LS_KEYS.agent, { baseUrl: 'http://evil.com:8765' }), 'BASEURL_NOT_ALLOWED');
  });
  it('JSON rác trong localStorage → về mặc định, không throw', () => {
    const be = store._memoryBackend();
    be.setItem(LS_KEYS.prefs, '{broken json');
    store._setBackend(be);
    eq(store.get(LS_KEYS.prefs).maxJobs, 4);
  });
  it('auditForeignKeys phát hiện khoá kitgen.* lạ', () => {
    const be = store._memoryBackend();
    be.setItem('kitgen.sneaky.v1', '{}');
    store._setBackend(be);
    eq(store.auditForeignKeys(), ['kitgen.sneaky.v1']);
  });
  it('rememberOpenedProject giữ tối đa 10 id, mới nhất lên đầu', () => {
    store._setBackend(store._memoryBackend());
    for (let i = 1; i <= 12; i += 1) store.rememberOpenedProject(`p${i}`);
    const r = store.get(LS_KEYS.recent);
    eq(r.projectIds.length, 10);
    eq(r.projectIds[0], 'p12');
    eq(r.lastOpenedId, 'p12');
  });
});
