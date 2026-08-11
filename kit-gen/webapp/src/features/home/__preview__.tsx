import { projectSchema, type Project } from "@/lib/types";
import { CreateKitTile, HomeEmpty, HomeError, HomeNoMatch, HomeSkeleton, KitCard } from ".";
import type { Gate } from "@/features/projects/lib/gate";
import type { KitActions } from "./components/KitCardMenu";

/**
 * STORY ĐỘC LẬP của màn H (FE3-PLAN §1.1 cấp `features/home/__preview__.tsx` cho H).
 *
 * **KHÔNG sửa `routes/__preview.tsx`** — Q là chủ trang preview tổng và sẽ ghép
 * `<HomePreview />` vào sau (§1.2-6). Đây đúng là bài học ownership của B2 ở FE-1.
 *
 * Dữ liệu dựng SẴN, không hook, không query ⇒ mọi trạng thái hiện ra tất định, kể cả
 * những ca khó dựng thật (agent tắt, bộ kit hỏng, 5 trạng thái cùng lúc).
 * Runtime của app vẫn đi qua `ProjectsScreen → useHomeData → useProjectsData`.
 *
 * `now` được ghim để chuỗi «Xong · 2 giờ trước» không đổi theo đồng hồ máy khi soi ảnh.
 */
const NOW = Date.parse("2026-08-07T12:00:00Z");

const ON: Gate = { readOnly: false, reason: "", longReason: "", code: null };
const OFF: Gate = {
  readOnly: true,
  reason: "Cần công cụ local đang chạy",
  longReason: "Bộ kit nằm trên máy bạn. Mở Terminal chạy công cụ local rồi thử lại.",
  code: "AGENT_NOT_RUNNING",
};

const NOOP: KitActions = {
  open: () => {}, rename: () => {}, duplicate: () => {}, exportZip: () => {}, remove: () => {},
};

/**
 * `projectSchema.parse` chứ không phải ép kiểu: nó điền hộ mọi trường có `default`
 * (`variants`, `sheets`, `staleReason`…) đúng như dữ liệu thật từ agent, nên story
 * không bao giờ dựng được một `Project` mà runtime không thể có.
 * Nhận `unknown` vì đầu vào ở đây là JSON thô, chưa phải `Project`.
 */
const kit = (over: Record<string, unknown> & { id: string; name: string }): Project =>
  projectSchema.parse({ tags: [], ...over });

/** Đúng 5 trạng thái UX-V3 §1.3 × 2 hình thái — thứ Q1 phải soi mắt. */
const KITS: Project[] = [
  kit({
    id: "tet26", name: "Tết Vietcombank", tags: ["kg-workflow", "tet"],
    updatedAt: "2026-08-07T11:00:00Z",
    stats: { rawPresent: 4 }, state: { activeRun: { runId: "r1", done: 2, total: 6 } },
  }),
  kit({
    id: "he", name: "Ý tưởng hè", tags: ["kg-canvas"], updatedAt: "2026-08-07T10:00:00Z",
    stats: { rawPresent: 3, lastRun: { id: "r0", at: "2026-08-07T10:00:00Z", ok: 3, fail: 0 } },
  }),
  kit({ id: "candy", name: "Candy Lite", updatedAt: "2026-08-06T09:00:00Z", stats: { rawPresent: 0 } }),
  kit({
    id: "noel", name: "Noel 2026", tags: ["kg-workflow"], updatedAt: "2026-08-05T09:00:00Z",
    stats: { rawPresent: 2 }, state: { stale: true },
  }),
  kit({
    id: "hoa", name: "Hoa mai", tags: ["kg-canvas"], updatedAt: "2026-08-04T09:00:00Z",
    stats: { rawPresent: 2 }, state: { jobs: { "hoa-main": "failed" } },
  }),
  kit({
    id: "old", name: "candy-old-11b2", broken: true,
    error: { code: "PROJECT_BROKEN", file: "project.json", line: 12 },
  }),
];

function Case({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-label text-fg-strong">{title}</h3>
        {note && <p className="text-caption text-fg-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function HomePreview() {
  return (
    <div className="flex flex-col gap-10">
      <Case
        title="Lưới thẻ — 5 trạng thái × 2 hình thái + 1 bộ kit hỏng"
        note="Ô ✚ là nút CTA accent DUY NHẤT của màn. Mỗi thẻ đúng 1 dòng trạng thái."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CreateKitTile gate={ON} onCreate={() => {}} />
          {KITS.map((p, i) => (
            <KitCard key={p.id} project={p} actions={NOOP} gate={ON} fromCache={false} tabIndex={i === 0 ? 0 : -1} now={NOW} />
          ))}
        </div>
      </Case>

      <Case title="Agent chưa chạy — thẻ xám bớt, ô ✚ khoá KÈM LÝ DO (không ẩn)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CreateKitTile gate={OFF} onCreate={() => {}} />
          {KITS.slice(0, 2).map((p) => (
            <KitCard key={p.id} project={p} actions={NOOP} gate={OFF} fromCache tabIndex={-1} now={NOW} />
          ))}
        </div>
      </Case>

      <Case title="loading — 6 thẻ skeleton ĐÚNG khung thẻ thật, không spinner giữa màn">
        <HomeSkeleton />
      </Case>

      <Case title="empty — chưa có bộ kit nào">
        <HomeEmpty gate={ON} onCreate={() => {}} />
      </Case>

      <Case title="tìm ra 0 kết quả">
        <HomeNoMatch query="zzz" onClear={() => {}} />
      </Case>

      <Case title="error — agent CÓ trả lời nhưng danh sách hỏng (mã lỗi chỉ trong «Chi tiết»)">
        <HomeError error={{ code: "AGENT_INTERNAL" }} onRetry={() => {}} />
      </Case>
    </div>
  );
}

export default HomePreview;
