import * as React from "react";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Gate } from "@/features/projects/lib/gate";
import type { Project } from "@/lib/types";
import { InfoForm } from "../settings/InfoForm";

/**
 * DIALOG CÀI ĐẶT DỰ ÁN — chỉ còn META CỦA DỰ ÁN, không còn một mảnh soạn thảo nào.
 *
 * ╔══ HAI TAB ĐÃ RỜI ĐI, VÀ ĐÂY LÀ LÝ DO ════════════════════════════════════╗
 * ║ Bản trước có ba tab: «Yêu cầu» (`BriefStep`) · «Phong cách» (`StyleStep`) ·║
 * ║ «Dự án». Hai tab đầu là NƠI SOẠN — chúng ghi vào cùng `contract.json` mà   ║
 * ║ khu soạn prompt (`/k/:id`) đang là chủ. Hai nơi soạn cho một bộ kit nghĩa  ║
 * ║ là hai bản dịch chồng lên nhau: sửa phong cách ở đây rồi mở khu soạn ra    ║
 * ║ thấy chữ cũ, hoặc ngược lại — và không cửa nào nói cho người dùng biết bản ║
 * ║ nào vừa thắng. Nay ngữ cảnh chung (theme · phong cách · màu thương hiệu)   ║
 * ║ chỉ có MỘT chỗ: khối «Ngữ cảnh chung» ở đầu khu soạn.                      ║
 * ║                                                                            ║
 * ║ Còn lại đúng thứ KHÔNG nằm trong contract, tức là thứ khu soạn không quản: ║
 * ║ tên hiển thị, mô tả, tag, ảnh bìa, tên file khi xuất, thư mục trên máy —   ║
 * ║ và ba việc nặng ở cuối (nhân bản · xuất .zip · thùng rác).                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ KHÔNG DỰNG FORM THỨ HAI ═══════════════════════════════════════════════
 * Ruột khối thông tin là `settings/InfoForm` — form đã có sẵn, đã mang đủ luật khó
 * (409 `PROJECT_ID_TAKEN` báo inline tại ô slug kèm nút «Dùng gợi ý», lưu hỏng thì
 * KHÔNG mất dữ liệu đang gõ, ảnh bìa chọn từ file có thật chứ không nhập đường dẫn
 * tự do — chốt bảo mật §6.5). Viết lại một form gọn hơn ở đây là bỏ hết những luật
 * đó và phát hiện lại chúng bằng bug.
 *
 * ══ BA VIỆC NẶNG KHÔNG NẰM TRONG DIALOG NÀY ═══════════════════════════════
 * Nhân bản / Xuất / Xoá đều đã có dialog riêng của màn danh sách (`ProjectDialogs`),
 * kèm lớp chống C-01 (`ActiveRunGuard`) và toast «Hoàn tác 10s». Nên ở đây chỉ có ba
 * cái nút, và chúng ĐÓNG dialog này trước khi mở dialog kia: hai lớp cửa sổ chồng
 * nhau là chỗ người dùng bấm Esc một lần rồi tưởng đã huỷ cả hai.
 */
export function ProjectSettingsDialog({
  open, onOpenChange, project, gate, variantId, onDuplicate, onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  gate: Gate;
  /** Phong cách đầu tiên — picker ảnh bìa hỏi #42 theo nó. */
  variantId: string | undefined;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const ro = gate.readOnly;
  const guard = { disabled: ro, "aria-disabled": ro || undefined, title: ro ? gate.reason : undefined };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="h-[min(44rem,calc(100dvh-2rem))]">
        <DialogHeader>
          {/* "dự án" ở tiêu đề KHÔNG phải chữ thừa: bánh răng ở topbar mở cài đặt của
              CẢ APP (`SettingsDialog`, tiêu đề "Cài đặt"), và hai cái cửa đó cùng với
              tới được từ màn này. Hai dialog trùng tên là hai thứ khác nhau nói cùng
              một câu, và trình đọc màn hình không phân biệt nổi. */}
          <DialogTitle>Cài đặt dự án</DialogTitle>
          <DialogDescription>Tên, ảnh bìa và chỗ để trên máy của dự án «{project.name}».</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-col gap-5">
          <InfoForm project={project} gate={gate} variantId={variantId} />

          {/* Vùng nguy hiểm — viền `--danger` để tách hẳn khỏi phần trên (§3-S2b). */}
          <Card className="border-danger/60">
            <CardHeader>
              <CardTitle className="text-danger">Vùng nguy hiểm</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-line-subtle">
              <DangerRow
                title="Nhân bản dự án này"
                description="Tạo một bản sao. Chọn được giữ hay bỏ ảnh đã sinh."
                action={<Button variant="secondary" {...guard} onClick={onDuplicate}><Copy aria-hidden />Nhân bản…</Button>}
              />
              <DangerRow
                title="Chuyển dự án vào thùng rác"
                description="Giữ 30 ngày và phục hồi lại được. Ngay sau khi xoá vẫn có 10 giây để hoàn tác."
                action={<Button variant="danger" {...guard} onClick={onDelete}><Trash2 aria-hidden />Xoá…</Button>}
              />
            </CardContent>
          </Card>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** Một dòng của Vùng nguy hiểm: mô tả hậu quả TRƯỚC, nút ở cuối (§1.1 "nói trước khi làm"). */
function DangerRow({ title, description, action }: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-subtitle text-fg-strong">{title}</p>
        <p className="max-w-[62ch] text-body text-fg-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
