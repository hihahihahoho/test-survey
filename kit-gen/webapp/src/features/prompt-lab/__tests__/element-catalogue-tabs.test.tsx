/* @vitest-environment jsdom */
/**
 * HỘP TRA DANH MỤC ELEMENT — BA NẤC, VÀ MÓN CÓ ẢNH KHUNG SẴN TRONG KHO.
 *
 * Chủ sản phẩm, nhìn hộp này đứng cạnh hộp của mọi pill khác trên cùng một màn:
 * *«phần này cũng nên bỏ cái Tự đặt tên → vì nó ở đính ảnh khung rồi? tức là thêm
 * 1 tab gõ riêng như mấy chỗ khác? và có nút quản lý element → element cũng cho
 * kiểu up ảnh + gõ mô tả → sau select được bên tab đầu nhé»*.
 *
 * Bốn thứ trong câu ấy, và cả bốn đều hỏng CÂM được:
 *  ① THANH NẤC PHẢI CÓ MẶT Ở CẢ HAI CHỖ MỞ HỘP. Trước lượt này nó chỉ hiện khi có
 *    đường đính ảnh, nên cùng một hộp lại có hai hình dạng — và ở «+ Element» thì
 *    cửa «gõ riêng» là một khối lạ dán ở đáy một danh sách cuộn được.
 *  ② CỬA «TỰ ĐẶT TÊN» Ở ĐÁY PHẢI BIẾN MẤT. Còn sót lại thì có HAI đường vào cho
 *    cùng một việc, ở hai chỗ khác nhau của cùng một hộp.
 *  ③ TÌM HỤT PHẢI DẪN ĐI ĐÂU ĐÓ. Cửa gõ tên nay nằm sau một cú bấm, nên lúc danh
 *    sách rỗng mà không có đường sang đó thì nó thành cửa KHÔNG TỒN TẠI với người
 *    chưa biết nó có.
 *  ④ MÓN CÓ ẢNH KHUNG PHẢI MANG ẢNH THEO SANG DÒNG. Ảnh nằm ở kho dùng chung còn
 *    `gen.sh` chỉ đính được tệp trong dự án — không chép thì người dùng thấy
 *    thumbnail trong hộp chọn, chọn xong dòng trống trơn, và không có gì báo.
 *
 * ══ ⑤ 22/09/2026 — ĐÍNH ẢNH KHUNG *LÀ* KHAI MỘT MÓN ═══════════════════════════
 * Chủ sản phẩm, kèm ảnh chụp dòng #5 vừa tải lên một tấm phác của riêng mình:
 * *«mà cái này tôi up custom sao nó vẫn chọn là popup pannel nhỉ, với cả nút thêm
 * cho full khung, user thấy rõ?»*.
 * Việc đầu hỏng CÂM: đời trước cú chốt chỉ ghi `shapeRef`/`shapeNote` rồi để nguyên
 * `elementId`, nên prompt gửi đi mang CẢ danh từ của danh mục lẫn câu người dùng tự
 * viết («popup panel (shape as in the attached reference)» + «… (Popup panel): khung
 * nhiệm vụ ba cạnh»). Màn hình vẫn đẹp, máy vẽ vẫn vẽ ra cái popup panel.
 */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { seedPresets, type ElementPreset, type PresetBundle } from "../lib/presets-store";
import { newCell, type UiCell, type UiKitBlock } from "../lib/composer-model";
import { UiKitBlockBody } from "../components/UiKitBlockView";

/**
 * HAI MÓN THÊM VÀO DANH MỤC HẠT GIỐNG cho riêng file này.
 *
 * `vi.hoisted` chứ không phải hai hằng số thường: `vi.mock` được kéo lên ĐẦU file,
 * nên một hằng số khai ở thân file sẽ chưa tồn tại lúc factory chạy — và lỗi ấy
 * hiện ra dưới dạng "Cannot access before initialization" ở một dòng `import`.
 */
