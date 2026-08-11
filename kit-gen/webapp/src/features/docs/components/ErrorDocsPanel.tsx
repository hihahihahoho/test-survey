import * as React from "react";
import { BookOpen, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common";
import { docEntriesByGroup, docEntry, searchDocs, type DocEntry } from "../lib/catalog";
import { docsElementId } from "../lib/anchors";
import { ErrorDocCard } from "./ErrorDocCard";

/**
 * TRA CỨU MÃ LỖI — thân của trang trợ giúp, dùng được ở 2 chỗ:
 *   · trong S6 tab Môi trường (đích hiện tại của `error.docs`)
 *   · trong dialog `ErrorDocsDialog` (mở từ bất kỳ màn nào)
 *
 * BỐN TRẠNG THÁI của màn này (dữ liệu là bảng TĨNH nên không có loading/error mạng):
 *   empty   → tìm không ra mã nào ⇒ EmptyState có đường đi tiếp, KHÔNG phải "không có dữ liệu"
 *   loading → không tồn tại: nội dung nằm trong bundle, có ngay khi render
 *   error   → không tồn tại: không gọi API nào. Mã LẠ (agent mới thêm) ⇒ khối "chưa có mục
 *             cho mã này" + vẫn nói được việc cần làm, KHÔNG trắng trang (§6.5-6)
 *   success → mục lục + danh sách theo nhóm
 * Ca agent chưa chạy: trang này KHÔNG phụ thuộc agent nên đọc được bình thường — đó chính là
 * lý do nó phải là bảng tĩnh (khi lỗi kết nối thì đây là chỗ duy nhất còn giải thích được).
 */
export function ErrorDocsPanel({
  /** Mã cần nhảy tới + làm nổi (từ hash hoặc từ nút [Xem hướng dẫn]). */
  focusCode = null,
  /** Có hiện ô tìm không — trong dialog hẹp thì vẫn nên có. */
  showSearch = true,
}: {
  focusCode?: string | null;
  showSearch?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const inputId = React.useId();
  const focused = focusCode ? docEntry(focusCode) : null;
  const searching = query.trim() !== "";
  const results = React.useMemo(() => (searching ? searchDocs(query) : []), [query, searching]);

  /* Nhảy tới mục được trỏ. `scrollIntoView` thay vì tin vào `#hash` của trình duyệt:
     nội dung này render sau khi màn mount (import động), lúc trình duyệt xử lý hash thì
     phần tử còn chưa tồn tại — đây là lý do link lỗi trước đây "bấm không thấy gì". */
  React.useEffect(() => {
    if (!focused) return;
    const el = document.getElementById(docsElementId(focused.code));
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }, 60);
    return () => clearTimeout(t);
  }, [focused]);

  const groups = React.useMemo(() => docEntriesByGroup(), []);

  return (
    <div className="flex flex-col gap-4">
      {/* Mã lạ: agent trả code mà bảng chưa biết. Nói THẬT là chưa có mục, và vẫn chỉ đường. */}
      {focusCode && !focused && <UnknownCodeNotice code={focusCode} />}

      {showSearch && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={inputId}>Tìm mã lỗi hoặc từ khoá</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted-raised"
              aria-hidden
            />
            <Input
              id={inputId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ví dụ: quota, thùng rác, CONTRACT_CONFLICT"
              autoComplete="off"
              spellCheck={false}
              className="pl-9 pr-9"
            />
            {searching && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
                onClick={() => setQuery("")}
                aria-label="Xoá ô tìm"
              >
                <X aria-hidden />
              </Button>
            )}
          </div>
          <p className="text-caption text-fg-muted-raised" role="status">
            {searching
              ? `${results.length} mục khớp "${query.trim()}"`
              : "Gõ không dấu cũng tìm được. Mỗi mã lỗi mà công cụ local trả về đều có một mục ở đây."}
          </p>
        </div>
      )}

      {searching ? (
        results.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Không có mục nào khớp"
            description="Có thể mã lỗi này mới được thêm ở công cụ local, hoặc bạn đang tìm bằng từ khác."
            steps={[
              "Thử gõ chính xác mã lỗi in trong panel Chi tiết cho lập trình viên",
              "Hoặc xoá ô tìm để xem toàn bộ mục theo nhóm",
              "Vẫn không thấy: gửi phần chi tiết kỹ thuật cho người phát triển",
            ]}
            action={
              <Button variant="secondary" onClick={() => setQuery("")}>
                Xem toàn bộ danh sách
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {results.map((e) => (
              <ErrorDocCard key={e.code} entry={e} highlight={e.code === focused?.code} />
            ))}
          </div>
        )
      ) : (
        <>
          <TableOfContents groups={groups} />
          {groups.map(({ group, items }) => (
            <section key={group} className="flex flex-col gap-3">
              <h3 id={`docs-nhom-${slug(group)}`} className="scroll-mt-24 text-label uppercase tracking-label text-fg-muted-raised">
                {group}
              </h3>
              {items.map((e) => (
                <ErrorDocCard key={e.code} entry={e} highlight={e.code === focused?.code} />
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function TableOfContents({ groups }: { groups: { group: string; items: DocEntry[] }[] }) {
  return (
    <nav aria-label="Mục lục mã lỗi" className="rounded-3 border border-line-subtle bg-surface p-4">
      <p className="text-caption uppercase tracking-label text-fg-muted-raised">Mục lục</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {groups.map(({ group, items }) => (
          <li key={group}>
            <a
              href={`#docs-nhom-${slug(group)}`}
              className="rounded-1 text-body text-accent-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {group}
              <span className="ml-1 text-caption text-fg-muted-raised">({items.length})</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function UnknownCodeNotice({ code }: { code: string }) {
  return (
    <div role="status" className="flex gap-3 rounded-3 border border-warn/60 kg-tint-warn p-4">
      <BookOpen className="mt-0.5 size-4 shrink-0 text-on-tint-warn" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-subtitle text-fg-strong">Chưa có mục hướng dẫn cho mã này</p>
        <p className="text-body text-fg">
          Công cụ local trả về mã <span className="font-mono text-accent-text">{code}</span> mà bản giao diện này
          chưa biết. Bạn vẫn có thể xử lý theo cách chung: thử lại thao tác, xem cửa sổ Terminal đang chạy công cụ
          local, và nếu cần thì cập nhật công cụ local lên bản mới.
        </p>
      </div>
    </div>
  );
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function prefersReducedMotion(): boolean {
  // §5.8-A10: tôn trọng prefers-reduced-motion — cuộn mượt cũng là chuyển động.
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
