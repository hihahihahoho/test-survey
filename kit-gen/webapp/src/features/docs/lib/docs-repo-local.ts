/**
 * features/docs/lib/docs-repo-local.ts — BẢN `local` của `DocsRepo` (IndexedDB, nháp trên máy).
 *
 * ĐÂY LÀ MOCK, VÀ NÓ PHẢI TỰ NHẬN LÀ MOCK: `kind = "local"` ⇒ UI hiện badge «bản nháp cục bộ»
 * (FE-PLAN Q3). Người dùng phải biết file con **chưa** nằm trong project trên đĩa.
 *
 * BỐN QUY TẮC HÀNH VI, mỗi cái có lý do đo được:
 *
 * 1. **Bản ghi hỏng schema ⇒ BỎ QUA khi liệt kê, báo `DOC_BROKEN` khi mở.** Không ném ở `list`:
 *    một bản ghi rác của phiên bản cũ sẽ giết cả thanh tab, mất luôn những file còn tốt.
 *    (Cùng luật với `safety/drafts.ts`: "Parse hỏng ⇒ coi như không có nháp, KHÔNG ném ra màn".)
 *
 * 2. **Hết chỗ ⇒ `STORAGE_FULL`, KHÔNG im lặng.** `docsIdbSet` đã dọn + thử lại 1 lần rồi mới
 *    trả `false`. Nuốt lỗi ở đây = user gõ cả buổi rồi mất trắng mà không ai báo — đúng thứ
 *    mà bài học C-01 (qa-func) cấm: không được đoán hộ, phải đọc kết quả thật.
 *
 * 3. **Xoá là XOÁ MỀM.** `remove` chỉ đặt `trashedAt` ⇒ có đường lùi cho "Hoàn tác 10s" và
 *    thùng rác 30 ngày (§4.4). Xoá file con **không bao giờ** đụng sheet/ảnh/kit: repo này
 *    không có một hàm nào chạm tới contract hay artifact — kiểm được bằng `grep`.
 *
 * 4. **Ghi canvas theo `expectedVersion`** (= `If-Match` của #49). Lệch ⇒ `DOC_CONFLICT`,
 *    không đè. Mock mà bỏ luật này thì FE-2/FE-3 sẽ viết UI không có nhánh xung đột, và khi
 *    nối backend thật sẽ phải sửa lại đúng chỗ khó nhất.
 */
import { DocsRepoError } from "./docs-errors";
import {
  docKey,
  docsIdbAvailable,
  docsIdbDel,
  docsIdbGet,
  docsIdbKeys,
  docsIdbSet,
  keyPrefix,
} from "./docs-idb";
import type { CreateDocInput, DocsRepo, LoadedCanvas, SaveResult } from "./docs-repo";
import {
  canvasDocSchema,
  docNameSchema,
  docRecordSchema,
  duplicateName,
  isVirtualDoc,
  makeDocId,
  type CanvasDoc,
  type Doc,
  type DocColor,
  type DocRecord,
  type DocView,
} from "./types";

/** Thùng rác giữ 30 ngày (§4.4, dùng lại mô hình UX-SPEC §4.4). */
export const TRASH_KEEP_DAYS = 30;
const DAY_MS = 86_400_000;

const nowIso = () => new Date().toISOString();

async function requireAvailable(): Promise<void> {
  if (!docsIdbAvailable()) throw new DocsRepoError("STORAGE_UNAVAILABLE", "indexedDB không dùng được");
}

/** Đọc 1 bản ghi. `null` = không có; `"broken"` = có nhưng lệch schema. */
async function readRecord(projectId: string, docId: string): Promise<DocRecord | null | "broken"> {
  const raw = await docsIdbGet<unknown>(docKey(projectId, docId));
  if (raw === null || raw === undefined) return null;
  const parsed = docRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : "broken";
}