const { SHAPED, HALF, ELEMENTS, UPLOADED } = vi.hoisted(() => {
  /** Món TỰ ĐẶT TÊN mang sẵn ảnh khung trong kho dùng chung — thứ lượt trước thêm vào. */
  const SHAPED: ElementPreset = {
    id: "tu-dat-khung-nhiem-vu",
    vi: "Khung nhiệm vụ",
    en: "quest frame",
    decor: "medium",
    glazeId: "solid",
    sizeId: "",
    shapeAssetId: "asset_quest",
    shapeNote: "khung ba cạnh, có dải ruy băng trên đỉnh",
  };
  /** Món CÓ ảnh nhưng THIẾU mô tả — bản ghi nửa vời, phải bị bỏ qua. */
  const HALF: ElementPreset = {
    id: "tu-dat-nua-voi",
    vi: "Món nửa vời",
    en: "half done",
    decor: "medium",
    glazeId: "solid",
    sizeId: "",
    shapeAssetId: "asset_half",
    shapeNote: "   ",
  };
  return {
    SHAPED,
    HALF,
    /**
     * DANH MỤC SỐNG của file này — mảng THẬT mà `usePresets` trả ra, không phải bản chép.
     *
     * Nấc «Đính ảnh khung» nay ĐẺ RA element (xem ⑤), và cú chốt ấy chỉ đọc được là
     * đúng nếu cái pill ngay sau đó TRA ĐƯỢC món vừa sinh. Một bản chép đóng băng lúc
     * mock thì pill mãi hiện id trần, và ca test đỏ vì đồ giả chứ không vì code.
     */
    ELEMENTS: [] as ElementPreset[],
    /** Tấm ảnh mà phép tải lên (đã mock) trả về. */
    UPLOADED: { refName: "shape-1.png", path: "refs/shape-1.png" },
  };
});

vi.mock("../lib/presets-store", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  const { slugify } = await import("@/lib/types/contract");
  const seed = (real["seedPresets"] as () => PresetBundle)();
  ELEMENTS.push(...seed.elements, SHAPED, HALF);
  const bundle = { ...seed, elements: ELEMENTS };
  return {
    ...real,
    usePresets: () => bundle,
    getPresets: () => bundle,
    /* BẢN RÚT GỌN CỦA `addCustomElement` THẬT, không phải một cái tem: cùng luật gộp
       theo `vi` không phân biệt hoa thường, cùng khuôn id `tu-dat-<slug>` (chính hàm
       `slugify` của contract). Chỉ vòng ghi lên server là bị bỏ. Hai luật ấy LÀ thứ ca
       ⑤ đọc — làm giả chúng thì ca ấy khoá một hành vi không tồn tại. */
    addCustomElement: (name: string): ElementPreset | null => {
      const label = name.trim();
      if (!label) return null;
      const same = ELEMENTS.find((element) => element.vi.toLowerCase() === label.toLowerCase());
      if (same) return same;
      const made: ElementPreset = {
        id: `tu-dat-${slugify(label)}`, vi: label, en: label, decor: "medium", glazeId: "solid", sizeId: "",
      };
      ELEMENTS.push(made);
      return made;
    },
  };
});

/* Nấc «Đính ảnh khung» đẩy tệp qua agent rồi mới cầm được `refs/…`. Ca ở đây nói về
   CÚ CHỐT, không về đường tải — nên phép tải trả thẳng một đường dẫn có thật. */
vi.mock("@/features/prompt-canvas/lib/pill-image", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  uploadPillImage: async () => UPLOADED,
}));

/* Thumbnail đọc kho dùng chung qua `useLibraryImage`. Ca ở đây nói về hộp chọn,
   không về đường tải ảnh — nên hook trả thẳng một chuỗi. */
vi.mock("@/lib/hooks", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  useLibraryImage: (id: string | null) => (id ? `blob:${id}` : null),
}));

const SEED = seedPresets();

/** Một ô, dựng bằng CHÍNH `newCell` của kho — gõ tay từng trường là một ô thứ hai
    có hình dạng riêng, và nó sẽ lệch khỏi ô thật ở lượt thêm trường kế tiếp. */
const cellOf = (elementId: string, id: string, extra: Partial<UiCell> = {}): UiCell =>
  ({ ...newCell(elementId, SEED), id, ...extra });

