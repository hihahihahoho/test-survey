import * as React from "react";
import { Check, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkflowProjectId, useWorkflowStore, useWorkflowStoreApi, migrateMascots, type WorkflowMascot } from "../lib/model";
import { useWorkflowRefs } from "../lib/refs-sync";
import { CheckRow } from "../components/CheckRow";
import { GroupChips } from "../components/GroupChips";
import { ItemDetailDialog } from "../components/ItemDetail";
import { MascotCard, MascotDialog, MascotEmpty } from "../components/MascotDialog";
import { useKitsetContract } from "../lib/contract-sync";
import { itemPromptFor, poseCellFile } from "../lib/item-prompt";
import { POSES, POSE_GROUPS, allPoseIds } from "../lib/poses";
import { poseSvgMarkup } from "@/features/design/preview";
import { Step } from "./BriefStep";

/** Danh mục dáng nay ở `lib/poses.ts`; re-export để nơi gọi cũ (và test) không gãy. */
export { POSES } from "../lib/poses";

/** Xem `KitsetStep` — cùng một luật hai hình thái cho wizard và trang quản lý. */
export type MascotVariant = "wizard" | "manage";

/**
 * KHỐI DANH SÁCH CUỘN ĐƯỢC — dùng cho cả danh sách nhân vật lẫn lưới dáng.
 *
 * Chủ sản phẩm: "MASCOT, CHO NÓ SHOW SCROLL ĐƯỢC". Trước đây hai danh sách này đổ
 * thẳng ra trang, nên khi một dự án có nhiều nhân vật/nhiều dáng thì hàng nút Lưu và
 * cả hàng tab bị đẩy ra ngoài tầm nhìn, còn muốn xem dáng cuối phải cuộn cả trang.
 *
 * `max-h` chứ KHÔNG `h`: chiều cao không bị bó cứng — ít món thì khối co lại vừa số
 * món, nhiều món thì mới sinh thanh cuộn riêng. `pr-1` chừa chỗ cho thanh cuộn để nó
 * không đè lên viền thẻ cuối hàng.
 */
const SCROLL_LIST = "max-h-[min(60vh,34rem)] overflow-y-auto overscroll-contain pr-1";

