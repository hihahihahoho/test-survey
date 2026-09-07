import * as React from "react";
import { useUserLibrary } from "@/lib/hooks/use-library";
import { api } from "@/lib/api";
import type { BrandProfile, LibraryItem } from "@/lib/types/api";
import type { BrandBinding, BrandOption } from "@/features/prompt-lab/components/BrandPickerPill";
import type { ComposerState, ContextRef } from "@/features/prompt-lab/lib/composer-model";
import { uploadPillImage, type PillImage } from "./pill-image";

/**
 * brand-binding.ts — NỐI KHO THƯƠNG HIỆU DÙNG CHUNG VÀO BẢN NHÁP CỦA MỘT DỰ ÁN.
 *
 * ╔══ HAI THẾ GIỚI, VÀ CHÚNG KHÔNG CÙNG MỘT CÁI ĐĨA ═════════════════════════╗
 * ║ Thương hiệu (tên · màu · logo · linh vật) sống ở KHO DÙNG CHUNG của người  ║
 * ║ dùng — `GET /api/library`, một thư mục nằm ngoài mọi dự án. Còn `gen.sh`   ║
 * ║ chỉ đính kèm được tệp NẰM TRONG dự án (`refs/<tên>`), vì đó là thư mục     ║
 * ║ duy nhất nó `cd` vào. Nên "chọn thương hiệu" không thể chỉ là ghi một id:  ║
 * ║ mỗi asset phải được CHÉP sang dự án, và phép chép ấy là một vòng tải xuống ║
 * ║ + một vòng tải lên cho mỗi tấm.                                           ║
 * ║                                                                          ║
 * ║ VÌ SAO CHÉP LÚC CHỌN, KHÔNG ĐỢI LÚC BẤM VẼ: bấm Vẽ là lúc người dùng đã   ║
 * ║ quyết định tiêu tiền, và bắt họ đợi thêm bốn vòng mạng ở đúng khoảnh khắc  ║
 * ║ ấy là biến một cú bấm thành một quãng chờ không giải thích được. Chọn      ║
 * ║ thương hiệu thì ngược lại: nó là một thao tác sắp xếp, chờ ở đó là bình    ║
 * ║ thường, và pill nói ra bằng một vòng xoay.                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO CHÉP Ở CLIENT, KHÔNG XIN AGENT MỘT ENDPOINT «attach» ═══════════
 * Đã đi tìm: agent có `POST /api/library/items` (thêm vào kho) và `GET
 * /api/library/items/:id/file` (đọc byte ra), nhưng KHÔNG có đường nào chép
 * thẳng một asset thư viện vào `refs/` của một dự án. Đường vòng blob → `File` →
 * `POST /refs` dùng lại đúng hai cửa đã có và đã được kiểm (agent tự đặt tên,
 * kiểm magic bytes), nên nó không mở thêm bề mặt nào. Cái giá là byte đi qua
 * trình duyệt một vòng — chấp nhận được cho vài tấm logo, và nếu sau này có
 * endpoint thật thì chỗ phải đổi đúng là hàm `copyAsset` dưới đây.
 */

/** Nhóm asset của thương hiệu → vai trò trong contract. Thiếu ⇒ không tự chép. */
const ROLE_BY_GROUP: Record<string, ContextRef["role"]> = {
  "brand-logo": "logo",
  "brand-style": "style",
};

/** Nhóm asset LINH VẬT — không tự chép, chỉ đem đi mời ở pill ảnh nhân vật. */
const MASCOT_GROUP = "brand-mascot";

/** Hai mảng màu có nói cùng một điều không — xem `BrandBinding.colorsEdited`. */
export function sameColors(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((hex, at) => hex.toLowerCase() === (b[at] ?? "").toLowerCase());
}

/**
 * Ảnh của câu ngữ cảnh SAU KHI đổi sang một thương hiệu khác.
 *
 * Hàm THUẦN, và đó là điểm của nó: luật "giữ ảnh người dùng tự đính, thay ảnh do
 * thương hiệu mang tới" là chỗ dễ làm mất dữ liệu nhất trong cả tính năng này —
 * quét sạch cả mảng thì tấm ảnh chủ đề họ tự chọn biến mất chỉ vì họ bấm thử một
 * thương hiệu. Dấu phân biệt là `assetId` (xem `ContextRef`).
 */
export function swapBrandRefs(prev: readonly ContextRef[], next: readonly ContextRef[]): ContextRef[] {
  return [...prev.filter((ref) => !ref.assetId), ...next];
}

export interface BrandLibraryState extends BrandBinding {
  /** Kho đã tải xong chưa — màn có thể chưa muốn vẽ pill khi còn trống. */
  loaded: boolean;
}

/**
 * Dây thương hiệu cho một dự án.
 *
 * @param edit Cùng cửa `edit` mà cả màn dùng — nên nó cũng đi qua `locked` (câu
 *   hỏi thay bản nháp cũ). Chọn thương hiệu là một lượt GHI, không được có lối
 *   tắt nào lách được câu hỏi ấy.
 */
