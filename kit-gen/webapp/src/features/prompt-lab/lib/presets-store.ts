import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GENRE_PRESETS } from "@/features/prompt-lab/lib/genre-presets";
import {
  CATALOG_ORDER, CATALOG_SEEDS, type CatalogKind,
} from "@/features/prompt-lab/lib/catalog-seeds";
import { GLAZE_AUTO, glazeFromMaterial } from "@/features/kit-core/lib/glaze";
import { EXPRESSIONS, POSES } from "@/features/kit-core/lib/poses";
import { skelSchema, slugify, type Skel } from "@/lib/types/contract";
import { api } from "@/lib/api/endpoints";
import { qk, useUserLibrary } from "@/lib/hooks";
import type { LibraryPreset } from "@/lib/types/api";

/**
 * presets-store.ts — DANH MỤC NGƯỜI DÙNG TỰ SỬA, lưu TRONG WORKSPACE KitGen.
 *
 * ╔══ VÌ SAO LAB LẠI CÓ MỘT KHO DỮ LIỆU ═════════════════════════════════════╗
 * ║ Vì phần đắt nhất của ý tưởng này không phải cái editor — mà là câu hỏi    ║
 * ║ "danh mục element/phong cách của ĐỘI này gồm những gì". Mỗi đội game có   ║
 * ║ bộ element riêng (nút, popover, thanh máu, khung avatar…) và bộ phong     ║
 * ║ cách riêng. Nếu danh mục bị đóng cứng trong code thì demo chỉ trả lời     ║
 * ║ được "UI có đẹp không", không trả lời được "quy trình này có dùng được    ║
 * ║ cho đội tôi không" — mà đó mới là thứ cần biết trước khi làm thật.        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ ĐÃ RỜI localStorage → `GET/POST/PATCH/DELETE /api/library/presets` ══════
 * Bản trước lưu trong localStorage và tự ghi ba nhược điểm của nó ngay tại đây:
 * một máy · một trình duyệt; ẩn danh; mất khi người dùng xoá dữ liệu duyệt web.
 * Cả ba đã hết: preset nay nằm trong `.kitgen/library/library.json` của
 * workspace, cạnh contract — đúng chỗ mà chú thích cũ nói "bản làm thật phải để".
 *
 * ══ BA THỨ PHẢI GIỮ NGUYÊN, VÀ CHÚNG ĐỊNH HÌNH CẢ FILE NÀY ═════════════════
 * 1. `getPresets()` PHẢI ĐỒNG BỘ. Chục hàm THUẦN dùng nó làm đối số mặc định
 *    (`composer-model`, `pill-registry`, `serialize*`, `composer-doc`,
 *    `composer-to-contract`). Biến chúng thành async là sửa cả một tầng — và
 *    làm mất tính thuần khiến chúng hết test được. Nên: TanStack Query giữ dữ
 *    liệu gốc, còn ở đây có một BẢN SAO trong RAM để đọc đồng bộ. Bản sao chỉ
 *    được ghi từ đúng hai nguồn: hydrate từ server, và `setPresets` của người dùng.
 * 2. `id` trong bundle KHÔNG phải id của server. Id bundle đi thẳng vào tài liệu
 *    đã lưu (`elementId` của mỗi ô, giá trị của pill phong cách). Nếu nó là id
 *    server sinh ngẫu nhiên thì mọi tài liệu cũ trỏ vào hư không sau lần đầu đồng
 *    bộ. Nên id bundle được giữ nguyên trong `data.key`, và id server chỉ là địa
 *    chỉ vận chuyển — được tra qua bảng `serverIdOf`.
 * 3. Màn preset sửa THEO TỪNG PHÍM (không có nút Lưu — xem `PresetsScreen`).
 *    Mỗi phím một PATCH là hàng trăm request và một cuộc đua ghi đè. Nên bản sao
 *    trong RAM đổi NGAY (UI không giật), còn việc ghi lên server được GỘP lại và
 *    hoãn `FLUSH_DELAY_MS`.
 *
 * ══ HẠT GIỐNG lấy từ dữ liệu THẬT của kit-core (chỉ đọc) ════════════════
 * Kho rỗng là một màn không dùng được: người mở lần đầu phải tự nghĩ ra 7 phong
 * cách trước khi thấy được gì. Seed từ `genre-presets` / `poses` ⇒ mở phát là
 * chạy, và người ta sửa từ một thứ có sẵn thay vì từ trang trắng.
 */

export interface StylePreset {
  id: string;
  /** Nhãn tiếng Việt trên pill. */
  vi: string;
  /** Cụm tiếng Anh đi vào prompt. */
  en: string;
}

/**
 * MỘT MÓN LÀ PHẦN CỦA MỘT BỘ — «chọn 1 được 2».
 *
 * ╔══ VÌ SAO BỘ LÀ MỘT NHÃN TRÊN TỪNG PHẦN, KHÔNG PHẢI MỘT MẢNG `parts[]` ═══╗
 * ║ Đường kia — `ElementPreset.parts: [...]` — nghe gọn hơn đúng một phút, rồi ║
 * ║ đẻ ra HAI LOẠI MÓN: loại tra được trong danh mục và loại nằm lồng bên      ║
 * ║ trong một món khác. Mà `elementId` của mỗi ô, tên file trong contract,     ║
 * ║ pill đổi loại, ô tìm kiếm, màn «Thư viện prompt» — tất cả đều tra bằng     ║
 * ║ MỘT phép `elements.find(id)`. Thêm một tầng lồng là bắt sáu chỗ ấy nhớ hỏi ║
 * ║ cả hai nguồn, và chỗ nào quên thì hiện ra một id trần (đúng cái lý lẽ đã   ║
 * ║ viết ở `addCustomElement`).                                               ║
 * ║ Nên: mỗi PHẦN vẫn là một `ElementPreset` đầy đủ — có id, có danh từ EN, có ║
 * ║ hình học riêng — và cái «bộ» chỉ là một NHÃN chung mà vài phần cùng đeo.   ║
 * ║ Đúng hình dạng mà `element-lib-v2.json` của engine đã dùng (`group`).      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ DI TRÚ KHÔNG TỐN GÌ ════════════════════════════════════════════════════
 * Thiếu `set` = MÓN LẺ. Mọi bản ghi element đã nằm trên workspace từ trước lượt
 * này đều thiếu nó, và chúng tiếp tục chạy y như hôm qua — không có bước nâng cấp,
 * không có lượt ghi ngược.
 */
export interface ElementSetRef {
  /** Id của BỘ — mọi phần cùng bộ mang ĐÚNG một chuỗi này. */
  id: string;
  /**
   * Nhãn của cả bộ («Health bar») — chữ đứng đầu dòng của bộ trong hộp chọn.
   *
   * THUẬT NGỮ GAME UI BẰNG TIẾNG ANH, không phải bản dịch — xem khối «NHÃN LÀ
   * THUẬT NGỮ TIẾNG ANH» ở `seedPresets()`. Trường vẫn tên `vi` vì nó là NHÃN HIỂN
   * THỊ (đối lập với `en`, câu đi vào prompt); đổi tên trường là đổi cả `row.name`
   * của server và mọi chỗ đọc nó, để lấy về đúng một chữ đẹp hơn.
   *
   * CHÉP TRÊN MỌI PHẦN, có chủ ý: kho là một mảng phẳng các bản ghi độc lập trên
   * server (mỗi phần một `POST`), nên không có chỗ nào để cất một bản ghi «bộ» mà
   * không đẻ ra một loại bản ghi thứ hai cùng những câu hỏi của nó (bộ rỗng thì
   * sao, bộ mồ côi thì sao). Cái giá: hai phần cùng bộ có thể mang hai chữ khác
   * nhau nếu ai đó sửa tay trên đĩa — `elementSets` xử lý bằng luật PHẦN ĐẦU
   * THẮNG, và màn «Thư viện prompt» đổi tên thì ghi lên MỌI phần cùng lúc.
   */
  vi: string;
}

/**
 * Một loại element của bộ UI kit — một dòng trong danh mục mà thẻ Bộ UI tra.
 *
 * ╔══ `en` LÀ MỘT DANH TỪ, KHÔNG PHẢI MỘT CÂU MÔ TẢ ═════════════════════════╗
 * ║ Chủ sản phẩm, khi nhìn thấy "a rounded background panel for a dialog" và  ║
 * ║ "a floating popover panel with a title bar" trên màn: *"KHÔNG có thuộc    ║
 * ║ tính nhé… làm theo kiểu composition, popover thì chỉ là popover thôi."*   ║
 * ║                                                                          ║
 * ║ Ba tính từ trong một danh mục là ba quyết định thẩm mỹ bị đóng cứng vào   ║
 * ║ MỌI bộ kit dùng nó: "rounded" đá nhau với một style góc cạnh, "floating"  ║
 * ║ đá nhau với một popover dán mép màn hình, "with a title bar" thì thêm hẳn ║
 * ║ một bộ phận người dùng không xin. Thẩm mỹ đến từ prompt tổng phong cách + ║
 * ║ pill người dùng bấm; danh mục chỉ trả lời "món này TÊN LÀ GÌ".            ║
 * ║ Luật thành văn: `en` là DANH TỪ (cụm danh từ), không mạo từ, không tính   ║
 * ║ từ thẩm mỹ. Đúng hình dạng mà `element-lib.json` của engine đang đổi về.  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export interface ElementPreset {
  id: string;
  /**
   * NHÃN HIỂN THỊ của riêng món này — và với một PHẦN, nó là tên phần chứ không
   * phải tên đầy đủ: «fill», không phải «Health bar fill». Chữ đầy đủ mà người
   * dùng đọc trên dòng do `elementLabel` ghép, vì nó là chỗ DUY NHẤT biết cả bộ
   * lẫn phần. Món lẻ (không `set`) thì tên phần chính là tên đầy đủ.
   */
  vi: string;
  /** DANH TỪ tiếng Anh đi vào `spec` của ô — xem khối chú thích trên. */
  en: string;
  /**
   * Lượng trang trí áp sẵn khi thêm ô này — id của `DECOR_LEVELS`.
   *
   * CHUỖI, không phải số nữa (09/2026). Bản ghi đời cũ trên workspace mang số và
   * được dịch ngay lúc ĐỌC (`decorLevelOf` trong `toBundle`): một con số lọt vào
   * thang mới không tra ra mục nào, và hậu quả là dòng element mất câu trang trí
   * mà không ai báo.
   */
  decor: string;
  /**
   * Id đục nền áp sẵn (`glaze.ts`). Hạt giống đời nay ghi `auto` — "để máy tự quyết
   * theo vật liệu", chứ không phải "nền đặc" (nấc đặc là `solid`).
   *
   * RỖNG VẪN ĐỌC ĐƯỢC và cố ý không vá tại chỗ: bản ghi đời cũ trên workspace giữ
   * `""`, và vá lúc đọc sẽ kéo theo một lượt ghi ngược (xem `payloadOf`). Chỗ vá là
   * `newCell` — nơi giá trị này thật sự biến thành lựa chọn của một ô.
   */
  glazeId: string;
  /**
   * Cỡ safe zone GHIM TAY (`cell-size.ts`); rỗng ⇒ cỡ đo từ `skel` của chính loại này.
   * Rỗng là giá trị BÌNH THƯỜNG từ 07/09/2026, không phải "chưa điền".
   */
  sizeId: string;
  /**
   * HÌNH DẠNG của loại element — thứ đi thẳng vào `component.skel` của contract.
   *
   * ╔══ VÌ SAO DANH MỤC PHẢI BIẾT HÌNH DẠNG, KHÔNG CHỈ BIẾT TÊN ═══════════════╗
   * ║ `shape` không phải trang trí: `gen.sh` in toạ độ safe zone ra prompt từ   ║
   * ║ nó (`geometry.safe_box`), `slice.py` nắn lõi về đúng hộp ấy               ║
   * ║ (`snap_to_safe`, chỉ với pill/bar/rrect/circle/puzzle) và ghi 9-slice từ  ║
   * ║ `slice9`. Không khai ⇒ mọi ô là `rrect` 0.8×0.6, tức là ta đòi một cái    ║
   * ║ hộp 4:3 cho cả thanh máu lẫn khung tròn — xem khối đo thật ở đầu           ║
   * ║ `cell-size.ts`.                                                          ║
   * ║                                                                          ║
   * ║ `w`/`h` là phân số của một ô VUÔNG (tấm Bộ UI luôn vuông), nên đọc thẳng  ║
   * ║ ra tỉ lệ hình: `0.86 × 0.22` LÀ một thanh 3,9:1.                          ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   *
   * Thiếu (element tự đặt tên, hoặc bản ghi đời trước) ⇒ `CUSTOM_ELEMENT_SKEL`.
   */
  skel?: Skel;
  /**
   * BỘ mà món này là một PHẦN — thiếu ⇒ MÓN LẺ, tức một bộ có đúng một phần
   * (xem `ElementSetRef` và `elementSets`).
   *
   * Hai phần cùng bộ phải KHỚP HÌNH HỌC với nhau, và đó là việc của hạt giống chứ
   * không phải của mã: khung và phần đầy của cùng một thanh phải cùng `shape`, và
   * phần đầy nhỏ hơn khung đúng một lề. Xem bảng đo ở `seedPresets()`.
   */
  set?: ElementSetRef;
}