export function MascotStep({ variant = "wizard", detailFooter }: {
  variant?: MascotVariant;
  /** Hàng nút của panel chi tiết dáng. Màn quản lý truyền `SaveBar`. */
  detailFooter?: React.ReactNode;
} = {}) {
  const s = useWorkflowStore();
  const store = useWorkflowStoreApi();
  const projectId = useWorkflowProjectId();
  const refs = useWorkflowRefs(projectId);
  const sync = useKitsetContract();
  const [poseGroup, setPoseGroup] = React.useState<string>(POSE_GROUPS[0]!);
  const [editing, setEditing] = React.useState<WorkflowMascot | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [detailPose, setDetailPose] = React.useState<string | null>(null);

  /* Bản nháp ghi từ bản build cũ chỉ có ba trường `mascot*` rời. `hydrateWorkflowStore`
     đã nâng cấp bản nháp trên ĐĨA; đây là vế còn lại — bản nháp trong `localStorage`
     do `persist` nạp lại. Idempotent nên chạy lại không sinh con thứ hai. */
  React.useEffect(() => {
    const next = migrateMascots(store.getState());
    if (next) store.setState({ mascots: next });
  }, [store]);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (mascot: WorkflowMascot) => { setEditing(mascot); setDialogOpen(true); };

  const detailPoseInfo = detailPose ? POSES.find((pose) => pose.id === detailPose) ?? null : null;
  const poseCount = s.mascotPoses.length;
  const shown = POSES.filter((pose) => pose.group === poseGroup);
  const groupChips = POSE_GROUPS.map((group) => ({
    id: group,
    label: group,
    count: POSES.filter((pose) => pose.group === group && s.mascotPoses.includes(pose.id)).length,
  }));

  return (
    <Step headless={variant === "manage"} title="Mascot" copy="Thêm từng nhân vật và chọn các dáng cần vẽ.">
      <CheckRow
        id="mascot-enabled-step"
        checked={s.mascotEnabled}
        onCheckedChange={(checked) => s.set({ mascotEnabled: checked })}
        label="Có nhân vật đại diện"
        description="Bật khi dự án cần mascot nhất quán ở nhiều dáng."
      />

      {s.mascotEnabled && (
        <>
          <section className="picker-section" aria-label="Nhân vật của dự án">
            <div className="picker-heading">
              <div>
                <p className="field-label">Nhân vật</p>
                <strong>{s.mascots.length} nhân vật</strong>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={openAdd}>
                <Plus aria-hidden />Thêm nhân vật
              </Button>
            </div>
            {s.mascots.length > 0 ? (
              /* "MASCOT, CHO NÓ SHOW SCROLL ĐƯỢC" — danh sách nhân vật cuộn TRONG khối
                 của nó. `max-h` chứ không `h`: bốn nhân vật thì khối cao bốn thẻ, không
                 phải một hộp rỗng cao bằng màn hình. */
              <div className={SCROLL_LIST}>
                <div className="mascot-card-grid">
                  {s.mascots.map((mascot, index) => (
                    <MascotCard
                      key={mascot.id}
                      mascot={mascot}
                      index={index}
                      onEdit={() => openEdit(mascot)}
                      onRemove={() => s.removeMascot(mascot.id)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <MascotEmpty onAdd={openAdd} />
            )}
          </section>

          {/*
            UI-FIX §3a — bộ dáng dùng ĐÚNG khuôn của bước "Bộ khung UI": hàng chip nhóm
            + lưới thẻ có tick. Trước đây chỗ này là tab gạch chân + ô vuông + một dải
            chip "Sẽ vẽ" — ba thứ trang trí cho một việc mà bước liền trước đã dạy xong.
          */}
          <section className="picker-section" aria-label="Bộ dáng mascot">
            <div className="picker-heading">
              <div>
                <p className="field-label">Bộ dáng</p>
                <strong>{poseCount}/{POSES.length} dáng đã chọn</strong>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => s.set({ mascotPoses: allPoseIds() })}>Chọn tất cả</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => s.set({ mascotPoses: [] })}>Bỏ chọn</Button>
              </div>
            </div>

            <GroupChips
              groups={groupChips}
              value={poseGroup}
              onChange={setPoseGroup}
              trailing={`${poseCount} đã chọn`}
            />

            <div aria-label={poseGroup} className={cn("compact-element-grid", SCROLL_LIST)}>
              {shown.map((pose) => {
                const on = s.mascotPoses.includes(pose.id);
                const toggle = (
                  <button
                    type="button"
                    className={cn(
                      on ? "compact-element selected" : "compact-element",
                      variant === "manage" && "w-full pr-12",
                    )}
                    aria-pressed={on}
                    onClick={() => s.set({
                      mascotPoses: on
                        ? s.mascotPoses.filter((id) => id !== pose.id)
                        : [...s.mascotPoses, pose.id],
                    })}
                  >
                    <span
                      className="compact-element-art"
                      aria-hidden
                      dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 60 84" width="40" height="56">${poseSvgMarkup(pose.id, 60, 84)}</svg>` }}
                    />
                    <span className="min-w-0">
                      <strong className="block truncate">{pose.label}</strong>
                      <small>{pose.group}</small>
                    </span>
                    {on ? <Check aria-hidden /> : <Plus aria-hidden />}
                  </button>
                );
                if (variant === "wizard") return <React.Fragment key={pose.id}>{toggle}</React.Fragment>;
                return (
                  <div key={pose.id} className="relative min-w-0">
                    {toggle}
                    {/* Cùng luật với trang Skeleton UI: thẻ sạch, mọi control trong popup. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-2 top-1/2 z-10 -translate-y-1/2"
                      aria-label={`Chi tiết dáng ${pose.label}`}
                      title={`Chi tiết dáng ${pose.label}`}
                      onClick={() => setDetailPose(pose.id)}
                    >
                      <SlidersHorizontal aria-hidden />
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          {detailPoseInfo ? (
            <ItemDetailDialog
              open
              onOpenChange={(open) => { if (!open) setDetailPose(null); }}
              title={`Dáng ${detailPoseInfo.label}`}
              description={`Nhóm ${detailPoseInfo.group} · ${detailPoseInfo.id}`}
              prompt={itemPromptFor(sync?.contract ?? null, poseCellFile(sync?.contract ?? null, detailPoseInfo.id) ?? "")}
              promptEmptyReason="Dáng này chưa được chọn (hoặc dự án chưa có nhân vật nào) nên chưa có ô nào trong bản thiết kế."
              footer={detailFooter ?? <Button type="button" variant="secondary" onClick={() => setDetailPose(null)}>Đóng</Button>}
            >
              <div className="space-y-4">
                <CheckRow
                  id={`pose-detail-${detailPoseInfo.id}`}
                  checked={s.mascotPoses.includes(detailPoseInfo.id)}
                  onCheckedChange={(checked) => s.set({
                    mascotPoses: checked
                      ? [...s.mascotPoses.filter((id) => id !== detailPoseInfo.id), detailPoseInfo.id]
                      : s.mascotPoses.filter((id) => id !== detailPoseInfo.id),
                  })}
                  label="Vẽ dáng này"
                  description="Bỏ tick để loại dáng khỏi tấm mascot của dự án."
                />
                {/* Ô dáng KHÔNG có kích thước riêng: `kitset-to-contract` khoá cứng
                    `w .3 · h .85` cho mọi dáng để cả tấm là một turnaround đều nhau —
                    một người cao 85% ô, rộng ~1/3. Nói ra thay vì đưa một ô nhập giả. */}
                <p className="text-caption text-fg-muted">
                  Kích thước ô dáng cố định 30% × 85% để cả tấm mascot cùng một tỷ lệ người.
                </p>
              </div>
            </ItemDetailDialog>
          ) : null}

          <MascotDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            mascot={editing}
            uploadRef={(file) => refs.addOne(file, "character")}
            onAdoptPoses={(poses) => s.set({ mascotPoses: poses })}
            onSave={(input) => {
              if (editing) s.patchMascot(editing.id, input);
              else s.addMascot(input);
            }}
          />
        </>
      )}
    </Step>
  );
}
