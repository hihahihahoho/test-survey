/* @vitest-environment jsdom */
/**
 * THẺ BACKGROUND — Ô GHI CHÚ CỦA CẢ TẤM.
 *
 * ╔══ VÌ SAO CA NÀY PHẢI MOUNT DOM THẬT ═════════════════════════════════════╗
 * ║ Luật cần khoá là một luật về CÁI GÌ CÓ MẶT TRÊN MÀN, và nó không để lại   ║
 * ║ dấu vết nào trong contract khi bị làm hỏng: ẩn ô ghi chú ở chế độ tự do   ║
 * ║ vẫn sinh ra đúng cái `sheet.directive` cũ (giá trị còn nằm trong state),  ║
 * ║ chỉ là người dùng không còn thấy — và không sửa được — cái chữ vẫn đang   ║
 * ║ được gửi đi vẽ. Đó đúng là kiểu hỏng câm mà một ca thuần dữ liệu bỏ lọt.  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { newDocBlock, type DocBlock } from "../lib/composer-model";
import { DocBlockBody } from "../components/DocBlockView";

vi.mock("../lib/presets-store", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  const seed = (real["seedPresets"] as () => unknown)();
  return { ...real, usePresets: () => seed, getPresets: () => seed };
});

afterEach(cleanup);

/** Thẻ sống được trong ca test: state thật, `onChange` thật, không giả lập editor. */
function Harness({ start }: { start: DocBlock }) {
  const [block, setBlock] = React.useState(start);
  return <DocBlockBody block={block} onChange={(update) => setBlock((prev) => update(prev))} />;
}

describe("ô ghi chú của thẻ Background", () => {
  it("có mặt ở chế độ KHUÔN, và gõ vào thì chữ ở lại", () => {
    render(<Harness start={newDocBlock()} />);
    const field = screen.getByLabelText("Ghi chú cho Background") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "vẽ thêm mưa xuân rơi nhẹ" } });
    expect((screen.getByLabelText("Ghi chú cho Background") as HTMLInputElement).value).toBe(
      "vẽ thêm mưa xuân rơi nhẹ",
    );
  });

  /* Chế độ tự do thay CÂU CHỮ (`promptOverride`), còn ghi chú đi vào một ô khác
     của contract (`sheet.directive`). Ẩn nó đi là làm chữ người dùng đã gõ biến
     mất khỏi màn hình trong khi vẫn tiếp tục được gửi tới máy vẽ. */
  it("VẪN có mặt ở chế độ TỰ DO — nó không phải bản thay thế của chế độ ấy", () => {
    render(<Harness start={{ ...newDocBlock(), mode: "free", note: "màn chính của game" }} />);
    expect((screen.getByLabelText("Ghi chú cho Background") as HTMLInputElement).value).toBe("màn chính của game");
  });
});