export function useBrandBinding(
  projectId: string,
  composer: ComposerState,
  edit: (updater: (prev: ComposerState) => ComposerState) => void,
  manage?: () => void,
): BrandLibraryState {
  const library = useUserLibrary();

  const brands: BrandProfile[] = React.useMemo(() => library.data?.brands ?? [], [library.data]);
  const items: LibraryItem[] = React.useMemo(() => library.data?.items ?? [], [library.data]);
  const [busy, setBusy] = React.useState(false);

  const current = brands.find((brand) => brand.id === composer.brandId) ?? null;

  const options: BrandOption[] = React.useMemo(
    () => brands.map((brand) => ({ id: brand.id, name: brand.name, colors: brand.colors })),
    [brands],
  );

  /* Bản mới nhất NGOÀI vòng render: `copyAsset` chạy bất đồng bộ vài giây sau cú
     bấm, và bảng cache nó phải đọc là bảng lúc CHÉP XONG, không phải lúc bấm.
     Cùng lý do với `composerRef` của màn. */
  const stateRef = React.useRef(composer);
  stateRef.current = composer;

  /**
   * Một asset thư viện → một tấm trong `refs/` của dự án. CÓ NHỚ.
   *
   * Nhớ ở `brandAssets` chứ không ở một `Map` trong RAM: đổi thương hiệu đi rồi
   * đổi lại, hay mở lại dự án hôm sau, đều phải rẻ. Bảng ấy đi xuống đĩa cùng
   * bản nháp nên nó sống qua cả hai ca.
   */
  const copyAsset = React.useCallback(
    async (assetId: string): Promise<PillImage> => {
      const cached = stateRef.current.brandAssets?.[assetId];
      const item = items.find((entry) => entry.id === assetId);
      if (cached) return { refName: cached.slice("refs/".length), path: cached };
      if (!item) throw new Error("Ảnh này không còn trong kho dùng chung");

      const blob = await api.library.blob(assetId);
      const file = new File([blob], item.filename, { type: blob.type || "image/png" });
      const image = await uploadPillImage(projectId, file, {
        /* Logo và ảnh phong cách đều là `inspo` theo phân loại của agent; linh vật
           là `character`. Phân loại ấy chỉ để agent xếp thư mục — vai trò THẬT của
           tấm ảnh trong prompt do `ContextRef.role` nói, không do cái này. */
        kind: item.group === MASCOT_GROUP ? "character" : "inspo",
        hintName: item.filename,
      });
      edit((prev) => ({ ...prev, brandAssets: { ...prev.brandAssets, [assetId]: image.path } }));
      return image;
    },
    [projectId, items, edit],
  );

  const pick = React.useCallback(
    (brandId: string) => {
      const brand = brands.find((entry) => entry.id === brandId) ?? null;

      /* BỎ THƯƠNG HIỆU không đụng vào màu: bộ màu đang dùng là thứ người dùng
         nhìn thấy và có thể đã sửa tay: xoá nó đi vì họ bấm «không theo thương
         hiệu» là mất một lựa chọn mà không ai xin phép. Ảnh do thương hiệu mang
         tới thì ngược lại — chúng đến cùng cái id vừa bị bỏ. */
      if (!brand) {
        edit((prev) => ({ ...prev, brandId: "", contextRefs: swapBrandRefs(prev.contextRefs, []) }));
        return;
      }

      /* ĐỔI MÀU NGAY, CHÉP ẢNH SAU. Hai việc, hai tốc độ: màu là dữ liệu đã có
         trong tay nên nó phải hiện ra trong cùng một nhịp bấm; ảnh cần mạng.
         Gộp chúng vào một lượt `edit` sau khi chép xong thì pill đứng im vài giây
         và người dùng bấm lần nữa. */
      edit((prev) => ({
        ...prev,
        brandId: brand.id,
        /* Thương hiệu không khai màu nào ⇒ GIỮ bộ màu đang có. Đổ một mảng rỗng
           vào là xoá màu của cả bộ kit để đổi lấy không gì cả. */
        brandColors: brand.colors.length > 0 ? [...brand.colors] : prev.brandColors,
      }));

      const assets = brand.assetIds
        .map((id) => items.find((entry) => entry.id === id))
        .filter((item): item is LibraryItem => !!item && item.group in ROLE_BY_GROUP);
      if (assets.length === 0) {
        edit((prev) => ({ ...prev, contextRefs: swapBrandRefs(prev.contextRefs, []) }));
        return;
      }

      setBusy(true);
      void (async () => {
        const made: ContextRef[] = [];
        for (const item of assets) {
          try {
            const image = await copyAsset(item.id);
            made.push({ path: image.path, role: ROLE_BY_GROUP[item.group]!, assetId: item.id });
          } catch {
            /* Một tấm chép hỏng KHÔNG được kéo theo cả lượt chọn: thương hiệu vẫn
               được chọn, màu vẫn đúng, chỉ thiếu đúng tấm ấy. Im lặng ở đây là có
               chủ ý — pill đã hết quay, và câu duy nhất ta nói được ("không tải
               được một ảnh") không cho người dùng việc gì để làm. */
          }
        }
        edit((prev) =>
          /* Kiểm lại id: người dùng có thể đã đổi sang thương hiệu khác trong lúc
             chép. Đổ ảnh của thương hiệu cũ vào là trộn hai bộ nhận diện. */
          prev.brandId === brand.id ? { ...prev, contextRefs: swapBrandRefs(prev.contextRefs, made) } : prev,
        );
        setBusy(false);
      })();
    },
    [brands, items, edit, copyAsset],
  );

  const restoreColors = React.useCallback(() => {
    const colors = current?.colors ?? [];
    if (colors.length === 0) return;
    edit((prev) => ({ ...prev, brandColors: [...colors] }));
  }, [current, edit]);

  const mascots = React.useMemo(
    () =>
      (current?.assetIds ?? [])
        .map((id) => items.find((entry) => entry.id === id))
        .filter((item): item is LibraryItem => !!item && item.group === MASCOT_GROUP)
        .map((item) => ({ assetId: item.id, name: item.name || item.filename })),
    [current, items],
  );

  return {
    brands: options,
    brandId: composer.brandId,
    name: current?.name ?? "",
    colorsEdited: !!current && current.colors.length > 0 && !sameColors(composer.brandColors, current.colors),
    busy,
    mascots,
    pick,
    restoreColors,
    copyAsset,
    loaded: library.data !== undefined,
    ...(manage ? { manage } : {}),
  };
}
