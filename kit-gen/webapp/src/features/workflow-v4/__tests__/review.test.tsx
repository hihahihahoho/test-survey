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
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { contractJobs } from "@/lib/types/contract";
import { WorkflowStoreProvider, createWorkflowStore, resetWorkflowStores } from "../lib/model";
import { buildKitsetContract } from "../lib/kitset-to-contract";
import { ContractSyncProvider, type ContractSync } from "../lib/contract-sync";
import { DownloadKitButton, CopyFigmaButton } from "../components/KitExits";
import { DrawConfirmDialog, ReviewStep, drawableOf, mascotRecapValue } from "../steps/ReviewStep";
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
/**
 * Số thành phần SẼ VẼ THẬT của state mặc định. Trước UI-FIX §2 con số này là 7 (preset
 * "quay số may mắn") và được gõ thẳng vào ca test; nay mặc định là CẢ THƯ VIỆN, nên nó
 * phải được TÍNH RA — nếu không thì mỗi lần thư viện thêm một món là test đỏ vì hạ tầng.
 */
const DRAWABLE = drawableOf(createWorkflowStore(PID).getState().elements).length;

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
  it("dòng ước lượng đọc số TẤM, không phải số element", () => {
    mountWithContract(<ReviewStep />);
    const dòng = screen.getByText(/lượt ·/);
    expect(dòng.textContent).toContain(`${JOBS} lượt`);
    // Điều ca này khoá: hai đại lượng KHÁC NHAU. Kho mặc định nay là cả thư viện, nên
    // hằng số cũ (7/8) không còn nghĩa — phép so phải nói bằng chính hai con số ấy.
    expect(JOBS).not.toBe(DRAWABLE);
    expect(dòng.textContent).not.toContain(`${DRAWABLE} lượt`);
    expect(dòng.textContent).toContain("ước lượng, có thể lệch");
  });

  it("con số ấy ĐÚNG BẰNG số job mà agent sẽ tạo (`contractJobs`)", () => {
    // Không tin con số hiện trên màn: tính lại từ contract bằng chính hàm agent dùng.
    expect(JOBS).toBe(contractJobs(kitsetContract()).length);
    expect(JOBS).toBe(kitsetContract().sheets.length); // 1 phong cách ⇒ job = sheet
  });

  it("dialog xác nhận báo CÙNG con số với thẻ ước lượng (một nguồn, hai chỗ hiện)", () => {
    mountWithContract(<DrawConfirmDialog open onOpenChange={() => {}} />);
    const t = screen.getByText(new RegExp(`${DRAWABLE} thành phần`)).textContent ?? "";
    expect(t).toContain(`${DRAWABLE} thành phần`); // số thành phần đã trừ vòng quay mock
    expect(t).toContain(`${JOBS} lượt`);            // số LƯỢT là số tấm — hai đại lượng khác nhau
    expect(DRAWABLE).not.toBe(JOBS);
  });

  it("thẻ recap Kitset hiện số đã trừ mock, nói ra chỗ bị trừ VÀ số tấm", () => {
    mountWithContract(<ReviewStep />);
    expect(screen.getByText(`${DRAWABLE} thành phần`)).toBeTruthy();
    expect(screen.getByText(/1 thành phần chưa có bộ khung/)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${JOBS} sheet`))).toBeTruthy();
  });

  it("render CÔ LẬP (không có contract) thì KHÔNG bịa số lượt", () => {
    mount(<ReviewStep />);
    expect(screen.getByText(new RegExp(`${DRAWABLE} thành phần · ước lượng`))).toBeTruthy();
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
        <WorkflowActions step={5} drawable={7} onBack={() => {}} onNext={() => {}} onDraw={onDraw} />
      </>,
    );
    const nút = screen.getAllByRole("button", { name: /Tạo ảnh/ });
    expect(nút).toHaveLength(1);
    expect(nút[0]!.closest(".workflow-actions")).toBeTruthy();
    fireEvent.click(nút[0]!);
    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  it("không còn món nào vẽ được thì nút chính khoá, không phải biến mất", () => {
    render(<WorkflowActions step={5} drawable={0} onBack={() => {}} onNext={() => {}} onDraw={() => {}} />);
    expect(screen.getByRole("button", { name: /Tạo ảnh/ }).hasAttribute("disabled")).toBe(true);
  });
});

/**
 * §W1-2 ĐỔI NHÀ — **bước ⑥ "Kết quả" đã bỏ**, nhưng hợp đồng của nó thì không.
 *
 * Hợp đồng cũ: *"mạch wizard không được kết thúc bằng không gì cả"* và *"hai cửa ra
 * mang phần thưởng phải khoá KÈM LÝ DO khi chưa có ảnh đã cắt"*. Cả hai vẫn được kiểm,
 * chỉ đổi chỗ:
 *   · mạch nay kết thúc bằng ĐIỀU HƯỚNG vào màn quản lý dự án, tab "Ảnh đã tạo";
 *   · hai cửa ra chuyển sang `features/project/sections/ImagesSection.tsx`.
 */
describe("§W1-2 — mạch wizard kết thúc ở màn dự án, không ở một bước thứ sáu", () => {
  it("hàng nút cuối KHÔNG còn bước 6 và KHÔNG còn nút 'Xong — về dự án'", () => {
    render(<WorkflowActions step={5} drawable={7} onBack={() => {}} onNext={() => {}} onDraw={() => {}} />);
    expect(screen.queryByRole("button", { name: /Xong — về dự án/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Quay lại/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tạo ảnh/ })).toBeTruthy();
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
          <DownloadKitButton projectId={PID} /><CopyFigmaButton projectId={PID} kitName="Bộ thử" />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    for (const name of [/Tải \.zip/, /Copy sang Figma/]) {
      const b = screen.getByRole("button", { name });
      expect(b.hasAttribute("disabled")).toBe(true);
      expect(b.getAttribute("title")).toMatch(/ảnh đã cắt/);
    }
  });

  it("hàng nút KHÔNG tự dựng cửa ra — chúng thuộc màn dự án", () => {
    render(<WorkflowActions step={5} drawable={7} onBack={() => {}} onNext={() => {}} onDraw={() => {}} />);
    expect(screen.queryByRole("button", { name: /Tải \.zip/ })).toBeNull();
    expect(readFileSync(join(SRC, "features/project/sections/ImagesSection.tsx"), "utf8")).toContain("<DownloadKitButton");
  });

  it("bấm 'Tạo ảnh' ở màn thật: LƯU → đóng dấu hoàn tất → vào tab Ảnh đã tạo", () => {
    const src = readFileSync(join(SRC, "features/workflow-v4/WorkflowScreen.tsx"), "utf8");
    // §W3-2: rời màn là mốc phải ghi đĩa — không được để nhịp debounce nuốt thay đổi cuối.
    expect(src).toContain("sync.saveNow()");
    // `completed: true` phải ghi TRƯỚC khi điều hướng, nếu không màn dự án đá ngược về wizard.
    const done = src.indexOf("completed: true");
    const go = src.indexOf('navigate({ to: "/p/$projectId"');
    expect(done).toBeGreaterThan(-1);
    expect(go).toBeGreaterThan(done);
    expect(src).toContain('search: { section: "images" }');
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
describe("§W3-5 — chọn bộ khung theo bốn loại sản phẩm", () => {
  it("hiện đủ nhóm Nền, Popup, UI nhỏ và Đạo cụ", () => {
    mount(<KitsetStep />);
    expect(screen.getByRole("button", { name: /^Nền · \d+$/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Popup · \d+$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^UI nhỏ · \d+$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Đạo cụ/ })).toBeTruthy();
  });

  it("đổi nhóm và lọc thành phần thật", () => {
    mount(<KitsetStep />);
    fireEvent.click(screen.getByRole("button", { name: /UI nhỏ/ }));
    const box = screen.getByLabelText("Tìm trong UI nhỏ") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "nut do" } });
    expect(box.value).toBe("nut do");
    expect(screen.getByText("Nút đỏ (CTA)")).toBeTruthy();
  });

  it("bấm một thành phần cập nhật lựa chọn của dự án", () => {
    mount(<KitsetStep />);
    fireEvent.click(screen.getByRole("button", { name: /UI nhỏ/ }));
    const red = screen.getByRole("button", { name: /Nút đỏ \(CTA\)/ });
    const before = red.getAttribute("aria-pressed") === "true";
    fireEvent.click(red);
    const state = createWorkflowStore(PID).getState();
    expect(state.elements.find((element) => element.file === "01-btn-pill-red")?.selected).toBe(!before);
  });

  /**
   * UI-FIX §2 — MẶC ĐỊNH CHỌN HẾT. Kiểm ở tầng MÀN (không chỉ ở store) vì đúng chỗ
   * người dùng nhìn: mọi thẻ đang hiện phải mang `aria-pressed="true"`, ở MỌI nhóm.
   */
  it("mới vào wizard thì MỌI thành phần của MỌI nhóm đều đã được tick", () => {
    const { container } = mount(<KitsetStep />);
    for (const group of ["Nền", "Popup", "UI nhỏ", "Đạo cụ"]) {
      // Chip nhóm mang dạng "Nền · 2"; thẻ thành phần cũng có thể bắt đầu bằng "Nền",
      // nên phải khoá cả hình dạng đuôi số.
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${group} · \\d+$`) }));
      const cards = [...container.querySelectorAll(".compact-element")];
      expect(cards.length, group).toBeGreaterThan(0);
      expect(cards.every((card) => card.getAttribute("aria-pressed") === "true"), group).toBe(true);
    }
  });

  it("nút 'Bỏ chọn nhóm này' bỏ đúng nhóm đang hiện, không đụng nhóm khác", () => {
    mount(<KitsetStep />);
    const before = createWorkflowStore(PID).getState().elements.filter((e) => e.selected).length;
    fireEvent.click(screen.getByRole("button", { name: /^Nền · \d+$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bỏ chọn nhóm này/ }));
    const after = createWorkflowStore(PID).getState().elements.filter((e) => e.selected);
    expect(after.length).toBeLessThan(before);
    expect(after.some((e) => e.file === "01-btn-pill-red")).toBe(true);
    expect(createWorkflowStore(PID).getState().kitsetTouched).toBe(true);
  });
});