export interface MascotPreset {
  id: string;
  vi: string;
  en: string;
  /** Tên tệp ảnh tham chiếu — CHỈ là ghi chú chữ. Xem khối ẢNH bên dưới. */
  refName: string;
}

/**
 * MỘT DÒNG của một danh mục pill chọn-một — nhãn Việt + câu Anh, và hết.
 *
 * ╔══ VÌ SAO MƯỜI TRỤC DÙNG CHUNG MỘT HÌNH DẠNG ═════════════════════════════╗
 * ║ Chủ đề · khung cảnh · bố cục · đục nền · trang trí · bố trí · dáng · góc  ║
 * ║ máy · biểu cảm · trang phục khác nhau ĐÚNG ở danh sách lựa chọn. Mỗi trục ║
 * ║ một kiểu bản ghi là mười đường đọc, mười đường ghi, mười chỗ để quên khi  ║
 * ║ thêm một cờ như `hidden`. Ở đây: một kiểu, một bảng tra theo `kind` —     ║
 * ║ cùng lý lẽ đã làm ra `optionPill` một node cho chín loại pill.            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export interface CatalogRow {
  /** Id ổn định — nằm trong `attrs.value` của pill ĐÃ LƯU. Không đổi được. */
  id: string;
  /** Nhãn tiếng Việt trên pill và trong menu. */
  vi: string;
  /** Cụm tiếng Anh đi vào prompt. */
  en: string;
  /** Dòng ghi chú phụ trong hộp chọn — KHÔNG đi vào prompt. */
  hint?: string;
  /** Câu tiếng Anh THỨ HAI — chỉ `theme`, xem `SeedRow.en2`. */
  en2?: string;
  /**
   * ẨN KHỎI MENU PILL, nhưng VẪN TRA ĐƯỢC.
   *
   * Đây là đường "xoá" của hai trục không xoá được (`pose`, `view`) và là đường
   * lùi an toàn cho mọi trục còn lại: một dòng bị XOÁ thật thì mọi tài liệu đang
   * trỏ vào nó hiện chữ trần và rụng khỏi prompt; một dòng bị ẩn thì biến khỏi
   * menu mà câu cũ vẫn đọc ra đúng chữ.
   */
  hidden?: boolean;
}

export interface PresetBundle {
  styles: StylePreset[];
  elements: ElementPreset[];
  mascots: MascotPreset[];
  /**
   * MƯỜI DANH MỤC CÒN LẠI, tra theo `kind` của pill.
   *
   * `styles`/`elements`/`mascots` KHÔNG bị kéo vào bảng này dù cũng là danh mục:
   * ba mảng ấy có hình dạng riêng (element mang hình học, mascot mang tên ảnh) và
   * có hàng chục chỗ đọc theo tên trường. Gộp chúng vào một map là một lượt sửa
   * xuyên tầng đổi lấy đúng một chút đối xứng trên giấy.
   */
  catalogs: Record<Exclude<CatalogKind, "style">, CatalogRow[]>;
}

/** Trục nào có thể quản lý ở màn «Thư viện prompt» — mười danh mục + hai kho cũ. */
export type ManagedKind = CatalogKind | "element";

/**
 * ẢNH TRONG PRESET — cố ý chỉ lưu TÊN, không lưu ảnh.
 *
 * Ảnh trong lab là `blob:` sống trong RAM một tab (xem `schema.ts`). Ngay cả khi
 * kho đã lên server, nhét ảnh vào preset là nhét nhị phân vào một file JSON
 * metadata — trong khi workspace ĐÃ CÓ chỗ đúng cho ảnh (`/api/library/items`,
 * có sniff định dạng, có giới hạn dung lượng, có route đọc file). Preset mascot
 * vì thế chỉ mang TÊN ảnh như một lời nhắc; ảnh thật vẫn chọn ở pill trong block.
 */

/**
 * BỐN NẤC TRANG TRÍ — thang của pill `decor`, dùng lại ở seed element.
 *
 * ⚠️ CHỈ CÒN LÀ MỘT LỐI TẮT ĐỌC HẠT GIỐNG (`CATALOG_SEEDS.decor`). Danh mục THẬT
 * mà pill đọc nằm trong kho (`PresetBundle.catalogs.decor`) và người dùng sửa được
 * ở màn «Thư viện prompt» — bảng này chỉ để mã nguồn tra bốn nấc gốc.
 *
 * ╔══ VÌ SAO BỐN NẤC CÓ TÊN THAY CHO THANG 1..7 ═════════════════════════════╗
 * ║ Thang cũ hỏi "viền dày bao nhiêu" và trả lời bằng bảy mức độ dày. Chủ sản ║
 * ║ phẩm nhìn tấm khung Tết vẽ ra rồi nói: *"lần nào nó cũng ra viền decor"*  ║
 * ║ — và cả bảy nấc đều đúng như thế, vì không nấc nào trong số đó CẤM được   ║
 * ║ hoa mai với đèn lồng bám quanh ô. Chúng chỉ nói về VIỀN; hoa văn treo vào ║
 * ║ ô thì đi theo theme, và theme Tết kéo chúng vào mọi ô.                    ║
 * ║ Nên trục này đổi câu hỏi: không phải "viền dày mỏng" mà LƯỢNG TRANG TRÍ — ║
 * ║ không · ít · vừa · nhiều — và mỗi nấc phải nói CẢ hai vế (viền lẫn hoa    ║
 * ║ văn), đủ mạnh để thắng theme. Nấc «Không» vì thế gọi tên thẳng thứ bị cấm ║
 * ║ ("no flowers, lanterns, ribbons, gems or trinkets"): một câu chung chung   ║
 * ║ kiểu "plain edge" đã được thử và thua theme.                              ║
 * ║ Bốn nấc chứ không bảy: người dùng không phân biệt được nấc 4 với nấc 5,   ║
 * ║ mà máy vẽ lại càng không.                                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VẪN CHỈ TẢ CẤU TRÚC, KHÔNG TẢ CÁCH ĐÁNH BÓNG ══════════════════════════╗
 * ║ Luật cũ giữ nguyên: cách hoàn thiện (vát khối, chuyển màu, đổ bóng) là    ║
 * ║ việc của PHONG CÁCH — đã nói một lần ở `## Art style` cho cả tấm. Nhắc    ║
 * ║ lại ở từng ô là hai giọng cùng chỉ huy một chuyện: chọn "flat vector" rồi ║
 * ║ kéo trang trí lên «Nhiều» là prompt tự mâu thuẫn ngay trong chính nó.     ║
 * ║ Không "bevel", không "gradient", không "shadow", không "glow" — cổng ở    ║
 * ║ `__tests__/prompt-composer.test.tsx` canh đúng những chữ ấy.              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export const DECOR_LEVELS: readonly { value: string; vi: string; en: string }[] =
  CATALOG_SEEDS.decor.map((row) => ({ value: row.id, vi: row.vi, en: row.en }));

/** Nấc «Không» — nấc DUY NHẤT làm pill «Bố trí» mất nghĩa. Xem `hasDecorPlacement`. */
export const DECOR_NONE = "none";

/** Nấc mặc định của một ô mới và của một bản ghi không đọc ra nấc nào. */
export const DECOR_DEFAULT = "medium";

/**
 * BỐN CÁCH BỐ TRÍ chỗ trang trí — thang của pill `decorPlace`.
 *
 * ⚠️ Cùng thân phận với `DECOR_LEVELS`: lối tắt đọc hạt giống, không phải danh mục.
 *
 * ╔══ VÌ SAO LƯỢNG VÀ CHỖ LÀ HAI TRỤC, KHÔNG PHẢI MỘT THANG ═════════════════╗
 * ║ Chủ sản phẩm hỏi hai câu tách bạch: *"lượng trang trí"* và *"bố trí trang ║
 * ║ trí… hiện tại đang hơi random"*. Nhồi chúng vào một thang thì bảng lựa    ║
 * ║ chọn là tích Descartes 4×4 = 16 nấc, và người dùng phải đi tìm "vừa +     ║
 * ║ lệch trái" trong một danh sách mười sáu dòng. Hai pill thì mỗi pill trả   ║
 * ║ lời đúng một câu, và pill thứ hai TẮT HẲN khi câu hỏi của nó vô nghĩa     ║
 * ║ (không trang trí thì không có gì để mà bố trí).                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Câu Anh nói ra CHỖ, không nói ra lượng: lượng đã là việc của `DECOR_LEVELS`, và
 * hai trục cùng nói về lượng là hai giọng chỉ huy một chuyện.
 */
export const DECOR_PLACES: readonly { value: string; vi: string; en: string }[] =
  CATALOG_SEEDS.decorPlace.map((row) => ({ value: row.id, vi: row.vi, en: row.en }));

/** Cách bố trí mặc định — đối xứng, thứ một bộ UI muốn ở gần như mọi ô. */
export const DECOR_PLACE_DEFAULT = "balanced";

/**
 * Số đời cũ / chuỗi lạ → một nấc CÓ THẬT của `DECOR_LEVELS`.
 *
 * ╔══ DI TRÚ ĐỌC-MỘT-CHIỀU, VÀ VÌ SAO NÓ KHÁC `glazeId` ═════════════════════╗
 * ║ Bản ghi preset và bản nháp lưu trước lượt này mang `decor` là SỐ ("4").   ║
 * ║ Với thang mới, "4" không tra ra mục nào ⇒ `phraseOf` trả rỗng ⇒ dòng      ║
 * ║ element mất hẳn câu trang trí, im lặng. Đó là lý do trục này PHẢI được vá ║
 * ║ ngay lúc đọc, khác với `glazeId` (rỗng ở đó vẫn đọc ra một nghĩa dùng      ║
 * ║ được, nên nó chờ tới `newCell` mới vá để khỏi kéo theo một lượt ghi).      ║
 * ║ Vá lúc đọc KHÔNG tự nó sinh ra request nào: `toBundle` chỉ đổi bản sao     ║
 * ║ trong RAM, còn `flush` chỉ chạy sau một `setPresets` — tức là sau khi có   ║
 * ║ người thật sự sửa danh mục. Xem chú thích của `payloadOf`.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Bảng số: 1→«Không», 2-3→«Ít», 4-5→«Vừa», 6-7→«Nhiều». Rỗng/rác ⇒ «Vừa» — mặc
 * định của một ô mới, chứ KHÔNG phải «Không»: một ô không nói gì về trang trí thì
 * xưa nay vẫn được vẽ có viền, và di trú không phải chỗ để đổi thứ người dùng thấy.
 */
export function decorLevelOf(raw: unknown): string {
  const value = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!value) return DECOR_DEFAULT;
  const n = Number(value);
  /* KHÔNG PHẢI SỐ ⇒ TRẢ NGUYÊN VĂN, kể cả khi nó không nằm trong bốn nấc gốc.
     Đổi 09/2026 cùng lượt danh mục trang trí thành sửa được: bản trước so với
     `DECOR_LEVELS` rồi rơi về «Vừa» khi không khớp — nghĩa là nấc thứ năm do
     người dùng tự thêm sẽ bị âm thầm đổi thành «Vừa» ngay lần đọc đầu tiên.
     Rác thật (một chuỗi không tra ra dòng nào) vẫn vô hại: `phraseOf` trả rỗng,
     đúng như mọi giá trị lạ khác của mọi trục pill. */
  if (!Number.isFinite(n)) return value;
  if (n <= 1) return DECOR_NONE;
  if (n <= 3) return "light";
  if (n <= 5) return DECOR_DEFAULT;
  return "rich";
}

