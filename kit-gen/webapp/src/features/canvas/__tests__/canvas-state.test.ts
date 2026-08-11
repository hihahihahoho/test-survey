/**
 * Tầng THUẦN HÀM của khung canvas — chạy ở environment "node" (config gốc R0),
 * không cần jsdom. Test DOM nằm ở `canvas-shell.dom.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import { canvasDocSchema, type CanvasDoc } from "@/features/docs/lib";
import { DocsRepoError } from "@/features/docs/lib/docs-errors";
import { fitRect } from "@/lib/viewport";
import {
  canvasErrorCopy,
  canvasPhase,
  contentRectOf,
  isTypingTarget,
  saveCopy,
  showsViewport,
} from "../lib/canvas-state";
import { DOT_BASE_STEP, DOT_STEP_MAX, DOT_STEP_MIN, dotGridStyle, dotStepMultiple } from "../lib/dot-grid";

const P = (o: Partial<Parameters<typeof canvasPhase>[0]> = {}) =>
  canvasPhase({ isLoading: false, timedOut: false, isError: false, nodeCount: 0, ...o });

describe("canvasPhase — năm trạng thái, không ca nào rơi ra ngoài", () => {
  it("lỗi thắng mọi thứ khác", () => {
    expect(P({ isError: true, isLoading: true })).toBe("error");
  });
  it("đang tải chưa quá hạn ⇒ loading; quá hạn ⇒ timeout", () => {
    expect(P({ isLoading: true })).toBe("loading");
    expect(P({ isLoading: true, timedOut: true })).toBe("timeout");
  });
  it("tải xong mà không có node ⇒ empty (đây là ca mặc định của FE-2)", () => {
    expect(P()).toBe("empty");
  });
  it("có node ⇒ ready", () => {
    expect(P({ nodeCount: 1 })).toBe("ready");
  });
  it("khung nhìn vẫn render ở error/empty/ready, chỉ ẩn khi chưa có dữ liệu", () => {
    expect(showsViewport("error")).toBe(true);
    expect(showsViewport("empty")).toBe(true);
    expect(showsViewport("ready")).toBe(true);
    expect(showsViewport("loading")).toBe(false);
    expect(showsViewport("timeout")).toBe(false);
  });
});

describe("contentRectOf — nguồn của ⌘1", () => {
  it("canvas rỗng/null ⇒ null, và fitRect nuốt được null mà không NaN", () => {
    expect(contentRectOf(null)).toBeNull();
    expect(contentRectOf(canvasDocSchema.parse({}))).toBeNull();
    const vp = fitRect(null, { width: 800, height: 600 });
    expect(Number.isFinite(vp.x) && Number.isFinite(vp.y) && Number.isFinite(vp.k)).toBe(true);
  });

  it("gộp đúng bbox của nhiều node", () => {
    const doc = canvasDocSchema.parse({
      nodes: [
        { id: "a", type: "note", x: 10, y: 20, w: 100, h: 50 },
        { id: "b", type: "note", x: -30, y: 5, w: 40, h: 40 },
      ],
    });
    expect(contentRectOf(doc)).toEqual({ x: -30, y: 5, width: 140, height: 65 });
  });

  /**
   * `canvasDocSchema` CHẶN được NaN (đã kiểm: `parse` ném ZodError), nên lớp bảo vệ
   * trong `contentRectOf` chỉ có ý nghĩa cho dữ liệu KHÔNG đi qua schema — ví dụ node
   * do FE-3 dựng trong bộ nhớ trước khi lưu. Test vì thế cố tình đi vòng qua schema
   * thay vì giả vờ rằng schema để lọt.
   */
  it("node toạ độ hỏng (không qua schema) bị bỏ qua thay vì làm hỏng cả bbox", () => {
    expect(() =>
      canvasDocSchema.parse({ nodes: [{ id: "bad", type: "note", x: Number.NaN, y: 0 }] }),
    ).toThrow();

    const doc = {
      nodes: [
        { id: "ok", type: "note", x: 0, y: 0, w: 10, h: 10 },
        { id: "bad", type: "note", x: Number.NaN, y: 0, w: 10, h: 10 },
      ],
      viewport: { x: 0, y: 0, k: 1 },
    } as unknown as CanvasDoc;
    expect(contentRectOf(doc)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });
});

