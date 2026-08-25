import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { JOINT_GROUPS, joint, type JointId } from "../lib/skeleton";
import type { PoseAngles } from "../lib/pose-state";

/**
 * JointPanel — ĐƯỜNG NẮN KHỚP DỰ PHÒNG bằng slider.
 *
 * ╔══ VÌ SAO CÓ CẢ SLIDER KHI ĐÃ CÓ GIZMO ═══════════════════════════════════╗
 * ║ Gizmo xoay nhanh nhưng có ba chỗ nó thua hẳn:                             ║
 * ║  ① Người chưa từng dùng phần mềm 3D không đoán ra ba cái vòng tròn kia làm ║
 * ║    gì — slider có CHỮ nói rõ "gập khuỷu", "dang tay".                      ║
 * ║  ② Ở góc nhìn xấu, vòng gizmo bị bóp thành một đường thẳng, kéo không nổi. ║
 * ║  ③ Gizmo xoay TỰ DO; slider có DẢI GIỚI HẠN nên không nắn ra khớp gãy      ║
 * ║    ngược — thứ mà máy vẽ sau này sẽ học theo y hệt.                        ║
 * ║ Hai đường ghi vào cùng một `PoseAngles`, nên kéo gizmo thì slider nhảy     ║
 * ║ theo và ngược lại — không có state thứ hai để lệch.                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Chỉ mở slider của khớp ĐANG CHỌN: 17 khớp × 3 trục = 51 thanh, đổ hết ra thì
 * panel thành một bức tường không ai đọc.
 */
export interface JointPanelProps {
  angles: PoseAngles;
  selected: JointId | null;
  onSelect: (id: JointId) => void;
  onAxisChange: (id: JointId, axis: "x" | "y" | "z", value: number) => void;
  rootY: number;
  onRootY: (value: number) => void;
}

export function JointPanel({ angles, selected, onSelect, onAxisChange, rootY, onRootY }: JointPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-label font-medium text-fg-strong">Nâng / hạ cả người</p>
        <p className="mb-1.5 text-caption text-fg-muted">
          Xoay khớp không làm nhân vật ngồi xuống hay bật lên được — nên độ cao gốc là một ô riêng.
        </p>
        <div className="flex items-center gap-3">
          <Slider
            className="flex-1"
            min={-100}
            max={100}
            step={1}
            value={[Math.round(rootY * 100)]}
            onValueChange={(v) => onRootY((v[0] ?? 0) / 100)}
          />
          <span className="w-14 shrink-0 text-right font-mono text-caption tabular-nums text-fg-muted">
            {rootY.toFixed(2)}
          </span>
        </div>
      </div>

      {JOINT_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 text-label font-medium text-fg-strong">{group.label}</p>
          <div className="flex flex-col gap-1">
            {group.ids.map((id) => {
              const def = joint(id);
              const isOpen = selected === id;
              const angle = angles[id];
              const touched = angle[0] !== 0 || angle[1] !== 0 || angle[2] !== 0;
              return (
                <div key={id} className="rounded-2 border border-line-subtle">
                  <button
                    type="button"
                    onClick={() => onSelect(id)}
                    aria-expanded={isOpen}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-2 px-2.5 py-1.5 text-left text-label transition-colors",
                      isOpen ? "bg-accent/[var(--kg-tint-a)] text-fg-strong" : "text-fg hover:bg-raised"
                    )}
                  >
                    <span className="truncate">{def.label}</span>
                    {/* Dấu chấm = "khớp này đã bị nắn" — để tìm lại chỗ mình lỡ tay
                        mà không phải mở từng khớp ra xem. */}
                    {touched ? <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label="đã chỉnh" /> : null}
                  </button>

                  {isOpen ? (
                    <div className="flex flex-col gap-2.5 border-t border-line-subtle px-2.5 py-2.5">
                      {def.axes.map((spec) => {
                        const value = angle[spec.axis === "x" ? 0 : spec.axis === "y" ? 1 : 2];
                        return (
                          <div key={spec.axis}>
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <span className="text-caption text-fg-muted">{spec.label}</span>
                              <span className="font-mono text-caption tabular-nums text-fg-muted">
                                {Math.round(value)}°
                              </span>
                            </div>
                            <Slider
                              min={spec.min}
                              max={spec.max}
                              step={1}
                              value={[Math.round(value)]}
                              onValueChange={(v) => onAxisChange(id, spec.axis, v[0] ?? 0)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
