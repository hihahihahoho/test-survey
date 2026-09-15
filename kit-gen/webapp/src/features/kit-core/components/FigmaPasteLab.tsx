import * as React from "react";
import { FlaskConical, Copy, ClipboardList, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { figmaLabOn } from "../lib/figma-lab";
import {
  ANALYSIS_MAX_BYTES,
  HTML_HEAD_CHARS,
  analysisToJson,
  analyzeFigmaClipboardHtml,
  type ClipboardEntry,
  type FigAnalysis,
} from "../lib/fig-kiwi";

/**
 * FigmaPasteLab — BÀN MỔ MỘT CHIỀU: dán **từ Figma vào đây**, rồi đọc ra sự thật.
 *
 * ╔══ NÓ TRẢ LỜI CÁI GÌ ══════════════════════════════════════════════════════╗
 * ║ Chín cách viết CSS đã đo xong và cả chín đều ra Left/Top (`figma-lab.ts`). ║
 * ║ Nên hướng còn lại là dùng CHÍNH cái người dùng copy từ Figma làm KHUÔN.    ║
 * ║ Trước khi mã hoá lại được cái khuôn ấy thì phải đọc được nó đã, và ba câu  ║
 * ║ dưới đây chưa ai ở đây có số đo:                                          ║
 * ║   ① khối nhị phân mở ra được bằng thứ có sẵn trong trình duyệt không?      ║
 * ║   ② tên THẬT của trường ràng buộc / khoá tỉ lệ / cách trải ảnh là gì?      ║
 * ║   ③ ẢNH nằm trong payload, hay chỉ là một mã băm trỏ về máy chủ Figma?     ║
 * ║ Bấm «Copy JSON» rồi gửi về là đủ để trả lời cả ba — không cần cài gì.      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ LƯỢT DÁN THẬT ĐẦU TIÊN KHÔNG CÓ MỐC NÀO (15/09/2026) ═══════════════════╗
 * ║ Kết quả về tay: `text/html`, 46 203 ký tự, không `(figmeta)`, không        ║
 * ║ `(figma)`. Bàn mổ cũ dừng ở đúng một câu «không đến từ Figma» — mà câu ấy  ║
 * ║ đúng với bốn nguyên nhân khác hẳn nhau, nên nó không chẩn ra gì cả.       ║
 * ║ Nay bàn mổ mở thêm BA CỬA, và cả ba đều là ĐO chứ không phải đoán:        ║
 * ║   ① thiếu mốc ⇒ đo chính chuỗi HTML đó (`diagnoseHtml`): 2 000 ký tự đầu, ║
 * ║      đếm thẻ, tên `data-*`, chỗ có chữ «figma», dạng ảnh, số chú thích.   ║
 * ║   ② kê CẢ BẢNG bộ nhớ tạm: từng kiểu dài bao nhiêu, có tệp đính kèm nào.  ║
 * ║   ③ đọc bằng `navigator.clipboard.read()` để SO với đường sự kiện dán —   ║
 * ║      hai đường này lọc khác nhau, và chênh lệch chính là câu trả lời.     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌── VÌ SAO NGHE Ở `document` CHỨ KHÔNG PHẢI Ở CÁI Ô ───────────────────────┐
 * │ Sự kiện dán chỉ bắn vào phần tử ĐANG có con trỏ, mà một hộp không sửa     │
 * │ được thì nhiều trình duyệt không cho nó nhận con trỏ. Nghe ở `document`   │
 * │ trong lúc bảng mở ⇒ dán ở đâu trong bảng cũng ăn. Bảng đóng thì gỡ tay    │
 * │ nghe ra ngay: một bàn thí nghiệm rình mọi cú dán của cả app là một cái    │
 * │ bẫy để lại cho người sau.                                                │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * CHỈ CÓ Ở BẢN DEV — cùng cổng `figmaLabOn()` với nút thí nghiệm bên panel tấm
 * (bản đã build mở kèm `?lab=figma`). Người dùng cuối không bao giờ thấy nó.
 * Nó KHÔNG đụng một byte nào của đường copy thật: cả bàn này chỉ ĐỌC.
 */

/** Một dòng «tên: giá trị» của bảng tóm tắt. */
function Row({ k, v }: { k: string; v: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex gap-2 border-b border-line-subtle py-1 last:border-b-0">
      <span className="w-52 shrink-0 text-fg-muted">{k}</span>
      <span className="min-w-0 break-words text-fg-strong">{v}</span>
    </div>
  );
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `{a: 3, b: 1}` → `"a×3 · b×1"`, cắt sau `cap` mục để bảng còn đọc được bằng mắt. */
function tally(rec: Record<string, number>, cap = 10): string {
  const all = Object.entries(rec);
  if (all.length === 0) return "—";
  const head = all.slice(0, cap).map(([k, n]) => `${k}×${n}`).join(" · ");
  return all.length > cap ? `${head} · +${all.length - cap}` : head;
}

/* ══════════════════════════════════════════════════════════════════════════
   ĐỌC BẢNG KÊ BỘ NHỚ TẠM — HAI ĐƯỜNG, VÌ CHÚNG LỌC KHÁC NHAU
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Đường ① — từ chính sự kiện dán. `getData` chỉ trả về chuỗi, nên tệp đính kèm
 * (ảnh PNG chẳng hạn) KHÔNG bao giờ hiện ra ở đó; chúng phải đếm riêng qua
 * `items`, và đó đúng là chỗ một lượt «Copy as PNG» sẽ lộ mặt.
 */
export function readClipboardDetail(data: DataTransfer): ClipboardEntry[] {
  const out: ClipboardEntry[] = [];
  for (const type of [...data.types]) {
    try {
      out.push({ type, kind: "chuoi", chars: data.getData(type).length });
    } catch (err) {
      out.push({ type, kind: "chuoi", chars: null, note: errText(err) });
    }
  }
  for (const item of [...data.items]) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    out.push({
      type: item.type === "" ? "?" : item.type,
      kind: "file",
      chars: null,
      fileName: file?.name ?? "?",
      bytes: file?.size ?? 0,
    });
  }
  return out;
}

interface DirectType {
  type: string;
  bytes: number | null;
  note?: string;
}

interface DirectRead {
  items: { index: number; types: DirectType[] }[];
  error: string | null;
}

/**
 * Đường ② — `navigator.clipboard.read()`. Nó CẦN cử chỉ người dùng và cần quyền,
 * nên phải treo sau một cái nút chứ không chạy lúc mở bảng. Bị từ chối thì ghi
 * thẳng câu từ chối ra: «không đọc được» mà không nói vì sao là một ngõ cụt.
 */
async function readDirectClipboard(): Promise<DirectRead> {
  const api = navigator.clipboard as Clipboard | undefined;
  if (api === undefined || typeof api.read !== "function") {
    return { items: [], error: "Trình duyệt này không có navigator.clipboard.read()." };
  }
  let items: ClipboardItems;
  try {
    items = await api.read();
  } catch (err) {
    return { items: [], error: `Bị từ chối hoặc hỏng: ${errText(err)}` };
  }
  const rows: DirectRead["items"] = [];
  for (const [index, item] of [...items].entries()) {
    const types: DirectType[] = [];
    for (const type of item.types) {
      try {
        const blob = await item.getType(type);
        types.push({ type, bytes: blob.size });
      } catch (err) {
        types.push({ type, bytes: null, note: errText(err) });
      }
    }
    rows.push({ index, types });
  }
  return { items: rows, error: null };
}

/* ══════════════════════════════════════════════════════════════════════════
   BẢNG TÓM TẮT
   ══════════════════════════════════════════════════════════════════════════ */

/** Tóm tắt NGẮN, đọc được bằng mắt — phần đầy đủ nằm trong JSON bên dưới. */
function Summary({ a }: { a: FigAnalysis }): React.JSX.Element {
  const chunkNote = a.chunks.map((c) => `#${c.index} ${c.packedBytes}→${c.unpackedBytes} (${c.method})`).join(" · ");
  const blobNote = a.message === null || a.message.blobs.length === 0
    ? "không có"
    : a.message.blobs.map((b) => `#${b.index} ${b.kind} ${b.bytes}B`).join(" · ");
  const detailNote = a.clipboardDetail
    .map((d) => (d.kind === "file" ? `${d.type} (tệp «${d.fileName ?? "?"}» ${d.bytes ?? 0}B)` : `${d.type} ${d.chars ?? "?"} ký tự`))
    .join(" · ");
  const d = a.htmlDiag;
  return (
    <div className="text-caption">
      <Row k="Kiểu trong bộ nhớ tạm" v={a.clipboardTypes.join(", ") || "—"} />
      <Row k="Từng kiểu chở bao nhiêu" v={detailNote || "—"} />
      <Row k="Số ký tự HTML" v={String(a.htmlChars)} />
      <Row
        k="Vỏ nhị phân"
        v={a.container === null ? "chưa mở được" : `${a.container.magic} · bản ${a.container.version} · ${a.container.chunkCount} khối`}
      />
      <Row k="Các khối" v={chunkNote || "—"} />
      <Row
        k="Lược đồ"
        v={a.schema === null ? "chưa đọc được" : `${a.schema.definitionCount} định nghĩa · gốc «${a.schema.rootMessage ?? "?"}»`}
      />
      <Row
        k="Số node đổi"
        v={a.message === null ? "chưa đọc được" : `${a.message.nodeCount} (khoá «${a.message.nodeChangesKey ?? "?"}»)`}
      />
      <Row k="Phần đính kèm" v={blobNote} />
      <Row
        k="Byte thừa sau khi đọc"
        v={a.message === null ? "—" : String(a.message.bytesLeft)}
      />
      {d !== null && (
        <>
          <Row
            k="Mốc tìm được (mọi dạng)"
            v={d.markerForms.length === 0
              ? "không dạng nào — kể cả dạng bị escape hay có khoảng trắng"
              : d.markerForms.map((m) => `${m.form} @${m.index}`).join(" · ")}
          />
          <Row k="Đếm thẻ" v={tally(d.tagCounts)} />
          <Row k="Thuộc tính data-*" v={d.dataAttrs.slice(0, 12).join(", ") || "không có"} />
          <Row
            k="Chữ «figma» trong HTML"
            v={d.hasFigmaWord === null ? "không có ở đâu cả" : `tại ký tự ${d.hasFigmaWord.index}`}
          />
          <Row k="Nguồn ảnh" v={tally(d.imgSrcKinds)} />
          <Row k="Số lần mở chú thích" v={String(d.commentCount)} />
        </>
      )}
      {a.errors.length > 0 && (
        <Row k="Chỗ chưa xong" v={<span className="text-warn">{a.errors.join(" | ")}</span>} />
      )}
    </div>
  );
}

interface LabState {
  analysis: FigAnalysis | null;
  json: string;
  truncated: boolean;
  note: string;
  /** HTML đầu, NGUYÊN VĂN. Bản trong `analysis` đã escape để chở đi; bản này để
      mắt người đọc thấy đúng cái thẻ thật, không phải `&lt;div&gt;`. */
  head: string;
}

const EMPTY: LabState = { analysis: null, json: "", truncated: false, note: "", head: "" };

export function FigmaPasteLab(): React.JSX.Element | null {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [state, setState] = React.useState<LabState>(EMPTY);
  const [direct, setDirect] = React.useState<DirectRead | null>(null);
  const [copied, setCopied] = React.useState(false);

  /* Bảng mở ⇒ nghe dán ở cấp tài liệu; bảng đóng ⇒ gỡ. Xem khối chú thích đầu file. */
  React.useEffect(() => {
    if (!open) return undefined;
    const onPaste = (ev: ClipboardEvent) => {
      const data = ev.clipboardData;
      if (data === null) return;
      ev.preventDefault();
      const types = [...data.types];
      const detail = readClipboardDetail(data);
      const html = data.getData("text/html");
      setBusy(true);
      setCopied(false);
      /* KHÔNG dừng lại khi thiếu HTML: bảng kê bộ nhớ tạm vẫn là câu trả lời —
         nó nói ra lượt copy ấy chở cái gì thay cho HTML. */
      const note = html === ""
        ? `Bộ nhớ tạm không có phần HTML. Nó chào ra: ${types.join(", ") || "không gì cả"}.`
        : "";
      void analyzeFigmaClipboardHtml(html, types, detail)
        .then((analysis) => {
          const out = analysisToJson(analysis);
          setState({ analysis, json: out.text, truncated: out.truncated, note, head: html.slice(0, HTML_HEAD_CHARS) });
        })
        .catch((err: unknown) => {
          setState({ ...EMPTY, note: errText(err) });
        })
        .finally(() => setBusy(false));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [open]);

  if (!figmaLabOn()) return null;

  if (!open) {
    return (
      <div className="fixed bottom-3 left-3 z-50">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <FlaskConical aria-hidden strokeWidth={1.5} />
          Dán từ Figma vào đây
        </Button>
      </div>
    );
  }

  const directJson = direct === null ? "" : JSON.stringify({ navigatorClipboardRead: direct }, null, 2);

  const copyJson = () => {
    const text = directJson === "" ? state.json : `${state.json}\n\n${directJson}`;
    void navigator.clipboard.writeText(text).then(() => setCopied(true));
  };

  const readDirect = () => {
    setDirect(null);
    void readDirectClipboard().then(setDirect);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas p-4" aria-label="Bàn mổ lượt dán từ Figma">
      <div className="flex items-center justify-between gap-2 pb-3">
        <h2 className="text-title text-fg-strong">Dán từ Figma vào đây</h2>
        <div className="flex items-center gap-2">
          <Button
            type="button" variant="secondary" size="sm" onClick={readDirect}
            title="Đọc thẳng bộ nhớ tạm bằng navigator.clipboard.read() để so với đường sự kiện dán."
          >
            <ClipboardList aria-hidden strokeWidth={1.5} />
            Đọc clipboard trực tiếp
          </Button>
          <Button
            type="button" variant="secondary" size="sm" onClick={copyJson}
            disabled={state.json === "" && directJson === ""}
            title="Chép toàn bộ bản phân tích ra bộ nhớ tạm để gửi đi."
          >
            <Copy aria-hidden strokeWidth={1.5} />
            {copied ? "Đã chép JSON" : "Copy JSON phân tích"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            <X aria-hidden strokeWidth={1.5} />
            Đóng
          </Button>
        </div>
      </div>

      {/* Ô ĐÍCH: không sửa được, chỉ để mắt biết dán vào đâu. Cú dán thật do
          `document` bắt, nên bấm vào đâu trong bảng rồi dán cũng ăn. */}
      <div className="rounded-4 border border-dashed border-line bg-surface p-4 text-center text-body text-fg-muted">
        {busy
          ? "Đang mổ…"
          : "Chọn khung trong Figma · Cmd/Ctrl+C · rồi bấm Cmd/Ctrl+V ở đây."}
      </div>

      {state.note !== "" && (
        <p className="pt-3 text-body text-warn">{state.note}</p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {direct !== null && (
          <div className="pt-3">
            <p className="text-caption text-fg-muted">
              {direct.error === null
                ? `navigator.clipboard.read(): ${direct.items.length} mục.`
                : `navigator.clipboard.read() không xong: ${direct.error}`}
            </p>
            <pre className="mt-2 whitespace-pre-wrap break-all rounded-1 border border-line-subtle bg-surface p-3 text-mono text-fg">
              {directJson}
            </pre>
          </div>
        )}

        {state.analysis !== null && (
          <div className="pt-3">
            <Summary a={state.analysis} />
            {state.head !== "" && (
              <>
                <p className="pt-3 text-caption text-fg-muted">
                  {HTML_HEAD_CHARS} ký tự đầu của HTML, nguyên văn (bản trong JSON đã escape):
                </p>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-1 border border-line-subtle bg-surface p-3 text-mono text-fg">
                  {state.head}
                </pre>
              </>
            )}
            <p className="pt-3 text-caption text-fg-muted">
              {state.truncated
                ? `Bản JSON đã bị cắt cho vừa trần ${ANALYSIS_MAX_BYTES} byte — chỗ bị cắt có ghi cờ «daCat».`
                : "Bản JSON đầy đủ, không cắt chỗ nào."}
            </p>
            <pre className="mt-2 whitespace-pre-wrap break-all rounded-1 border border-line-subtle bg-surface p-3 text-mono text-fg">
              {state.json}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
