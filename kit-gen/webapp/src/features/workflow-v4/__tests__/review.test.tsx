/* @vitest-environment jsdom */
/**
 * WAVE 1 — bằng chứng cho §W1-5 (dialog Vẽ), §W1-10 (nút chính về đúng chỗ),
 * §W1-11 (ước lượng thôi nói sai) và §W1-2 (bước 6 có cửa ra).
 *
 * ⚠️ TIÊU CHÍ PHÁT BIỂU Ở DẠNG **PHỦ ĐỊNH HÌNH DẠNG** — đây là bài học đắt nhất của
 * vòng trước (UPGRADE-PLAN §Đ1): ba vòng review kiểm "có padding không?" rồi kết luận
 * về một thứ khác hẳn ("nhìn có ra cái ô không?"). Câu hỏi đúng, kiểm được bằng cả mắt
 * lẫn DOM, là: *"có đường kẻ ngang nào chạy hết bề ngang dialog giữa title và hàng nút
 * không?"* → phải là KHÔNG.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { contractJobs } from "@/lib/types/contract";
import { WorkflowStoreProvider, createWorkflowStore, resetWorkflowStores } from "../lib/model";
import { buildKitsetContract } from "../lib/kitset-to-contract";
import { ContractSyncProvider, type ContractSync } from "../lib/contract-sync";
import { DownloadKitButton, CopyFigmaButton } from "../components/KitExits";
import { DrawConfirmDialog, ReviewStep } from "../steps/ReviewStep";
import { BriefStep } from "../steps/BriefStep";
import { KitsetStep } from "../steps/KitsetStep";
import { MascotStep, POSES } from "../steps/MascotStep";
import { WorkflowActions } from "../WorkflowScreen";

const PID = "kit-thu-nghiem";
/**
 * Thư mục `src/` — dùng cho hai ca đọc thẳng mã nguồn.
 * (KHÔNG dùng `new URL("..", import.meta.url).pathname`: dưới môi trường `jsdom`,
 * vite-node trả URL không phải `file:` nên đường dẫn mất mất gốc dự án và test đỏ
 * vì hạ tầng chứ không vì mã sai. `process.cwd()` là gốc webapp khi chạy `npm test`.)
 */
const SRC = resolve(process.cwd(), "src");

/**
 * "Đường kẻ ngang chạy hết bề ngang" = utility `border-t` / `border-b` / `divide-y`.
 * Phải tách theo TOKEN: `border-transparent` của nút cũng chứa chuỗi con "border-t"
 * nhưng không vẽ đường kẻ nào — kiểm bằng `class*=` là kiểm nhầm thứ.
 */
const looksLikeRule = (token: string) => /(^|:)border-[bt]($|-)/.test(token) || /(^|:)divide-y($|-)/.test(token);
const rulesIn = (root: Element) =>
  Array.from(root.querySelectorAll<HTMLElement>("*"))
    .filter((el) => typeof el.className === "string" && el.className.split(/\s+/).some(looksLikeRule))
    .map((el) => el.className);

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetWorkflowStores();
});

/**
 * §W3-5 bổ sung `QueryClientProvider`: `KitsetStep` nay đọc kho element THẬT qua
 * `useElementLib()` (`GET /api/element-lib` — đĩa thuần, 0 đồng). Trong test không có
 * agent nên query hỏng và bước này rơi về **bản đóng gói 42 món** — đó chính là đường
 * lùi offline mà ta muốn khoá lại: kho phải hiện đủ 42 kể cả khi công cụ local chưa chạy.
 * `retry:false` để ca test không chờ 3 lần thử lại.
 */
const mount = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider><WorkflowStoreProvider projectId={PID}>{ui}</WorkflowStoreProvider></TooltipProvider>
    </QueryClientProvider>,
  );
};

/**
 * Contract THẬT dựng từ state mặc định của store — dùng cho các ca §W3-4.
 * Không bịa một contract giả: con số phải là con số mà màn thật sẽ hiện.
 */
const kitsetContract = () => buildKitsetContract(createWorkflowStore(PID).getState());
/** Số lượt = số job của contract. Tính RA ĐÂY để ca test không hardcode "5". */
const JOBS = contractJobs(kitsetContract()).length;