async function writeRecord(projectId: string, rec: DocRecord): Promise<void> {
  const ok = await docsIdbSet(docKey(projectId, rec.doc.id), rec);
  if (!ok) throw new DocsRepoError("STORAGE_FULL", "docsIdbSet trả false sau khi dọn + thử lại");
}

async function readAll(projectId: string): Promise<DocRecord[]> {
  const keys = await docsIdbKeys(keyPrefix(projectId));
  const out: DocRecord[] = [];
  for (const k of keys) {
    const raw = await docsIdbGet<unknown>(k);
    const parsed = docRecordSchema.safeParse(raw);
    if (parsed.success) out.push(parsed.data); // quy tắc 1: bản hỏng bị bỏ qua, không ném
  }
  out.sort((a, b) => a.doc.createdAt.localeCompare(b.doc.createdAt) || a.doc.id.localeCompare(b.doc.id));
  return out;
}

function assertWritable(docId: string): void {
  if (isVirtualDoc(docId)) throw new DocsRepoError("DOC_READONLY", `${docId} là file hệ thống`);
}

function cleanName(name: string): string {
  const parsed = docNameSchema.safeParse(name);
  if (!parsed.success) throw new DocsRepoError("INVALID_NAME", parsed.error.issues[0]?.message);
  return parsed.data;
}

