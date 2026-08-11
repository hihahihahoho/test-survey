import * as React from "react";
import { FileTabsBar } from "./FileTabsBar";
import { CreateFileDialog } from "./CreateFileDialog";
import { DeleteFileDialog } from "./DeleteFileDialog";
import { TabContextMenu } from "./TabContextMenu";
import { TabRenameInput } from "./TabRenameInput";
import { TrashPopover } from "./TrashPopover";
import { useSubfileActions } from "../../hooks/use-subfile-actions";
import { useSubfileFocus } from "../../hooks/use-subfile-focus";
import { usePurgeExpiredDocs, useTrashedDocs, docErrorDetail, docErrorTitle } from "../../hooks/use-doc-mutations";
import { useFileTabs } from "../../hooks/use-file-tabs";
import { toast, KG_TOAST_DURATION } from "@/components/ui/sonner";
import {
  COPY_FAIL_TITLE, anchorForTab, copyFailDescription, copyText,
} from "../../lib/subfile-a11y";
import { resolveDocLink, type DocLinkResolver } from "../../lib/subfile-intent";

/**
 * THANH TAB FILE CON, BẢN ĐẦY ĐỦ — thanh của C1 + toàn bộ CRUD/thùng rác/hoàn tác của C2.
 *
 * Đây là thứ E1 nên mount trên 6 màn project; `FileTabsBar` trần vẫn dùng được cho
 * story và cho chỗ chỉ cần đọc. **Không sửa một dòng nào của C1**: mọi thứ cắm qua
 * 4 điểm mà C1 đã chừa (`onCreate`, `onContextMenu`, `allFilesFooter`, `renderTabLabel`).
 *
 * ROUTER-AGNOSTIC (FE2-PLAN §3-C3): nhận `activeId` + `onActivate`, và nhận
 * `linkForDoc(docId)` để mục «Sao chép liên kết» có URL — component không tự biết
 * router, không đọc `window.location` hộ E1.
 *
 * BA SỬA CỦA C3 (số đo ở `fe2/C3-REPORT.md` §2):
 *  ① **Tiêu điểm quay về tab** sau khi menu ngữ cảnh hoặc dialog xoá đóng lại; trước
 *     đây nó rơi về `<body>` và người dùng bàn phím mất chỗ giữa màn.
 *  ② **Sao chép liên kết không im lặng nữa.** `navigator.clipboard` vắng mặt trên
 *     trang http hoặc bị từ chối quyền là ca THẬT: giờ báo và đưa chuỗi để chép tay.
 *  ③ **`Shift+F10` / phím ☰** mở menu ngay tại tab đang focus (neo vào chính tab đó).
 */
export interface SubfileTabsProps {
  projectId: string;
  /** id sheet của contract. Agent chưa chạy ⇒ `[]`, KHÔNG phải lỗi. */
  contractSheetIds: readonly string[];
  activeId?: string | null;
  onActivate: (id: string) => void;
  /** id file đang có thay đổi chưa lưu (canvas shell báo lên). */
  dirtyIds?: readonly string[];
  /** id sheet đang có lượt chạy — CHỈ để cảnh báo trong dialog xoá (C-01). */
  runningSheetIds?: readonly string[];
  agentOffline?: boolean;
  /** E1 cấp URL cho mục «Sao chép liên kết». Không có ⇒ mục vẫn chạy, copy id. */
  linkForDoc?: DocLinkResolver;
  /** id `role="tabpanel"` mà chỗ gọi thật sự render — không có thì bỏ `aria-controls`. */
  panelId?: string;
  className?: string;
}

