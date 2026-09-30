import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { presentError } from "@/lib/api/errors";
import { forgetTemplateEditProject, useCommitTemplateEdit, useDiscardTemplateEdit } from "@/lib/hooks";
import type { TemplateEditInfo } from "@/lib/types/api";
import { toastSuccess } from "@/features/projects/lib/feedback";
import type { ComposerDocStore } from "./composer-doc";

/**
 * template-edit.ts — CHẾ ĐỘ SỬA NỘI DUNG TEMPLATE của màn soạn.
 *
 * ╔══ MỘT PHIÊN = MỘT DỰ ÁN LÀM VIỆC ẨN ═════════════════════════════════════╗
 * ║ Chủ sản phẩm chốt: bấm một template ⇒ mở ĐÚNG màn soạn quen thuộc, sửa   ║
 * ║ như sửa một dự án, rồi «Lưu vào template» hoặc «Huỷ thay đổi». Agent dựng ║
 * ║ một dự án ẩn từ template (`POST /api/templates/:id/edit`); màn soạn sửa   ║
 * ║ nó bằng đúng bộ máy tự lưu của mọi dự án — nên đóng tab giữa chừng không  ║
 * ║ mất gì, và mọi lớp chống ghi đè (baseUpdatedAt · 409 · chặn khi chưa nạp) ║
 * ║ vẫn đứng nguyên. Thứ duy nhất khác: không có Vẽ, không «Lưu làm template», ║
 * ║ và hai nút kết phiên.                                                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

/**
 * Lỗi này có nghĩa là PHIÊN KHÔNG CÒN (không phải "thử lại là được") hay không.
 * `PROJECT_NOT_FOUND` đứng chung hàng: dự án làm việc 404 thì phiên đã bị bỏ/lưu ở nơi
 * khác — tự lưu vào đó hay bấm lưu lần nữa đều vô ích, chỉ còn đường về «Template dự án».
 */
export function isEditSessionGone(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  const { code } = presentError(error);
  return code === "TEMPLATE_EDIT_NOT_FOUND" || code === "PROJECT_NOT_FOUND";
}

export type TemplateEditPhase = "idle" | "saving" | "committing" | "discarding";

/** Mảnh của kho bản soạn mà hai nút kết phiên thật sự dùng — khai hẹp để test dựng được. */
export type TemplateEditStore = Pick<ComposerDocStore, "persist" | "close">;

export interface TemplateEditActions {
  phase: TemplateEditPhase;
  /** Lỗi của lượt «Lưu vào template» gần nhất — hiện ngay trong băng, chữ trên màn vẫn giữ. */
  saveFailure: unknown;
  /** Lỗi của lượt «Huỷ thay đổi» gần nhất — hiện trong hộp xác nhận. */
  discardFailure: unknown;
  /** Phiên đã biến mất giữa chừng (404) — biết được qua một thao tác của chính màn này. */
  gone: boolean;
  save: () => Promise<void>;
  discard: () => Promise<void>;
  clearDiscardFailure: () => void;
  toTemplates: () => void;
}

/**
 * HAI NÚT KẾT PHIÊN — và thứ tự việc của chúng, thứ duy nhất ở đây sai được mà im lặng.
 *
 * ╔══ «LƯU VÀO TEMPLATE»: GHI XUỐNG ĐĨA TRƯỚC, CHÉP VÀO TEMPLATE SAU ════════╗
 * ║ Agent chép bản soạn TRÊN ĐĨA của dự án làm việc. Màn tự lưu sau 600ms im ║
 * ║ phím, nên người gõ xong một chữ rồi bấm lưu ngay sẽ có một template THIẾU ║
 * ║ đúng chữ ấy — không lỗi, không báo, chỉ lộ ra khi mở dự án mới từ nó.    ║
 * ║ Nên: `store.persist()` (ghi ngay + ĐỢI lượt cuối đáp xuống thành công),   ║
 * ║ rồi mới `commit`. Ghi hỏng ⇒ DỪNG, không chép bản cũ, nói ra tại chỗ.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Trong lúc hai việc ấy chạy, màn soạn KHOÁ (`phase !== "idle"`): một chữ gõ vào sau
 * lượt ghi cuối mà trước lượt chép sẽ không bao giờ tới được template — và cũng không
 * tới đâu khác, vì dự án làm việc bị xoá ngay sau đó.
 *
 * Xong ⇒ `store.close()` (không một lượt ghi nào nữa, kể cả lượt ghi-lúc-rời-màn) rồi về
 * `/templates`. KHÔNG trả `phase` về `idle` khi thành công: màn đang rời đi, mở khoá cho
 * nó một nhịp là mở cửa cho đúng cái chữ-gõ-lạc vừa nói.
 */