describe("§W1-7 — mascot có thư viện pose đầy đủ theo nhóm", () => {
  it("giữ id kỹ thuật trong store; bỏ tick một dáng thì store bớt đúng id đó", () => {
    mount(<MascotStep />);
    const idle = screen.getAllByRole("button", { name: /Đứng chờ/ }).find(b => b.hasAttribute("aria-pressed"))!;
    // UI-FIX §3a — mặc định chọn HẾT, nên dáng nào cũng đang bật khi mới vào.
    expect(idle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(idle);
    expect(createWorkflowStore(PID).getState().mascotPoses).not.toContain("idle");
    fireEvent.click(idle);
    expect(createWorkflowStore(PID).getState().mascotPoses).toContain("idle");
  });

  it("mặc định chọn HẾT 19 dáng (bỏ bớt, không phải cộng thêm)", () => {
    expect(createWorkflowStore(PID).getState().mascotPoses).toHaveLength(POSES.length);
  });

  it("có đủ 19 pose của pipeline qua 5 nhóm", () => {
    expect(POSES).toHaveLength(19);
    expect(new Set(POSES.map(p => p.group)).size).toBe(5);
  });

  /**
   * UI-FIX §3a — bộ dáng dùng ĐÚNG khuôn của bước "Bộ khung UI". Kiểm bằng HÌNH DẠNG
   * DOM (class của thẻ + `aria-pressed`), không phải bằng "có gọi component X không":
   * điều người dùng thấy là hai bước liền nhau trông như một, không phải cây import.
   */
  it("thẻ dáng dùng chung khuôn `.compact-element` với bước Bộ khung UI", () => {
    const { container } = mount(<MascotStep />);
    const cards = container.querySelectorAll(".compact-element-grid .compact-element");
    expect(cards.length).toBeGreaterThan(0);
    expect([...cards].every((card) => card.hasAttribute("aria-pressed"))).toBe(true);
    // …và KHÔNG còn ngôn ngữ riêng của bản cũ.
    expect(container.querySelector(".pose-group-tabs")).toBeNull();
    expect(container.querySelector(".pose-choice-grid")).toBeNull();
    expect(container.querySelector(".selected-poses")).toBeNull();
  });
});

/**
 * UI-FIX §1 — hai chỗ có hàng "Có nhân vật đại diện" phải là CHECKBOX nằm cùng hàng
 * với nhãn, không phải công tắc trôi lên một dòng riêng.
 *
 * Ca test phát biểu ở dạng KIỂM ĐƯỢC BẰNG DOM: (a) control mang `role="checkbox"`,
 * (b) nó nằm TRONG chính `<label>` chứa nhãn ⇒ bấm đâu trên hàng cũng đổi trạng thái.
 */
describe("UI-FIX §1 — 'Có nhân vật đại diện' là checkbox, nhãn cùng hàng", () => {
  it.each([
    ["bước Yêu cầu", () => <BriefStep />],
    ["bước Mascot", () => <MascotStep />],
  ])("%s: control là checkbox nằm trong cùng label với nhãn và mô tả", (_name, ui) => {
    mount(ui());
    const box = screen.getByRole("checkbox", { name: /Có nhân vật đại diện/ });
    const row = box.closest("label")!;
    expect(row).toBeTruthy();
    expect(row.className).toContain("check-row");
    expect(row.textContent).toContain("Có nhân vật đại diện");
    expect(row.querySelector(".check-row-text")).toBeTruthy();
    // KHÔNG còn công tắc ở hàng này.
    expect(row.querySelector('[role="switch"]')).toBeNull();
  });

  it("bỏ tick thì store tắt mascot (và bước Mascot giấu phần nội dung)", () => {
    mount(<MascotStep />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Có nhân vật đại diện/ }));
    expect(createWorkflowStore(PID).getState().mascotEnabled).toBe(false);
    expect(screen.queryByRole("button", { name: /Thêm nhân vật/ })).toBeNull();
  });
});

