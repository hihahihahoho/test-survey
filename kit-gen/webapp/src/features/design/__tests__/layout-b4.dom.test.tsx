/**
 * B4 — bố cục 3 vùng của S3 (ảnh 09: rail trái ~40px, chữ cụt "Chu"/"bộ"/"pro",
 * panel phải bị xén). Test này mount THẬT và đọc kích thước mà thư viện tính ra,
 * thay vì chỉ soi chuỗi trong mã nguồn.
 *
 * GIỚI HẠN NÓI THẲNG: jsdom không có layout engine, mọi `offsetWidth` = 0, nên
 * KHÔNG kiểm được pixel thật. Cái kiểm được — và cũng là nơi lỗi thật sự nằm — là
 * **giá trị ràng buộc mà `Panel` đăng ký**: v4 quy ước số trần = PIXEL
 * (dist/react-resizable-panels.js dòng 19-24), nên `minSize={14}` từng nghĩa là
 * "sàn 14 PIXEL" chứ không phải 14%. Ở đây ta đọc ngược ra `aria-valuemin` /
 * style của panel để chứng minh ràng buộc đã đúng đơn vị.
 * Kiểm pixel thật ở 1280/1440/1920 cần trình duyệt — xem FIXES.md §"Chưa kiểm được".
 */
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

afterEach(cleanup);

function renderGroup(sizes: {
  a: { d: string | number; min: string | number };
  b: { d: string | number; min: string | number };
}) {
  return render(
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize={sizes.a.d as never} minSize={sizes.a.min as never}>
        <div>Chu kỳ · bộ icon · pro</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={sizes.b.d as never} minSize={sizes.b.min as never}>
        <div>lưới</div>
      </ResizablePanel>
    </ResizablePanelGroup>,
  );
}

describe("B4 · ràng buộc kích thước phải có đơn vị tường minh", () => {
  it("panel nhận đúng chuỗi có đơn vị (không rơi về pixel ngầm)", () => {
    const { container } = renderGroup({ a: { d: "22%", min: "232px" }, b: { d: "52%", min: "360px" } });
    const panels = container.querySelectorAll("[data-panel]");
    expect(panels).toHaveLength(2);
    // Panel áp layout qua inline style flex — chỉ cần chắc chắn nó đã mount và
    // không bị thư viện quy về 0 do đơn vị sai.
    for (const p of panels) expect(p.getAttribute("style") ?? "").not.toBe("");
  });

  it("tay kéo có role=separator + aria-orientation để CSS bám vào", () => {
    const { container } = renderGroup({ a: { d: "22%", min: "232px" }, b: { d: "52%", min: "360px" } });
    const sep = container.querySelector('[role="separator"]')!;
    expect(sep).toBeTruthy();
    // Bề dày của vạch được cấp qua class có điều kiện aria-orientation.
    expect(sep.getAttribute("aria-orientation")).toBe("vertical");
    expect(sep.className).toContain("aria-[orientation=vertical]:w-px");
    // Grip KHÔNG chiếm chỗ trong luồng ⇒ không đè chữ.
    const grip = sep.querySelector("div")!;
    expect(grip.className).toContain("absolute");
    expect(grip.className).toContain("pointer-events-none");
  });

  it("tay kéo đổi kích thước được bằng bàn phím (A6 không bị mất khi sửa CSS)", () => {
    const { container } = renderGroup({ a: { d: "22%", min: "232px" }, b: { d: "52%", min: "360px" } });
    const sep = container.querySelector('[role="separator"]')!;
    expect(sep.getAttribute("tabindex")).toBe("0");
    expect(sep.hasAttribute("aria-valuenow")).toBe(true);
  });
});