/** Chuỗi lạ / thiếu → «Cân đối». Song sinh với `decorLevelOf`, cùng một lý do. */
export function decorPlaceOf(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  /* Cùng nới lỏng với `decorLevelOf`: một cách bố trí do người dùng thêm không
     được bị đổi ngược về «Cân đối» chỉ vì nó không có trong bốn nấc gốc. */
  return value || DECOR_PLACE_DEFAULT;
}

/**
 * Ô này có câu hỏi «bố trí ở đâu» không.
 *
 * MỘT hàm cho BỐN chỗ đọc (dòng khuôn trên màn, câu khởi điểm của chế độ tự do,
 * bộ serialize, bộ dịch contract). Viết `decor !== "none"` ở bốn nơi là bốn chỗ
 * để quên khi thang đổi — và chỗ quên sẽ in ra "không trang trí gì, hoa văn đối
 * xứng hai bên" trong cùng một câu.
 */
export function hasDecorPlacement(decor: string): boolean {
  return hasDecor(decor);
}

/**
 * Ô này CÓ viền/trang trí không — nấc «Không» là nấc duy nhất trả `false`.
 *
 * Cùng phép so với `hasDecorPlacement` nhưng KHÁC câu hỏi, nên có tên riêng: một
 * bên hỏi "có gì để mà bố trí không" (bật/tắt pill «Bố trí»), bên kia hỏi "ô này
 * có cần chừa lề rộng cho phần tràn không" (`skel.decor` của contract →
 * `geometry.cell_margin_ratio`). Hai câu hỏi tình cờ cùng đáp án hôm nay; gộp
 * chúng làm một là hẹn ngày đổi một câu thì câu kia im lặng đổi theo.
 */
export function hasDecor(decor: string): boolean {
  return decorLevelOf(decor) !== DECOR_NONE;
}

/**
 * Hạt giống của MƯỜI danh mục dòng-đơn — bản sao SÂU của `CATALOG_SEEDS`.
 *
 * Sao chép chứ không trả thẳng bảng hằng: `setPresets` nhận về một bundle mà người
 * dùng vừa sửa, và nếu bundle ấy còn dùng chung object với bảng hằng thì một lượt
 * sửa nhãn sẽ đổi luôn HẠT GIỐNG — nút «Khôi phục mặc định» khi ấy khôi phục về
 * đúng thứ vừa bị sửa.
 */
export function seedCatalogs(): PresetBundle["catalogs"] {
  const out = {} as PresetBundle["catalogs"];
  for (const kind of CATALOG_ORDER) out[kind] = CATALOG_SEEDS[kind].map((row) => ({ ...row }));
  return out;
}

/** Hạt giống — đọc từ danh mục THẬT của kit-core, không chép tay. */
export function seedPresets(): PresetBundle {
  /**
   * MƯỜI BẢY BỘ — id + nhãn viết ĐÚNG MỘT LẦN, các phần bên dưới trỏ vào.
   *
   * Khai TRONG hàm chứ không ở tầng module, cùng lý do với `seedCatalogs()` chép
   * sâu: `setPresets` nhận về một bundle người dùng vừa sửa, và nếu bundle ấy còn
   * dùng chung object với một hằng ở tầng module thì một lượt đổi tên bộ sẽ đổi
   * luôn HẠT GIỐNG — nút «Khôi phục mặc định» khi ấy khôi phục về thứ vừa bị sửa.
   */
  const SET = {
    btn: { id: "btn", vi: "Button" },
    hp: { id: "hp", vi: "Health bar" },
    xp: { id: "xp", vi: "Progress bar" },
    dialog: { id: "dialog", vi: "Dialog" },
    rank: { id: "rank", vi: "Leaderboard" },
    popup: { id: "popup", vi: "Popup" },
    tab: { id: "tab", vi: "Tabs" },
    toggle: { id: "toggle", vi: "Toggle" },
    check: { id: "check", vi: "Checkbox" },
    heart: { id: "heart", vi: "Hearts" },
    star: { id: "star", vi: "Stars" },
    coins: { id: "coins", vi: "Coin counter" },
    slot: { id: "slot", vi: "Inventory slot" },
    slider: { id: "slider", vi: "Slider" },
    arrow: { id: "arrow", vi: "Arrows" },
    envelope: { id: "envelope", vi: "Envelope" },
    gift: { id: "gift", vi: "Gift box" },
  } satisfies Record<string, ElementSetRef>;

  return {
    catalogs: seedCatalogs(),
    styles: GENRE_PRESETS.map((preset) => ({ id: preset.id, vi: preset.vi, en: preset.stylePrompt })),

    /* Danh mục element: repo CHƯA có danh mục tương đương để mượn (contract của
       kit-core mô tả từng ô bằng chữ tự do, không bằng loại). Nên đây là danh
       mục MỚI của lab — và chính vì nó là mới nên nó phải sửa được, không được
       đóng cứng. Đúng thứ trang preset sinh ra để trả lời. */
    /* `en` = DANH TỪ THUẦN, `skel` = HÌNH HỌC của chính món đó. Hình học là thứ
       DUY NHẤT còn được áp sẵn theo loại element, vì nó không phải thẩm mỹ: một
       thanh máu là hộp rộng-mỏng ở mọi phong cách, một khung avatar là hộp vuông
       ở mọi phong cách.

       ══ BẢNG HÌNH DẠNG → TỈ LỆ (đo trên ô tham chiếu 314×314) ══════════════
         button        pill   0.78×0.27 → 245×85   2,9:1  ← element-lib 01-btn-pill-red
         popover       rrect  0.86×0.66 → 270×207  1,3:1  hộp thoại nổi
         health bar    bar    0.86×0.22 → 270×69   3,9:1  ← lõi model tự vẽ đo được 370×97
         coin icon     circle 0.40×0.40 → 126×126  1:1    đồng xu
         avatar frame  circle 0.62×0.62 → 195×195  1:1    ← lõi đo được 303×263
         panel         rrect  0.92×0.80 → 289×251  1,15:1 to nhất, còn chừa biên cho dao cắt
         badge         circle 0.46×0.46 → 144×144  1:1
         progress bar  bar    0.86×0.18 → 270×57   4,8:1  ← element-lib 07-progress-track

       Hai cột phải nói cùng một thứ tiếng với `element-lib.json` của engine: ở đó
       pill/bar là rộng-mỏng, circle/burst/puzzle là vuông, popup là hộp to. Khác
       biệt duy nhất là MẪU SỐ — element-lib đo trên ô 3:2 của tấm landscape, còn
       tấm Bộ UI ở đây luôn vuông, nên cùng một tỉ lệ ra cặp phân số khác.

       `slice9` bật cho món CO GIÃN ĐƯỢC (nút, thanh, bảng, hộp thoại) và tắt cho
       món tròn — kéo một cái huy hiệu tròn theo 9-slice là méo nó. `sizeId` để
       RỖNG: ghim một nấc cỡ ở đây là đè lên chính hình dạng vừa khai. */
    /* ══ BỘ: MỘT LỰA CHỌN, NHIỀU Ô ═══════════════════════════════════════════
       Chủ sản phẩm: *«thanh máu phải tách ra từng phần nhỏ, chọn 1 được 2»*. Một
       thanh máu vẽ liền một khối thì lập trình game không dùng được: phần đầy phải
       co giãn được độc lập với khung. Nên nó là HAI ô — và hai ô ấy phải được vẽ
       trong cùng một lượt, cùng một phong cách, khớp nhau từng bo góc.

       ══ HAI LUẬT CỦA MỘT BỘ, VÀ CẢ HAI NẰM TRONG DỮ LIỆU DƯỚI ĐÂY ═══════════
       ① HÌNH HỌC KHỚP. Phần đầy cùng `shape` với khung và nhỏ hơn đúng một lề
          (0,86×0,22 ⇒ 0,81×0,15): cùng tỉ lệ thì hai ô ra hai hộp chồng khít nhau
          khi lập trình game xếp chúng lên nhau, còn lệch tỉ lệ thì không có cách
          nào cứu ở tầng dưới.
       ② CÂU EN TỰ NÓI RA MÌNH LÀ PHẦN NÀO. `gen.sh` in mỗi ô một dòng độc lập, và
          `chunkBySize` có quyền cắt một bộ sang hai tấm — nên "cái ở trên" không
          phải một chỗ dựa. Phần đầy vì thế mang nguyên văn quan hệ của nó ("the
          fill bar that sits inside the health bar, the same length and corner
          radius, with no track or frame of its own"), đúng lối mà
          `element-lib-v2.json` của engine đã dùng cho cặp track/fill.

       ⚠️ `en` VẪN LÀ DANH TỪ, KHÔNG PHẢI THẨM MỸ. "the same tab chip, selected"
       nói VỊ TRÍ TRONG BỘ và TRẠNG THÁI — không nói vật liệu, không nói màu, không
       nói cách đánh bóng. Luật ở khối chú thích của `ElementPreset.en` không bị nới
       một chữ nào cho bộ.

       ⚠️ NĂM MÓN CŨ ĐƯỢC GOM VÀO BỘ, KHÔNG BỊ NHÂN ĐÔI: `button`, `popover`,
       `healthbar`, `coin`, `progress` giữ nguyên id — chỉ đeo thêm nhãn bộ. Đẻ ra
       một bộ thứ hai bên cạnh món cũ là bắt người dùng đoán xem hai dòng cùng tên
       khác nhau chỗ nào.

       ══ NHÃN LÀ THUẬT NGỮ TIẾNG ANH, KHÔNG PHẢI BẢN DỊCH ═════════════════
       Chủ sản phẩm: *«hộp thoại → để chọn là Dialog giống như từ chuyên ngành,
       mấy cái khác cũng thế»*. Người ngồi dựng một bộ kit game gọi món của họ là
       Dialog · Health bar · Leaderboard — đó là chữ họ đọc trong tài liệu engine,
       trong tên component của chính dự án họ. Dịch sang «Hộp thoại» là bắt họ
       dịch ngược lại trong đầu ở mỗi cú bấm, và dịch ngược thì mỗi người ra một
       chữ khác nhau.
       Nên `vi` của một BỘ là thuật ngữ đầy đủ (Dialog, Health bar), còn `vi` của
       một PHẦN là thuật ngữ NGẮN của riêng phần ấy (box, fill, name plate) — tên
       bộ đã đứng ngay trước nó trên nhãn, xem `elementLabel`. Lặp lại tên bộ trong
       từng phần («Health bar · Health bar fill») là đọc hai lần một chữ.
       ⚠️ `vi` KHÔNG đi vào prompt — `en` mới đi. Đổi nhãn không đụng một chữ nào
       của câu gửi máy vẽ, và đó là lý do lượt đổi tên này không cần đo lại prompt. */
    elements: [
      /* ── Button ──────────────────────────────────────────────────────────── */
      { id: "button", vi: "primary", en: "button", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "pill", w: 0.78, h: 0.27, slice9: true }, set: SET.btn },
      { id: "btn-secondary", vi: "secondary", en: "the same button as a secondary action", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "pill", w: 0.78, h: 0.27, slice9: true }, set: SET.btn },
      { id: "btn-pressed", vi: "pressed", en: "the same button, pressed", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "pill", w: 0.78, h: 0.27, slice9: true }, set: SET.btn },
      { id: "btn-disabled", vi: "disabled", en: "the same button, disabled", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "pill", w: 0.78, h: 0.27, slice9: true }, set: SET.btn },

      /* ── Health bar — khung 0,86×0,22, phần đầy 0,81×0,15 (nhỏ hơn đúng một lề) ── */
      { id: "healthbar", vi: "frame", en: "health bar", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "bar", w: 0.86, h: 0.22, slice9: true }, set: SET.hp },
      /* Phần đầy để «Không trang trí»: một dải màu chạy bên trong khung mà lại mọc
         viền và hoa văn của riêng nó thì xếp lên nhau là hai lớp viền chồng nhau. */
      { id: "hp-fill", vi: "fill", en: "the fill bar that sits inside the health bar, the same length and corner radius, with no track or frame of its own", decor: "none", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "bar", w: 0.81, h: 0.15, slice9: true }, set: SET.hp },

      /* ── Progress bar — cùng luật với Health bar, mảnh hơn ─────────────── */
      { id: "progress", vi: "frame", en: "progress bar", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "bar", w: 0.86, h: 0.18, slice9: true }, set: SET.xp },
      { id: "progress-fill", vi: "fill", en: "the fill bar that sits inside the progress bar, the same length and corner radius, with no track or frame of its own", decor: "none", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "bar", w: 0.81, h: 0.12, slice9: true }, set: SET.xp },

      /* ── Dialog ───────────────────────────────────────────────────────── */
      { id: "dialog-panel", vi: "box", en: "a dialogue box", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.92, h: 0.56, slice9: true }, set: SET.dialog },
      { id: "dialog-name", vi: "name plate", en: "the name plate that sits on the same dialogue box", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.5, h: 0.16, slice9: true }, set: SET.dialog },
      { id: "dialog-next", vi: "next button", en: "the continue marker of the same dialogue box", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "circle", w: 0.3, h: 0.3 }, set: SET.dialog },

      /* ── Leaderboard ────────────────────────────────────────────────────────── */
      { id: "rank-1", vi: "rank 1 badge", en: "a first-place rank medal", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "circle", w: 0.5, h: 0.5 }, set: SET.rank },
      { id: "rank-2", vi: "rank 2 badge", en: "the same rank medal, second place", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "circle", w: 0.5, h: 0.5 }, set: SET.rank },
      { id: "rank-3", vi: "rank 3 badge", en: "the same rank medal, third place", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "circle", w: 0.5, h: 0.5 }, set: SET.rank },
      { id: "rank-row", vi: "row", en: "a leaderboard row with an avatar slot at the left", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "bar", w: 0.9, h: 0.22, slice9: true }, set: SET.rank },
      { id: "rank-row-self", vi: "my row", en: "the same leaderboard row, highlighted as the current player", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "bar", w: 0.9, h: 0.22, slice9: true }, set: SET.rank },

      /* ── Popup ───────────────────────────────────────────────────────────── */
      { id: "popover", vi: "panel", en: "popover", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.86, h: 0.66, slice9: true }, set: SET.popup },
      { id: "popup-ribbon", vi: "ribbon", en: "the heading banner that sits across the top of the same popover", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.78, h: 0.2, slice9: true }, set: SET.popup },
      { id: "popup-close", vi: "close button", en: "the round close button of the same popover, with a cross mark", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "circle", w: 0.32, h: 0.32 }, set: SET.popup },

      /* ── Tabs ─────────────────────────────────────────────────────────────── */
      { id: "tab-idle", vi: "idle", en: "a tab chip, unselected", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.6, h: 0.26, slice9: true }, set: SET.tab },
      { id: "tab-active", vi: "active", en: "the same tab chip, selected", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.6, h: 0.26, slice9: true }, set: SET.tab },

      /* ── Toggle ────────────────────────────────────────────────────────── */
      { id: "toggle-on", vi: "on", en: "a toggle switch, on, knob at the right", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "pill", w: 0.5, h: 0.28 }, set: SET.toggle },
      { id: "toggle-off", vi: "off", en: "the same toggle switch, off, knob at the left", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "pill", w: 0.5, h: 0.28 }, set: SET.toggle },

      /* ── Checkbox ──────────────────────────────────────────────────────────── */
      { id: "check-on", vi: "on", en: "a checkbox, checked", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.34, h: 0.34 }, set: SET.check },
      { id: "check-off", vi: "off", en: "the same checkbox, unchecked", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.34, h: 0.34 }, set: SET.check },

      /* ── Hearts ─────────────────────────────────────────────────────────────── */
      { id: "heart-full", vi: "full", en: "a life heart, full", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.4, h: 0.38 }, set: SET.heart },
      { id: "heart-empty", vi: "empty", en: "the same life heart, empty", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.4, h: 0.38 }, set: SET.heart },

      /* ── Stars ─────────────────────────────────────────────────────────────── */
      { id: "star-full", vi: "full", en: "a rating star, earned", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.42, h: 0.4 }, set: SET.star },
      { id: "star-empty", vi: "empty", en: "the same rating star, not earned", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.42, h: 0.4 }, set: SET.star },

      /* ── Coin counter: ô đếm + đồng xu nằm trong ô đếm ấy ────────────────────── */
      { id: "coin", vi: "coin", en: "coin icon", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "circle", w: 0.4, h: 0.4 }, set: SET.coins },
      { id: "coin-counter", vi: "counter", en: "a counter chip with a slot at one end for the coin icon", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "pill", w: 0.72, h: 0.26, slice9: true }, set: SET.coins },

      /* ── Inventory slot ────────────────────────────────────────────────────────── */
      { id: "slot-empty", vi: "empty", en: "an empty inventory slot", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.5, h: 0.5, slice9: true }, set: SET.slot },
      { id: "slot-filled", vi: "filled", en: "the same inventory slot holding an item", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.5, h: 0.5, slice9: true }, set: SET.slot },
      { id: "slot-active", vi: "active", en: "the same inventory slot, selected", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.5, h: 0.5, slice9: true }, set: SET.slot },

      /* ── Slider ─────────────────────────────────────────────────────── */
      { id: "slider-track", vi: "track", en: "the track of a slider", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "bar", w: 0.86, h: 0.12, slice9: true }, set: SET.slider },
      { id: "slider-knob", vi: "knob", en: "the knob that rides on the same slider track", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "circle", w: 0.26, h: 0.26 }, set: SET.slider },

      /* ── Arrows ─────────────────────────────────────────────────────────── */
      { id: "arrow-left", vi: "left", en: "a round button with a left arrow", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "circle", w: 0.34, h: 0.34 }, set: SET.arrow },
      { id: "arrow-right", vi: "right", en: "the same round button with a right arrow", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "circle", w: 0.34, h: 0.34 }, set: SET.arrow },

      /* ── Envelope: nắp rời, CÙNG BỀ NGANG với thân để dán lại thành một cái ── */
      { id: "envelope-body", vi: "body", en: "the body of a lucky-money envelope, without its top flap", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.56, h: 0.66 }, set: SET.envelope },
      { id: "envelope-flap", vi: "flap", en: "only the detached top flap of the same envelope, the same width as its body", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.56, h: 0.28 }, set: SET.envelope },

      /* ── Gift box ─────────────────────────────────────────────────────────── */
      { id: "gift-closed", vi: "closed", en: "a closed gift box", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.56, h: 0.56 }, set: SET.gift },
      { id: "gift-open", vi: "open", en: "the same gift box, open", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.56, h: 0.56 }, set: SET.gift },

      /* ── MÓN LẺ — không phần nào đi kèm, chọn một là được một ─────────────── */
      { id: "avatar-frame", vi: "Avatar frame", en: "avatar frame", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "circle", w: 0.62, h: 0.62 } },
      { id: "panel", vi: "Panel", en: "panel", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.92, h: 0.8, slice9: true } },
      { id: "badge", vi: "Badge", en: "badge", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "circle", w: 0.46, h: 0.46 } },
      { id: "lock", vi: "Lock", en: "padlock", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.42, h: 0.5 } },
      { id: "timer", vi: "Timer", en: "countdown timer plate", decor: "light", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.52, h: 0.3, slice9: true } },
      /* `free`: một cái cúp có quai và đế, không nắn về hộp chữ nhật được — cùng cờ
         mà `element-lib-v2.json` gắn cho `54-trophy-cup`. */
      { id: "trophy", vi: "Trophy", en: "trophy cup", decor: "medium", glazeId: GLAZE_AUTO, sizeId: "", skel: { shape: "rrect", w: 0.5, h: 0.66, free: true } },
    ],

    /* Mascot: ghép dáng + biểu cảm có sẵn thành vài "nhân vật mẫu" để trang
       preset không mở ra trống trơn. Chữ `en` là mô tả nhân vật, không phải dáng
       — dáng đã có pill riêng trong block. */
    mascots: [
      {
        id: "mascot-default",
        vi: "Linh vật chính",
        en: `a friendly rounded mascot character, ${EXPRESSIONS[0]?.value ?? "a big bright smile"}`,
        refName: "",
      },
      {
        id: "mascot-sidekick",
        vi: "Nhân vật phụ",
        en: `a small sidekick creature standing in an ${POSES[0]?.id ?? "idle"} pose`,
        refName: "",
      },
    ],
  };
}


