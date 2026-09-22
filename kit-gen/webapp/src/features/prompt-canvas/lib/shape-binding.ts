import * as React from "react";
import { useUserLibrary } from "@/lib/hooks/use-library";
import { api } from "@/lib/api";
import type { LibraryItem } from "@/lib/types/api";
import type { ComposerState } from "@/features/prompt-lab/lib/composer-model";
import { uploadPillImage, type PillImage } from "./pill-image";

/**
 * shape-binding.ts — ẢNH KHUNG CỦA MỘT MÓN ĐI TỪ KHO DÙNG CHUNG VÀO MỘT DỰ ÁN.
 *
 * ╔══ CÙNG HAI THẾ GIỚI MÀ `brand-binding.ts` ĐÃ MÔ TẢ ══════════════════════╗
 * ║ Danh mục element sống ở KHO DÙNG CHUNG của người dùng, ngoài mọi dự án —  ║
 * ║ đó chính là điểm của nó: đính một bản phác «khung nhiệm vụ» một lần ở màn ║
 * ║ «Thư viện prompt», rồi mọi bộ kit chọn món ấy đều nhận lại đúng hình dáng ║
 * ║ đó. Còn `gen.sh` chỉ đính kèm được tệp NẰM TRONG dự án (`refs/<tên>`).    ║
 * ║ Nên "chọn một món có ảnh khung" không thể chỉ là ghi một id: tấm ảnh phải ║
 * ║ được CHÉP sang dự án, và phép chép ấy là một vòng tải xuống + một vòng    ║
 * ║ tải lên.                                                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO LÀ MỘT FILE RIÊNG, KHÔNG PHẢI THÊM MỘT HÀM VÀO `brand-binding` ═╗
 * ║ Hai phép chép giống nhau đến từng dòng, nhưng thứ chúng nhớ thì KHÔNG    ║
 * ║ được trộn: `brandAssets` là câu trả lời cho «tấm nào do thương hiệu mang  ║
 * ║ tới», và `swapBrandRefs` GỠ đúng những tấm ấy khi người dùng đổi sang     ║
 * ║ thương hiệu khác. Một tấm ảnh khung lọt vào bảng đó sẽ mang tên một logo  ║
 * ║ trên pill, rồi biến mất khỏi dòng ở lần đổi thương hiệu kế tiếp — hai lần ║
 * ║ hỏng câm cho một chỗ dùng lại code.                                      ║
 * ║ Cái CHUNG thật sự (blob → `File` → `POST /refs`) thì vốn đã nằm ở         ║
 * ║ `uploadPillImage`, và cả hai file cùng gọi nó.                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

/**
 * Hàm chép ảnh khung cho một dự án. CÓ NHỚ.
 *
 * Nhớ ở `ComposerState.shapeAssets` chứ không ở một `Map` trong RAM: chọn lại cùng
 * một món ở thẻ khác, hay mở lại dự án hôm sau, đều phải rẻ. Bảng ấy đi xuống đĩa
 * cùng bản nháp nên nó sống qua cả hai ca. Cùng kỷ luật, cùng hình dạng với
 * `copyAsset` của `useBrandBinding`.
 *
 * @param edit Cùng cửa `edit` mà cả màn dùng — nên nó cũng đi qua `locked`. Chép
 *   ảnh là một lượt GHI vào bản nháp, không được có lối tắt nào lách câu hỏi ấy.
 */
export function useShapeBinding(
  projectId: string,
  composer: ComposerState,
  edit: (updater: (prev: ComposerState) => ComposerState) => void,
): (assetId: string) => Promise<PillImage> {
  const library = useUserLibrary();
  const items: LibraryItem[] = React.useMemo(() => library.data?.items ?? [], [library.data]);

  /* Bản mới nhất NGOÀI vòng render: phép chép chạy bất đồng bộ vài giây sau cú bấm,
     và bảng cache nó phải đọc là bảng lúc CHÉP XONG, không phải lúc bấm — nếu không
     thì hai món bấm liền tay cùng ghi đè lên nhau và tấm thứ nhất mất khỏi bảng. */
  const stateRef = React.useRef(composer);
  stateRef.current = composer;

  return React.useCallback(
    async (assetId: string): Promise<PillImage> => {
      const cached = stateRef.current.shapeAssets?.[assetId];
      if (cached) return { refName: cached.slice("refs/".length), path: cached };

      const item = items.find((entry) => entry.id === assetId);
      /* NÓI RA, không im lặng trả về một tấm rỗng: món này khai là có ảnh khung, và
         người dùng chọn nó VÌ tấm ảnh ấy. Ảnh đã bị xoá khỏi kho là một việc họ phải
         biết — chỗ sửa nằm ở màn «Thư viện prompt», không ở đây. */
      if (!item) throw new Error("ảnh khung của món này không còn trong kho dùng chung");

      const blob = await api.library.blob(assetId);
      const file = new File([blob], item.filename, { type: blob.type || "image/png" });
      /* `kind: "shape"` — CÙNG phân loại mà ô đính ảnh tay của một dòng dùng
         (`ShapeRefPanel`). Hai đường vào cùng một ô của contract thì phải xếp tấm
         ảnh vào cùng một chỗ, nếu không agent có hai thư mục cho một loại ảnh. */
      const image = await uploadPillImage(projectId, file, { kind: "shape", hintName: `shape-${item.filename}` });
      edit((prev) => ({ ...prev, shapeAssets: { ...prev.shapeAssets, [assetId]: image.path } }));
      return image;
    },
    [projectId, items, edit],
  );
}
