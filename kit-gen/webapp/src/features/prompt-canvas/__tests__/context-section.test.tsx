/* @vitest-environment jsdom */
/**
 * KHỐI «NGỮ CẢNH CHUNG» — CHẾ ĐỘ TỰ DO.
 *
 * ╔══ VÌ SAO KHỐI NÀY ĐÁNG MỘT FILE TEST RIÊNG ══════════════════════════════╗
 * ║ Câu ở đây đi vào `variant.style`, tức là vào MỌI tấm của bộ kit. Nó cũng   ║
 * ║ là khối duy nhất có một node kiểu khác: `brandPill` — node RỖNG, đọc màu   ║
 * ║ sống qua React context (xem `BrandPill.tsx`). Dây context ấy đi xuyên qua  ║
 * ║ portal của ProseMirror, một đường mà `tsc` không kiểm được: quên bọc       ║
 * ║ Provider thì không có lỗi nào nổ, dãy màu chỉ lặng lẽ thành chữ            ║
 * ║ "[màu thương hiệu]" và người dùng mất đường chỉnh màu.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Phần "câu tự do đi tới contract" đã khoá ở `lib/__tests__/prompt-canvas.test.ts`
 * bằng hàm thuần. Ở đây chỉ khoá phần CHỈ TỒN TẠI TRONG DOM.
 */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/react";

import { seedPresets } from "@/features/prompt-lab/lib/presets-store";
import { contextDoc } from "@/features/prompt-lab/lib/doc-templates";
import type { ComposerState } from "@/features/prompt-lab/lib/composer-model";
import { ContextSection } from "../components/ContextSection";

const PRESETS = seedPresets();

vi.mock("@/features/prompt-lab/lib/presets-store", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  const seed = (real["seedPresets"] as () => unknown)();
  return { ...real, usePresets: () => seed, getPresets: () => seed };
});

const base = (partial: Partial<ComposerState> = {}): ComposerState => ({
  themeValue: "a Vietnamese Tết festive outfit",
  styleId: PRESETS.styles[0]!.id,
  brandColors: ["#ff5533", "#112233"],
  contextMode: "template",
  blocks: [],
  ...partial,
});

/** Câu ngữ cảnh có thêm chữ NGƯỜI DÙNG viết — thứ mà quay về khuôn sẽ làm mất. */
function written(state: ComposerState, extra: string): JSONContent {
  const doc = contextDoc(state);
  const para = doc.content![0]!;
  return { ...doc, content: [{ ...para, content: [...(para.content ?? []), { type: "text", text: extra }] }] };
}

function Harness({ initial, onState }: { initial: ComposerState; onState?: (next: ComposerState) => void }) {
  const [composer, setComposer] = React.useState(initial);
  return (
    <ContextSection
      composer={composer}
      edit={(updater) =>
        setComposer((prev) => {
          const next = updater(prev);
          onState?.(next);
          return next;
        })
      }
    />
  );
}

afterEach(cleanup);

