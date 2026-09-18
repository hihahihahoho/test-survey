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
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const renderPoseDataUrl = vi.fn(
  (input: { view: string; rootY: number; size: number }) =>
    `data:image/png;base64,${input.view}|${input.rootY}|${input.size}`,
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
import { MascotBlockBody } from "../components/MascotBlockView";
import { OptionPill, SOURCE_PICKER_MAX_PX, SOURCE_PICKER_TALL_PX } from "../components/pill-ui";
import { newMascotBlock, newMascotPose, type MascotBlock } from "../lib/composer-model";
import { PoseRowContext } from "../lib/pose/use-pose-thumbs";
import { POSE_THUMB_SIZE, ROW_THUMB_SIZE, resetPoseThumbs } from "../lib/pose/pose-thumb";

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

/** Ô ảnh và ô giữ chỗ dùng chung một cỡ — `size-[4.5rem]` LÀ 72px. */
function boxes(root: HTMLElement) {
  return [...root.querySelectorAll('[class*="size-[4.5rem]"]')];
}

/** Khung ngoài của hộp — nơi đeo trần cao. */
function panel(root: HTMLElement) {
  return root.querySelector("[aria-label^='Nguồn cho']");
}

/**
 * Trần cao ĐỌC RA TỪ CLASS, tính bằng px — để so THẲNG với hằng mà phép lật dùng.
 * Đây là cái chốt giữ hai con số ấy đi cùng nhau: đổi `max-h-[…]` mà quên đổi
 * `SOURCE_PICKER_*_PX` thì hộp đo chỗ trống bằng một chiều cao nó không có, mở
 * xuống dưới ở một pill gần đáy màn rồi bị cắt mất chân — một hỏng chỉ hiện ra ở
 * đúng vài trăm pixel cuối trang, tức là thứ không ai gặp lúc đang sửa nó.
 */
function maxHeightPx(box: Element | null): number {
  const rem = /max-h-\[([0-9.]+)rem\]/.exec(box?.className ?? "")?.[1];
  return Number(rem) * 16;
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

  it("③ có ô xem trước ⇒ hộp CAO HƠN; không có thì giữ nguyên trần cũ", () => {
    /* Trần không phải chuyện thẩm mỹ: dòng có ảnh cao ~84px, nên trần 360px chỉ
       bày nổi ~3 trong 19 dáng. Hai con số này còn phải khớp `SOURCE_PICKER_*_PX`
       — chính chúng nói cho hộp biết còn chỗ mở xuống dưới hay phải lật lên. */
    const { container: withShots } = render(<Box previewOf={() => THUMB} />);
    expect(maxHeightPx(panel(withShots))).toBe(SOURCE_PICKER_TALL_PX);

    cleanup();
    const { container: plain } = render(<Box />);
    expect(maxHeightPx(panel(plain))).toBe(SOURCE_PICKER_MAX_PX);
  });

  it("④ ô tìm nhanh và «Quản lý…» vẫn ở nguyên chỗ khi có ảnh — ô ảnh không được nuốt lối đi nào", () => {
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
  it("⑤ hộp «Dáng» vẽ mỗi dáng ở GÓC CỦA DÒNG, không phải góc mặc định", async () => {
    const { container } = render(<Pill kind="pose" value="wave" pose="wave" view="side-right" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(container.querySelectorAll("img").length).toBeGreaterThan(0));

    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(19));

    const views = new Set(renderPoseDataUrl.mock.calls.map((call) => call[0]?.view));
    expect([...views]).toEqual(["side-right"]);
    /* 19/19 từ 18/09/2026 — không dòng nào trong danh mục còn bày ô xám. */
    expect(renderPoseDataUrl).toHaveBeenCalledTimes(19);
  });

  it("⑥ hộp «Góc» vẽ DÁNG CỦA DÒNG ở từng góc — chín góc, cùng một dáng", async () => {
    const { container } = render(<Pill kind="view" value="front" pose="jump" view="front" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(container.querySelectorAll("img").length).toBe(9));

    /* `rootY` của «Nhảy» là 0.35 — đây là dấu vân tay nói rằng đúng dáng của dòng
       đã được dựng, chứ không phải một dáng mặc định nào đó. */
    const roots = new Set(renderPoseDataUrl.mock.calls.map((call) => call[0]?.rootY));
    expect([...roots]).toEqual([0.35]);
    expect(new Set(renderPoseDataUrl.mock.calls.map((call) => call[0]?.view)).size).toBe(9);
  });

  it("⑦ dòng đang ở một dáng KHÔNG dựng được hình ⇒ hộp «Góc» vẫn cho thấy góc, bằng dáng nghỉ", async () => {
    /* Ô dáng ĐỂ TRỐNG (hoặc một câu người dùng tự gõ) — bày chín ô trống ở đây là
       giấu mất thứ người dùng đang đi tìm, chính là góc máy. */
    const { container } = render(<Pill kind="view" value="front" pose="" view="front" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(container.querySelectorAll("img").length).toBe(9));
    const roots = new Set(renderPoseDataUrl.mock.calls.map((call) => call[0]?.rootY));
    expect([...roots]).toEqual([0]); // `idle` không nhấc gốc lên
  });

  it("⑧ mở lại hộp KHÔNG vẽ lại gì — cái nhớ là thứ giữ cho GPU khỏi cháy", async () => {
    const { container } = render(<Pill kind="pose" value="wave" pose="wave" view="front" />);
    const button = screen.getByRole("button");

    fireEvent.click(button);
    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(19));
    const first = renderPoseDataUrl.mock.calls.length;

    fireEvent.click(button); // đóng
    fireEvent.click(button); // mở lại
    /* Có hình NGAY ở nhịp render đầu, không nháy một vòng ô trống: `peek` đồng bộ. */
    expect(container.querySelectorAll("img")).toHaveLength(19);

    await waitFor(() => expect(renderPoseDataUrl.mock.calls.length).toBe(first));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Ô XEM TRƯỚC Ở ĐẦU DÒNG — «chọn xong rồi thì thấy mình vừa chọn cái gì»
   ══════════════════════════════════════════════════════════════════════════
   Hộp chọn đóng lại ngay sau cú bấm, và thứ còn lại trên màn là hai chữ trong
   một pill. Ca dưới đây khoá cái phần CÒN LẠI ấy: một bản nháp 12 dòng phải đọc
   được bằng mắt, không phải bằng cách mở lại 12 cái hộp. */

/** Một thẻ Nhân vật đúng MỘT dòng, dáng và góc do ca chỉ định. */
function Rows({ pose, view }: { pose: string; view: string }) {
  const block = React.useMemo<MascotBlock>(
    () => ({ ...newMascotBlock(), poses: [{ ...newMascotPose(pose, view), id: "p1" }] }),
    [pose, view],
  );
  return <MascotBlockBody block={block} onChange={() => {}} />;
}

/** Ô 40px ở đầu dòng — ảnh thật hoặc ô giữ chỗ tàng hình, cùng một cỡ. */
function rowBoxes(root: HTMLElement) {
  return [...root.querySelectorAll('[class~="size-10"]')];
}

describe("đầu dòng mang tấm ảnh của chính dòng ấy", () => {
  it("⑨ dòng đã chọn dáng ⇒ một tấm 40px, dựng ĐÚNG cỡ 40 (không phải cỡ hộp chọn bị CSS thu nhỏ)", async () => {
    const { container } = render(<Rows pose="bow" view="side-right" />);

    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(1));
    const shot = container.querySelector("img")!;

    /* Dấu vết của mock ghi cả góc lẫn cạnh: đủ để nói tấm này là tấm của DÒNG,
       không phải một tấm nào khác lọt vào. */
    expect(shot.getAttribute("src")).toContain("side-right|");
    expect(shot.getAttribute("src")).toContain(`|${ROW_THUMB_SIZE}`);
    /* Không một lượt nào dựng ở cỡ hộp chọn: dựng 72 rồi để CSS kéo về 40 là một
       manơcanh nhoè và gấp ba lần byte giữ trong RAM cho mỗi dòng. */
    expect(renderPoseDataUrl.mock.calls.map((call) => call[0]?.size)).not.toContain(POSE_THUMB_SIZE);

    /* ĐỨNG NGAY CẠNH SỐ THỨ TỰ — đó là cột mắt người dùng chạy dọc. */
    expect(shot.previousElementSibling?.textContent).toBe("#1");
  });

  it("⑩ ô dáng để trống ⇒ KHÔNG ảnh và KHÔNG chừa chỗ: dòng chưa từng có dáng không mọc thêm ô rỗng", async () => {
    const { container } = render(<Rows pose="" view="front" />);

    await waitFor(() => expect(screen.getByText("#1")).toBeTruthy());
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(rowBoxes(container)).toHaveLength(0);
    expect(renderPoseDataUrl).not.toHaveBeenCalled();
  });

  it("⑪ xoá dáng của một dòng ĐÃ có ảnh ⇒ ô giữ chỗ TÀNG HÌNH thay vào, dòng không tụt chiều cao", async () => {
    /* Chốt một chiều: chiều cao hàng 1 chỉ được đổi đúng một lần, ở nhịp dòng có
       ảnh lần đầu. Bấm «— để trống —» mà dòng tụt một bậc là mọi dòng bên dưới
       nhảy lên ngay dưới ngón tay người vừa bấm. */
    const { container, rerender } = render(<Rows pose="wave" view="front" />);
    await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(1));

    rerender(<Rows pose="" view="front" />);

    expect(container.querySelectorAll("img")).toHaveLength(0);
    const cho = rowBoxes(container);
    expect(cho).toHaveLength(1);
    /* TÀNG HÌNH, không viền: nó là khoảng trống, không phải một tấm ảnh hỏng. */
    expect(cho[0]?.className).not.toContain("border");
    expect(cho[0]?.getAttribute("aria-hidden")).toBe("true");
  });

  it("⑫ đổi GÓC của dòng ⇒ tấm đầu dòng đổi theo ngay, không đợi mở hộp nào", async () => {
    const { container, rerender } = render(<Rows pose="wave" view="front" />);
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toContain("front|"));

    rerender(<Rows pose="wave" view="back" />);
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toContain("back|"));

    expect(renderPoseDataUrl).toHaveBeenCalledTimes(2);
  });
});
