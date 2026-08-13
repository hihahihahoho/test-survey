import * as React from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkflowProjectId, useWorkflowStore, useWorkflowStoreApi, migrateMascots, type WorkflowMascot } from "../lib/model";
import { useWorkflowRefs } from "../lib/refs-sync";
import { CheckRow } from "../components/CheckRow";
import { GroupChips } from "../components/GroupChips";
import { MascotCard, MascotDialog, MascotEmpty } from "../components/MascotDialog";
import { POSES, POSE_GROUPS, allPoseIds } from "../lib/poses";
import { poseSvgMarkup } from "@/features/design/preview";
import { Step } from "./BriefStep";

/** Danh mục dáng nay ở `lib/poses.ts`; re-export để nơi gọi cũ (và test) không gãy. */
export { POSES } from "../lib/poses";

export function MascotStep() {
  const s = useWorkflowStore();
  const store = useWorkflowStoreApi();
  const projectId = useWorkflowProjectId();
  const refs = useWorkflowRefs(projectId);
  const [poseGroup, setPoseGroup] = React.useState<string>(POSE_GROUPS[0]!);
  const [editing, setEditing] = React.useState<WorkflowMascot | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  /* Bản nháp ghi từ bản build cũ chỉ có ba trường `mascot*` rời. `hydrateWorkflowStore`
     đã nâng cấp bản nháp trên ĐĨA; đây là vế còn lại — bản nháp trong `localStorage`
     do `persist` nạp lại. Idempotent nên chạy lại không sinh con thứ hai. */
  React.useEffect(() => {
    const next = migrateMascots(store.getState());
    if (next) store.setState({ mascots: next });
  }, [store]);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (mascot: WorkflowMascot) => { setEditing(mascot); setDialogOpen(true); };

  const poseCount = s.mascotPoses.length;
  const shown = POSES.filter((pose) => pose.group === poseGroup);
  const groupChips = POSE_GROUPS.map((group) => ({
    id: group,
    label: group,
    count: POSES.filter((pose) => pose.group === group && s.mascotPoses.includes(pose.id)).length,
  }));

  return (
    <Step title="Mascot" copy="Thêm từng nhân vật và chọn các dáng cần vẽ.">
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
                return (
                  <button
                    key={pose.id}
                    type="button"
                    className={on ? "compact-element selected" : "compact-element"}
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
              })}
            </div>
          </section>

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