/** Tên không trùng TRONG project (§4.4), bỏ qua chính nó và bỏ qua file trong thùng rác. */
function assertNameFree(records: readonly DocRecord[], name: string, selfId?: string): void {
  const taken = records.some(
    (r) => !r.doc.trashedAt && r.doc.id !== selfId && r.doc.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw new DocsRepoError("DOC_NAME_TAKEN", "trùng tên trong project");
}

async function mustGet(projectId: string, docId: string): Promise<DocRecord> {
  const rec = await readRecord(projectId, docId);
  if (rec === null) throw new DocsRepoError("DOC_NOT_FOUND", docId);
  if (rec === "broken") throw new DocsRepoError("DOC_BROKEN", `bản ghi ${docId} lệch schema`);
  return rec;
}

async function patchDoc(projectId: string, docId: string, patch: Partial<Doc>): Promise<Doc> {
  assertWritable(docId);
  await requireAvailable();
  const rec = await mustGet(projectId, docId);
  const next: DocRecord = { ...rec, doc: { ...rec.doc, ...patch, updatedAt: nowIso() } };
  await writeRecord(projectId, next);
  return next.doc;
}

export const localDocsRepo: DocsRepo = {
  kind: "local",

  async available() {
    return docsIdbAvailable();
  },

  async list(projectId, opts) {
    if (!docsIdbAvailable()) return []; // quy tắc: mất chỗ lưu ⇒ rỗng, KHÔNG trắng trang
    const all = await readAll(projectId);
    return all.map((r) => r.doc).filter((d) => (opts?.includeTrashed ? true : !d.trashedAt));
  },

  async create(projectId, input: CreateDocInput) {
    await requireAvailable();
    const records = await readAll(projectId);
    const name = cleanName(input.name);
    assertNameFree(records, name);
    const id = makeDocId(name, records.map((r) => r.doc.id));
    const ts = nowIso();

    let view: DocView | undefined = input.view;
    let canvas: CanvasDoc | null = input.kind === "canvas" ? { nodes: [], viewport: { x: 0, y: 0, k: 1 } } : null;

    if (input.fromDocId) {
      const src = await mustGet(projectId, input.fromDocId);
      // §4.4: nhân bản node + bộ lọc. KHÔNG nhân bản contract, KHÔNG copy ảnh.
      view = src.doc.view ? { ...src.doc.view, sheetIds: [...src.doc.view.sheetIds], variantIds: [...src.doc.view.variantIds] } : view;
      canvas = src.canvas ? canvasDocSchema.parse(structuredClone(src.canvas)) : canvas;
    }

    const doc: Doc = {
      id,
      name,
      kind: input.kind,
      createdAt: ts,
      updatedAt: ts,
      color: "none",
      ...(view ? { view } : {}),
      trashedAt: null,
    };
    await writeRecord(projectId, { doc, version: 0, canvas });
    return doc;
  },

  async rename(projectId, docId, name) {
    assertWritable(docId);
    await requireAvailable();
    const clean = cleanName(name);
    assertNameFree(await readAll(projectId), clean, docId);
    return patchDoc(projectId, docId, { name: clean });
  },

  async setColor(projectId, docId, color: DocColor) {
    return patchDoc(projectId, docId, { color });
  },

  async setView(projectId, docId, view: DocView) {
    return patchDoc(projectId, docId, { view });
  },

  async duplicate(projectId, docId) {
    await requireAvailable();
    const src = await mustGet(projectId, docId);
    const records = await readAll(projectId);
    const name = duplicateName(src.doc.name, records.filter((r) => !r.doc.trashedAt).map((r) => r.doc.name));
    return localDocsRepo.create(projectId, { name, kind: src.doc.kind, fromDocId: docId });
  },

  /** Xoá MỀM. Không đụng sheet/ảnh — câu xác nhận ở UI phải nói đúng điều đó (§4.4). */
  async remove(projectId, docId) {
    assertWritable(docId);
    await requireAvailable();
    const rec = await mustGet(projectId, docId);
    const trashedAt = nowIso();
    await writeRecord(projectId, { ...rec, doc: { ...rec.doc, trashedAt, updatedAt: trashedAt } });
    return { trashedAt };
  },

  /** Đường lùi của "Hoàn tác 10s" và của Thùng rác. Tên bị chiếm mất ⇒ báo, không đè. */
  async restore(projectId, docId) {
    assertWritable(docId);
    await requireAvailable();
    const rec = await mustGet(projectId, docId);
    assertNameFree(await readAll(projectId), rec.doc.name, docId);
    const ts = nowIso();
    const doc: Doc = { ...rec.doc, trashedAt: null, updatedAt: ts };
    await writeRecord(projectId, { ...rec, doc });
    return doc;
  },

  async purgeExpired(projectId, now = new Date()) {
    if (!docsIdbAvailable()) return 0;
    const all = await readAll(projectId);
    let n = 0;
    for (const r of all) {
      if (!r.doc.trashedAt) continue;
      const t = Date.parse(r.doc.trashedAt);
      if (!Number.isFinite(t)) continue;
      if (now.getTime() - t > TRASH_KEEP_DAYS * DAY_MS) {
        await docsIdbDel(docKey(projectId, r.doc.id));
        n++;
      }
    }
    return n;
  },

  async load(projectId, docId): Promise<LoadedCanvas> {
    await requireAvailable();
    const rec = await mustGet(projectId, docId);
    const parsed = canvasDocSchema.safeParse(rec.canvas ?? { nodes: [], viewport: { x: 0, y: 0, k: 1 } });
    if (!parsed.success) throw new DocsRepoError("DOC_BROKEN", `canvas ${docId} lệch schema`);
    return { canvas: parsed.data, version: rec.version };
  },

  async save(projectId, docId, canvas, expectedVersion): Promise<SaveResult> {
    assertWritable(docId);
    await requireAvailable();
    const rec = await mustGet(projectId, docId);
    if (rec.version !== expectedVersion) {
      throw new DocsRepoError("DOC_CONFLICT", `serverVersion=${rec.version}, If-Match=${expectedVersion}`);
    }
    const parsed = canvasDocSchema.safeParse(canvas);
    if (!parsed.success) throw new DocsRepoError("DOC_BROKEN", parsed.error.issues[0]?.message);
    const version = rec.version + 1;
    const ts = nowIso();
    await writeRecord(projectId, {
      doc: { ...rec.doc, updatedAt: ts },
      version,
      canvas: parsed.data,
    });
    return { version, bytes: JSON.stringify(parsed.data).length };
  },
};