/** Bọc thêm contract đã dựng, đúng như `WorkflowScreen` phát xuống lúc chạy thật. */
const mountWithContract = (ui: React.ReactNode) => {
  const contract = kitsetContract();
  const sync = {
    state: "saved", contract, jobCount: contractJobs(contract).length, version: 1,
    savedAt: null, note: null, conflict: null,
    sourceContract: contract, adoptForeign: () => {},
    resolveConflict: (async () => null) as ContractSync["resolveConflict"],
    dismissConflict: () => {}, saveNow: async () => true,
  } satisfies ContractSync;
  return mount(<ContractSyncProvider value={sync}>{ui}</ContractSyncProvider>);
};

describe("§W1-5 — dialog Vẽ không còn ô kẹp", () => {
  it("KHÔNG có đường kẻ ngang nào trong dialog (header/footer thôi kẻ mặc định)", () => {
    mount(<DrawConfirmDialog open onOpenChange={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(rulesIn(dialog)).toEqual([]);
  });

  it("KHÔNG có DialogBody trong dialog ngắn — một dòng chữ thì không phải vùng cuộn", () => {
    mount(<DrawConfirmDialog open onOpenChange={() => {}} />);
    expect(screen.queryByTestId("dialog-body")).toBeNull();
  });

  it("câu trấn an là <p class='dialog-supporting'> nằm NGAY DƯỚI description, cùng khối với title", () => {
    mount(<DrawConfirmDialog open onOpenChange={() => {}} />);
    const supporting = screen.getByText("Ảnh cũ vẫn được giữ lại.");
    expect(supporting.tagName).toBe("P");
    expect(supporting.className).toContain("dialog-supporting");
    expect(supporting.className).not.toMatch(/border|divide|input|field/);

    const header = supporting.parentElement!;
    expect(header).toBe(screen.getByText("Tạo ảnh?").parentElement);
    expect(supporting.previousElementSibling?.textContent).toContain("thành phần");
  });

  it("dialog vẫn còn đủ hai nút và vẫn đóng được", () => {
    const onOpenChange = vi.fn();
    mount(<DrawConfirmDialog open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Xem lại/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: /Tạo ảnh/ })).toBeTruthy();
  });

  it("primitive `dialog.tsx` không còn kẻ mặc định (chặn cái bẫy quay lại)", () => {
    const src = readFileSync(join(SRC, "components/ui/dialog.tsx"), "utf8");
    const header = src.slice(src.indexOf("const DialogHeader"), src.indexOf("DialogHeader.displayName"));
    const footer = src.slice(src.indexOf("const DialogFooter"), src.indexOf("DialogFooter.displayName"));
    expect(header).not.toContain("border-b");
    expect(footer).not.toContain("border-t");
  });
});

/**
 * ⚠️ HỢP ĐỒNG ĐỔI Ở WAVE 3 (§W3-4) — plan đã hẹn trước, ghi ở §Đ4 "một ngoại lệ có chủ ý".
 *
 * W1 chỉ sửa phần TRUNG THỰC của ước lượng (trừ món mock, thêm chữ "ước lượng") và
 * để lại con số đúng cho W3, vì con số đúng cần `buildKitsetContract` — lúc đó chưa có.
 * Nay có rồi: `gen.sh` tính tiền theo **(phong cách × sheet)**, không theo số element.
 * 7 món vẽ được của preset pack thành **5 tấm**, nên báo "7 lượt" vẫn là báo giá SAI —
 * chỉ là sai ít hơn 8. Ca dưới đây đòi con số theo job, và đòi luôn rằng nó KHÁC số element.
 */
