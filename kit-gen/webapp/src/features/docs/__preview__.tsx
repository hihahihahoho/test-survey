import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { FileTabsBar, CreateFileDialog, DeleteFileDialog, TrashPopover } from "./components/subfiles";
import { buildTabs } from "./lib/subfile-model";
import { docSchema, type Doc, type DraftBadge } from "./lib";
import type { FileTabsModel } from "./hooks";

/**
 * STORY ĐỘC LẬP của tầng file con (FE2-PLAN §3-C3: `features/docs/__preview__.tsx`).
 * **KHÔNG sửa `routes/__preview.tsx`** — Q là chủ trang preview tổng và sẽ ghép
 * `<SubfilePreview />` vào sau khi C bàn giao. Đây là lý do story nằm trong feature.
 *
 * Story dùng dữ liệu DỰNG SẴN (không repo, không query) để mỗi trạng thái hiện ra
 * tất định — kể cả những trạng thái khó dựng thật (quá hạn 20s, kho lưu bị chặn).
 * Runtime của app vẫn đi qua `useFileTabs → docsRepo`, story không thay thế đường đó.
 *
 * C1 dựng khung 7 ca; **C2 thêm** 3 ca của CRUD (dialog tạo, dialog xoá, thùng rác)
 * dưới dạng `SubfileCrudPreview` — vẫn KHÔNG chạm `routes/__preview.tsx` (Q là chủ).
 */
const SHEETS = ["main", "main2", "pose-lan"];

const D = (id: string, name: string, over: Partial<Doc> = {}): Doc =>
  docSchema.parse({
    id, name, kind: "workflow", createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z", color: "none", trashedAt: null, ...over,
  });

const LOCAL: DraftBadge = {
  level: "info", label: "bản nháp cục bộ", tone: "muted",
  explain: "File này đang được lưu trên máy bạn, chưa nằm trong thư mục dự án.",
};
const NO_STORAGE: DraftBadge = {
  level: "warn", label: "không lưu được", tone: "amber",
  explain: "Trình duyệt đang không cho lưu trên máy này, nên thay đổi của bạn sẽ mất khi đóng tab.",
};

function m(docs: Doc[], over: Partial<FileTabsModel> = {}, dirtyIds: string[] = []): FileTabsModel {
  const tabs = buildTabs({ docs, contractSheetIds: SHEETS, dirtyIds });
  return {
    phase: "ready", tabs, activeId: tabs[0]!.id, activeFallback: false,
    errorTitle: "", refetch: () => {}, badge: LOCAL, ...over,
  };
}

const ONE = [D("f-bo-kit-chinh", "Bộ kit chính")];
const THREE = [
  D("f-bo-kit-chinh", "Bộ kit chính", { view: { sheetIds: ["main", "main2"], variantIds: [] } }),
  D("f-y-tuong-tet", "Ý tưởng Tết", { kind: "canvas", color: "mint" }),
  D("f-nhan-vat-lan", "Nhân vật Lan", { kind: "canvas" }),
];
const NINE = Array.from({ length: 9 }, (_, i) =>
  D(`f-file-${i + 1}`, `File thứ ${i + 1}`, { kind: i % 2 ? "canvas" : "workflow" }),
);

function Case({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-label text-fg-strong">{title}</h3>
        {note && <p className="text-caption text-fg-muted-raised">{note}</p>}
      </div>
      <div className="rounded-3 border border-line-subtle bg-canvas">{children}</div>
    </section>
  );
}

