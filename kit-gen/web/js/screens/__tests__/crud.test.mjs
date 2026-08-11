/* Mở THẬT các modal §4 (tạo / đổi tên / nhân bản / nhập / xuất) dưới minidom
   và kiểm những điều spec bắt buộc: 4 template, đường lùi, bảng đối chiếu,
   nút phá huỷ không phải mặc định Enter, agent chưa chạy thì disable TRƯỚC khi bấm. */
import { assert, describe, eq, it } from '../../core/__tests__/harness.mjs';
import { jsonResponse, mockFetch } from '../../core/__tests__/mock-fetch.mjs';
import * as agent from '../../core/agent.js';
import { document } from './dom-patch.mjs';
import { TEMPLATES, openCreateModal, openRenameModal } from '../projects/crud/create.js';
import { openDuplicateModal } from '../projects/crud/duplicate.js';
import { openImportWizard } from '../projects/crud/import-wizard.js';
import { openExportModal } from '../projects/crud/export-zip.js';

const P = {
  id: 'tet26-a7f3', name: 'Tết 2026', slug: 'tet26', tags: ['tet'],
  stats: { variants: 2, sheets: 5, components: 42, rawPresent: 8, kitsCut: 96, diskBytes: 184320133 },
};
const body = () => document.body;
const text = (n) => String(n.textContent ?? '');
const panels = () => body().querySelectorAll('.kg-modal__panel');
const last = () => { const p = panels(); return p[p.length - 1]; };
function closeAll() { for (const b of body().querySelectorAll('.kg-modal__close')) b.click(); }

describe('§4.1 · modal Tạo project', () => {
  it('có đủ 4 template, mặc định là "Kit cơ bản" (khuyến nghị)', () => {
    eq(TEMPLATES.map((t) => t.id), ['basic', 'blank', 'from-project', 'import']);
    closeAll();
    const m = openCreateModal({ existing: [] });
    const p = last();
    const t = text(p);
    for (const label of ['Kit cơ bản', 'Trống', 'Từ project đang có', 'Nhập file']) {
      assert(t.includes(label), `thiếu template ${label}`);
    }
    const radios = p.querySelectorAll('input[type="radio"]');
    assert(radios.length >= 4, 'template phải là radio thật (§5.8-A5), không phải div onclick');
    m.close();
  });
  it('slug tự sinh từ tên và hiện trước cho user thấy', () => {
    closeAll();
    const m = openCreateModal({ existing: [] });
    const p = last();
    const nameInput = p.querySelectorAll('input')[0];
    nameInput.value = 'Xuân 26';
    nameInput.dispatch('input');
    assert(text(p).includes('projects/xuan-26-xxxx'), text(p).slice(0, 400));
    m.close();
  });
  it('trùng tên → cảnh báo vàng + gợi ý, KHÔNG chặn tạo (§4.1-2)', () => {
    closeAll();
    const m = openCreateModal({ existing: [{ id: 'x', name: 'Tết 2026', tags: [] }] });
    const p = last();
    const nameInput = p.querySelectorAll('input')[0];
    nameInput.value = 'Tết 2026';
    nameInput.dispatch('input');
    assert(text(p).includes('Vẫn tạo được'), text(p).slice(0, 400));
    assert(p.querySelectorAll('.kg-banner--warning').length >= 1, 'phải là banner cảnh báo');
    const btns = [...p.querySelectorAll('.kg-btn')];
    const create = btns.find((b) => text(b) === 'Tạo project');
    assert(create && !create.disabled, 'không được chặn tạo');
    m.close();
  });
  it('agent chưa chạy → nút Tạo disabled + dải vàng giải thích TRƯỚC khi bấm (§4.1-5)', () => {
    closeAll();
    const m = openCreateModal({ existing: [], readOnly: true, reason: 'Cần công cụ local đang chạy' });
    const p = last();
    assert(text(p).includes('Cần công cụ local đang chạy để tạo thư mục project'), text(p).slice(0, 300));
    const create = [...p.querySelectorAll('.kg-btn')].find((b) => text(b) === 'Tạo project');
    eq(create.disabled, true);
    m.close();
  });
});

describe('§4.2 · modal Đổi tên', () => {
  it('nói rõ thư mục trên máy KHÔNG đổi', () => {
    closeAll();
    const m = openRenameModal({ project: P, existing: [] });
    assert(text(last()).includes('Thư mục trên máy vẫn là tet26-a7f3'), text(last()));
    m.close();
  });
});

describe('§4.3 · modal Nhân bản có chọn lọc', () => {
  it('Bản thiết kế luôn copy (checkbox bị khoá) và mặc định KHÔNG copy ảnh/kit', () => {
    closeAll();
    const m = openDuplicateModal({ project: P, existing: [] });
    const p = last();
    const t = text(p);
    assert(t.includes('luôn copy'), t.slice(0, 300));
    const boxes = [...p.querySelectorAll('input[type="checkbox"]')];
    // minidom không phản chiếu attribute→property nên kiểm attribute (đúng ở cả trình duyệt thật)
    assert(boxes[0].getAttribute('disabled') !== null, 'checkbox "Bản thiết kế" phải bị khoá');
    eq(boxes[0].checked, true);
    eq(boxes[1].checked, true);       // refs: mặc định có
    eq(boxes[2].checked, false);      // raw: mặc định không
    eq(boxes[3].checked, false);      // kits: mặc định không
    m.close();
  });
  it('có 3 lựa chọn phong cách sau khi nhân bản (§4.3)', () => {
    closeAll();
    const m = openDuplicateModal({ project: P, existing: [] });
    const t = text(last());
    assert(t.includes('Giữ nguyên phong cách'), t.slice(0, 500));
    assert(t.includes('Chỉ giữ 1 phong cách'));
    assert(t.includes('Xoá hết phong cách'));
    m.close();
  });
  it('nêu số liệu THẬT của project nguồn, không bịa tỉ lệ từng phần', () => {
    closeAll();
    const m = openDuplicateModal({ project: P, existing: [] });
    const t = text(last());
    assert(t.includes('5 sheet') && t.includes('42 element'), t.slice(0, 400));
    assert(t.includes('8 lượt có ảnh'), 'phải nêu số lượt có ảnh thật');
    assert(t.includes('96 file'), 'phải nêu số file kit thật');
    m.close();
  });
});

