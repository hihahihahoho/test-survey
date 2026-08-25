/* @vitest-environment jsdom */
/**
 * NÚT [Cắt N lượt] Ở MÀN "ẢNH ĐÃ TẠO" — dải cảnh báo phải ĐƯA RA ĐƯỢC việc nó vừa nêu.
 *
 * ══ LỖI ĐANG KHOÁ ═══════════════════════════════════════════════════════════
 * `ImagesSection` mắc `StaleBanner` với `onSlice={null}` đóng cứng. `StaleBanner` coi
 * `null` là "màn này không cắt được" nên nó ẨN LUÔN nút (`canSlice`), trong khi vẫn
 * hiện đúng câu *"N lượt có ảnh mới nhưng chưa cắt"* kèm lời khuyên *"cắt để kit khớp
 * với ảnh mới nhất — bước này không tiêu quota"*. Kết quả là một dải cảnh báo bảo
 * người dùng làm một việc rồi không đưa ra chỗ nào để làm nó.
 *
 * Lịch sử (để không sửa nhầm chỗ): handler THẬT từng sống ở màn cha `ProjectScreen`
 * (`onSlice={... slice.run(warning.uncutJobs)}`) và bị xoá trong `59e59e3`; `2048593`
 * mắc lại dải cảnh báo nhưng chỉ nối nửa "sinh", để nửa "cắt" là `null`. Nên chữa
 * đúng chỗ = trả handler về màn cha, không phải chế một nút mới trong dải.
 *
 * ══ RANH GIỚI CỦA FILE NÀY ══════════════════════════════════════════════════
 * Ở đây kiểm HAI mắt xích, tách bạch:
 *   ① dải cảnh báo → gọi `onSlice` với ĐÚNG tập lượt chưa cắt, và KHÔNG chạm `onGenerate`;
 *   ② hook cắt của màn dự án → gửi `kind:"slice"`, không bao giờ là `"gen"`.
 * Nối hai mắt xích đó là một dòng JSX ở `ProjectScreen` (`onSlice={slice.run}`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { Gate } from "@/features/projects/lib/gate";
import type { Contract, Project } from "@/lib/types";

/* Xem ghi chú cùng tên ở `features/design/__tests__/slice-wiring.test.tsx`: ca này
   mount thật + tự trả tiền transform, nên dưới tải song song nó vượt mốc 5s mặc định
   rồi rò DOM sang ca sau. Nới mốc là sửa đúng nguyên nhân, không phải giấu test chậm. */
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 });

const H = vi.hoisted(() => ({
  startRun: vi.fn(),
  toasts: [] as { level: string; title: string }[],
}));

/* Chỉ giả những thứ NÓI CHUYỆN VỚI THẾ GIỚI. Phần đang kiểm — dây nối từ nút xuống
   payload — vẫn là mã thật. */
vi.mock("@/lib/hooks", () => ({
  useRuns: () => ({ data: { items: [] } }),
  useStartRun: () => ({ mutate: H.startRun, isPending: false }),
  /* `RunFailBanner` đứng ngay trên dải cảnh báo và đọc version agent để dựng câu lỗi. */
  useHealth: () => ({ data: null }),
}));
vi.mock("@/components/ui/sonner", () => ({
  KG_TOAST_DURATION: { success: 4000, info: 5000, warning: 8000, error: Number.POSITIVE_INFINITY },
  toast: {
    success: (title: string) => void H.toasts.push({ level: "success", title }),
    info: (title: string) => void H.toasts.push({ level: "info", title }),
    warning: (title: string) => void H.toasts.push({ level: "warning", title }),
    error: (title: string) => void H.toasts.push({ level: "error", title }),
  },
}));
/* Lưới kết quả + ba cửa ra kéo theo canvas, clipboard và cả màn demo — không phải thứ
   đang kiểm, và để nguyên thì một test về dây nối biến thành test tích hợp toàn trang. */
vi.mock("@/features/kit-core/components/GeneratedResults", () => ({ GeneratedResults: () => null }));
vi.mock("@/features/kit-core/components/KitExits", () => ({
  DownloadKitButton: () => null,
  CopyFigmaButton: () => null,
}));
vi.mock("@/features/demo", () => ({ DemoScreenButton: () => null }));

const contract = {
  schemaVersion: 4,
  characterPoses: [],
  variants: [{ id: "chinh", vi: "Chính", style: "vui", bg: "magenta", characters: [] }],
  sheets: [{ id: "main", grid: { cols: 1, rows: 1 }, components: [] }],
} as unknown as Contract;