/** Ghép vào trang preview tổng bằng: `import { SubfilePreview } from "@/features/docs/__preview__"`. */
export function SubfilePreview() {
  const [active, setActive] = React.useState("f-y-tuong-tet");
  const noop = () => {};
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-8 p-6">
        <Case title="1 file — thanh tab tối giản" note="Tab «Tất cả sheet» luôn có mặt, kể cả khi chỉ có một file thật.">
          <FileTabsBar model={m(ONE)} onActivate={noop} onCreate={noop} />
        </Case>

        <Case title="3 file — có nhãn màu và chấm «chưa lưu»" note="Chấm chỉ là phụ hoạ; thông tin nằm trong aria-label bằng chữ.">
          <FileTabsBar
            model={m(THREE, { activeId: active }, ["f-y-tuong-tet"])}
            onActivate={setActive}
            onCreate={noop}
          />
        </Case>

        <Case title="9 file + tab ảo — thu gọn" note="Quá 8 tab: phần dư vào menu `»`, tab đang mở luôn còn trên thanh.">
          <FileTabsBar model={m(NINE, { activeId: "f-file-9" })} onActivate={noop} onCreate={noop} />
        </Case>

        <Case title="Chưa có file con" note="Không trắng trang: vẫn có đường an toàn + lời mời tạo file.">
          <FileTabsBar model={m([])} onActivate={noop} onCreate={noop} />
        </Case>

        <Case title="Đang tải / quá hạn 20 giây">
          <FileTabsBar model={m(THREE, { phase: "loading" })} onActivate={noop} />
          <FileTabsBar model={m(THREE, { phase: "timeout" })} onActivate={noop} />
        </Case>

        <Case title="Lỗi kho lưu + bản ghi hỏng" note="Câu đời thường ở thân UI; mã lỗi nằm trong «Chi tiết cho lập trình viên».">
          <FileTabsBar
            model={m(THREE, {
              phase: "error",
              badge: NO_STORAGE,
              errorTitle: "Nội dung file lưu trên máy bị hỏng nên không mở được. Bản gốc trong dự án không bị ảnh hưởng.",
              errorDetail: "DOC_BROKEN: bản ghi f-y-tuong-tet lệch schema",
            })}
            onActivate={noop}
          />
        </Case>

        <Case title="Công cụ trên máy chưa chạy" note="File con nằm trên máy nên tab vẫn dùng được — nói ra thay vì khoá màn.">
          <FileTabsBar model={m(THREE, { activeFallback: true })} onActivate={noop} onCreate={noop} agentOffline />
        </Case>
      </div>
    </TooltipProvider>
  );
}


/* ═══════════ C2 — CRUD, thùng rác, hoàn tác ═══════════ */

const TRASHED: Doc[] = [
  D("f-y-cu", "Ý tưởng cũ", { kind: "canvas", trashedAt: "2026-07-20T00:00:00.000Z" }),
  D("f-het-han", "Bản nháp quá hạn", { trashedAt: "2026-05-01T00:00:00.000Z" }),
];

/**
 * Ba dialog/popover của C2, dựng bằng dữ liệu tĩnh (không repo) để mỗi ca hiện tất định.
 * Runtime của app đi qua `SubfileTabs → useSubfileActions → docsRepo`.
 */
export function SubfileCrudPreview() {
  const [create, setCreate] = React.useState(false);
  const [del, setDel] = React.useState(false);
  const [trash, setTrash] = React.useState(false);
  const noop = () => {};
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-8 p-6">
        <Case title="Dialog tạo file — hai mode + chọn sheet" note="Mode mặc định là quy trình chuẩn; tên gợi ý đổi theo mode khi người dùng chưa tự gõ.">
          <div className="p-3">
            <Button variant="primary" onClick={() => setCreate(true)}>Mở dialog tạo file</Button>
          </div>
          <CreateFileDialog
            open={create}
            onOpenChange={setCreate}
            docs={THREE}
            sheetIds={SHEETS}
            onSubmit={() => setCreate(false)}
          />
        </Case>

        <Case title="Dialog xoá — nói rõ cái gì KHÔNG mất + cảnh báo lượt đang chạy" note="Không bắt gõ tên: thao tác phục hồi được thì ma sát cao là phản tác dụng (chốt X6).">
          <div className="p-3">
            <Button variant="danger" onClick={() => setDel(true)}>Mở dialog xoá</Button>
          </div>
          <DeleteFileDialog
            doc={THREE[0]!}
            open={del}
            onOpenChange={setDel}
            onConfirm={() => setDel(false)}
            runningSheetIds={["main"]}
          />
        </Case>

        <Case title="Thùng rác file — 30 ngày, có đếm ngược" note="Không có nút xoá vĩnh viễn: thùng rác tự dọn sau 30 ngày.">
          <div className="w-64 p-3">
            <TrashPopover
              allDocs={TRASHED}
              open={trash}
              onOpenChange={setTrash}
              onRestore={noop}
              now={Date.parse("2026-08-06T00:00:00.000Z")}
            />
          </div>
        </Case>

        <Case title="Thùng rác rỗng" note="Empty state nói được việc tiếp theo, không phải «không có dữ liệu».">
          <div className="w-64 p-3">
            <TrashPopover allDocs={[]} open={false} onOpenChange={noop} onRestore={noop} />
          </div>
        </Case>
      </div>
    </TooltipProvider>
  );
}