describe('§4.6 · wizard Nhập 3 bước — bảng đối chiếu KHÔNG bỏ qua được', () => {
  it('bước 1 có 3 nguồn + khẳng định không sửa file gốc', () => {
    closeAll();
    const m = openImportWizard({});
    const t = text(last());
    assert(t.includes('Bước 1/3'), t.slice(0, 200));
    assert(t.includes('File .zip của project'));
    assert(t.includes('styles.json của bản cũ'));
    assert(t.includes('Thư mục có sẵn'));
    assert(t.includes('KHÔNG bị thay đổi hay xoá'), 'phải nói rõ nhập là một chiều');
    m.close();
  });
  it('không chọn file thì KHÔNG sang bước 2 (không im lặng, có toast cảnh báo)', () => {
    closeAll();
    const m = openImportWizard({});
    const p = last();
    const nameInput = p.querySelectorAll('input[type="text"], input:not([type])')[0];
    if (nameInput) { nameInput.value = 'Bản nhập'; nameInput.dispatch('input'); }
    const next = [...p.querySelectorAll('.kg-btn')].find((b) => text(b).includes('Tiếp: đối chiếu'));
    next.click();
    assert(text(last()).includes('Bước 1/3'), 'phải VẪN ở bước 1');
    assert(text(body()).includes('Chưa chọn file'), 'phải báo cho user biết vì sao chưa đi tiếp');
    m.close();
  });
  it('bước 2 hiện bảng thêm/ghi đè/bỏ qua với số liệu từ /api/import/preview', async () => {
    closeAll();
    agent.configure({
      location: { protocol: 'https:', hostname: 'kitgen.pages.dev', pathname: '/', origin: 'https://kitgen.pages.dev' },
      baseUrl: 'http://127.0.0.1:8765',
      fetchImpl: mockFetch(({ url }) => {
        if (url.includes('/api/import/preview')) {
          return jsonResponse({
            report: {
              sheets: 12, components: 78, variants: 3, poses: 0, unknownComponents: 73,
              duplicateSheetIds: ['pose-soc'],
              willCreate: { sheets: 12, components: 78, variants: 3, raw: 8, kits: 96 },
              warnings: [{ code: 'UNKNOWN_COMPONENTS', message: '73/78 element không có trong thư viện chuẩn — GIỮ NGUYÊN như trong file', items: [] }],
            },
          });
        }
        return jsonResponse({ ok: true });
      }),
    });
    const m = openImportWizard({ presetName: 'styles-campaign (nhập)' });
    // giả lập đã chọn file: đặt uploadId qua đường công khai duy nhất là chạy lại bước 2
    const p0 = last();
    const nameInput = p0.querySelectorAll('input')[0];
    nameInput.value = 'styles-campaign (nhập)';
    nameInput.dispatch('input');
    // chọn nguồn "Thư mục có sẵn" để không cần upload
    const radios = [...p0.querySelectorAll('input[type="radio"]')];
    radios[2].checked = true;
    radios[2].dispatch('change');
    const folder = [...last().querySelectorAll('input')].find((i) => i.getAttribute('class')?.includes('mono') || i.className.includes('mono'));
    if (folder) { folder.value = 'candy-old-11b2'; folder.dispatch('input'); }
    const next2 = [...last().querySelectorAll('.kg-btn')].find((b) => text(b).includes('Tiếp: đối chiếu'));
    next2.click();
    await new Promise((r) => setTimeout(r, 30));
    const t = text(last());
    assert(t.includes('Bước 2/3'), t.slice(0, 200));
    assert(t.includes('12 sheet') && t.includes('78 element'), 'phải hiện đúng 12/78 (mốc T6 của §8.1)');
    assert(t.includes('Thêm mới') && t.includes('Không ghi đè'), 'bảng phải nói rõ thêm/ghi đè/bỏ qua');
    assert(t.includes('GIỮ NGUYÊN'), 'phải nêu cảnh báo 73 element lạ được giữ nguyên');
    assert(t.includes('sheet trùng mã'), 'phải nêu sheet trùng id');
    m.close();
  });
});

describe('§4.7 · modal Xuất .zip', () => {
  it('bản thiết kế luôn xuất + hiện tên file kitgen-<slug>-<ngày>.zip', () => {
    closeAll();
    const m = openExportModal({ project: P });
    const t = text(last());
    assert(/kitgen-tet26-\d{8}\.zip/.test(t), t.slice(0, 300));
    assert(t.includes('luôn xuất'));
    assert(t.includes('thả vào máy khác là chạy được'));
    m.close();
  });
  it('agent chưa chạy → nút tải disabled kèm lý do', () => {
    closeAll();
    const m = openExportModal({ project: P, readOnly: true, reason: 'Cần công cụ local đang chạy' });
    const btn = [...last().querySelectorAll('.kg-btn')].find((b) => text(b).includes('Tải .zip'));
    eq(btn.disabled, true);
    assert(String(btn.title).includes('công cụ local'));
    m.close();
  });
});