/* ══════════════════════════════════════════════════════════════════════════
   GOM MÓN THÀNH BỘ — một phép đọc THUẦN, không phải một kho thứ hai
   ══════════════════════════════════════════════════════════════════════════ */

/** Một BỘ đã gom xong: nhãn của bộ + các phần, ĐÚNG thứ tự chúng nằm trong kho. */
export interface ElementSetView {
  id: string;
  /** Nhãn tiếng Việt của bộ — lấy từ PHẦN ĐẦU TIÊN, xem `ElementSetRef.vi`. */
  vi: string;
  parts: ElementPreset[];
}

/**
 * MỌI THỨ CHỌN ĐƯỢC Ở HỘP «+ Element» — và tất cả đều là BỘ, kể cả bộ một phần.
 *
 * ╔══ VÌ SAO KHÔNG CÒN PHÂN ĐÔI «Bộ | Lẻ» ═══════════════════════════════════╗
 * ║ Chủ sản phẩm: *«lúc pick thì select theo SET, chứ không select lẻ»*. Bản ║
 * ║ trước bày hai nhóm, và cùng một cái tên hiện ra ở cả hai hình dạng: một  ║
 * ║ dòng «Thanh máu» (bộ, ra hai ô) và một dòng «Thanh máu» (phần, ra một    ║
 * ║ ô). Muốn bấm đúng thì phải hiểu sự khác nhau ấy TRƯỚC cú bấm đầu tiên —  ║
 * ║ mà nó chỉ hiện ra SAU, lúc đếm số dòng vừa mọc thêm.                     ║
 * ║ Nên: một danh sách, một kiểu dòng, một luật — bấm một dòng là lấy ĐỦ     ║
 * ║ các phần của nó. Món không đeo nhãn bộ chỉ là một bộ có đúng một phần;   ║
 * ║ nó không cần một nhóm riêng, vì nó không hành xử khác.                   ║
 * ║ Từ 09/2026 luật ấy phủ CẢ pill tên trên một dòng đã có («Đổi loại món»): ║
 * ║ hộp ấy từng bày danh mục phẳng, nay bày đúng danh sách này (chủ sản      ║
 * ║ phẩm: *«select cả cụm chứ»*) — xem `ElementCatalogue`. Ai cần đúng MỘT   ║
 * ║ phần thì chọn cả bộ rồi xoá dòng thừa: một cú bấm trên thứ đã hiện ra    ║
 * ║ trước mắt, thay vì một cú bấm đúng trong một danh sách 48 dòng.          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Không còn ngưỡng "đủ mấy phần mới là bộ": người dùng xoá phần cho tới khi còn
 * một thì dòng ấy vẫn là dòng của chính bộ ấy, chỉ ghi «1 phần». Nhãn bộ nằm
 * nguyên trên bản ghi, nên phần thứ hai quay lại lúc nào cũng được.
 */
/**
 * BỘ MÀ MỘT MÓN THUỘC VỀ, dưới dạng một khoá so sánh được.
 *
 * KHOÁ GOM KHÁC ID BỘ, có chủ ý: một món tự đặt tên lấy id từ `slugify`, và
 * `slugify("Health bar")` ra đúng chuỗi mà một nhãn bộ có thể đang mang. Gom chung
 * theo id trần là ghép một món không liên quan vào bộ ấy. Hai tiền tố tách hẳn hai
 * không gian tên; `id` bày ra ngoài vẫn là id thật.
 *
 * Món KHÔNG tra ra trong danh mục (id lạ trong một bản nháp cũ) ra chuỗi RỖNG —
 * khác mọi khoá thật, nên nó không bao giờ bị coi là "đã thuộc bộ đang chọn".
 */
export function elementSetKey(element: ElementPreset | undefined): string {
  if (!element) return "";
  return element.set?.id ? `set:${element.set.id}` : `one:${element.id}`;
}

/**
 * CHỮ NGƯỜI DÙNG ĐỌC TRÊN MỘT DÒNG: «Dialog · box», «Health bar · fill», «Panel».
 *
 * ╔══ VÌ SAO NHÃN PHẢI ĐƯỢC GHÉP, KHÔNG PHẢI ĐƯỢC LƯU ══════════════════════╗
 * ║ Vì tên bộ sửa được, ở màn «Thư viện prompt», và một lượt sửa ấy ghi lên   ║
 * ║ MỌI phần cùng lúc (`renameSet`). Nếu mỗi phần còn lưu thêm một bản chép   ║
 * ║ của tên bộ trong `vi` của chính nó thì lượt đổi tên phải sửa hai chỗ trên ║
 * ║ mỗi bản ghi, và chỗ nào quên thì dòng ấy mang tên bộ cũ mãi mãi.          ║
 * ║ Ghép lúc hiển thị: một nguồn, không có gì để trôi khỏi nhau.              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * BỘ MỘT PHẦN CHỈ HIỆN MỘT TÊN. Món lẻ không có `set`, nên nhãn của nó là `vi` của
 * chính nó. Và bản ghi đời cũ có thể mang `set.vi` TRÙNG `vi` (nhãn bộ được vá vào
 * lúc đọc, xem `SEED_SET`) — lặp lại nguyên một chuỗi ngay sau chính nó thì không
 * nói thêm được gì, nên ca ấy cũng rút về một tên.
 *
 * `fallback` là chữ hiện khi id không còn tra ra món nào (danh mục bị xoá dòng, bản
 * nháp cũ): chỗ gọi đưa vào `cell.elementId` — một id trần vẫn hơn một ô trống.
 */
