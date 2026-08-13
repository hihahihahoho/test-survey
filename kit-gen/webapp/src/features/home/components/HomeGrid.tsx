import type { Project } from "@/lib/types";
import type { Gate } from "@/features/projects/lib/gate";
import type { GridKeysApi } from "@/features/projects/lib/useGridKeys";
import { HOME_COPY } from "../lib/home-copy";
import { CreateKitTile } from "./CreateKitTile";
import { KitCard } from "./KitCard";
import type { KitActions } from "./KitCardMenu";

/**
 * LƯỚI THẺ BỘ KIT — ô đầu tiên là «✚ Tạo bộ kit mới», CÙNG CỠ thẻ file (UX-V3 §1.1).
 *
 * ══ VÌ SAO KHÔNG DÙNG `role="list"` Ở ĐÂY (khác màn cũ — đọc trước khi "sửa lại cho giống") ══
 * Lưới này có MỘT phần tử không phải bộ kit: ô CTA. `role="list"` thì mọi con phải là
 * `listitem`; khai CTA là `listitem` sẽ làm trình đọc màn hình đếm «5 mục» khi chỉ có 4 bộ kit.
 * Hai đường vòng đều tệ hơn:
 *   · bọc phần thẻ trong `<div role="list" class="contents">` — `display:contents` có lịch sử
 *     làm mất ngữ nghĩa của chính phần tử mang role ở một số bản trình duyệt; đánh cược
 *     ngữ nghĩa để lấy một cái role là lỗ vốn;
 *   · đưa CTA ra ngoài lưới — phá đúng bố cục mà §1.1 vẽ.
 * Nên: vùng là `<section aria-label>`, mỗi thẻ là `<article>` có `aria-label` đầy đủ
 * («tên — hình thái — trạng thái»). Trình đọc màn hình vẫn duyệt được từng thẻ; điều hướng
 * 2 chiều bằng mũi tên chạy qua roving tabindex và **không phụ thuộc role**.
 *
 * `useGridKeys` (FE-1, CHỈ-ĐỌC với FE-3) tìm thẻ bằng selector `[data-project-card]`.
 * `KitCard` vì thế mang **cả hai** `data-kit-card` (của H) và `data-project-card` (hợp đồng
 * selector của hook). Đổi hook sẽ là sửa file ngoài glob — xem H1-REPORT §4.
 *
 * Thùng rác là NÚT CHỮ MỜ ở GÓC DƯỚI PHẢI, không nổi (§1.1). Ẩn hẳn khi rỗng.
 */
export function HomeGrid({
  items,
  actions,
  gate,
  grid,
  fromCache,
  onCreate,
  now,
}: {
  items: readonly Project[];
  actions: KitActions;
  gate: Gate;
  grid: GridKeysApi;
  fromCache: boolean;
  onCreate: () => void;
  now?: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section
        ref={grid.containerRef}
        aria-label={HOME_COPY.GRID_LABEL}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
      >
        <CreateKitTile gate={gate} onCreate={onCreate} />
        {items.map((p, i) => (
          <KitCard
            key={p.id}
            project={p}
            actions={actions}
            gate={gate}
            fromCache={fromCache}
            tabIndex={grid.tabIndexFor(i)}
            {...(now === undefined ? {} : { now })}
          />
        ))}
      </section>

      {/* Nút "Thùng rác (N)" góc dưới-phải đã bỏ theo yêu cầu chủ sản phẩm:
          Thùng rác đã có sẵn ở sidebar, nút thứ hai trong vùng nội dung là thừa. */}
    </div>
  );
}
