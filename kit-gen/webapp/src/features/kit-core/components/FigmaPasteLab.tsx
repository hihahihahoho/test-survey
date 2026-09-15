import * as React from "react";
import { FlaskConical, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { figmaLabOn } from "../lib/figma-lab";
import {
  ANALYSIS_MAX_BYTES,
  analysisToJson,
  analyzeFigmaClipboardHtml,
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

/** Tóm tắt NGẮN, đọc được bằng mắt — phần đầy đủ nằm trong JSON bên dưới. */
function Summary({ a }: { a: FigAnalysis }): React.JSX.Element {
  const chunkNote = a.chunks.map((c) => `#${c.index} ${c.packedBytes}→${c.unpackedBytes} (${c.method})`).join(" · ");
  const blobNote = a.message === null || a.message.blobs.length === 0
    ? "không có"
    : a.message.blobs.map((b) => `#${b.index} ${b.kind} ${b.bytes}B`).join(" · ");
  return (
    <div className="text-caption">
      <Row k="Kiểu trong bộ nhớ tạm" v={a.clipboardTypes.join(", ") || "—"} />
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
}

const EMPTY: LabState = { analysis: null, json: "", truncated: false, note: "" };

export function FigmaPasteLab(): React.JSX.Element | null {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [state, setState] = React.useState<LabState>(EMPTY);
  const [copied, setCopied] = React.useState(false);

  /* Bảng mở ⇒ nghe dán ở cấp tài liệu; bảng đóng ⇒ gỡ. Xem khối chú thích đầu file. */
  React.useEffect(() => {
    if (!open) return undefined;
    const onPaste = (ev: ClipboardEvent) => {
      const data = ev.clipboardData;
      if (data === null) return;
      ev.preventDefault();
      const types = [...data.types];
      const html = data.getData("text/html");
      if (html === "") {
        setState({
          ...EMPTY,
          note: `Bộ nhớ tạm không có phần HTML. Nó chào ra: ${types.join(", ") || "không gì cả"}.`,
        });
        return;
      }
      setBusy(true);
      setCopied(false);
      void analyzeFigmaClipboardHtml(html, types)
        .then((analysis) => {
          const out = analysisToJson(analysis);
          setState({ analysis, json: out.text, truncated: out.truncated, note: "" });
        })
        .catch((err: unknown) => {
          setState({ ...EMPTY, note: err instanceof Error ? err.message : String(err) });
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

  const copyJson = () => {
    void navigator.clipboard.writeText(state.json).then(() => setCopied(true));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas p-4" aria-label="Bàn mổ lượt dán từ Figma">
      <div className="flex items-center justify-between gap-2 pb-3">
        <h2 className="text-title text-fg-strong">Dán từ Figma vào đây</h2>
        <div className="flex items-center gap-2">
          <Button
            type="button" variant="secondary" size="sm" onClick={copyJson}
            disabled={state.json === ""}
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

      {state.analysis !== null && (
        <div className="min-h-0 flex-1 overflow-auto pt-3">
          <Summary a={state.analysis} />
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
  );
}