/** UI-FIX §3b — nhân vật cộng TỪNG CON qua modal, mỗi con một thẻ có nút xoá. */
describe("UI-FIX §3b — bước Mascot là danh sách thẻ + modal", () => {
  it("mới vào thì danh sách rỗng và có nút '+ Thêm nhân vật'", () => {
    mount(<MascotStep />);
    expect(createWorkflowStore(PID).getState().mascots).toEqual([]);
    expect(screen.getByRole("button", { name: /Thêm nhân vật/ })).toBeTruthy();
    // Form inline một-con của bản cũ đã biến mất khỏi thân bước.
    expect(screen.queryByLabelText("Tên nhân vật")).toBeNull();
  });

  it("bấm 'Thêm nhân vật' mở MODAL, lưu xong thành một thẻ trong danh sách", () => {
    mount(<MascotStep />);
    fireEvent.click(screen.getByRole("button", { name: /Thêm nhân vật/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(screen.getByLabelText("Tên nhân vật"), { target: { value: "Mèo bạc hà" } });
    fireEvent.change(screen.getByLabelText("Mô tả nhân vật"), { target: { value: "Mèo xanh, khăn quàng" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Thêm nhân vật$/ }));

    const mascots = createWorkflowStore(PID).getState().mascots;
    expect(mascots).toHaveLength(1);
    expect(mascots[0]!.name).toBe("Mèo bạc hà");
    // Ba trường cũ là TIẾNG VỌNG của con đầu — contract và recap vẫn đọc được.
    expect(createWorkflowStore(PID).getState().mascotName).toBe("Mèo bạc hà");
    expect(createWorkflowStore(PID).getState().mascotDescription).toBe("Mèo xanh, khăn quàng");
  });

  it("mỗi thẻ có nút Sửa và nút Xoá; xoá thì con đó rời danh sách", () => {
    createWorkflowStore(PID).getState().addMascot({ name: "Sóc VCB", description: "" });
    mount(<MascotStep />);
    expect(screen.getByRole("button", { name: "Sửa Sóc VCB" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xoá Sóc VCB" }));
    fireEvent.click(screen.getByRole("button", { name: /Xoá nhân vật/ }));
    expect(createWorkflowStore(PID).getState().mascots).toEqual([]);
    expect(createWorkflowStore(PID).getState().mascotName).toBe("");
  });

  it("recap bước Kiểm tra đếm được nhiều nhân vật, không chỉ nói tên con đầu", () => {
    const s = createWorkflowStore(PID).getState();
    s.addMascot({ name: "Sóc", description: "" });
    expect(mascotRecapValue(createWorkflowStore(PID).getState())).toBe("Sóc");
    createWorkflowStore(PID).getState().addMascot({ name: "Mèo", description: "" });
    expect(mascotRecapValue(createWorkflowStore(PID).getState())).toBe("2 nhân vật");
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
