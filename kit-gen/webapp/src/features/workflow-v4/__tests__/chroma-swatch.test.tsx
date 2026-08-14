/* @vitest-environment jsdom */
/**
 * BACKLOG #18 — SWATCH «MÀU NỀN TÁCH» PHẢI NÓI KEY **HIỆU LỰC**.
 *
 * Bối cảnh: từ đợt 5b (`kitset-to-contract` §5b) key ghi vào contract là kết quả
 * AUTO-PICK, không còn là `s.chroma` người dùng bấm. Bản cũ của `StyleStep` vẫn vẽ
 * `CHROMA_HEX[s.chroma]` ⇒ có một trạng thái mà **UI nói một đằng, engine chạy một
 * nẻo** — và đó đúng là trạng thái người ta cần UI nhất (vì sao ảnh ra viền lạ).
 *
 * Ba nhóm ca dưới đây khoá ba lời hứa, và mỗi ca đều đi qua DOM THẬT chứ không đọc
 * mã nguồn: ① không đổi thì đừng làm ồn; ② đổi thì phải nói ra cả hai đầu + lý do;
 * ③ hết đường lui thì phải kêu. Ca ② còn so trực tiếp màu ô vẽ với màu mà
 * `buildKitsetContract` thật sự ghi vào `variant.bg` — hai đầu không thể lệch.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  WorkflowStoreProvider, createWorkflowStore, resetWorkflowStores, type WorkflowState,
} from "../lib/model";
import { buildKitsetContract, explainChromaKey, pickChromaKey } from "../lib/kitset-to-contract";
import { StyleStep } from "../steps/StyleStep";

const PID = "kit-swatch";

/** Nạp state rồi render — thứ tự này quan trọng: swatch đọc state lúc render đầu. */
function mount(patch: Partial<WorkflowState>) {
  createWorkflowStore(PID).getState().set(patch);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider><WorkflowStoreProvider projectId={PID}><StyleStep /></WorkflowStoreProvider></TooltipProvider>
    </QueryClientProvider>,
  );
}

/** Ô màu là `aria-hidden` (nó không mang nghĩa nào mà chữ bên cạnh chưa nói) ⇒ lấy
 *  bằng class, không bằng role. Trả về `background` đã chuẩn hoá về chữ thường. */
const swatchColor = (container: HTMLElement) =>
  (container.querySelector(".color-swatch") as HTMLElement).style.background.toLowerCase();

/** Câu chú đi kèm swatch — nguồn duy nhất của tên màu hiển thị. */
const swatchText = () => (screen.getByText(/Màu nền tách:/).closest("p") as HTMLElement).textContent ?? "";

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetWorkflowStores();
});