describe("§W3-4 — ước lượng theo JOB của contract, không theo số element", () => {
  it("dòng ước lượng đọc số TẤM (5), không phải số element (7 hay 8)", () => {
    mountWithContract(<ReviewStep />);
    const dòng = screen.getByText(/lượt ·/);
    expect(dòng.textContent).toContain(`${JOBS} lượt`);
    expect(JOBS).not.toBe(7);
    expect(dòng.textContent).not.toContain("7 lượt");
    expect(dòng.textContent).not.toContain("8 lượt");
    expect(dòng.textContent).toContain("ước lượng, có thể lệch");
  });

  it("con số ấy ĐÚNG BẰNG số job mà agent sẽ tạo (`contractJobs`)", () => {
    // Không tin con số hiện trên màn: tính lại từ contract bằng chính hàm agent dùng.
    expect(JOBS).toBe(contractJobs(kitsetContract()).length);
    expect(JOBS).toBe(kitsetContract().sheets.length); // 1 phong cách ⇒ job = sheet
  });

  it("dialog xác nhận báo CÙNG con số với thẻ ước lượng (một nguồn, hai chỗ hiện)", () => {
    mountWithContract(<DrawConfirmDialog open onOpenChange={() => {}} />);
    const t = screen.getByText(/7 thành phần/).textContent ?? "";
    expect(t).toContain("7 thành phần");  // số thành phần vẫn là 7 (đã trừ vòng quay mock)
    expect(t).toContain(`${JOBS} lượt`);   // số LƯỢT là số tấm — hai đại lượng khác nhau
  });

  it("thẻ recap Kitset hiện số đã trừ mock, nói ra chỗ bị trừ VÀ số tấm", () => {
    mountWithContract(<ReviewStep />);
    expect(screen.getByText("7 thành phần")).toBeTruthy();
    expect(screen.getByText(/1 thành phần chưa có bộ khung/)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${JOBS} sheet`))).toBeTruthy();
  });

  it("render CÔ LẬP (không có contract) thì KHÔNG bịa số lượt", () => {
    mount(<ReviewStep />);
    expect(screen.getByText(/7 thành phần · ước lượng/)).toBeTruthy();
  });
});

describe("§W1-10 — nút chính ở hàng nút cuối, không nằm giữa thân trang", () => {
  it("thân bước 5 KHÔNG còn nút Vẽ và KHÔNG còn câu 'Cửa sổ xác nhận…'", () => {
    mount(<ReviewStep />);
    expect(screen.queryByRole("button", { name: /Tạo ảnh/ })).toBeNull();
    expect(screen.queryByText(/Cửa sổ xác nhận luôn hiện/)).toBeNull();
  });

  it("cả màn chỉ có ĐÚNG MỘT nút 'Tạo ảnh', và nó ở hàng nút cuối", () => {
    const onDraw = vi.fn();
    mount(
      <>
        <ReviewStep />
        <WorkflowActions step={5} drawable={7} onBack={() => {}} onNext={() => {}} onDraw={onDraw} onDone={() => {}} />
      </>,
    );
    const nút = screen.getAllByRole("button", { name: /Tạo ảnh/ });
    expect(nút).toHaveLength(1);
    expect(nút[0]!.closest(".workflow-actions")).toBeTruthy();
    fireEvent.click(nút[0]!);
    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  it("không còn món nào vẽ được thì nút chính khoá, không phải biến mất", () => {
    render(<WorkflowActions step={5} drawable={0} onBack={() => {}} onNext={() => {}} onDraw={() => {}} onDone={() => {}} />);
    expect(screen.getByRole("button", { name: /Tạo ảnh/ }).hasAttribute("disabled")).toBe(true);
  });
});

describe("§W1-2 — bước 6 có cửa ra", () => {
  it("hàng nút cuối ở bước 6 có ≥2 nút, trong đó có đường rời khỏi mạch", () => {
    const onDone = vi.fn();
    render(<WorkflowActions step={6} drawable={7} onBack={() => {}} onNext={() => {}} onDraw={() => {}} onDone={onDone} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: /Quay lại/ })).toBeTruthy();

    const xong = screen.getByRole("button", { name: /Xong — về dự án/ });
    expect(xong.hasAttribute("disabled")).toBe(false);
    fireEvent.click(xong);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  /**
   * §W3-7 — hai nút này ở W1 là hai `<Button disabled>` chết cứng. Nay chúng là
   * component thật, tự đọc `useKit(projectId)`. Trong test không có agent ⇒ không có
   * ảnh đã cắt ⇒ vẫn KHOÁ KÈM LÝ DO — đúng hành vi ta muốn, nhưng nay vì một sự thật
   * (`files.length === 0`) chứ không vì một cái `disabled` gõ tay.
   */
  it("hai cửa ra mang phần thưởng: khoá KÈM LÝ DO khi chưa có ảnh đã cắt", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <WorkflowActions
            step={6} drawable={7} onBack={() => {}} onNext={() => {}} onDraw={() => {}} onDone={() => {}}
            exits={<><DownloadKitButton projectId={PID} /><CopyFigmaButton projectId={PID} kitName="Bộ thử" /></>}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    for (const name of [/Tải \.zip/, /Copy sang Figma/]) {
      const b = screen.getByRole("button", { name });
      expect(b.hasAttribute("disabled")).toBe(true);
      expect(b.getAttribute("title")).toMatch(/ảnh đã cắt/);
    }
  });

  it("hàng nút KHÔNG tự dựng cửa ra — chúng do màn bơm vào (`exits`)", () => {
    render(<WorkflowActions step={6} drawable={7} onBack={() => {}} onNext={() => {}} onDraw={() => {}} onDone={() => {}} />);
    expect(screen.queryByRole("button", { name: /Tải \.zip/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Xong — về dự án/ })).toBeTruthy();
  });

  it("nút 'Xong' của màn thật LƯU rồi mới điều hướng về danh sách", () => {
    const src = readFileSync(join(SRC, "features/workflow-v4/WorkflowScreen.tsx"), "utf8");
    // §W3-2: rời màn là mốc phải ghi đĩa — không được để nhịp debounce 2s nuốt
    // thay đổi cuối cùng của người dùng.
    expect(src).toContain("sync.saveNow()");
    expect(src).toContain('navigate({ to: "/p/$projectId", params: { projectId } })');
  });
});

/**
 * ⚠️ HỢP ĐỒNG ĐỔI Ở WAVE 3 (§W3-5) — và đây là điều CHÍNH PLAN ĐÃ HẸN TRƯỚC.
 *
 * §W1-12 bỏ ô tìm đi vì lúc đó nó là đồ trang trí (`<Input>` không `value`/`onChange`)
 * trên một kho 11 món — "11 món thì không cần tìm, thật thà và rẻ nhất". Plan viết
 * nguyên văn: *"Khi W3-5 nâng lên 42 món thì mới nối filter thật, cùng lúc."*
 * Giờ là lúc đó, nên ca test lật lại — nhưng phải đòi HƠN bản gốc: ô tìm phải LỌC THẬT,
 * không được là ô trang trí lần thứ hai.
 */
describe("§W3-5 — chọn bộ khung theo ba loại sản phẩm", () => {
  it("hiện đúng ba nhóm Nền, Popup và UI nhỏ", () => {
    mount(<KitsetStep />);
    expect(screen.getByRole("button", { name: /^Nền · \d+$/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Popup · \d+$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^UI nhỏ & đạo cụ · \d+$/ })).toBeTruthy();
  });

  it("đổi nhóm và lọc thành phần thật", () => {
    mount(<KitsetStep />);
    fireEvent.click(screen.getByRole("button", { name: /UI nhỏ & đạo cụ/ }));
    const box = screen.getByLabelText("Tìm trong UI nhỏ & đạo cụ") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "nut do" } });
    expect(box.value).toBe("nut do");
    expect(screen.getByText("Nút đỏ (CTA)")).toBeTruthy();
  });

  it("bấm một thành phần cập nhật lựa chọn của dự án", () => {
    mount(<KitsetStep />);
    fireEvent.click(screen.getByRole("button", { name: /UI nhỏ & đạo cụ/ }));
    const red = screen.getByRole("button", { name: /Nút đỏ \(CTA\)/ });
    const before = red.getAttribute("aria-pressed") === "true";
    fireEvent.click(red);
    const state = createWorkflowStore(PID).getState();
    expect(state.elements.find((element) => element.file === "01-btn-pill-red")?.selected).toBe(!before);
  });
});

describe("§W1-7 — mascot có thư viện pose đầy đủ theo nhóm", () => {
  it("giữ id kỹ thuật trong store và cho chọn pose mới", () => {
    mount(<MascotStep />);
    const idle = screen.getAllByRole("button", { name: "Đứng chờ" }).find(b => b.hasAttribute("aria-pressed"))!;
    expect(idle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Chuyển động/ }));
    fireEvent.click(screen.getByRole("button", { name: "Chạy" }));
    expect(createWorkflowStore(PID).getState().mascotPoses).toContain("run");
  });

  it("có đủ 19 pose của pipeline qua 5 nhóm", () => {
    expect(POSES).toHaveLength(19);
    expect(new Set(POSES.map(p => p.group)).size).toBe(5);
  });
});

describe("§W1-6 — ô campaign giữ được chữ", () => {
  it("gõ vào campaign thì store nhận ngay (không còn ô trôi)", () => {
    mount(<BriefStep />);
    fireEvent.change(screen.getByLabelText("Mục tiêu hoặc chiến dịch"), { target: { value: "mini-game hè 2026" } });
    expect(createWorkflowStore(PID).getState().campaign).toBe("mini-game hè 2026");
  });
});

describe("§W1-1 — bản nháp của màn này là bản nháp CỦA BỘ KIT NÀY", () => {
  it("provider bơm đúng store của projectId đang mở", () => {
    createWorkflowStore(PID).getState().set({ kitName: "Tên riêng của kit thử nghiệm" });
    mount(<ReviewStep />);
    expect(screen.getByText("Tên riêng của kit thử nghiệm")).toBeTruthy();
  });
});
