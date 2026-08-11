import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Textarea } from "@/components/ui/textarea";
import { useWorkflowProjectId, useWorkflowStore } from "../lib/model";
import { useWorkflowRefs } from "../lib/refs-sync";
import { RefChips } from "../components/RefChips";
import { SegChoice } from "../components/SegChoice";
import { Step } from "./BriefStep";

/**
 * §W1-7 — DÁNG MASCOT: store giữ **id tiếng Anh**, UI hiện **nhãn tiếng Việt**.
 *
 * Bản cũ toggle bằng chính chuỗi nhãn và so `includes("đứng chờ")` với store chứa
 * `["idle","cheer","sad","present"]` ⇒ cả 4 nút hiện "chưa chọn" dù store nói đã chọn 4,
 * và bấm một nút làm mảng phồng lên 5 phần tử trộn hai hệ chữ. Đó là HỎNG DỮ LIỆU,
 * không phải lệch hiển thị.
 *
 * §W3-3 — ảnh ref nhân vật nay ĐI TỚI ĐĨA (`kind:"character"` ⇒ agent đặt tên `char-*.png`)
 * và được đính vào sheet dáng, nên 4 ô pose vẽ CÙNG một nhân vật thay vì bốn con khác nhau.
 */
export const POSES = [
  { id: "idle", label: "Đứng chờ", group: "Cơ bản" }, { id: "wave", label: "Vẫy tay", group: "Cơ bản" },
  { id: "point", label: "Chỉ tay", group: "Cơ bản" }, { id: "present", label: "Giới thiệu", group: "Cơ bản" },
  { id: "cheer", label: "Ăn mừng", group: "Cảm xúc" }, { id: "sad", label: "Buồn", group: "Cảm xúc" },
  { id: "think", label: "Suy nghĩ", group: "Cảm xúc" }, { id: "thumbs-up", label: "Giơ ngón cái", group: "Cảm xúc" },
  { id: "run", label: "Chạy", group: "Chuyển động" }, { id: "walk", label: "Đi bộ", group: "Chuyển động" },
  { id: "jump", label: "Nhảy", group: "Chuyển động" }, { id: "dance", label: "Nhảy múa", group: "Chuyển động" },
  { id: "hold-gift", label: "Ôm quà", group: "Chiến dịch" }, { id: "bow", label: "Cúi chào", group: "Chiến dịch" },
  { id: "sit", label: "Ngồi", group: "Chiến dịch" }, { id: "fly", label: "Bay", group: "Chiến dịch" },
  { id: "view-34", label: "Góc 3/4", group: "Góc nhìn" }, { id: "view-side", label: "Nhìn ngang", group: "Góc nhìn" },
  { id: "view-back", label: "Nhìn sau", group: "Góc nhìn" },
] as const;

export function MascotStep() {
  const s = useWorkflowStore();
  const projectId = useWorkflowProjectId();
  const refs = useWorkflowRefs(projectId);
  const [poseGroup, setPoseGroup] = useState("Cơ bản");

  if (!s.mascotEnabled) {
    return (
      <Step title="Mascot" copy="Bạn có thể bỏ qua nhân vật; bộ kit sẽ chỉ sinh giao diện.">
        <button type="button" className="choice-card selected" aria-pressed="false" onClick={() => s.set({ mascotEnabled: true })}>
          <strong>Không dùng mascot</strong>
          <span>Bật lại nếu cần nhân vật nhất quán ở nhiều dáng.</span>
        </button>
      </Step>
    );
  }

  const pickRef = (files: FileList | File[] | null) => {
    const file = files?.[0];
    if (!file) return;
    refs.add([file], "character");
    s.set({ mascotRef: { name: file.name } });
  };

  return (
    <Step title="Mascot" copy="Thêm nhân vật và ảnh ref để mọi pose giữ cùng khuôn mặt, màu và trang phục.">
      <div className="workflow-form-grid">
        <div>
          <label className="field-label" htmlFor="mascot-name">Tên nhân vật</label>
          <Input id="mascot-name" value={s.mascotName} onChange={(e) => s.set({ mascotName: e.target.value })} placeholder="Ví dụ: Mèo bạc hà" />
        </div>
        <div>
          <label className="field-label" htmlFor="mascot-description">Mô tả nhân vật</label>
          <Textarea id="mascot-description" rows={3} value={s.mascotDescription} onChange={(e) => s.set({ mascotDescription: e.target.value })} placeholder="Khuôn mặt, màu, trang phục…" />
        </div>
      </div>
      {/* §W2B-6 — chip ảnh vào TRONG khung vùng thả (xem StyleStep + globals.css). */}
      <div className="dropfield mascot-dropzone">
        <ImageDropzone label="Kéo ảnh nhân vật vào đây" description="Một ảnh rõ mặt, đủ trang phục để giữ nhận diện ở mọi pose" state={refs.pending ? "uploading" : refs.groups.character.length ? "done" : "idle"} onFiles={pickRef} />
        <RefChips
          items={refs.groups.character}
          ready={refs.ready}
          fallback={s.mascotRef ? [s.mascotRef] : []}
          onRemove={refs.remove}
        />
      </div>
      <section className="mascot-pose-picker">
        <div className="pose-heading"><div><p className="field-label">Bộ pose</p><strong>{s.mascotPoses.length} dáng đã chọn</strong></div><p>Chọn nhiều dáng trong cùng một bảng để giữ nhân vật nhất quán và tiết kiệm lượt.</p></div>
        <div className="pose-group-tabs">{[...new Set(POSES.map(p => p.group))].map(g => <button key={g} className={poseGroup === g ? "active" : ""} onClick={() => setPoseGroup(g)}>{g}<small>{POSES.filter(p => p.group === g).length}</small></button>)}</div>
        <div className="pose-choice-grid">{POSES.filter(p => p.group === poseGroup).map(p => { const on=s.mascotPoses.includes(p.id); return <SegChoice key={p.id} on={on} onClick={() => s.set({ mascotPoses: on ? s.mascotPoses.filter(x=>x!==p.id) : [...s.mascotPoses,p.id] })}>{p.label}</SegChoice>; })}</div>
        <div className="selected-poses"><span className="eyebrow">Sẽ vẽ</span>{s.mascotPoses.map(id=><button key={id} onClick={()=>s.set({mascotPoses:s.mascotPoses.filter(x=>x!==id)})}>{POSES.find(p=>p.id===id)?.label ?? id}<span aria-hidden>×</span></button>)}</div>
      </section>
    </Step>
  );
}