const uikit = (cells: UiCell[] = []): UiKitBlock => ({ id: "u1", kind: "uikit", mode: "template", cells });

function Harness({
  initial,
  copyShapeAsset,
  onState,
}: {
  initial: UiKitBlock;
  copyShapeAsset?: (assetId: string) => Promise<{ refName: string; path: string }>;
  onState?: (next: UiKitBlock) => void;
}) {
  const [block, setBlock] = React.useState(initial);
  return (
    <UiKitBlockBody
      block={block}
      onChange={(updater) =>
        setBlock((prev) => {
          const next = updater(prev);
          onState?.(next);
          return next;
        })
      }
      {...(copyShapeAsset ? { projectId: "p1", copyShapeAsset } : {})}
    />
  );
}

const openAdd = () => fireEvent.click(screen.getByRole("button", { name: /Element/ }));
const openNamePill = () => fireEvent.click(screen.getByRole("button", { name: /Đổi loại món/ }));
const openShapeTab = () => {
  openNamePill();
  fireEvent.click(screen.getByRole("tab", { name: "Đính ảnh khung" }));
};

/** Thả một tấm ảnh vào ô đính — qua ĐÚNG ô chọn tệp mà người dùng bấm tới. */
async function attachImage() {
  fireEvent.change(screen.getByLabelText("Chọn tệp ảnh khung"), {
    target: { files: [new File(["x"], "phac.png", { type: "image/png" })] },
  });
  await waitFor(() => expect(screen.getByText("Đổi ảnh khung")).toBeTruthy());
}

/** Số món của danh mục lúc chưa ai gõ thêm gì — xem `ELEMENTS`. */
const SEED_COUNT = ELEMENTS.length;

afterEach(() => {
  cleanup();
  /* Danh mục là một mảng SỐNG dùng chung cả file, nên món của ca này không được
     còn đó ở ca sau: một cú gộp theo tên trúng rác của ca trước là một ca xanh giả. */
  ELEMENTS.length = SEED_COUNT;
});

/* ══════════════════════════════════════════════════════════════════════════
   ① THANH NẤC — LUÔN CÓ MẶT, HAI HAY BA NẤC TUỲ CHỖ MỞ
   ══════════════════════════════════════════════════════════════════════════ */

