/* @vitest-environment jsdom */
/**
 * Ô XEM TRƯỚC TRONG HỘP CHỌN — «cho xem trước cái dáng để biết dáng nào là dáng nào».
 *
 * ╔══ VÌ SAO CA NÀY PHẢI DỰNG HỘP THẬT ══════════════════════════════════════╗
 * ║ Cả tính năng này KHÔNG để lại một dấu vết nào trong prompt: cùng một câu   ║
 * ║ đi tới máy vẽ dù hộp có hình hay không. Nó chỉ tồn tại ở chỗ người dùng    ║
 * ║ NHÌN. Nên chỉ có một ca mở hộp thật và đếm thẻ `<img>` mới nói được rằng   ║
 * ║ nó còn sống — và quan trọng hơn: rằng hộp vẽ ĐÚNG tấm ảnh của DÒNG này,    ║
 * ║ chứ không phải 19 tấm chính diện trong khi dòng đang đặt «Ngang phải».     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * jsdom không có WebGL, nên `renderPoseDataUrl` bị thay bằng một hàm trả chuỗi có
 * ghi sẵn dáng+góc — nhờ thế ca dưới đọc được TẤM NÀO đã được đặt vẽ.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const renderPoseDataUrl = vi.fn(
  (input: { view: string; rootY: number }) => `data:image/png;base64,${input.view}|${input.rootY}`,
);
vi.mock("../lib/pose/pose-renderer", () => ({ renderPoseDataUrl, POSE_FOV: 34 }));

/* Kho preset thật đi qua TanStack Query + agent; ca ở đây nói về hộp chọn, không
   về đường tải danh mục — cùng thủ pháp với `mascot-block.test.tsx`. */
vi.mock("../lib/presets-store", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  const seed = (real["seedPresets"] as () => unknown)();
  return { ...real, usePresets: () => seed, getPresets: () => seed };
});

import { SourcePicker } from "../components/SourcePicker";
import { OptionPill } from "../components/pill-ui";
import { PoseRowContext } from "../lib/pose/use-pose-thumbs";
import { resetPoseThumbs } from "../lib/pose/pose-thumb";

const THUMB = "data:image/png;base64,co-hinh";

beforeEach(() => {
  resetPoseThumbs();
  renderPoseDataUrl.mockClear();
});

afterEach(cleanup);

/** Hộp trần, không qua pill: ca ① và ② chỉ nói về HÌNH DẠNG hộp. */
function Box({ previewOf }: { previewOf?: (value: string) => string | null }) {
  return (
    <SourcePicker
      label="dáng"
      groups={[{ options: [{ value: "wave", vi: "Vẫy tay" }, { value: "cheer", vi: "Ăn mừng" }] }]}
      emptyLabel="— để trống —"
      value=""
      custom=""
      image={null}
      onChoose={vi.fn()}
      onClose={vi.fn()}
      {...(previewOf ? { previewOf } : {})}
    />
  );
}

/** Ô ảnh và ô giữ chỗ dùng chung một cỡ — `size-20` LÀ 80px, cỡ chủ sản phẩm chốt. */
function boxes(root: HTMLElement) {
  return [...root.querySelectorAll(".size-20")];
}