export function SubfileTabs(props: SubfileTabsProps) {
  const {
    projectId, contractSheetIds, activeId, onActivate, dirtyIds,
    runningSheetIds = [], agentOffline, linkForDoc, panelId, className,
  } = props;

  const model = useFileTabs({ projectId, contractSheetIds, activeId, dirtyIds });
  const ctl = useSubfileActions({
    projectId,
    contractSheetIds,
    activeId: model.activeId,
    onActivate,
  });

  const focusBack = useSubfileFocus();
  const trash = useTrashedDocs(projectId, ctl.trashOpen);
  const purge = usePurgeExpiredDocs(projectId);

  /**
   * Đóng menu ngữ cảnh và LUÔN trả tiêu điểm về tab (sửa ① của C3).
   * `ctl.closeMenu` một mình chỉ gỡ menu; focus thì rơi về `<body>`.
   */
  const closeMenu = React.useCallback(() => {
    ctl.closeMenu();
    focusBack.restore(model.activeId);
  }, [ctl, focusBack, model.activeId]);

  const openMenuAt = React.useCallback(
    (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
      focusBack.remember(id);
      // Chuột phải có toạ độ; `Shift+F10`/phím ☰ thì không ⇒ neo vào chính tab đó.
      const at = "clientX" in e && (e.clientX !== 0 || e.clientY !== 0)
        ? { x: e.clientX, y: e.clientY }
        : anchorForTab(id, focusBack.rootRef.current);
      ctl.openMenu(id, at);
    },
    [ctl, focusBack],
  );

  /**
   * Sao chép liên kết — KHÔNG nuốt lỗi (sửa ② của C3). Trang chạy http hoặc quyền bị
   * từ chối là ca thật; im lặng để người dùng dán ra chỗ khác mới biết hỏng là kiểu
   * hỏng tệ. Thất bại ⇒ đưa thẳng chuỗi để họ chép tay.
   */
  const copyLink = React.useCallback(
    (docId: string) => {
      closeMenu();
      const text = resolveDocLink(docId, linkForDoc);
      void copyText(text).then((r) => {
        if (r.ok) {
          toast.success("Đã chép liên kết file", { duration: KG_TOAST_DURATION.success });
        } else {
          toast.error(COPY_FAIL_TITLE, {
            description: copyFailDescription(r.text),
            duration: KG_TOAST_DURATION.error,
          });
        }
      });
    },
    [closeMenu, linkForDoc],
  );

  return (
    <>
      {/* `display:contents` — phần tử này CHỈ để có một phạm vi DOM cho việc trả
          tiêu điểm (xem `useSubfileFocus`); nó không tham gia bố cục, nên thanh tab
          giữ nguyên nhịp FLORA của C1. */}
      <div ref={focusBack.rootRef} className="contents">
      <FileTabsBar
        className={className}
        model={model}
        onActivate={onActivate}
        onCreate={ctl.openCreate}
        agentOffline={agentOffline}
        panelId={panelId}
        onContextMenu={openMenuAt}
        renderTabLabel={(tab) =>
          ctl.rename?.docId === tab.id ? (
            <TabRenameInput
              state={ctl.rename}
              onChange={ctl.changeRename}
              /* Đóng ô đổi tên (dù lưu hay huỷ) phải trả focus về CHÍNH tab đó —
                 nếu không, `Esc` xong là tiêu điểm rơi về `<body>` (sửa ① của C3). */
              onCommit={() => void ctl.commitRename().then(() => focusBack.restore(tab.id))}
              onCancel={() => {
                ctl.cancelRename();
                focusBack.restore(tab.id);
              }}
            />
          ) : undefined
        }
        allFilesFooter={
          <TrashPopover
            allDocs={trash.data ?? []}
            loading={ctl.trashOpen && trash.isLoading}
            errorTitle={trash.error ? docErrorTitle(trash.error) : null}
            errorDetail={trash.error ? docErrorDetail(trash.error) : null}
            open={ctl.trashOpen}
            onOpenChange={ctl.setTrashOpen}
            onRestore={(id) => void ctl.restore(id)}
            restorePending={ctl.restorePending}
            onPurgeExpired={() => purge.mutate()}
          />
        }
      />
      </div>

      <CreateFileDialog
        open={ctl.createOpen}
        onOpenChange={(v) => (v ? ctl.openCreate() : ctl.closeCreate())}
        docs={ctl.docs}
        sheetIds={contractSheetIds}
        pending={ctl.createPending}
        errorTitle={ctl.createError ? ctl.titleOf(ctl.createError) : null}
        errorDetail={ctl.createError ? ctl.detailOf(ctl.createError) : null}
        onSubmit={(input) => void ctl.submitCreate(input)}
      />

      <TabContextMenu
        doc={ctl.menu ? ctl.docs.find((d) => d.id === ctl.menu!.docId) ?? virtualStub(ctl.menu.docId) : null}
        at={ctl.menu ? { x: ctl.menu.x, y: ctl.menu.y } : null}
        onClose={closeMenu}
        onRename={ctl.beginRename}
        onDuplicate={(id) => void ctl.duplicate(id)}
        onCopyLink={copyLink}
        onSetColor={(id, c) => void ctl.setColor(id, c)}
        onDelete={ctl.requestDelete}
      />

      <DeleteFileDialog
        doc={ctl.deleteTarget}
        open={Boolean(ctl.deleteTarget)}
        onOpenChange={(v) => {
          if (v) return;
          ctl.cancelDelete();
          focusBack.restore(model.activeId); // huỷ xoá ⇒ về đúng tab vừa bấm
        }}
        onConfirm={() => {
          void ctl.confirmDelete().then(() => focusBack.restore(model.activeId));
        }}
        pending={ctl.deletePending}
        runningSheetIds={runningSheetIds}
        errorTitle={ctl.deleteError ? ctl.titleOf(ctl.deleteError) : null}
        errorDetail={ctl.deleteError ? ctl.detailOf(ctl.deleteError) : null}
      />
    </>
  );
}

/**
 * Chuột phải trên tab ẢO «Tất cả sheet»: nó không có bản ghi trong repo, nhưng menu
 * vẫn phải mở ra để nói *vì sao* các mục bị khoá — im lặng không mở là kiểu hỏng
 * khiến người dùng bấm mãi mà không hiểu.
 */
function virtualStub(id: string) {
  return {
    id, name: "Tất cả sheet", kind: "workflow" as const,
    createdAt: "", updatedAt: "", color: "none" as const, trashedAt: null,
  };
}