export function elementLabel(element: ElementPreset | undefined, fallback: string): string {
  if (!element) return fallback;
  const set = (element.set?.vi ?? "").trim();
  if (!set || set === element.vi) return element.vi || fallback;
  return `${set} · ${element.vi}`;
}

export function elementSets(bundle: PresetBundle = getPresets()): ElementSetView[] {
  const order: string[] = [];
  const byKey = new Map<string, ElementSetView>();
  for (const element of bundle.elements) {
    const setId = element.set?.id ?? "";
    const key = elementSetKey(element);
    let view = byKey.get(key);
    if (!view) {
      /* PHẦN ĐẦU THẮNG: hai phần cùng bộ mà mang hai chữ khác nhau là dữ liệu đã
         lệch (sửa tay trên đĩa, hoặc một lượt ghi hụt) — chọn một cách dứt khoát
         còn hơn để nhãn bộ nhảy theo thứ tự lọc. */
      view = setId
        ? { id: setId, vi: element.set?.vi || setId, parts: [] }
        : { id: element.id, vi: element.vi, parts: [] };
      byKey.set(key, view);
      order.push(key);
    }
    view.parts.push(element);
  }
  return order.map((key) => byKey.get(key)!);
}

/* ══ DỊCH GIỮA HAI HÌNH DẠNG ════════════════════════════════════════════════
   Server: `{id, kind, name, data}` — `data` là JSON tự do, agent không hiểu.
   Lab: ba mảng có kiểu chặt. Chỗ dịch nằm gọn ở đây, và CHỈ ở đây. */

/**
 * `kind` của một bản ghi trên server. Mười trục mới dùng CHÍNH `kind` của pill
 * làm `kind` bản ghi — một tên cho một thứ, không có bảng dịch ở giữa.
 * Agent phải biết đủ chừng này tên: xem `PRESET_KINDS` ở `agent/lib/library.mjs`.
 */
type PresetKind = ManagedKind | "mascot";

/** `kind` này lưu ở `catalogs`, không phải ở `styles`/`elements`/`mascots`. */
function isCatalogKind(kind: string): kind is Exclude<CatalogKind, "style"> {
  return (CATALOG_ORDER as readonly string[]).includes(kind);
}

interface PresetPayload {
  kind: PresetKind;
  name: string;
  data: Record<string, unknown>;
}

/** Bất kỳ dòng nào trong ba mảng: ba kiểu chỉ khác nhau ở phần ĐUÔI, nên dạng
    chung là "phần chung bắt buộc + phần đuôi tuỳ chọn". Cả ba interface public
    ở trên đều gán được vào đây, và `payloadOf` chỉ đọc đuôi đúng theo `kind`. */
type AnyPreset = StylePreset
  & Partial<Omit<ElementPreset, keyof StylePreset>>
  & Partial<Omit<MascotPreset, keyof StylePreset>>
  & Partial<Omit<CatalogRow, keyof StylePreset>>;

/** `name` của server là nhãn tiếng Việt; phần còn lại nằm trong `data`. */
function payloadOf(kind: PresetKind, preset: AnyPreset): PresetPayload {
  /* `key` là id bundle — lý do #2 ở đầu file. Nó phải nằm TRONG `data` vì `id`
     của bản ghi thuộc về server (agent tự sinh, client không được chọn). */
  const base: Record<string, unknown> = { key: preset.id, en: preset.en };
  /**
   * NHÃN RỖNG RƠI VỀ ID, và đó là một hàng rào chứ không phải một phép làm đẹp.
   *
   * Agent từ chối `name` rỗng bằng 400 (`suite-library`: «tên rỗng ⇒ 400»). Màn
   * quản lý thì ghi theo TỪNG PHÍM — nên khoảnh khắc người dùng bôi đen nhãn cũ và
   * bấm xoá để gõ lại, kho có một dòng nhãn rỗng và lượt ghi kế tiếp nổ, kèm một
   * dải cảnh báo đỏ cho một thao tác hoàn toàn bình thường. Rơi về id thì lượt ghi
   * ấy đi qua, và ký tự đầu tiên họ gõ tiếp sẽ ghi đè lên nó.
   */
  const name = (preset.vi ?? "").trim() || preset.id;
  if (kind === "element") {
    return {
      kind,
      name,
      /* `materialId` KHÔNG còn được ghi: trường ấy đã chết cùng pill Chất liệu.
         Bản ghi cũ trên workspace vẫn còn nó cho tới lượt PATCH đầu tiên — và
         `toBundle` dịch nó sang `glazeId` khi đọc, nên không có khoảng nào mà
         người dùng mất lựa chọn. */
      /* `skel` ghi ra NGUYÊN OBJECT: nó là hình học của loại element, và bỏ nó lại
         ở client nghĩa là mở app trên máy thứ hai thì mọi element về `rrect` 0.8×0.6
         — đúng cái bệnh vừa chữa, nhưng lần này chỉ hiện ở máy khác. */
      data: {
        ...base,
        /* GHI RA ID CHỮ. Bản ghi đời cũ mang số; nó đã được `toBundle` dịch lúc đọc,
           nên tới đây không còn số nào — và lượt PATCH đầu tiên (chỉ xảy ra khi có
           người thật sự sửa danh mục) đóng đinh id chữ xuống đĩa. */
        decor: decorLevelOf(preset.decor),
        /* GHI ĐÚNG THỨ ĐÃ ĐỌC LÊN, không chuẩn hoá `""` → `auto` ở đây. Chuẩn hoá
           lúc ghi nghĩa là mở app lên là mọi bản ghi element đời cũ bị PATCH lại
           một lượt — một lượt ghi mà không ai bấm, chỉ vì ta đổi cách gọi tên nấc
           mặc định. Rỗng được vá ở chỗ NÓ ĐƯỢC DÙNG (`newCell`), xem `glazeOrAuto`. */
        glazeId: preset.glazeId ?? "",
        sizeId: preset.sizeId ?? "",
        ...(preset.skel ? { skel: preset.skel } : {}),
        /**
         * NHÃN BỘ — ghi ra khi có; khi KHÔNG có thì tuỳ món.
         *
         * Món thường: vắng khoá luôn, vì `flush` so hai `data` bằng JSON và một
         * khoá rỗng thừa là một PATCH cho bản ghi không đổi gì, nhân với 48 dòng.
         * NĂM MÓN HẠT GIỐNG ĐƯỢC GOM VÀO BỘ thì khác: `toBundle` vá nhãn bộ cho
         * chúng theo id (`SEED_SET`), nên với chúng "vắng khoá" đã có sẵn một
         * nghĩa — «bản ghi đời cũ, hãy vá». Nếu «đã gỡ khỏi bộ» cũng vắng khoá
         * thì lượt đọc kế tiếp kéo món ấy trở lại bộ, im lặng. Nên riêng năm món
         * ấy ghi hẳn `set: null` để nói ra «có người đã quyết, và quyết là không».
         */
        ...(preset.set
          ? { set: { id: preset.set.id, vi: preset.set.vi } }
          : SEED_SET[preset.id] ? { set: null } : {}),
      },
    };
  }
  if (kind === "mascot") return { kind, name, data: { ...base, refName: preset.refName ?? "" } };
  /* Ba trường phụ CHỈ ghi khi có giá trị — không ghi `hint: ""`, `hidden: false`.
     Lý do là `flush` so hai `data` bằng JSON: một khoá rỗng thừa ở bên này mà bên
     kia không có là một PATCH cho một bản ghi không đổi gì, nhân với 60 dòng. */
  if (isCatalogKind(kind)) {
    return {
      kind,
      name,
      data: {
        ...base,
        ...(preset.hint ? { hint: preset.hint } : {}),
        ...(preset.en2 ? { en2: preset.en2 } : {}),
        ...(preset.hidden ? { hidden: true } : {}),
      },
    };
  }
  return { kind, name, data: base };
}

/** Đọc PHÒNG THỦ: `data` do đời code trước ghi và do người dùng sửa được. */
function str(data: Record<string, unknown>, field: string, fallback = ""): string {
  const value = data[field];
  return typeof value === "string" ? value : fallback;
}

/**
 * DI TRÚ CHỮ: mô tả có thuộc tính (đời trước) → DANH TỪ THUẦN.
 *
 * ╔══ VÌ SAO PHẢI CÓ BẢNG NÀY, DÙ HẠT GIỐNG ĐÃ ĐỔI ═════════════════════════╗
 * ║ Hạt giống chỉ gieo MỘT LẦN, vào một kho rỗng. Mọi workspace đã mở app     ║
 * ║ trước hôm nay đang giữ tám bản ghi với `en` là câu mô tả cũ — và           ║
 * ║ `seedOnce` cố ý KHÔNG ghi đè chúng (bản trên server có thể đã được người   ║
 * ║ dùng sửa). Không có bảng này thì chủ sản phẩm mở lại đúng máy đang test    ║
 * ║ vẫn thấy "a floating popover panel with a title bar" — đúng câu vừa bị      ║
 * ║ than, sau một lượt sửa mà anh ấy được báo là đã xong.                     ║
 * ║                                                                          ║
 * ║ Bảng khớp NGUYÊN VĂN, không đoán bằng regex: chỉ tám chuỗi do CHÍNH ta    ║
 * ║ ghi ra mới bị đổi. Người dùng tự sửa một chữ trong đó ⇒ không khớp ⇒ chữ   ║
 * ║ của họ được giữ nguyên, luôn luôn.                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
const LEGACY_ELEMENT_EN: Record<string, string> = {
  "a primary action button with a centered label": "button",
  "a floating popover panel with a title bar": "popover",
  "a horizontal health bar with a filled track": "health bar",
  "a coin currency icon seen from a slight angle": "coin icon",
  "a circular avatar frame with a rim": "avatar frame",
  "a rounded background panel for a dialog": "panel",
  "a small badge with a number counter": "badge",
  "a segmented progress bar with a knob": "progress bar",
};

/** Hình dạng hạt giống, tra theo id — nguồn của cả `seedPresets()` lẫn bảng di trú
 *  ngay dưới, để hai chỗ không thể nói khác nhau. */
const SEED_ELEMENTS: readonly ElementPreset[] = seedPresets().elements;

const SEED_SKEL: Record<string, Skel | undefined> = Object.fromEntries(
  SEED_ELEMENTS.map((element) => [element.id, element.skel]),
);

/**
 * Nhãn bộ hạt giống, tra theo id — nguồn của phép vá ở `toBundle`.
 *
 * CHỈ chứa món hạt giống THUỘC một bộ; món lẻ không có mặt, nên `SEED_SET[id]`
 * vừa là "món này thuộc bộ nào" vừa là câu hỏi "đây có phải món hạt giống có bộ
 * không" mà `payloadOf` cần.
 */
const SEED_SET: Record<string, ElementSetRef | undefined> = Object.fromEntries(
  SEED_ELEMENTS.filter((element) => element.set).map((element) => [element.id, element.set]),
);

/**
 * Bản ghi trên đĩa → `ElementSetRef`, hoặc `undefined`.
 *
 * `null` (đã gỡ khỏi bộ, xem `payloadOf`) và mọi thứ rác khác đều ra `undefined`
 * — cùng một nghĩa cuối cùng là «món lẻ», khác nhau chỉ ở chỗ `payloadOf` có phải
 * nói ra hay không.
 */
function readSet(value: unknown): ElementSetRef | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const id = typeof raw["id"] === "string" ? raw["id"].trim() : "";
  if (!id) return undefined;
  const vi = typeof raw["vi"] === "string" ? raw["vi"].trim() : "";
  return { id, vi: vi || id };
}