export function useTemplateEditActions({ projectId, info, store }: {
  projectId: string;
  info: TemplateEditInfo | null;
  store: TemplateEditStore;
}): TemplateEditActions {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const commit = useCommitTemplateEdit();
  const discardMutation = useDiscardTemplateEdit();
  const [phase, setPhase] = React.useState<TemplateEditPhase>("idle");
  const [saveFailure, setSaveFailure] = React.useState<unknown>(null);
  const [discardFailure, setDiscardFailure] = React.useState<unknown>(null);
  const [gone, setGone] = React.useState(false);

  /* Cửa khoá THẬT, cạnh cửa khoá hiển thị: hai cú bấm trong cùng một nhịp vẽ đều thấy
     `phase === "idle"` từ state, nhưng chỉ cú đầu thấy ref còn trống. */
  const busyRef = React.useRef(false);
  /* Phiên đã kết (lưu/bỏ xong) ⇒ lúc màn gỡ thì quên nốt cache còn sống của dự án làm
     việc — xem `forgetTemplateEditProject` để biết vì sao không quên ngay lúc xong. */
  const endedRef = React.useRef(false);
  React.useEffect(() => {
    endedRef.current = false;
    return () => {
      if (endedRef.current) forgetTemplateEditProject(qc, projectId, { activeToo: true });
    };
  }, [qc, projectId]);

  const toTemplates = React.useCallback(() => void navigate({ to: "/templates" }), [navigate]);

  const { persist, close } = store;
  const commitAsync = commit.mutateAsync;
  const discardAsync = discardMutation.mutateAsync;
  const templateId = info?.templateId ?? null;
  const templateName = info?.templateName ?? "";

  const save = React.useCallback(async () => {
    if (!templateId || busyRef.current) return;
    busyRef.current = true;
    setSaveFailure(null);
    setPhase("saving");
    try {
      await persist();
      setPhase("committing");
      const saved = await commitAsync({ templateId, projectId });
      close();
      endedRef.current = true;
      // kg-allow-jargon: «template» là TÊN TÍNH NĂNG do chủ sản phẩm đặt, không phải chữ kỹ thuật lọt ra.
      toastSuccess(`Đã lưu template «${saved.name}»`, "Các dự án đã tạo từ template này trước đây vẫn giữ nguyên.");
      toTemplates();
    } catch (error) {
      /* Hỏng ở bước nào cũng vậy: MỞ KHOÁ, giữ nguyên chữ trên màn, nói ra tại chỗ. Lỗi
         của `persist` là lỗi GHI — `commit` chưa từng được gọi, template chưa bị đụng. */
      busyRef.current = false;
      setPhase("idle");
      if (isEditSessionGone(error)) setGone(true);
      else setSaveFailure(error);
    }
  }, [templateId, projectId, persist, close, commitAsync, toTemplates]);

  /**
   * «HUỶ THAY ĐỔI» — sau hộp xác nhận. ĐỢI lượt ghi đang bay đáp xuống TRƯỚC khi xoá:
   * một PUT tới sau DELETE là một lượt ghi vào thư mục vừa xoá. Lượt đợi ấy hỏng thì kệ
   * (bản soạn sắp bị bỏ cả) — thứ duy nhất nó phải làm là không còn gì bay. Bỏ hỏng ⇒
   * màn MỞ KHOÁ lại và tự lưu chạy tiếp như chưa có gì: không mất một chữ nào.
   */
  const discard = React.useCallback(async () => {
    if (!templateId || busyRef.current) return;
    busyRef.current = true;
    setDiscardFailure(null);
    setPhase("discarding");
    await persist().catch(() => undefined);
    try {
      await discardAsync({ templateId, projectId });
      close();
      endedRef.current = true;
      // kg-allow-jargon: tên tính năng «template», như trên.
      toastSuccess("Đã huỷ thay đổi", `Template «${templateName}» giữ nguyên như trước khi sửa.`);
      toTemplates();
    } catch (error) {
      busyRef.current = false;
      setPhase("idle");
      setDiscardFailure(error);
    }
  }, [templateId, templateName, projectId, persist, close, discardAsync, toTemplates]);

  const clearDiscardFailure = React.useCallback(() => setDiscardFailure(null), []);

  return { phase, saveFailure, discardFailure, gone, save, discard, clearDiscardFailure, toTemplates };
}