describe("hộp chọn bày ô xem trước", () => {
  it("① mục có ảnh ⇒ `<img>`; mục không có ảnh ⇒ ô giữ chỗ CÙNG cỡ, không phải khoảng trống", () => {
    const { container } = render(<Box previewOf={(value) => (value === "wave" ? THUMB : null)} />);

    const shots = [...container.querySelectorAll("img")];
    expect(shots).toHaveLength(1);
    expect(shots[0]?.getAttribute("src")).toBe(THUMB);

    /* Ba dòng (để trống · Vẫy tay · Ăn mừng) ⇒ BA ô, dù chỉ một ô có hình: lề trái
       của mọi dòng phải bằng nhau, nếu không mắt mất cột để chạy dọc. */
    expect(boxes(container)).toHaveLength(3);
  });

  it("② hộp KHÔNG có hàm tra ảnh (chủ đề, phong cách…) giữ nguyên bố cục cũ — không chừa ô nào", () => {
    const { container } = render(<Box />);

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(boxes(container)).toHaveLength(0);
  });

  it("③ ô tìm nhanh và «Quản lý…» vẫn ở nguyên chỗ khi có ảnh — ô ảnh không được nuốt lối đi nào", () => {
    render(
      <SourcePicker
        label="dáng"
        groups={[{ options: Array.from({ length: 8 }, (_, n) => ({ value: `p${n}`, vi: `Dáng ${n}` })) }]}
        value=""
        custom=""
        image={null}
        manageHref="/library/prompts?kind=pose"
        previewOf={() => null}
        onChoose={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText("Tìm nhanh…")).toBeTruthy();
    expect(screen.getByText("Quản lý dáng…")).toBeTruthy();
  });
});

/** Pill thật, đặt trong một dòng đang mang dáng + góc cho trước. */
function Pill({ kind, value, pose, view }: { kind: "pose" | "view"; value: string; pose: string; view: string }) {
  return (
    <PoseRowContext.Provider value={{ pose, view }}>
      <OptionPill kind={kind} value={value} onChange={vi.fn()} />
    </PoseRowContext.Provider>
  );
}

describe("pill dáng/góc vẽ ĐÚNG tấm của dòng", () => {
  it("④ hộp «Dáng» vẽ mỗi dáng ở GÓC CỦA DÒNG, không phải góc mặc định", async () => {
    const { container } = render(<Pill kind="pose" value="wave" pose="wave" view="side-right" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(container.querySelectorAll("img").length).toBeGreaterThan(0));

    const views = new Set(renderPoseDataUrl.mock.calls.map((call) => call[0]?.view));
    expect([...views]).toEqual(["side-right"]);
    /* 8/19 dáng có bảng góc khớp; 11 dáng còn lại KHÔNG được mượn ảnh của `idle`. */
    expect(renderPoseDataUrl).toHaveBeenCalledTimes(8);
    expect(container.querySelectorAll("img")).toHaveLength(8);
  });

  it("⑤ hộp «Góc» vẽ DÁNG CỦA DÒNG ở từng góc — chín góc, cùng một dáng", async () => {
    const { container } = render(<Pill kind="view" value="front" pose="jump" view="front" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(container.querySelectorAll("img").length).toBe(9));

    /* `rootY` của «Nhảy» là 0.35 — đây là dấu vân tay nói rằng đúng dáng của dòng
       đã được dựng, chứ không phải một dáng mặc định nào đó. */
    const roots = new Set(renderPoseDataUrl.mock.calls.map((call) => call[0]?.rootY));
    expect([...roots]).toEqual([0.35]);
    expect(new Set(renderPoseDataUrl.mock.calls.map((call) => call[0]?.view)).size).toBe(9);
  });

  it("⑥ dòng đang ở một dáng KHÔNG dựng được hình ⇒ hộp «Góc» vẫn cho thấy góc, bằng dáng nghỉ", async () => {
    /* «Ăn mừng» có trong danh mục nhưng không có bảng góc khớp. Bày chín ô trống ở
       đây là giấu mất thứ người dùng đang đi tìm — chính là góc máy. */
    const { container } = render(<Pill kind="view" value="front" pose="cheer" view="front" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(container.querySelectorAll("img").length).toBe(9));
    const roots = new Set(renderPoseDataUrl.mock.calls.map((call) => call[0]?.rootY));
    expect([...roots]).toEqual([0]); // `idle` không nhấc gốc lên
  });

  it("⑦ mở lại hộp KHÔNG vẽ lại gì — cái nhớ là thứ giữ cho GPU khỏi cháy", async () => {
    const { container } = render(<Pill kind="pose" value="wave" pose="wave" view="front" />);
    const button = screen.getByRole("button");

    fireEvent.click(button);
    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(8));
    const first = renderPoseDataUrl.mock.calls.length;

    fireEvent.click(button); // đóng
    fireEvent.click(button); // mở lại
    /* Có hình NGAY ở nhịp render đầu, không nháy một vòng ô trống: `peek` đồng bộ. */
    expect(container.querySelectorAll("img")).toHaveLength(8);

    await waitFor(() => expect(renderPoseDataUrl.mock.calls.length).toBe(first));
  });
});