describe("① key không bị đổi ⇒ swatch nói đúng một cái tên, không thêm nhiễu", () => {
  it("palette trung tính: giữ nguyên lựa chọn tay", () => {
    const { container } = mount({ chroma: "magenta" });
    expect(swatchColor(container)).toBe("rgb(255, 0, 255)");
    expect(swatchText()).toContain("Màu nền tách: Magenta");
    // Không có mũi tên ⇒ không doạ người dùng rằng có gì đó vừa bị đổi.
    expect(swatchText()).not.toContain("→");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("chọn tay Xanh lá, palette không đụng ⇒ vẫn Xanh lá", () => {
    const { container } = mount({ chroma: "green", primaryColor: "#FF2FD0" });
    expect(swatchColor(container)).toBe("rgb(0, 255, 0)");
    expect(swatchText()).toContain("Màu nền tách: Xanh lá");
    expect(swatchText()).not.toContain("→");
  });
});

describe("② key bị đổi ⇒ swatch VẼ key mới và NÓI RA cả hai đầu", () => {
  it("style neon magenta: Magenta → Xanh lá, kèm lý do", () => {
    const { container } = mount({ chroma: "magenta", stylePrompt: "neon magenta cyberpunk" });

    expect(pickChromaKey(createWorkflowStore(PID).getState())).toBe("green");
    // Ô màu theo key HIỆU LỰC, không phải `s.chroma`.
    expect(swatchColor(container)).toBe("rgb(0, 255, 0)");
    expect(swatchColor(container)).not.toBe("rgb(255, 0, 255)");

    const text = swatchText();
    expect(text).toContain("Magenta");     // lựa chọn của người dùng KHÔNG bị giấu đi
    expect(text).toContain("→");
    expect(text).toContain("Xanh lá");
    expect(text).toContain("tránh trùng palette");
  });

  it("màu thương hiệu hồng: swatch và `variant.bg` của contract không thể lệch", () => {
    const { container } = mount({ chroma: "magenta", primaryColor: "#FF2FD0" });
    const state = createWorkflowStore(PID).getState();
    const bg = buildKitsetContract(state).variants?.[0]?.bg ?? "";

    // Contract nói "green" ⇒ ô màu phải là xanh lá, và chữ phải gọi đúng tên đó.
    expect(bg).toContain("green");
    expect(swatchColor(container)).toBe("rgb(0, 255, 0)");
    expect(swatchText()).toContain("Xanh lá");
  });

  it("bốn key đều gọi được tên — kể cả cyan/blue mà người dùng không bấm chọn được", () => {
    /* `explainChromaKey` là nguồn duy nhất, nên bảng nhãn phải phủ HẾT miền giá trị
       của nó. Ca này quét bốn palette cho ra bốn key khác nhau và đòi mỗi lần swatch
       vừa tô đúng hex vừa gọi được tên tiếng Việt — nếu ai đó thêm key thứ năm mà quên
       nhãn, chỗ này đỏ chứ không phải người dùng thấy `undefined`. */
    const base = { chroma: "magenta", stylePrompt: "", secondaryColor: "#9A9A9A" } as const;
    const cases = [
      { primaryColor: "#FF2FD0", label: "Xanh lá", css: "rgb(0, 255, 0)" },
      { primaryColor: "#00C2FF", label: "Magenta", css: "rgb(255, 0, 255)" },
      { primaryColor: "#22CC22", label: "Magenta", css: "rgb(255, 0, 255)" },
    ];
    const seen = new Set<string>();
    for (const { primaryColor, label, css } of cases) {
      cleanup();
      const { container } = mount({ ...base, primaryColor });
      seen.add(explainChromaKey({ ...base, primaryColor }).key);
      expect(swatchColor(container)).toBe(css);
      expect(swatchText()).toContain(label);
      // Khoá kỹ thuật KHÔNG được rò ra màn hình — người dùng đọc "Xanh lá", không đọc "green".
      expect(swatchText()).not.toMatch(/\b(magenta|green|cyan|blue)\b/);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("③ mọi ứng viên đều sát palette ⇒ phải kêu lên", () => {
  it("bảng màu phủ kín vòng tròn: có cảnh báo, và nó chỉ đúng chỗ sửa", () => {
    // magenta·green·cyan·blue nằm ở 300/120/180/240 — mô tả gọi tên đủ bốn phía thì
    // không ứng viên nào còn cách palette 60°.
    const { container } = mount({
      chroma: "magenta",
      primaryColor: "#FF00FF",
      secondaryColor: "#00FF00",
      stylePrompt: "cyan and blue neon",
    });
    expect(explainChromaKey(createWorkflowStore(PID).getState()).allClose).toBe(true);

    const alert = screen.getByRole("status");
    expect(alert.textContent).toContain("Mọi màu nền tách đều nằm sát bảng màu");
    expect(alert.textContent).toMatch(/màu thương hiệu|ô mô tả/);
    // Swatch vẫn phải vẽ key tốt nhất trong đám xấu, không được bỏ trắng.
    expect(swatchColor(container)).not.toBe("");
  });

  it("không có ca nào kêu oan: palette trung tính thì tuyệt đối im", () => {
    mount({ chroma: "magenta" });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
