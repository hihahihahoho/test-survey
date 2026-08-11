import { AlertTriangle, Info } from "lucide-react";
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ImportReport } from "@/lib/types";
import { count } from "../lib/format";
import { CheckRow, InfoNotice } from "./parts";

/**
 * BẢNG ĐỐI CHIẾU — bước 2 của wizard nhập (§4.6). BẮT BUỘC, không bỏ qua được.
 *
 * Ba cột nghĩa vụ của spec: cái gì được **thêm**, cái gì bị **ghi đè**, cái gì
 * bị **bỏ qua**. Ở kit-gen v2, ghi đè KHÔNG BAO GIỜ xảy ra (nhập luôn tạo project
 * MỚI) — nhưng dòng "Project đang có trên máy → Không ghi đè" vẫn phải hiện, vì
 * "không có gì bị ghi đè" là thông tin user cần đọc thấy chứ không phải thứ họ
 * phải tự suy ra.
 *
 * Mọi con số ở đây là của `POST /api/import/preview` — web không tự đọc file.
 */
export function ReconcileTable({
  report,
  sourceLabel,
  copyHeavy,
  onCopyHeavyChange,
}: {
  report: ImportReport;
  sourceLabel: string;
  copyHeavy: boolean;
  onCopyHeavyChange: (v: boolean) => void;
}) {
  const will = (report.willCreate ?? {}) as Record<string, number | undefined>;
  const rawN = Number(will.raw ?? 0);
  const kitsN = Number(will.kits ?? 0);
  const hasHeavy = rawN + kitsN > 0;

  const rows: { what: string; act: string; tone: "add" | "skip" | "keep"; n: number; note: string }[] = [
    { what: "Sheet", act: "Thêm mới", tone: "add", n: report.sheets, note: `khớp ${will.sheets ?? report.sheets}/${report.sheets}` },
    { what: "Element (ô trên sheet)", act: "Thêm mới", tone: "add", n: report.components, note: "giữ nguyên như trong file" },
    { what: "Phong cách", act: "Thêm mới", tone: "add", n: report.variants, note: "" },
    {
      what: "Dáng nhân vật",
      act: "Thêm mới",
      tone: "add",
      n: report.poses,
      // Agent thay danh sách dáng RỖNG bằng bộ mặc định của thư viện. Nói rõ ra,
      // vì số này không khớp file gốc và user sẽ thắc mắc.
      note: report.poses > 0 ? "gồm cả dáng mặc định của thư viện nếu file không có" : "file không có dáng nào",
    },
    {
      what: "Ảnh AI đã sinh",
      act: copyHeavy && rawN > 0 ? "Copy kèm" : "Bỏ qua",
      tone: copyHeavy && rawN > 0 ? "add" : "skip",
      n: rawN,
      note: "không tốn quota",
    },
    {
      what: "Kit đã cắt",
      act: copyHeavy && kitsN > 0 ? "Copy kèm" : "Bỏ qua",
      tone: copyHeavy && kitsN > 0 ? "add" : "skip",
      n: kitsN,
      note: "cắt lại được",
    },
    { what: "Dự án đang có trên máy", act: "Không ghi đè", tone: "keep", n: 0, note: "luôn tạo dự án mới" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-subtitle text-fg-strong">Kiểm tra trước khi nhập</h3>
        <p className="truncate text-caption text-fg-muted-raised" title={sourceLabel}>
          {sourceLabel}
        </p>
      </div>

      <p className="text-body text-fg">
        Đọc được: {count(report.sheets, "sheet")} · {count(report.components, "element")} ·{" "}
        {count(report.variants, "phong cách")} · {count(report.poses, "dáng nhân vật")}.
      </p>

      <div className="overflow-hidden rounded-2 border border-line-subtle">
        <Table>
          <TableCaption className="sr-only">
            Bảng đối chiếu: cái gì sẽ được thêm, ghi đè hay bỏ qua
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Nội dung</TableHead>
              <TableHead className="w-36">Sẽ làm gì</TableHead>
              <TableHead className="w-24 text-right">Số lượng</TableHead>
              <TableHead className="w-64">Ghi chú</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.what}>
                <TableCell className="text-fg-strong">{r.what}</TableCell>
                <TableCell>
                  <Badge tone={r.tone === "add" ? "ok" : r.tone === "skip" ? "never" : "accent"}>{r.act}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{r.n}</TableCell>
                <TableCell className="text-caption text-fg-muted-raised">{r.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {hasHeavy && (
        <CheckRow
          id="imp-heavy"
          checked={copyHeavy}
          onCheckedChange={onCopyHeavyChange}
          label="Copy luôn ảnh AI đã sinh và kit đã cắt"
          hint="Bỏ tick nếu chỉ muốn lấy bản thiết kế."
        />
      )}

      {/* Cảnh báo của agent — quan trọng nhất là UNKNOWN_COMPONENTS: bản Studio cũ
          XOÁ những element lạ (12 sheet còn 3); bản này GIỮ NGUYÊN. */}
      {report.warnings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {report.warnings.slice(0, 6).map((w, i) => (
            <li
              key={`${w.code}-${i}`}
              className="flex items-start gap-2 rounded-2 border border-warn/60 bg-warn/10 p-3"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-on-tint-warn" aria-hidden />
              <div className="min-w-0">
                <p className="text-caption text-fg-strong">{w.message ?? w.code}</p>
                {w.code === "UNKNOWN_COMPONENTS" && (
                  <p className="text-caption text-fg-muted-raised">
                    Bản Studio cũ sẽ xoá chúng đi. Bản này giữ nguyên.
                  </p>
                )}
                {w.items.length > 0 && (
                  <p className="truncate font-mono text-caption text-fg-muted-raised">
                    {w.items.slice(0, 6).join(", ")}
                    {w.items.length > 6 && ` … +${w.items.length - 6}`}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {report.duplicateSheetIds.length > 0 && (
        <div className="flex items-start gap-2 rounded-2 border border-warn/60 bg-warn/10 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-on-tint-warn" aria-hidden />
          <p className="text-caption text-fg-strong">
            {count(report.duplicateSheetIds.length, "sheet trùng mã")} ({report.duplicateSheetIds.join(", ")}) — sẽ
            tự thêm hậu tố <span className="font-mono">-2</span> và ghi vào báo cáo.
          </p>
        </div>
      )}

      {report.missingRefs.length > 0 && (
        <div className="flex items-start gap-2 rounded-2 border border-warn/60 bg-warn/10 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-on-tint-warn" aria-hidden />
          <p className="text-caption text-fg-strong">
            {count(report.missingRefs.length, "ảnh tham khảo")} được nhắc tới trong file. Thiếu ảnh nào thì sheet đó
            vẫn nhập được, chỉ là không có ảnh mẫu.
          </p>
        </div>
      )}

      <InfoNotice>File gốc không bị thay đổi hay xoá. Mỗi lần nhập sẽ tạo một dự án mới.</InfoNotice>
    </div>
  );
}
