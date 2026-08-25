import * as React from "react";
import { Check, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkflowProjectId, useWorkflowStore, useWorkflowStoreApi, migrateMascots, type WorkflowMascot } from "../lib/model";
import { useWorkflowRefs } from "../lib/refs-sync";
import { CheckRow } from "../components/CheckRow";
import { GroupChips } from "../components/GroupChips";
import { ItemDetailDialog } from "../components/ItemDetail";
import { MascotCard, MascotDialog, MascotEmpty, PhraseSelect } from "../components/MascotDialog";
import { useKitsetContract } from "../lib/contract-sync";
import { itemPromptFor, poseCellFile } from "../lib/item-prompt";
import { OUTFIT_THEMES, POSES, POSE_GROUPS, allPoseIds } from "../lib/poses";
import { poseSvgMarkup } from "@/features/design/preview";
import { Step } from "./BriefStep";

/** Danh mục dáng nay ở `lib/poses.ts`; re-export để nơi gọi cũ (và test) không gãy. */
export { POSES } from "../lib/poses";

/** Xem `KitsetStep` — cùng một luật hai hình thái cho wizard và trang quản lý. */
export type MascotVariant = "wizard" | "manage";

/* KHÔNG CÓ HỘP CUỘN CON Ở BƯỚC NÀY — đọc trước khi định thêm lại `max-h` +
 * `overflow-y-auto`. (Block comment thường, KHÔNG phải JSDoc của `MascotStep`: nó nói về
 * cả file chứ không riêng component.)
 *
 * Bản trước gói cả danh sách nhân vật lẫn lưới dáng vào
 * `max-h-[min(60vh,34rem)] overflow-y-auto overscroll-contain`, và đó chính là lỗi chủ
 * sản phẩm báo: *lăn chuột ngang qua khu "Bộ dáng" là trang khựng lại*.
 *
 * Cơ chế, đã đo bằng Chromium chứ không suy đoán: `overflow-y-auto` biến khối thành
 * scroll container NGAY CẢ KHI nội dung không tràn (một nhóm dáng chỉ có 3–4 thẻ ⇒ cao
 * 200px, còn xa mức trần 540px). Thêm `overscroll-behavior-y: contain` thì container đó
 * NUỐT luôn wheel event thay vì nhả cho trang: con trỏ nằm trên khối ⇒ `window.scrollY`
 * đứng im ở 0. (Đo: contain+auto ⇒ scrollY 0 · auto trần ⇒ 200 · không overflow ⇒ 200.)
 *
 * Nên hai danh sách nay NỞ HẾT chiều cao tự nhiên và trang cuộn một mạch. Đó cũng đúng
 * ý câu "MASCOT, CHO NÓ SHOW SCROLL ĐƯỢC" của chủ sản phẩm — nghĩa là XEM ĐƯỢC HẾT, chứ
 * không phải dựng một hộp con có thanh cuộn riêng. Trang dài thêm là đúng thiết kế.
 *
 * Cuộn nội bộ chỉ hợp lệ trong lớp NỔI (dialog/popover/overlay), nơi nền sau đã bị khoá
 * cuộn nên chặn chaining không cướp mất cú lăn nào: xem `DialogBody`
 * (`components/ui/dialog.tsx`) — ổ cuộn DUY NHẤT của mọi dialog, đã mang
 * `overscroll-contain`.
 */

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
          {/* CHỦ ĐỀ CẢ BỘ đứng TRƯỚC danh sách nhân vật: nó là quyết định của chiến dịch
              ("bộ kit Tết"), và mọi con thêm sau đều mặc theo nó trừ khi tự khai khác.
              Đặt sau danh sách thì nó đọc ra như một thuộc tính của con cuối cùng. */}
          <section className="picker-section" aria-label="Chủ đề trang phục">
            <div className="max-w-sm">
              <PhraseSelect
                id="mascot-outfit-theme"
                label="Chủ đề trang phục cả bộ"
                options={OUTFIT_THEMES}
                value={s.outfitTheme}
                emptyLabel="— không đặt —"
                placeholder="a school uniform with a navy blazer"
                onChange={(value) => s.set({ outfitTheme: value })}
              />
              <p className="mt-2 text-caption text-fg-muted">
                Áp cho mọi nhân vật chưa tự chọn trang phục riêng. Bỏ trống là không nhắc gì về trang phục.
              </p>
            </div>
          </section>

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
              /* Lưới đổ THẲNG ra trang — không bọc thêm một tầng cuộn nào. Xem chú
                 thích đầu file: hộp cuộn con ở đây là thứ làm trang khựng. */
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

            <div aria-label={poseGroup} className="compact-element-grid">
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
            poses={s.mascotPoses}
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
