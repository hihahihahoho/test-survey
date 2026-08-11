import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Contract } from "@/lib/types/contract";

const contract: Contract = {
  schemaVersion: 4,
  characterPoses: [],
  variants: [{ id: "tet", vi: "Tết đỏ", style: "vui", bg: "magenta", brand: { mode: "colors", primary: "#005BAA", secondary: "#00B0F0" }, characters: [] }],
  sheets: [{ id: "main", grid: { cols: 2, rows: 1 }, components: [
    { file: "01-btn", vi: "Nút chính", spec: "", skel: { shape: "pill", w: 0.8, h: 0.4 } },
    { file: "02-card", vi: "Khung thẻ", spec: "", skel: { shape: "rrect", w: 0.8, h: 0.6 } },
  ] }],
};

vi.mock("@/lib/hooks", () => ({
  useAgentStatus: () => ({ status: { pill: "ok", connected: true, readOnly: false, case: "ok", code: null } }),
  useDoctor: () => ({ data: { imageGen: { available: true } } }),
  useProject: () => ({ data: { name: "Tết 2026" }, isLoading: false, error: null, refetch: vi.fn() }),
  useStartRun: () => ({ mutate: vi.fn(), isPending: false }),
  useRawHistory: () => ({ data: { items: [] } }),
  useRestoreRaw: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/features/design/lib/useDesignEditor", () => ({
  useDesignEditor: () => ({ phase: "ready", api: { contract, dirty: false, readOnly: false, readOnlyReason: "" }, projectState: { jobs: {} }, loadError: null, refetch: vi.fn() }),
}));
vi.mock("@/features/design/lib/useDesignActions", () => ({
  useDesignActions: () => ({ patchVariant: vi.fn(), patchBrand: vi.fn(), addCharacter: vi.fn(), deleteCharacter: vi.fn(), addSheet: vi.fn(), addElements: vi.fn() }),
}));
vi.mock("@/components/layout", async (original) => ({ ...(await original()) as object, useRegisterCommands: vi.fn() }));
vi.mock("@/features/design/library/ElementLibraryDrawer", () => ({ ElementLibraryDrawer: () => null }));

async function mount() {
  const { StudioScreen } = await import("../StudioScreen");
  return render(<TooltipProvider><StudioScreen projectId="tet26-a7f3" /></TooltipProvider>);
}

afterEach(cleanup);

describe("/k/:id production studio", () => {
  it("có navigator phạm vi, visual chung, inspector và các hành động generate", async () => {
    await mount();
    expect(screen.getByRole("navigation", { name: "Phạm vi studio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tổng thể/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /UI kit/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Mascot/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Background/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate phần này" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate toàn bộ" })).toBeTruthy();
  });

  it("UI kit có ba chế độ xem và skeleton theo sheet", async () => {
    const { fireEvent } = await import("@testing-library/react");
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /UI kit/ }));
    expect(screen.getByRole("radiogroup", { name: "Kết quả của main" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Khung xương" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Ảnh đã vẽ" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Đã cắt" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /trong main/ })).toHaveLength(2);
  });
});