describe("① thanh nấc của hộp tra danh mục", () => {
  it("«+ Element» có ĐÚNG HAI nấc: «Chọn sẵn» · «Gõ riêng»", () => {
    render(<Harness initial={uikit()} />);
    openAdd();
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["Chọn sẵn", "Gõ riêng"]);
    /* Chưa có món thì chưa có hình dáng để hỏi — xem khối chú thích ở `onShape`. */
    expect(screen.queryByRole("tab", { name: "Đính ảnh khung" })).toBeNull();
  });

  it("pill tên trên dòng có ĐỦ BA nấc, đúng thứ tự", () => {
    render(<Harness initial={uikit([cellOf("button", "c1")])} />);
    openNamePill();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Chọn sẵn", "Đính ảnh khung", "Gõ riêng",
    ]);
  });

  it("nấc mở sẵn là nấc ĐANG HIỆU LỰC — dòng có ảnh khung ⇒ mở ở nấc ảnh", () => {
    render(
      <Harness
        initial={uikit([cellOf("button", "c1", { shapeRef: "refs/shape-1.png", shapeNote: "cái khiên tròn" })])}
      />,
    );
    openNamePill();
    expect(screen.getByRole("tab", { name: "Đính ảnh khung" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Gõ riêng" }).getAttribute("aria-selected")).toBe("false");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ② CỬA «TỰ ĐẶT TÊN» Ở ĐÁY ĐÃ ĐI — nó là một NẤC
   ══════════════════════════════════════════════════════════════════════════ */

describe("② nấc «Chọn sẵn» chỉ còn tìm + danh sách + lối tắt quản lý", () => {
  it("KHÔNG còn khối «Tự đặt tên» dán ở đáy danh sách", () => {
    render(<Harness initial={uikit()} />);
    openAdd();
    expect(screen.queryByText("Tự đặt tên")).toBeNull();
    /* Ô gõ tên cũng không được nằm sẵn ở đây: nó là ruột của nấc kia. */
    expect(screen.queryByLabelText("Tên món tự đặt")).toBeNull();
    expect(screen.getByLabelText("Tìm trong danh mục")).toBeTruthy();
  });

  it("chân hộp có lối tắt «Quản lý element…», mở đúng danh mục element ở TAB MỚI", () => {
    render(<Harness initial={uikit()} />);
    openAdd();
    const link = screen.getByRole("link", { name: /Quản lý element ở Thư viện prompt/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/library/prompts?kind=element");
    /* Hộp này sống trong một thẻ đang soạn dở — rời trang tại chỗ là ném đi chữ chưa lưu. */
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("bấm sang nấc «Gõ riêng» mới thấy ô tên, và lối tắt quản lý lui đi", () => {
    render(<Harness initial={uikit()} />);
    openAdd();
    fireEvent.click(screen.getByRole("tab", { name: "Gõ riêng" }));
    expect(screen.getByLabelText("Tên món tự đặt")).toBeTruthy();
    expect(screen.queryByLabelText("Tìm trong danh mục")).toBeNull();
    expect(screen.queryByRole("link", { name: /Quản lý element/ })).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ TÌM HỤT ⇒ MỘT CÚ BẤM SANG NẤC GÕ RIÊNG, TÊN ĐIỀN SẴN
   ══════════════════════════════════════════════════════════════════════════ */

describe("③ tìm không ra thì đặt tên, ngay tại chỗ tìm hụt", () => {
  it("gõ chuỗi không khớp ⇒ nút «Đặt tên “…”» hiện ra cùng lời báo", () => {
    render(<Harness initial={uikit()} />);
    openAdd();
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "ô rương" } });
    expect(screen.getByText(/Không có món nào khớp/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Đặt tên “ô rương”/ })).toBeTruthy();
  });

  it("ô tìm RỖNG thì KHÔNG bày nút ấy — «Đặt tên “”» là một cú bấm không có nghĩa", () => {
    render(<Harness initial={uikit()} />);
    openAdd();
    /* Danh mục hạt giống không rỗng, nên ca này dựng bằng một chuỗi toàn khoảng trắng. */
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "   " } });
    expect(screen.queryByRole("button", { name: /Đặt tên/ })).toBeNull();
  });

  it("bấm nút ấy ⇒ sang nấc «Gõ riêng» với ĐÚNG chữ vừa gõ điền sẵn", () => {
    render(<Harness initial={uikit()} />);
    openAdd();
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "ô rương" } });
    fireEvent.click(screen.getByRole("button", { name: /Đặt tên “ô rương”/ }));

    expect(screen.getByRole("tab", { name: "Gõ riêng" }).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByLabelText("Tên món tự đặt") as HTMLInputElement).value).toBe("ô rương");
  });

  it("gõ tên rồi «Thêm» ⇒ một dòng mới mang đúng tên ấy", () => {
    let latest: UiKitBlock | null = null;
    render(<Harness initial={uikit()} onState={(next) => { latest = next; }} />);
    openAdd();
    fireEvent.click(screen.getByRole("tab", { name: "Gõ riêng" }));
    fireEvent.change(screen.getByLabelText("Tên món tự đặt"), { target: { value: "Ô rương" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));

    expect((latest as unknown as UiKitBlock).cells).toHaveLength(1);
    /* Id đi thẳng vào TÊN FILE của ô trong contract, nên nó là một slug ngay từ lúc
       sinh — không phải chữ người dùng gõ kèm dấu và khoảng trắng. */
    expect((latest as unknown as UiKitBlock).cells[0]!.elementId).toBe("tu-dat-o-ruong");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ MÓN CÓ ẢNH KHUNG TRONG KHO — chọn ở nấc đầu là ảnh đi theo
   ══════════════════════════════════════════════════════════════════════════ */

const IMAGE = { refName: "shape-quest.png", path: "refs/shape-quest.png" };

describe("④ chọn một món có ảnh khung sẵn", () => {
  it("dòng của món ấy trong danh sách có THUMBNAIL đứng trước tên", () => {
    render(<Harness initial={uikit()} copyShapeAsset={async () => IMAGE} />);
    openAdd();
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "khung nhiem vu" } });
    const row = screen.getByRole("option", { name: /Khung nhiệm vụ/ });
    expect(row.querySelector("img")?.getAttribute("src")).toBe("blob:asset_quest");
  });

  it("«+ Element»: dòng hiện ra NGAY, rồi `shapeRef` + `shapeNote` được vá vào sau", async () => {
    const copy = vi.fn(async () => IMAGE);
    let latest: UiKitBlock | null = null;
    render(<Harness initial={uikit()} copyShapeAsset={copy} onState={(next) => { latest = next; }} />);
    openAdd();
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "khung nhiem vu" } });
    fireEvent.click(screen.getByRole("option", { name: /Khung nhiệm vụ/ }));

    /* Lượt ghi ĐẦU TIÊN chỉ mang cái món — ảnh cần mạng, và bắt màn hình đứng im
       chờ nó là mời người dùng bấm lần nữa. */
    expect((latest as unknown as UiKitBlock).cells[0]!.elementId).toBe(SHAPED.id);

    await waitFor(() => expect((latest as unknown as UiKitBlock).cells[0]!.shapeRef).toBe(IMAGE.path));
    expect((latest as unknown as UiKitBlock).cells[0]!.shapeNote).toBe(SHAPED.shapeNote);
    expect(copy).toHaveBeenCalledWith("asset_quest");
  });

  it("pill trên dòng: đổi loại sang món có ảnh ⇒ ĐÚNG dòng ấy nhận ảnh", async () => {
    const copy = vi.fn(async () => IMAGE);
    let latest: UiKitBlock | null = null;
    render(
      <Harness
        initial={uikit([cellOf("panel", "c1"), cellOf("badge", "c2")])}
        copyShapeAsset={copy}
        onState={(next) => { latest = next; }}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Đổi loại món/ })[0]!);
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "khung nhiem vu" } });
    fireEvent.click(screen.getByRole("option", { name: /Khung nhiệm vụ/ }));

    await waitFor(() => expect((latest as unknown as UiKitBlock).cells[0]!.shapeRef).toBe(IMAGE.path));
    /* Dòng bên cạnh KHÔNG được lây: ảnh khung là của MỘT món, không của cả thẻ. */
    expect((latest as unknown as UiKitBlock).cells[1]!.shapeRef).toBeUndefined();
  });

  it("món khai có ảnh mà THIẾU mô tả ⇒ KHÔNG chép gì — cặp nửa vời không lọt vào", async () => {
    const copy = vi.fn(async () => IMAGE);
    let latest: UiKitBlock | null = null;
    render(<Harness initial={uikit()} copyShapeAsset={copy} onState={(next) => { latest = next; }} />);
    openAdd();
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "nua voi" } });
    fireEvent.click(screen.getByRole("option", { name: /Món nửa vời/ }));

    expect((latest as unknown as UiKitBlock).cells[0]!.elementId).toBe(HALF.id);
    expect(copy).not.toHaveBeenCalled();
    expect((latest as unknown as UiKitBlock).cells[0]!.shapeRef).toBeUndefined();
  });

  it("KHÔNG CÓ DỰ ÁN (vỏ lab) ⇒ vẫn chọn được món, chỉ là không có ảnh đi kèm", () => {
    let latest: UiKitBlock | null = null;
    render(<Harness initial={uikit()} onState={(next) => { latest = next; }} />);
    openAdd();
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "khung nhiem vu" } });
    fireEvent.click(screen.getByRole("option", { name: /Khung nhiệm vụ/ }));

    expect((latest as unknown as UiKitBlock).cells[0]!.elementId).toBe(SHAPED.id);
    expect((latest as unknown as UiKitBlock).cells[0]!.shapeRef).toBeUndefined();
  });

  it("chép HỎNG ⇒ NÓI RA bằng chữ, không nuốt — hộp đã đóng, không còn chỗ nào khác để báo", async () => {
    const copy = vi.fn(async () => { throw new Error("mạng chết"); });
    render(<Harness initial={uikit()} copyShapeAsset={copy} />);
    openAdd();
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "khung nhiem vu" } });
    fireEvent.click(screen.getByRole("option", { name: /Khung nhiệm vụ/ }));

    await waitFor(() => expect(screen.getByText(/Không chép được ảnh khung của «Khung nhiệm vụ»/)).toBeTruthy());
    expect(screen.getByText(/mạng chết/)).toBeTruthy();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ ĐÍNH ẢNH KHUNG = KHAI MỘT MÓN — dòng thôi đeo danh từ của danh mục
   ══════════════════════════════════════════════════════════════════════════ */