/* ═══════════ C3 — A11Y, TRÀN THANH TAB và CA BIÊN ═══════════ */

/**
 * Story của C3. Ba ca dưới đây là những ca **không dựng được bằng thao tác bình thường**
 * trong app (phải có đúng 12 file, phải đang mở menu, phải có tên chạm trần 48 ký tự),
 * nên chúng chỉ tồn tại ở đây — đó là lý do story này có mặt.
 *
 * MOCK: vẫn là dữ liệu tĩnh như C1/C2, KHÔNG thêm repo/adapter nào (FE2-PLAN §4).
 * Runtime của app vẫn đi `SubfileTabs → useSubfileActions → docsRepo`.
 */
const TWELVE = Array.from({ length: 12 }, (_, i) =>
  D(`f-nhieu-${i + 1}`, `File số ${i + 1}`, { kind: i % 3 === 0 ? "canvas" : "workflow" }),
);

/** 48 ký tự = đúng trần `DOC_NAME_MAX` (§4.4). Dài hơn thì schema từ chối. */
const LONG_NAMES = [
  D("f-dai-1", "Bộ kit Tết 2026 cho VietinBank iPay bản rất dài"),
  D("f-dai-2", "Nhân vật Lan — tạo hình mùa xuân, bản duyệt 2", { kind: "canvas", color: "amber" }),
];

/** Bảng phím tắt — hiện ra để người kiểm thị giác biết phải thử gì bằng bàn phím. */
const KEYS: [string, string][] = [
  ["← →", "chuyển tab đang thấy"],
  ["Home / End", "tab đầu / tab cuối"],
  ["⌃Tab · ⌃⇧Tab", "tab kế / tab trước"],
  ["Mod+1..9", "nhảy tới tab thứ n (kể cả tab đang thu gọn)"],
  ["Mod+⌥N", "tạo file mới"],
  ["F2", "đổi tên tại chỗ · Esc huỷ"],
  ["Mod+D", "nhân bản"],
  ["⌫ / Delete", "xoá (mở hộp xác nhận, không xoá thẳng)"],
  ["Shift+F10 · ☰", "mở menu ngữ cảnh của tab đang focus"],
];

export function SubfileA11yPreview() {
  const [active, setActive] = React.useState("f-nhieu-12");
  const noop = () => {};
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-8 p-6">
        <Case
          title="12 file — tab đang mở là file CUỐI"
          note="Quá 8 tab thì phần dư vào «»»; tab đang mở luôn được kéo ra thanh. Mod+9 vẫn tới được file đang thu gọn."
        >
          <FileTabsBar model={m(TWELVE, { activeId: active })} onActivate={setActive} onCreate={noop} />
        </Case>

        <Case
          title="Tên chạm trần 48 ký tự"
          note="Cắt bằng CSS chứ không cắt dữ liệu: aria-label vẫn mang tên đầy đủ cho trình đọc màn hình."
        >
          <FileTabsBar model={m(LONG_NAMES)} onActivate={noop} onCreate={noop} />
        </Case>

        <Case
          title="Có vùng nội dung thật ⇒ tab mới được phép có aria-controls"
          note="Không có panel thì KHÔNG đặt aria-controls — thà thiếu còn hơn trỏ vào một id không tồn tại."
        >
          <FileTabsBar model={m(THREE)} onActivate={noop} panelId="kg-preview-panel" />
          <div id="kg-preview-panel" role="tabpanel" className="p-4 text-caption text-fg-muted-raised">
            Vùng nội dung của file đang mở.
          </div>
        </Case>

        <section className="flex flex-col gap-2">
          <h3 className="text-label text-fg-strong">Đường bàn phím phải thử khi nghiệm thu</h3>
          <ul className="flex flex-col gap-1 rounded-3 border border-line-subtle bg-surface p-4">
            {KEYS.map(([k, v]) => (
              <li key={k} className="flex items-baseline gap-3 text-caption text-fg">
                <code className="min-w-32 shrink-0 font-mono text-fg-strong">{k}</code>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </TooltipProvider>
  );
}