/**
 * DI TRÚ CỠ GHIM: bốn nấc S/M/L/XL của hạt giống ĐỜI TRƯỚC → rỗng (đo theo hình).
 *
 * Trước 07/09/2026 hạt giống ghim sẵn một nấc cỡ cho từng loại — đó là cách duy
 * nhất lúc ấy để một bảng nền to hơn một huy hiệu, khi mà danh mục chưa biết hình
 * dạng. Nay hình dạng đã có, và một nấc ghim sẽ ĐÈ LÊN chính nó: `defaultSizeOf`
 * ưu tiên `sizeId`, nên một cái nút vẫn ra hộp 192×136 (1,4:1) thay vì 245×85 (2,9:1).
 *
 * Khớp NGUYÊN VĂN cặp (id hạt giống, nấc hạt giống) — cùng kỷ luật với
 * `LEGACY_ELEMENT_EN`. Ai đã tự đổi nút sang «L» thì cặp không khớp và nấc của họ
 * ở nguyên đó.
 */
const LEGACY_ELEMENT_SIZE: Record<string, string> = {
  button: "m", popover: "xl", healthbar: "l", coin: "s",
  "avatar-frame": "m", panel: "xl", badge: "s", progress: "l",
};

/**
 * `data.skel` trên đĩa → `Skel`, hoặc `undefined`.
 *
 * Đọc qua `skelSchema` (schema THẬT của contract) chứ không tự kiểm tay: `shape`
 * là một enum đóng và `w`/`h` có luật V-06 ∈ (0,1]. Một `skel` rác lọt vào đây sẽ
 * đi thẳng ra `contract.json` rồi làm `gen.sh` in một hộp âm.
 */
function readSkel(value: unknown): Skel | undefined {
  const parsed = skelSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function toBundle(rows: readonly LibraryPreset[]): PresetBundle {
  const empty = {} as PresetBundle["catalogs"];
  for (const kind of CATALOG_ORDER) empty[kind] = [];
  const bundle: PresetBundle = { styles: [], elements: [], mascots: [], catalogs: empty };
  for (const row of rows) {
    const data = row.data ?? {};
    /* Thiếu `key` ⇒ dùng id server. Xảy ra khi bản ghi được tạo bởi một client
       khác (hoặc bằng tay) — thà một id xấu còn hơn nuốt mất bản ghi. */
    const id = str(data, "key") || row.id;
    const en = str(data, "en");
    if (row.kind === "style") bundle.styles.push({ id, vi: row.name, en });
    else if (row.kind === "element") {
      /* SỐ ĐỜI CŨ → ID CHỮ, ngay tại cửa đọc. Xem khối chú thích của `decorLevelOf`
         để biết vì sao trục này được vá lúc đọc còn `glazeId` thì không. */
      const decor = decorLevelOf(data["decor"]);
      /* Bản ghi đời trước chỉ có `materialId` ⇒ dịch sang đục nền gần nhất.
         Bản ghi đời nay có `glazeId` ⇒ nó thắng, nên phải hỏi `"glazeId" in data`
         chứ không phải `str(...) || fallback` — nếu không thì bỏ đục nền là nó tự
         quay lại theo `materialId` còn sót.
         RỖNG ĐI QUA NGUYÊN VẸN, cố ý: bản ghi preset là dữ liệu trên workspace, và
         `toBundle` là cửa ĐỌC — vá ở đây thì `payloadOf` sẽ ghi giá trị đã vá trở
         lại server, tức một lượt PATCH mọi bản ghi mà không ai bấm gì. Rỗng được vá
         ở chỗ nó ĐƯỢC DÙNG: `newCell` gọi `glazeOrAuto`. */
      const glazeId = "glazeId" in data ? str(data, "glazeId") : glazeFromMaterial(str(data, "materialId"));
      /**
       * DI TRÚ HÌNH DẠNG — cùng lý do (và cùng cách) với `LEGACY_ELEMENT_EN`.
       *
       * `skel` là khoá MỚI: mọi workspace đã mở app trước 07/09/2026 đang giữ tám
       * bản ghi element KHÔNG có nó, và `seedOnce` cố ý không ghi đè bản ghi cũ.
       * Không vá ở đây thì chủ sản phẩm mở lại đúng máy đang test vẫn thấy mọi ô ra
       * `rrect` 0.8×0.6 — đúng cái vừa được báo là đã sửa.
       *
       * Vá theo ID HẠT GIỐNG, không theo tên: tám id ấy do CHÍNH ta sinh ra. Element
       * người dùng tự thêm (`tu-dat-…`) không có trong bảng ⇒ giữ nguyên `undefined`,
       * và `CUSTOM_ELEMENT_SKEL` lo phần còn lại. Bản ghi ĐÃ CÓ `skel` thì nó thắng,
       * kể cả khi người dùng sửa tay trên đĩa.
       */
      const skel = readSkel(data["skel"]) ?? SEED_SKEL[id];
      /**
       * DI TRÚ NHÃN BỘ — cùng cách, cùng kỷ luật với `SEED_SKEL` ngay trên.
       *
       * `set` là khoá MỚI: mọi workspace mở app trước lượt này giữ tám bản ghi
       * element không có nó, và `seedOnce` cố ý không ghi đè bản ghi cũ. Không vá
       * ở đây thì năm món được gom vào bộ (`button`, `popover`, `healthbar`,
       * `coin`, `progress`) sẽ nằm ngoài bộ của chính chúng trên đúng cái máy đã
       * dùng app từ trước — còn phần thứ hai của bộ thì vừa được gieo vào.
       * Tra theo ID HẠT GIỐNG: món người dùng tự thêm (`tu-dat-…`) không có trong
       * bảng ⇒ vẫn là món lẻ. Bản ghi ĐÃ CÓ `set` thì nó thắng, kể cả khi người
       * dùng đã tự gỡ món ấy ra khỏi bộ… trừ đúng một ca không phân biệt được:
       * gỡ khỏi bộ ghi ra một bản ghi KHÔNG có khoá `set`, y hệt bản ghi đời cũ.
       * Nên «gỡ khỏi bộ» ở màn quản lý ghi `set` rỗng chứ không xoá khoá — xem
       * `readSet`.
       */
      const set = readSet(data["set"]) ?? ("set" in data ? undefined : SEED_SET[id]);
      const savedSize = str(data, "sizeId");
      bundle.elements.push({
        id, vi: row.name,
        en: LEGACY_ELEMENT_EN[en] ?? en,
        decor,
        glazeId,
        sizeId: savedSize === LEGACY_ELEMENT_SIZE[id] ? "" : savedSize,
        ...(skel ? { skel } : {}),
        ...(set ? { set } : {}),
      });
    } else if (row.kind === "mascot") bundle.mascots.push({ id, vi: row.name, en, refName: str(data, "refName") });
    else if (isCatalogKind(row.kind)) {
      bundle.catalogs[row.kind].push({
        id, vi: row.name, en,
        ...(str(data, "hint") ? { hint: str(data, "hint") } : {}),
        ...(str(data, "en2") ? { en2: str(data, "en2") } : {}),
        ...(data["hidden"] === true ? { hidden: true } : {}),
      });
    }
    /* `material` là `kind` agent chấp nhận nhưng lab KHÔNG dùng (pill chất liệu đã
       chết). Bỏ qua chứ không ném: một bản web cũ không được làm hỏng dữ liệu bản mới. */
  }
  /**
   * TRỤC CHƯA CÓ MỘT DÒNG NÀO TRÊN SERVER ⇒ HẠT GIỐNG, không phải rỗng.
   *
   * ╔══ ĐÂY LÀ CỬA DI TRÚ CỦA MỌI WORKSPACE ĐÃ MỞ APP TRƯỚC LƯỢT NÀY ══════════╗
   * ║ Chúng đang giữ đúng ba loại bản ghi (style · element · mascot) vì mười    ║
   * ║ trục còn lại hôm qua còn nằm cứng trong mã. Đọc thẳng ra thì `catalogs`    ║
   * ║ rỗng ⇒ MỌI menu pill rỗng ⇒ mọi câu prompt mất chữ. Và khoảng giữa lúc    ║
   * ║ thấy rỗng với lúc `seedOnce` gieo xong là một khoảng có thật (agent tắt   ║
   * ║ thì nó là mãi mãi). Cùng lý lẽ với nhánh "kho rỗng ⇒ hạt giống" ở         ║
   * ║ `hydrate`, chỉ là ở mức TỪNG TRỤC.                                       ║
   * ║ Rơi về hạt giống ở đây KHÔNG sinh ra request nào: `flush` chỉ chạy sau    ║
   * ║ một `setPresets`, còn việc ghi xuống là của `seedOnce`.                    ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  for (const kind of CATALOG_ORDER) {
    if (bundle.catalogs[kind].length === 0) bundle.catalogs[kind] = CATALOG_SEEDS[kind].map((row) => ({ ...row }));
  }
  return bundle;
}

/* ══ BẢN SAO TRONG RAM + HÀNG ĐỢI GHI ═══════════════════════════════════════
   Vẫn tự viết một store 30 dòng thay vì kéo zustand vào: cả lab chỉ có ĐÚNG một
   mẩu state chia sẻ. `useSyncExternalStore` là API React chuẩn cho việc này. */

/** Hoãn bao lâu trước khi đẩy lên server. Đủ dài để gộp một cụm phím, đủ ngắn để
    người dùng rời trang ngay sau đó vẫn kịp (màn này không có nút Lưu). */
const FLUSH_DELAY_MS = 400;

let cache: PresetBundle | null = null;
const listeners = new Set<() => void>();

/** Bản ghi server đã biết, để `flush` biết cái gì là thêm / sửa / xoá. */
let serverRows: LibraryPreset[] = [];
/** `"kind:key"` → id server. */
let serverIdOf = new Map<string, string>();
/** Ảnh chụp JSON của lần hydrate gần nhất — để không hydrate lại y hệt. */
let hydratedFrom = "";
/** Có sửa chưa đẩy lên server ⇒ CẤM hydrate đè lên (sẽ nuốt chữ đang gõ). */
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
/** Lỗi ghi gần nhất, hiện ra màn preset — im lặng nuốt lỗi ghi là không chấp nhận được. */
let syncError: string | null = null;

/** Cửa để `usePresets` báo cho query biết dữ liệu đã cũ. Đặt bởi hook, không import
    thẳng `queryClient` singleton — test dựng QueryClient riêng của chúng. */
let invalidateLibrary: (() => void) | null = null;

function emit() { for (const listener of listeners) listener(); }

function rowKey(kind: string, key: string) { return `${kind}:${key}`; }

export function getPresets(): PresetBundle {
  if (!cache) cache = seedPresets();
  return cache;
}

/** Lỗi đồng bộ gần nhất (`null` = đang sạch). Màn preset đọc để nói ra. */
export function getPresetSyncError(): string | null { return syncError; }

export function setPresets(next: PresetBundle): void {
  cache = next;
  dirty = true;
  emit();
  scheduleFlush();
}

/**
 * ELEMENT NGƯỜI DÙNG TỰ ĐẶT TÊN — «Tự đặt tên…» trong hộp tra danh mục.
 *
 * ╔══ VÌ SAO NÓ VÀO THẲNG DANH MỤC, KHÔNG PHẢI MỘT TRƯỜNG RIÊNG CỦA DÒNG ════╗
 * ║ Đường kia (giữ tên ngay trên `UiCell`) nghe gọn hơn nhưng đẻ ra hai loại  ║
 * ║ dòng element: loại tra được trong danh mục và loại không. Mọi chỗ đọc tên ║
 * ║ (`cellLine`, `uiCellDoc`, `uiKitSheets`, pill tên, ô tìm kiếm) sẽ phải    ║
 * ║ nhớ hỏi cả hai nguồn — và chỗ nào quên thì hiện ra một id trần.           ║
 * ║ Vào danh mục thì nó là một element như mọi element: đổi loại được, tìm    ║
 * ║ được, dùng lại ở thẻ khác, và sửa/xoá được ở trang «Quản lý preset».      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ TÊN VI VÀ DANH TỪ EN LÀ HAI TRƯỜNG, DÙ THƯỜNG BẰNG NHAU ════════════════
 * Người dùng gõ tiếng Anh thì một chuỗi làm cả hai việc. Gõ tiếng Việt thì `vi`
 * là chữ họ đọc trên màn, còn `en` là chữ đi tới máy vẽ — và ta KHÔNG dịch hộ:
 * dịch máy một danh từ chuyên ngành ("khiên chắn" → "shield"? "barrier"?) là
 * đoán, mà đoán sai thì máy vẽ ra một món khác hẳn. Nên `en` mặc định là NGUYÊN
 * chuỗi ấy (model đa ngữ đọc được tiếng Việt), và nơi gọi có quyền đưa `en` riêng.
 *
 * Trả về preset đã tạo. Trùng tên với một element đã có ⇒ trả về CHÍNH element ấy,
 * không đẻ bản thứ hai: hai dòng cùng tên trong danh mục là hai dòng không phân
 * biệt được, và người dùng gõ lại đúng tên cũ là đang muốn dùng lại nó.
 */
export function addCustomElement(name: string, enInput?: string): ElementPreset | null {
  const vi = name.trim();
  if (!vi) return null;
  const en = (enInput ?? "").trim() || vi;
  const bundle = getPresets();

  const same = bundle.elements.find((element) => element.vi.toLowerCase() === vi.toLowerCase());
  if (same) return same;

  /* Id đi thẳng vào TÊN FILE của ô trong contract (`uiKitSheets` slug hoá nó), nên
     nó phải an toàn ngay từ lúc sinh: `slugify` bỏ dấu tiếng Việt và mọi ký tự lạ.
     Tiền tố `tu-dat` để phân biệt với id của danh mục gốc, và hậu tố số để hai
     tên khác nhau mà cùng slug ("Nút X" / "Nút x") không đè lên nhau. */
  const base = `tu-dat-${slugify(vi)}`;
  let id = base;
  for (let n = 2; bundle.elements.some((element) => element.id === id); n += 1) id = `${base}-${n}`;

  /* KHÔNG có `skel`: một cái tên tự gõ không nói được hình dạng nào, và đoán hộ
     ("khiên" → circle? rrect?) là đoán sai ở đúng chỗ tốn một lượt vẽ. Thiếu `skel`
     ⇒ `CUSTOM_ELEMENT_SKEL` (rrect 0.8×0.6) — xem `cell-size.ts`. Người dùng chỉnh
     bằng pill «Cỡ» ngay trên dòng. */
  const preset: ElementPreset = { id, vi, en, decor: DECOR_DEFAULT, glazeId: GLAZE_AUTO, sizeId: "" };
  setPresets({ ...bundle, elements: [...bundle.elements, preset] });
  return preset;
}

/* ══════════════════════════════════════════════════════════════════════════
   MỘT HÌNH DẠNG DÒNG CHO MỌI DANH MỤC — cửa của màn «Thư viện prompt»
   ══════════════════════════════════════════════════════════════════════════

   ╔══ VÌ SAO MÀN QUẢN LÝ KHÔNG ĐƯỢC BIẾT BA KIỂU BẢN GHI ═══════════════════╗
   ║ Kho có ba hình dạng khác nhau: `styles` (id/vi/en), `elements` (thêm     ║
   ║ hình học + mặc định trang trí/đục nền), `catalogs` (thêm hint/en2/ẩn).   ║
   ║ Nếu màn tự phân nhánh theo ba hình dạng ấy thì mỗi việc — thêm, sửa,     ║
   ║ nhân bản, xoá, kéo thứ tự, khôi phục — phải viết ba lần, và lần thứ ba   ║
   ║ bao giờ cũng là lần bị quên. Nên chỗ dịch nằm ở ĐÂY, cạnh dữ liệu, và    ║
   ║ màn chỉ biết đúng một kiểu: `ManagedRow`.                                ║
   ╚══════════════════════════════════════════════════════════════════════════╝ */

/** Phần đuôi CHỈ trục `element` có — hình học, mặc định của một loại ô, và nhãn bộ. */
export type ManagedElementFields = Pick<ElementPreset, "decor" | "glazeId" | "sizeId" | "skel" | "set">;

/** Một dòng bất kỳ của bất kỳ danh mục nào, nhìn từ màn quản lý. */
export interface ManagedRow extends CatalogRow {
  element?: ManagedElementFields;
}

/** Thứ tự danh mục trên rail trái. Phong cách đứng đầu vì nó chi phối mọi tấm. */
export const MANAGED_ORDER: readonly ManagedKind[] = [
  "style", "theme", "scene", "layout", "glaze", "decor", "decorPlace", "element",
  "pose", "view", "expression", "outfit",
];

/** Đọc một danh mục ra dạng dòng chung. */
export function managedRows(bundle: PresetBundle, kind: ManagedKind): ManagedRow[] {
  if (kind === "style") return bundle.styles.map((row) => ({ id: row.id, vi: row.vi, en: row.en }));
  if (kind === "element") {
    return bundle.elements.map((row) => ({
      id: row.id, vi: row.vi, en: row.en,
      element: {
        decor: row.decor, glazeId: row.glazeId, sizeId: row.sizeId,
        ...(row.skel ? { skel: row.skel } : {}),
        ...(row.set ? { set: row.set } : {}),
      },
    }));
  }
  return bundle.catalogs[kind].map((row) => ({ ...row }));
}

/** Bundle MỚI với một danh mục đã thay. Không đụng vào các danh mục khác. */
export function withManagedRows(bundle: PresetBundle, kind: ManagedKind, rows: readonly ManagedRow[]): PresetBundle {
  if (kind === "style") return { ...bundle, styles: rows.map((row) => ({ id: row.id, vi: row.vi, en: row.en })) };
  if (kind === "element") {
    return {
      ...bundle,
      elements: rows.map((row) => ({
        id: row.id, vi: row.vi, en: row.en,
        decor: row.element?.decor ?? DECOR_DEFAULT,
        glazeId: row.element?.glazeId ?? GLAZE_AUTO,
        sizeId: row.element?.sizeId ?? "",
        ...(row.element?.skel ? { skel: row.element.skel } : {}),
        ...(row.element?.set ? { set: row.element.set } : {}),
      })),
    };
  }
  return {
    ...bundle,
    catalogs: {
      ...bundle.catalogs,
      [kind]: rows.map(({ element: _element, ...row }) => ({ ...row })),
    },
  };
}

/** Ghi một danh mục vào kho (và hẹn giờ đẩy lên workspace). */
export function setManagedRows(kind: ManagedKind, rows: readonly ManagedRow[]): void {
  setPresets(withManagedRows(getPresets(), kind, rows));
}

/** Hạt giống của MỘT danh mục — nút «Khôi phục mặc định» của danh mục ấy. */
export function seedRowsOf(kind: ManagedKind): ManagedRow[] {
  return managedRows(seedPresets(), kind);
}

/**
 * Id mới cho một dòng người dùng vừa thêm.
 *
 * Slug hoá vì id của element đi thẳng vào TÊN FILE trong contract (`uiKitSheets`),
 * và một id có dấu tiếng Việt ở đó là một tệp không mở được trên vài hệ tệp. Hậu
 * tố số để hai nhãn khác nhau mà cùng slug không đè lên nhau.
 */
export function nextRowId(kind: ManagedKind, vi: string, taken: readonly string[]): string {
  const base = `${kind === "element" ? "tu-dat-" : ""}${slugify(vi) || "moi"}`;
  let id = base;
  for (let n = 2; taken.includes(id); n += 1) id = `${base}-${n}`;
  return id;
}

/**
 * CỤM TRANG PHỤC của một chủ đề — thứ pill «Trang phục» để trống sẽ dùng.
 *
 * ╔══ VÌ SAO KHÔNG ĐỌC THẲNG `phraseOf("outfit", themeValue)` NỮA ═══════════╗
 * ║ Hạt giống đặt id của chủ đề BẰNG cụm trang phục đời đầu, nên tra chéo hai ║
 * ║ danh mục bằng id vẫn ra đúng chữ — cho tới khi ai đó THÊM một chủ đề mới. ║
 * ║ Chủ đề mới có id dạng slug (`chu-de-halloween-2`), và tra nó trong danh   ║
 * ║ mục trang phục thì không thấy ⇒ `phraseOf` của trục `outfit` trả về CHÍNH ║
 * ║ id ấy (quy ước "giá trị lạ là chữ tự gõ") ⇒ prompt nhận được chuỗi        ║
 * ║ "wearing chu-de-halloween-2". Nên chữ trang phục của một chủ đề phải nằm  ║
 * ║ TRONG chính dòng chủ đề (`en2`), và chỉ khi không có mới tra chéo.         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function themeOutfitEN(themeValue: string, bundle: PresetBundle = getPresets()): string {
  const raw = (themeValue ?? "").trim();
  if (!raw) return "";
  const hit = bundle.catalogs.theme.find((row) => row.id === raw);
  if (hit?.en2) return hit.en2;
  /* Không tra ra dòng chủ đề nào: giá trị này là CHỮ NGƯỜI DÙNG TỰ GÕ (pill chủ
     đề cho gõ riêng) — trả nguyên văn, đúng quy ước của trục `theme`/`outfit`. */
  return bundle.catalogs.outfit.find((row) => row.id === raw)?.en ?? raw;
}

/** Xoá kho, quay về hạt giống — nút "Khôi phục mặc định" của trang preset. */
export function resetPresets(): PresetBundle {
  const seed = seedPresets();
  setPresets(seed);
  return seed;
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, FLUSH_DELAY_MS);
}