describe("copy — thân UI không bao giờ thấy chuỗi kỹ thuật", () => {
  it("DocsRepoError: câu người thường ở title, mã lỗi CHỈ ở detail", () => {
    const c = canvasErrorCopy(new DocsRepoError("DOC_BROKEN", "canvas f-x lệch schema"));
    expect(c.title).toBe(
      "Nội dung file lưu trên máy bị hỏng nên không mở được. Bản gốc trong dự án không bị ảnh hưởng.",
    );
    expect(c.title).not.toMatch(/DOC_BROKEN|schema/);
    expect(c.detail).toBe("DOC_BROKEN: canvas f-x lệch schema");
  });

  it("lỗi lạ: không rò message kỹ thuật ra title", () => {
    const c = canvasErrorCopy(new TypeError("Cannot read properties of undefined (reading 'nodes')"));
    expect(c.title).not.toMatch(/undefined|reading/);
    expect(c.detail).toBe("TypeError");
  });

  it("trạng thái lưu: hai ca người dùng PHẢI biết ngay được đánh dấu khẩn", () => {
    expect(saveCopy("conflict").urgent).toBe(true);
    expect(saveCopy("error").urgent).toBe(true);
    expect(saveCopy("saving").urgent).toBe(false);
    expect(saveCopy("saved").label).toBe("Đã lưu trên máy");
  });
});

describe("isTypingTarget — không cướp phím của ô nhập liệu", () => {
  it("input/textarea/select/contenteditable/role=textbox ⇒ true", () => {
    expect(isTypingTarget({ tagName: "INPUT", getAttribute: () => null })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA", getAttribute: () => null })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT", getAttribute: () => null })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true, getAttribute: () => null })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", getAttribute: () => "textbox" })).toBe(true);
  });
  it("phần tử thường và giá trị rác ⇒ false", () => {
    expect(isTypingTarget({ tagName: "DIV", getAttribute: () => null })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
    expect(isTypingTarget({})).toBe(false);
  });
});

describe("dot-grid — hình học tính ở JS, MÀU vẫn là token CSS", () => {
  it("bước lưới hiện lên màn luôn nằm trong [12px, 48px] với mọi mức zoom hợp lệ", () => {
    for (const k of [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 4]) {
      const step = DOT_BASE_STEP * k * dotStepMultiple(k);
      expect(step).toBeGreaterThanOrEqual(DOT_STEP_MIN);
      expect(step).toBeLessThanOrEqual(DOT_STEP_MAX);
    }
  });

  it("k hỏng (0, âm, NaN) ⇒ trả 1, không vòng lặp vô hạn", () => {
    expect(dotStepMultiple(0)).toBe(1);
    expect(dotStepMultiple(-2)).toBe(1);
    expect(dotStepMultiple(Number.NaN)).toBe(1);
  });

  it("style dùng biến token, KHÔNG có mã màu, và KHÔNG background-attachment:fixed", () => {
    const s = dotGridStyle({ x: 12, y: -8, k: 1 });
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(\s*\d/i);
    expect(s.backgroundColor).toBe("rgb(var(--kg-canvas))");
    expect(s.backgroundImage).toContain("var(--kg-dot-color)");
    expect(s.backgroundImage).toContain("var(--kg-dot-alpha)");
    expect(s.backgroundAttachment).toBe("scroll");
  });

  /* POLISH-RAIL-DOT — lưới hai tầng. Canh CẢ hình lẫn thứ tự: tầng chính phải đứng
     TRƯỚC trong `background-image` (lớp đầu vẽ trên cùng), nếu không chấm phụ mờ sẽ
     đè lên chấm đậm ở đúng toạ độ mốc và mốc chính biến mất. */
  it("dot-grid có tầng mốc CHÍNH, đậm hơn, bước là bội số của tầng phụ", () => {
    const s = dotGridStyle({ x: 0, y: 0, k: 1 });
    const img = String(s.backgroundImage);
    expect(img).toContain("var(--kg-dot-major-alpha)");
    expect(img).toContain("var(--kg-dot-major-size)");
    expect(img.indexOf("--kg-dot-major-alpha")).toBeLessThan(img.indexOf("--kg-dot-alpha)"));
    expect(String(s.backgroundSize)).toContain("var(--kg-dot-major-every)");
    // Một `background-position` duy nhất ⇒ hai tầng luôn khớp mốc, không trôi lệch.
    expect(String(s.backgroundPosition).split(",")).toHaveLength(1);
  });

  it("lưới TRÔI theo khung nhìn: đổi pan ⇒ đổi background-position", () => {
    expect(dotGridStyle({ x: 0, y: 0, k: 1 }).backgroundPosition).toBe("0.00px 0.00px");
    expect(dotGridStyle({ x: 40, y: -15, k: 1 }).backgroundPosition).toBe("40.00px -15.00px");
  });
});