const gate: Gate = { readOnly: false, reason: "", longReason: "", code: null };

/** `uncut` = raw mới hơn kits ⇒ đúng ca mà dải cảnh báo mời người dùng cắt lại. */
const project = (jobs: Record<string, string>): Project =>
  ({ id: "p1", name: "Dự án", tags: [], broken: false, state: { stale: true, staleReason: ["raw>kits"], jobs } }) as unknown as Project;

async function mountSection(handlers: { onGenerate: () => void; onSlice: (jobs: string[]) => void }, jobs: Record<string, string>) {
  const { ImagesSection } = await import("../sections/ImagesSection");
  return render(
    <ImagesSection
      projectId="p1"
      kitName="Tết 2026"
      group="all"
      contract={contract}
      project={project(jobs)}
      gate={gate}
      jobStates={{}}
      readOnly={false}
      onGenerate={handlers.onGenerate}
      onSlice={handlers.onSlice}
    />,
  );
}

beforeEach(() => {
  H.startRun.mockReset();
  H.toasts.length = 0;
});
afterEach(cleanup);

describe("① dải cảnh báo đưa ra được việc nó vừa nêu", () => {
  it("có lượt chưa cắt ⇒ nút cắt HIỆN RA (bản cũ `onSlice={null}` ẩn mất nó)", async () => {
    await mountSection({ onGenerate: vi.fn(), onSlice: vi.fn() }, { "chinh-main": "uncut" });
    expect(screen.getByRole("button", { name: /Cắt 1 lượt/ })).toBeTruthy();
  });

  it("bấm nút ⇒ gọi `onSlice` với ĐÚNG tập lượt chưa cắt", async () => {
    const onSlice = vi.fn();
    await mountSection({ onGenerate: vi.fn(), onSlice }, { "chinh-main": "uncut" });
    fireEvent.click(screen.getByRole("button", { name: /Cắt 1 lượt/ }));

    expect(onSlice).toHaveBeenCalledTimes(1);
    expect(onSlice.mock.calls[0]![0]).toEqual(["chinh-main"]);
    /* `jobs` rỗng nghĩa là "cắt TẤT CẢ" với agent — nút nói "1 lượt" thì phải gửi
       đúng 1 lượt, không được rơi về mảng rỗng. */
    expect(onSlice.mock.calls[0]![0]).not.toEqual([]);
  });

  it("cắt KHÔNG được chạm vào đường sinh ảnh — hai việc khác giá tiền", async () => {
    const onGenerate = vi.fn();
    await mountSection({ onGenerate, onSlice: vi.fn() }, { "chinh-main": "uncut" });
    fireEvent.click(screen.getByRole("button", { name: /Cắt 1 lượt/ }));
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("không còn gì chưa cắt ⇒ không mọc nút thừa", async () => {
    await mountSection({ onGenerate: vi.fn(), onSlice: vi.fn() }, { "chinh-main": "ok" });
    expect(screen.queryByRole("button", { name: /Cắt \d+ lượt/ })).toBeNull();
  });
});

describe("② hook cắt của màn dự án gửi đúng `kind:\"slice\"`", () => {
  const nav = {
    toRun: vi.fn(), toRuns: vi.fn(), toProjects: vi.fn(), toOverview: vi.fn(), toSettings: vi.fn(),
    toDesign: vi.fn(), toKit: vi.fn(), toEnvSettings: vi.fn(), toTrash: vi.fn(),
  };

  it("`run(jobs)` ⇒ payload `kind:\"slice\"`, KHÔNG phải `\"gen\"`", async () => {
    const { useSliceRun } = await import("../lib/useSliceRun");
    const { result } = renderHook(() => useSliceRun("p1", nav));

    result.current.run(["chinh-main"]);

    expect(H.startRun).toHaveBeenCalledTimes(1);
    const input = H.startRun.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.kind).toBe("slice");
    expect(input.kind).not.toBe("gen");
    expect(input.jobs).toEqual(["chinh-main"]);
    expect(input.autoSliceAfterGen).toBe(false);
  });

  it("tập lượt rỗng ⇒ KHÔNG gửi request, nói ra bằng toast", async () => {
    const { useSliceRun } = await import("../lib/useSliceRun");
    const { result } = renderHook(() => useSliceRun("p1", nav));

    result.current.run([]);

    expect(H.startRun).not.toHaveBeenCalled();
    expect(H.toasts.some((t) => t.level === "info")).toBe(true);
  });
});