/**
 * Đẩy chênh lệch lên server: thêm cái mới, sửa cái đổi, xoá cái biến mất.
 *
 * TUẦN TỰ chứ không `Promise.all`: agent ghi cả kho vào MỘT file JSON
 * (`library.json`) theo kiểu đọc-sửa-ghi. Bắn song song thì hai request cùng đọc
 * một bản rồi ghi đè nhau — mất bản ghi mà không ai báo lỗi. Danh mục dài vài
 * chục dòng nên tuần tự vẫn xong trong một nhịp.
 */
async function flush(): Promise<void> {
  if (flushing) { scheduleFlush(); return; }
  flushing = true;
  const desired = getPresets();
  const before = serverRows;
  const seen = new Set<string>();
  try {
    const jobs: [PresetKind, AnyPreset[]][] = [
      ["style", desired.styles],
      ["element", desired.elements],
      ["mascot", desired.mascots],
      ...CATALOG_ORDER.map((kind) => [kind, desired.catalogs[kind]] as [PresetKind, AnyPreset[]]),
    ];
    let touched = false;
    for (const [kind, list] of jobs) {
      for (const preset of list) {
        const key = rowKey(kind, preset.id);
        seen.add(key);
        const payload = payloadOf(kind, preset);
        const id = serverIdOf.get(key);
        if (!id) {
          const created = await api.library.addPreset(payload);
          serverIdOf.set(key, created.id);
          touched = true;
          continue;
        }
        const existing = before.find((row) => row.id === id);
        /* So bằng JSON: `data` là object tự do, không có trường nào để so lẻ.
           Bỏ qua bản ghi không đổi là thứ giữ cho một phím gõ ở ô "phong cách"
           không kéo theo 10 PATCH của mọi dòng khác. */
        if (existing && existing.name === payload.name && stable(existing.data ?? {}) === stable(payload.data)) continue;
        await api.library.patchPreset(id, payload);
        touched = true;
      }
    }
    for (const [key, id] of [...serverIdOf]) {
      if (seen.has(key)) continue;
      await api.library.removePreset(id);
      serverIdOf.delete(key);
      touched = true;
    }
    dirty = false;
    syncError = null;
    if (touched) invalidateLibrary?.();
  } catch (error) {
    /* GIỮ `dirty`: bản trong RAM vẫn là cái người dùng đang thấy và đang sửa, và
       lần sửa tiếp theo sẽ thử ghi lại toàn bộ chênh lệch. Nhưng KHÔNG im lặng —
       màn preset hiện dòng cảnh báo, vì "tưởng đã lưu mà chưa" là hỏng tệ nhất. */
    syncError = error instanceof Error ? error.message : "Không ghi được danh mục lên workspace";
    emit();
  } finally {
    flushing = false;
  }
}

/** JSON có khoá sắp xếp — để so sánh không phụ thuộc thứ tự khoá. */
function stable(value: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(value).sort().map((key) => [key, value[key]]));
}