describe("hai chế độ của khối Ngữ cảnh chung", () => {
  it("mặc định là KHUÔN: câu React thuần, không mount editor nào", () => {
    render(<Harness initial={base()} />);
    expect(document.querySelector(".ProseMirror")).toBeNull();
    expect(screen.getByRole("button", { name: "Theo template" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("gạt sang Tự do ⇒ editor thật, pill theme/phong cách VÀ dãy màu đều nằm trong câu", async () => {
    render(<Harness initial={base()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tự do" }));

    const editor = await waitFor(() => {
      const found = document.querySelector(".ProseMirror");
      expect(found).not.toBeNull();
      return found!;
    });

    const kinds = [...editor.querySelectorAll("[data-kg-node='optionPill']")].map((p) => p.getAttribute("data-kind"));
    expect(kinds).toEqual(["theme", "style"]);

    /* Dãy màu phải là control THẬT, không phải chữ thay thế: thấy "[màu thương
       hiệu]" nghĩa là Provider chưa bọc tới node view. */
    const brand = editor.querySelector("[data-kg-node='brandPill']")!;
    expect(brand).not.toBeNull();
    expect(brand.textContent).not.toContain("[màu thương hiệu]");
    expect(brand.textContent).toContain("#ff5533");
  });

  it("quay về khuôn KHI CHƯA VIẾT GÌ ⇒ đi thẳng, không hỏi câu vô nghĩa", async () => {
    let latest: ComposerState | null = null;
    render(<Harness initial={base({ contextMode: "free" })} onState={(next) => { latest = next; }} />);
    await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Theo template" }));
    await waitFor(() => expect(latest?.contextMode).toBe("template"));
    expect(screen.queryByText(/sẽ bỏ câu ngữ cảnh/)).toBeNull();
    expect(latest!.contextDoc).toBeUndefined();
  });

  it("quay về khuôn KHI ĐÃ VIẾT ⇒ HỎI trước, và huỷ thì vẫn ở tự do", async () => {
    const state = base({ contextMode: "free" });
    /* Theo dõi CHẾ ĐỘ qua từng lượt cập nhật, không so cả object: ProseMirror
       chuẩn hoá tài liệu lúc nạp (gộp hai text node liền nhau, điền attr mặc
       định), nên một tài liệu dựng tay có thể sinh đúng MỘT lượt cập nhật hợp lệ
       ngay khi mount. Thứ ca này nói tới là chế độ, và chế độ thì không được đổi
       trước khi người dùng xác nhận. */
    const modes: string[] = [];
    render(
      <Harness
        initial={{ ...state, contextDoc: written(state, " tiết chế, như poster phim 80s") }}
        onState={(next) => modes.push(next.contextMode)}
      />,
    );
    await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Theo template" }));
    expect(screen.getByText(/sẽ bỏ câu ngữ cảnh/)).toBeTruthy();
    /* Chưa xác nhận thì CHƯA đổi chế độ — hộp hỏi mà vẫn đổi luôn là hộp trang trí. */
    expect(modes).not.toContain("template");
    expect(document.querySelector(".ProseMirror")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Tự do" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(screen.queryByText(/sẽ bỏ câu ngữ cảnh/)).toBeNull();
    expect(document.querySelector(".ProseMirror")).not.toBeNull();
  });

  it("xác nhận quay về khuôn ⇒ bỏ câu tự do, các trường có cấu trúc còn nguyên", async () => {
    const state = base({ contextMode: "free" });
    let latest: ComposerState | null = null;
    render(
      <Harness initial={{ ...state, contextDoc: written(state, " câu của tôi") }} onState={(next) => { latest = next; }} />,
    );
    await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Theo template" }));
    fireEvent.click(screen.getByRole("button", { name: "Quay về template" }));

    await waitFor(() => expect(latest?.contextMode).toBe("template"));
    expect(latest!.contextDoc).toBeUndefined();
    expect(latest!.themeValue).toBe(state.themeValue);
    expect(latest!.styleId).toBe(state.styleId);
    expect(latest!.brandColors).toEqual(["#ff5533", "#112233"]);
  });

  it("bấm pill phong cách TRONG câu ⇒ `styleId` đi theo, vì mọi thẻ dưới đọc trường đó", async () => {
    let latest: ComposerState | null = null;
    render(<Harness initial={base({ contextMode: "free" })} onState={(next) => { latest = next; }} />);
    await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());

    const stylePill = [...document.querySelectorAll("[data-kg-node='optionPill']")]
      .find((p) => p.getAttribute("data-kind") === "style")!;
    fireEvent.click(stylePill.querySelector("button")!);
    /* Mục [0] là "— theo cái chung —"; [2] là một phong cách khác cái đang chọn. */
    fireEvent.click(screen.getAllByRole("option")[2]!);

    await waitFor(() => expect(latest?.styleId).toBeTruthy());
    expect(latest!.styleId).toBe(PRESETS.styles[1]!.id);
    expect(latest!.contextDoc).toBeTruthy();
  });
});