const SHAPED_CELL = () =>
  cellOf(SHAPED.id, "c1", { shapeRef: UPLOADED.path, shapeNote: SHAPED.shapeNote! });

describe("⑤ cú chốt của nấc «Đính ảnh khung» đổi luôn danh tính của dòng", () => {
  it("mở trên một dòng đang đeo món DANH MỤC ⇒ ô tên RỖNG, không điền sẵn «Popup · panel»", () => {
    render(<Harness initial={uikit([cellOf("popover", "c1")])} copyShapeAsset={async () => IMAGE} />);
    openShapeTab();
    /* Điền sẵn đúng cái danh từ họ đang muốn bỏ đi là mời họ bấm «Thêm» mà không đọc. */
    expect((screen.getByLabelText("Tên món trong ảnh khung") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Thêm" })).toBeTruthy();
    expect(screen.getByText("Chọn một tấm ảnh trước.")).toBeTruthy();
  });

  it("TÊN LÀ BẮT BUỘC: có ảnh, có mô tả mà chưa có tên ⇒ nút xám, lý do nói ra bằng chữ", async () => {
    render(<Harness initial={uikit([cellOf("popover", "c1")])} copyShapeAsset={async () => IMAGE} />);
    openShapeTab();
    await attachImage();
    fireEvent.change(screen.getByLabelText("Mô tả món trong ảnh khung"), { target: { value: "ba cạnh" } });
    expect((screen.getByRole("button", { name: "Thêm" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Đặt tên món rồi mới thêm được.")).toBeTruthy();
  });

  it("chốt ⇒ dòng thành món TỰ ĐẶT TÊN `tu-dat-<slug>`, mang cả ảnh lẫn mô tả, và PILL đọc ra tên mới", async () => {
    let latest: UiKitBlock | null = null;
    render(
      <Harness
        initial={uikit([cellOf("popover", "c1")])}
        copyShapeAsset={async () => IMAGE}
        onState={(next) => { latest = next; }}
      />,
    );
    openShapeTab();
    await attachImage();
    fireEvent.change(screen.getByLabelText("Tên món trong ảnh khung"), { target: { value: "Khung chiến lợi phẩm" } });
    fireEvent.change(screen.getByLabelText("Mô tả món trong ảnh khung"), {
      target: { value: "  khung ba cạnh, có dải ruy băng trên đỉnh  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));

    const cell = (latest as unknown as UiKitBlock).cells[0]!;
    expect(cell.elementId).toBe("tu-dat-khung-chien-loi-pham");
    expect(cell.shapeRef).toBe(UPLOADED.path);
    expect(cell.shapeNote).toBe("khung ba cạnh, có dải ruy băng trên đỉnh");
    /* ĐÚNG CÁI CHỦ SẢN PHẨM NHÌN VÀO: cái pill, sau khi hộp đóng. */
    expect(screen.getByRole("button", { name: /Đổi loại món — đang là Khung chiến lợi phẩm, có ảnh khung/ })).toBeTruthy();
    expect(screen.queryByText("Popup")).toBeNull();
  });

  it("cỡ và công chỉnh tay của dòng đi qua nguyên vẹn — cú chốt không dựng lại dòng", async () => {
    let latest: UiKitBlock | null = null;
    render(
      <Harness
        initial={uikit([cellOf("popover", "c1", { note: "bo góc thật tròn", glazeId: "glass" })])}
        copyShapeAsset={async () => IMAGE}
        onState={(next) => { latest = next; }}
      />,
    );
    openShapeTab();
    await attachImage();
    fireEvent.change(screen.getByLabelText("Tên món trong ảnh khung"), { target: { value: "Khung chiến lợi phẩm" } });
    fireEvent.change(screen.getByLabelText("Mô tả món trong ảnh khung"), { target: { value: "ba cạnh" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));

    const cell = (latest as unknown as UiKitBlock).cells[0]!;
    expect(cell.id).toBe("c1");
    expect(cell.note).toBe("bo góc thật tròn");
    expect(cell.glazeId).toBe("glass");
  });

  it("gõ ĐÚNG TÊN một món đã có ⇒ nhận lại chính món ấy, không đẻ bản sao — cửa thoát cho ai chỉ muốn đính ảnh", async () => {
    let latest: UiKitBlock | null = null;
    render(
      <Harness
        initial={uikit([cellOf("badge", "c1")])}
        copyShapeAsset={async () => IMAGE}
        onState={(next) => { latest = next; }}
      />,
    );
    openShapeTab();
    await attachImage();
    /* Gõ thường hết — phép gộp KHÔNG phân biệt hoa thường, đúng luật của `addCustomElement`. */
    fireEvent.change(screen.getByLabelText("Tên món trong ảnh khung"), { target: { value: "badge" } });
    fireEvent.change(screen.getByLabelText("Mô tả món trong ảnh khung"), { target: { value: "huy hiệu tròn" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));

    expect((latest as unknown as UiKitBlock).cells[0]!.elementId).toBe("badge");
    expect((latest as unknown as UiKitBlock).cells[0]!.shapeRef).toBe(UPLOADED.path);
    expect(ELEMENTS).toHaveLength(SEED_COUNT);
  });

  it("dòng ĐÃ có ảnh ⇒ ô tên điền sẵn tên đang hiện, và nút đọc «Cập nhật»", () => {
    render(<Harness initial={uikit([SHAPED_CELL()])} copyShapeAsset={async () => IMAGE} />);
    openNamePill();
    expect((screen.getByLabelText("Tên món trong ảnh khung") as HTMLInputElement).value).toBe("Khung nhiệm vụ");
    expect((screen.getByLabelText("Mô tả món trong ảnh khung") as HTMLTextAreaElement).value).toBe(SHAPED.shapeNote);
    expect(screen.getByRole("button", { name: "Cập nhật" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Thêm" })).toBeNull();
  });

  it("nút chốt TRẢI HẾT BỀ NGANG, và câu lý do nằm DƯỚI nó", () => {
    /* *«với cả nút thêm cho full khung, user thấy rõ?»* — nút `sm` nép bên trái cạnh
       một câu chữ nhỏ đọc ra như chú thích, chứ không như CÚ BẤM duy nhất có hậu quả. */
    render(<Harness initial={uikit([cellOf("popover", "c1")])} copyShapeAsset={async () => IMAGE} />);
    openShapeTab();
    const button = screen.getByRole("button", { name: "Thêm" });
    expect(button.className).toContain("w-full");
    const why = screen.getByText("Chọn một tấm ảnh trước.");
    expect(why.parentElement).toBe(button.parentElement);
    expect(button.compareDocumentPosition(why) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    /* Lối ra kho vẫn ở dưới cùng — nó không bị nút mới đẩy đi đâu cả. */
    expect(screen.getByRole("link", { name: /Lưu vào kho element/ })).toBeTruthy();
  });

  it("«Bỏ ảnh khung» bỏ ảnh + mô tả, nhưng KHÔNG trả món về danh mục", () => {
    let latest: UiKitBlock | null = null;
    render(
      <Harness initial={uikit([SHAPED_CELL()])} copyShapeAsset={async () => IMAGE} onState={(next) => { latest = next; }} />,
    );
    openNamePill();
    fireEvent.click(screen.getByRole("button", { name: /Bỏ ảnh khung/ }));
    const cell = (latest as unknown as UiKitBlock).cells[0]!;
    expect(cell.shapeRef).toBeUndefined();
    expect(cell.shapeNote).toBeUndefined();
    /* Món vẫn là món họ đã đặt tên — nó chỉ thôi có bản phác đi kèm. */
    expect(cell.elementId).toBe(SHAPED.id);
  });
});