function hydrate(rows: readonly LibraryPreset[]): void {
  const snapshot = JSON.stringify(rows);
  if (snapshot === hydratedFrom) return;
  hydratedFrom = snapshot;
  serverRows = [...rows];
  serverIdOf = new Map(rows.map((row) => [rowKey(row.kind, str(row.data ?? {}, "key") || row.id), row.id]));
  /* Đang có sửa chưa đẩy đi ⇒ chỉ nhận bảng id, KHÔNG nhận nội dung. Nhận nội
     dung lúc này là xoá đúng ký tự người dùng vừa gõ. */
  if (dirty) return;
  /* KHO RỖNG KHÔNG PHẢI LÀ "DANH MỤC RỖNG". Rỗng nghĩa là chưa gieo hạt — và
     giữa lúc thấy rỗng với lúc các POST gieo hạt về là một khoảng có thật (còn
     nếu agent tắt thì nó là mãi mãi). Vẽ ba mảng trắng trong khoảng đó là đúng
     cái mà cả phần hạt giống sinh ra để tránh: người mở lần đầu nhìn vào trang
     trắng. Nên rỗng ⇒ hiện hạt giống, và `seedOnce()` lo phần ghi xuống. */
  cache = rows.length === 0 ? seedPresets() : toBundle(rows);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/* ══ GIEO HẠT LẦN ĐẦU ═══════════════════════════════════════════════════════
   Cờ chống gieo lặp phải là MỘT cờ dùng chung cho cả module, không phải state
   của component: `usePresets` được gọi ở 5 chỗ cùng lúc, và giữa lúc POST bay đi
   với lúc query trả về danh sách mới thì `presets` vẫn còn RỖNG — mỗi component
   sẽ tự thấy "kho rỗng, gieo đi" và ta có 5 bộ hạt giống chồng lên nhau.

   ══ NHƯNG CỜ ĐÓ CHỈ SỐNG TRONG MỘT LẦN TẢI TRANG ═════════════════════════════
   Và đó chính là chỗ nó thủng. Cờ này reset mỗi lần tải lại trang (F5, HMR nạp
   lại module, mở tab thứ hai) — trong khi thứ nó bảo vệ, cái kho, thì KHÔNG.
   Cảnh đã xảy ra thật trên `~/KitGen-dev`: một lần tải trang thấy kho rỗng và
   bắt đầu gieo; trước khi bộ POST ấy về, trang được tải lại; lần tải mới có cờ
   `idle` tinh khôi VÀ một ảnh chụp query vẫn còn rỗng — nên nó gieo lần nữa.
   Kết quả: 11 element với 3 bản trùng (Nút bấm / Popover / Thanh máu hai lần).

   Nên chống trùng phải nằm ở thứ SỐNG LÂU HƠN MỘT LẦN TẢI TRANG, tức là ở kho.
   Hai lớp, và chúng khác vai:
     ① (ở đây) ĐỐI CHIẾU DANH SÁCH SERVER NGAY TRƯỚC KHI GHI. Thu hẹp khe hở từ
       "bao lâu tuỳ độ cũ của cache query" xuống còn đúng một vòng request, và
       tránh bắn đi hàng chục POST vô ích. Đây là phép tối ưu, KHÔNG phải bảo đảm.
     ② (agent, `addLibraryPreset`) upsert nhẹ theo `kind`+`data.key`. Đây mới là
       BẢO ĐẢM: agent là chỗ duy nhất nhìn thấy mọi tab, mọi lần tải trang, nên
       chỉ nó mới đóng được khe hở "hai client cùng đọc rồi cùng ghi".
   Cờ `seedState` giữ nguyên làm lớp phụ: nó vẫn chặn được 5 component trong CÙNG
   một lần tải, mà không tốn request nào. */
type SeedState = "idle" | "running" | "done";
let seedState: SeedState = "idle";

/**
 * GIEO CÁI GÌ — `null` là "không gieo gì cả".
 *
 * `"all"` là cửa cũ: kho rỗng, hoặc một trục chưa có dòng nào.
 * `"elements"` là cửa MỚI, và nó tồn tại vì một ca có thật: một máy đã dùng app từ
 * trước lượt «bộ» có ĐỦ mọi trục và đủ tám món hạt giống đời trước — nên cửa cũ trả
 * `null` và các phần của mười bảy bộ sẽ không bao giờ tới máy ấy.
 */
type SeedScope = "all" | "elements";

/**
 * Tám id hạt giống ĐỜI TRƯỚC — đọc từ `LEGACY_ELEMENT_SIZE` chứ không chép lại.
 * Hai bảng cùng liệt kê "món hạt giống đời trước" là hai bảng sẽ trôi khỏi nhau.
 */
const LEGACY_SEED_ELEMENT_IDS: readonly string[] = Object.keys(LEGACY_ELEMENT_SIZE);

/** Id hạt giống CHỈ ĐỜI NÀY MỚI CÓ — vừa là thứ phải gieo bù, vừa là vạch mực. */
const NEW_SEED_ELEMENT_IDS: readonly string[] = SEED_ELEMENTS
  .map((element) => element.id)
  .filter((id) => !LEGACY_SEED_ELEMENT_IDS.includes(id));

/**
 * Kho này còn thiếu hạt giống nào, và thiếu tới mức nào.
 *
 * ╔══ VÌ SAO VẠCH MỰC LÀ «KHÔNG CÓ PHẦN NÀO», KHÔNG PHẢI «THIẾU PHẦN NÀO» ═══╗
 * ║ Hỏi "thiếu phần nào thì gieo phần ấy" nghe đúng hơn — cho tới lúc người   ║
 * ║ dùng XOÁ một phần họ không cần. Lần mở app sau, phần ấy thiếu, và ta gieo ║
 * ║ lại: cú xoá của họ bị hoàn tác bởi một cơ chế họ không nhìn thấy, mãi mãi.║
 * ║ Nên câu hỏi phải là "máy này đã từng nhận bộ chưa": KHÔNG phần nào có mặt ║
 * ║ ⇒ chưa từng ⇒ gieo. Có dù chỉ một phần ⇒ đã từng ⇒ mọi khoảng trống còn   ║
 * ║ lại là QUYẾT ĐỊNH CỦA NGƯỜI DÙNG, và ta không đụng vào.                   ║
 * ║ Cái giá, nói thẳng: xoá SẠCH mọi phần của mọi bộ thì lần mở sau chúng về  ║
 * ║ lại. Đổi lấy: xoá bớt — thứ người ta thật sự làm — thì không bao giờ bị   ║
 * ║ hoàn tác. Ai muốn một bộ biến mất mà không quay lại thì ẩn nó đi.         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Không chỉ hỏi "kho có rỗng không": một workspace mở app trước lượt mười danh mục
 * mới có đủ style/element/mascot mà KHÔNG có dòng nào của chủ đề, khung cảnh, dáng…
 * Hỏi bằng "rỗng hay không" thì nó không bao giờ được gieo, và mười trục ấy vĩnh
 * viễn sống bằng hạt giống trong RAM — sửa được trên màn nhưng mất sạch sau mỗi lần
 * tải lại trang.
 */
function seedScope(rows: readonly LibraryPreset[]): SeedScope | null {
  if (rows.length === 0) return "all";
  const kinds = new Set(rows.map((row) => row.kind));
  if (CATALOG_ORDER.some((kind) => !kinds.has(kind))) return "all";
  const have = new Set(
    rows.filter((row) => row.kind === "element").map((row) => str(row.data ?? {}, "key") || row.id),
  );
  /* HAI VẾ, và cả hai đều cần.
     ① CÓ hạt giống đời trước ⇒ đây đúng là một máy đã nhận danh mục món từ ta, chỉ
       là nhận bản cũ. Một kho toàn món tự đặt tên thì KHÔNG rơi vào đây: nhét bốn
       mươi dòng vào một danh mục người ta đã dựng bằng tay là một việc không ai xin.
     ② CHƯA có id nào của đời này ⇒ chưa từng nhận. Có dù một id ⇒ đã nhận rồi, và
       mọi chỗ trống còn lại là thứ họ đã tự xoá. */
  const legacy = LEGACY_SEED_ELEMENT_IDS.some((id) => have.has(id));
  const modern = NEW_SEED_ELEMENT_IDS.some((id) => have.has(id));
  if (legacy && !modern) return "elements";
  return null;
}

async function seedOnce(scope: SeedScope): Promise<void> {
  if (seedState !== "idle") return;
  seedState = "running";
  try {
    /* ĐỌC LẠI TỪ SERVER, không tin `rows` mà hook vừa đưa: chính cái ảnh chụp cũ
       đó là nguyên nhân. Ở đây gọi thẳng `api.library.get()` chứ không đi qua
       TanStack Query — ta cần giá trị TẠI THỜI ĐIỂM GHI, mà query thì có quyền
       trả về bản cache. */
    const live = await api.library.get();
    const have = new Set((live.presets ?? []).map((row) => rowKey(row.kind, str(row.data ?? {}, "key") || row.id)));

    const seed = seedPresets();
    /* `"elements"` gieo ĐÚNG những id đời này mới có, không đụng tới mười một trục
       còn lại và không đụng tới tám món hạt giống đời trước. Gieo cả kho ở nhánh
       này là mở một cửa hoàn tác thứ hai: một dòng «Trang trí» mà người dùng đã xoá
       từ lâu sẽ mọc lại chỉ vì hôm nay ta thêm mấy cái bộ. */
    const jobs: [PresetKind, AnyPreset[]][] = scope === "elements"
      ? [["element", seed.elements.filter((element) => NEW_SEED_ELEMENT_IDS.includes(element.id))]]
      : [
        ["style", seed.styles],
        ["element", seed.elements],
        ["mascot", seed.mascots],
        ...CATALOG_ORDER.map((kind) => [kind, seed.catalogs[kind]] as [PresetKind, AnyPreset[]]),
      ];
    for (const [kind, list] of jobs) {
      for (const preset of list) {
        /* Khoá đã có trên server ⇒ BỎ QUA. Kể cả khi bản trên server đã bị người
           dùng sửa khác hạt giống: hạt giống là điểm KHỞI ĐẦU, không phải giá trị
           đúng cần khôi phục. Ghi đè ở đây là xoá công sửa của họ. */
        if (have.has(rowKey(kind, preset.id))) continue;
        await api.library.addPreset(payloadOf(kind, preset));
      }
    }
    seedState = "done";
    /* Làm mới query KỂ CẢ KHI KHÔNG GIEO GÌ. Không gieo gì nghĩa là server đã có
       đủ — và cũng nghĩa là ảnh chụp query đang rỗng SAI. Bản trong RAM lúc này
       vẫn là hạt giống (`hydrate` đặt khi thấy rỗng), tức người dùng đang nhìn
       giá trị mặc định thay vì danh mục thật của họ. Một lượt refetch chữa đúng
       chỗ đó. */
    invalidateLibrary?.();
  } catch (error) {
    /* Gieo hụt (agent tắt giữa chừng) ⇒ về `idle` để lần mở sau thử lại. Bản
       trong RAM vẫn là hạt giống nên màn hình vẫn dùng được ngay bây giờ. */
    seedState = "idle";
    syncError = error instanceof Error ? error.message : "Không gieo được danh mục mặc định";
    emit();
  }
}

/** Chỉ cho test dùng: trả module về trạng thái vừa nạp. */
export function __resetPresetsStoreForTest(): void {
  cache = null;
  serverRows = [];
  serverIdOf = new Map();
  hydratedFrom = "";
  dirty = false;
  flushing = false;
  syncError = null;
  seedState = "idle";
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  invalidateLibrary = null;
}

/**
 * Hook đọc kho. Mọi màn cùng dùng ⇒ sửa ở trang preset là composer đổi theo.
 *
 * Đọc qua `useUserLibrary()` — CÙNG query với kho ảnh/thương hiệu, vì cả ba nằm
 * trong cùng một `GET /api/library`. Không mở query riêng cho preset: hai cache
 * cho cùng một response là hai thứ chắc chắn sẽ lệch nhau.
 */
export function usePresets(): PresetBundle {
  const client = useQueryClient();
  const library = useUserLibrary();
  const rows = library.data?.presets;

  React.useEffect(() => {
    invalidateLibrary = () => void client.invalidateQueries({ queryKey: qk.library() });
  }, [client]);

  React.useEffect(() => {
    if (!rows) return;
    hydrate(rows);
    /* Kho rỗng THẬT (đã tải xong, mảng rỗng) ⇒ gieo hạt. Phân biệt với "chưa
       tải" bằng chính `rows === undefined` ở trên: chưa tải thì không làm gì. */
    const scope = seedScope(rows);
    if (scope !== null && !dirty) void seedOnce(scope);
  }, [rows]);

  return React.useSyncExternalStore(subscribe, getPresets, getPresets);
}

/** Lỗi ghi gần nhất, dạng hook — màn preset hiện nó ra. */
export function usePresetSyncError(): string | null {
  return React.useSyncExternalStore(subscribe, getPresetSyncError, getPresetSyncError);
}
