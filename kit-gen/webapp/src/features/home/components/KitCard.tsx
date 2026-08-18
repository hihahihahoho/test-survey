import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CARD, FLORA, FOCUS } from "@/components/layout/flora";
import { deriveStatus, readMode } from "@/features/kitfile";
import { hasGeneratedOutput } from "@/features/projects/lib/nav";
import type { Project } from "@/lib/types";
import { KitCover } from "./KitCover";
import { KitCardMenu, type KitActions } from "./KitCardMenu";
import type { Gate } from "@/features/projects/lib/gate";
import { RUN_DOT_CLASS, runLineOf } from "../lib/run-line";

/**
 * THẺ MỘT BỘ KIT — UX-V3 §1.1.
 *
 * Đúng bốn tầng chữ, không hơn (FLOW-V3 §0.4 «3 giây bấm gì», FLORA-REF §2.8 mật độ thấp):
 *   1 ảnh bìa 16:10 bo 16px       2 NHÃN NHỎ phía trên: icon + "Điền form" / "Bàn làm việc"
 *   3 tên bộ kit                   4 TỐI ĐA MỘT dòng trạng thái (`deriveStatus` của S) —
 *                                    ẩn khi ảnh bìa đã tự nói (P-SWEEP·10, xem dưới)
 *
 * Thẻ cũ (`features/projects/components/ProjectCard.tsx`) có 8 vùng gồm số phong cách, số
 * tấm, số món, số file đã cắt, danh sách tag, thời gian, dung lượng. Bảy con số đó nay
 * KHÔNG hiện ở tầng đầu — đó chính là thứ FLOW-V3 §4 gọi là «lằng nhằng». File cũ vẫn nằm
 * nguyên trên đĩa cho màn cũ (§0-N8 cấm xoá).
 *
 * ══ BA QUYẾT ĐỊNH ĐÁNG NÓI ═══════════════════════════════════════════════════════
 * ① **Không chữ nào đè lên ảnh bìa.** UX-V3 §8.3 đòi đo tương phản «nhãn nhỏ đè ảnh bìa»
 *    và bắt phải có nền đặc. Tôi giải quyết bằng CẤU TRÚC thay vì bằng màu: nhãn nằm
 *    trong khối chữ dưới ảnh, trên nền `surface` đặc. Cặp màu vì thế đo được tĩnh và
 *    không phụ thuộc ảnh của user (xem H1-REPORT §5). Ảnh bìa của user là ảnh BẤT KỲ —
 *    mọi lời hứa tương phản trên nền đó đều là lời hứa không kiểm được.
 * ② **Icon luôn đi kèm chữ** và được `aria-hidden`: screen reader đọc «Điền form»,
 *    không đọc tên hình (§5.8-A3 «không chỗ nào chỉ bằng màu/hình»). P-SWEEP đổi
 *    hình từ emoji sang lucide — luật «đi kèm chữ» không đổi, xem chú thích tại chỗ.
 * ③ **Thẻ là `<article>` trong lưới composite widget**, `tabIndex` do lưới cấp; hành động
 *    thật nằm ở `<button>` bên trong. Không có `<div onclick>` trần.
 */
export function KitCard({
  project,
  actions,
  gate,
  tabIndex,
  fromCache,
  now,
}: {
  project: Project;
  actions: KitActions;
  gate: Gate;
  tabIndex: 0 | -1;
  /** vẽ từ cache cục bộ ⇒ xám bớt (§6 hàng H: «bản lưu lần trước») */
  fromCache: boolean;
  /** tiêm đồng hồ để test thời gian tương đối tất định */
  now?: number;
}) {
  const mode = readMode(project);
  const st = deriveStatus(project, now);
  /* §BACKLOG-22 — dòng phụ về LƯỢT GEN GẦN NHẤT. Nó THAY badge (không đứng cạnh) để
     thẻ vẫn đúng luật «tối đa MỘT dòng trạng thái» của UX-V3 §1.3; `runLineOf` trả
     `null` ở mọi ca mà badge cũ nói hay hơn. Xem `lib/run-line.ts`. */
  const runLine = runLineOf(project, now);

  return (
    <article
      data-kit-card
      /* Hợp đồng selector của `useGridKeys` (FE-1, CHỈ-ĐỌC với FE-3): hook tìm thẻ bằng
         `[data-project-card]`. Mang cả hai thuộc tính là cách dùng lại hook mà KHÔNG sửa
         file ngoài glob. Xem HomeGrid.tsx và H1-REPORT §4. */
      data-project-card
      data-kit-id={project.id}
      data-kit-mode={mode}
      data-kit-status={st.status}
      tabIndex={tabIndex}
      data-kit-run={runLine?.dot}
      /* Trạng thái vẫn ĐỌC ĐƯỢC đầy đủ ở đây kể cả khi dòng phụ bị nuốt vì hẹp chỗ —
         và khi có dòng lượt chạy thì screen reader phải nghe ĐÚNG câu đang hiện. */
      aria-label={`${project.name} — ${runLine?.text ?? st.label}`}
      onClick={() => actions.open(project)}
      onKeyDown={(e) => {
        // Space mở thẻ. Enter do lưới xử lý ở tầng trên ⇒ một đường duy nhất.
        if (e.key === " " && e.currentTarget === e.target) {
          e.preventDefault();
          actions.open(project);
        }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-3 p-3 text-left",
        CARD,
        "transition-[border-color,box-shadow,transform] duration-2 ease-out",
        "hover:-translate-y-1 hover:border-line-strong hover:shadow-3",
        FOCUS,
        fromCache && "opacity-80",
      )}
    >
      <KitCover
        projectId={project.id}
        coverPath={project.cover}
        kitName={project.name}
        offline={gate.readOnly}
        /* Chỉ dự án ĐÃ TỪNG chạy một lượt gen mới có thể đang được vẽ bìa ngầm: móc
           `maybeAutoCover` của agent nằm ở `finish()` của lượt chạy. Dự án trắng thì
           không có gì để chờ, nên nó KHÔNG gửi request nào — xem KitCover.

           `&& !fromCache` — THẺ CHỈ-CÓ-TRONG-CACHE KHÔNG ĐƯỢC HỎI SERVER.
           `kitgen.projects.cache.v1` vẽ lưới ngay từ lần sơn đầu tiên (§2.5-4: «agent
           chưa chạy không phải là màn hình trắng»), nhưng mục trong đó có thể là dự án
           đã bị xoá khỏi đĩa từ phiên trước. Thẻ ma ấy mount `KitCover` ⇒
           `GET /api/projects/<id>/cover` ⇒ 404 lặp — đúng thứ người test mù #1 bắt được
           (`hello-368a`, một id không có trong cả danh sách lẫn thùng rác) ngay khi mở
           app lần đầu với `/api/projects` trả `items: []`.
           Thẻ cache là ẢNH CHỤP MÀN HÌNH CŨ, không phải một dự án đang sống: nó chỉ
           được vẽ lại đúng những gì đã lưu. Khi `/api/projects` thật về, `fromCache`
           tắt và thẻ nào còn tồn tại sẽ tự hỏi bìa như thường; thẻ đã bị xoá thì biến
           mất luôn cùng lượt ghi đè cache của `writeListCache`. */
        watchCover={hasGeneratedOutput(project) && !fromCache}
      />

      <div className="flex min-w-0 items-start justify-between gap-2 px-1 pb-1">
        <div className="flex min-w-0 flex-col gap-1">
          {/* 2 — NHÃN NHỎ PHÍA TRÊN (FLORA-REF §2.6). Trên nền surface ĐẶC, không đè ảnh.
              P-SWEEP·11 — emoji ⚙️/🎨 thay bằng icon lucide 14px `strokeWidth 1.5`.
              App dùng icon line đơn sắc rất nhất quán; emoji nhiều màu, nét dày, và
              baseline lệch so với chữ đứng cạnh. Tệ hơn: CÙNG một việc "chọn hình
              thái" thì thẻ Home dùng emoji còn dialog tạo mới (ảnh 06) dùng đúng cặp
              icon lucide `Settings2`/`Sparkles` — hai bề mặt nói hai thứ tiếng.
              Nay cả hai dùng chung `MODE_ICON`. Icon `aria-hidden`; nghĩa vẫn nằm ở
              CHỮ `cardLabel` ngay bên cạnh (§5.8-A3), y như luật cũ của emoji. */}
          {/* 3 — tên. `h2` vì h1 của màn là «Bộ kit của bạn»; nhảy h1→h3 làm đứt cây tiêu đề. */}
          <h2 className="truncate text-subtitle text-fg-strong" title={project.name}>
            {project.name}
          </h2>
          {/* 4 — ĐÚNG MỘT dòng trạng thái. Màu lấy từ `tone` của S, màn không tự chọn.
              ══ P-SWEEP·10 · THÔI NÓI "CHƯA VẼ" HAI LẦN ═══════════════════════════
              Ảnh bìa rỗng ĐÃ nói trạng thái đó bằng hình: icon ảnh + chữ "Chưa vẽ ảnh
              nào" (`KitCover`). Thêm pill "Chưa vẽ" ngay dưới tên là lần thứ hai, cách
              nhau 40px — trên một lưới 6 thẻ thành 12 lần cùng một câu (ảnh 03/04/05).
              Pill chỉ còn hiện khi trạng thái KHÔNG đoán được từ ảnh bìa: đang vẽ,
              cần vẽ lại, vẽ lỗi… Đáy các thẻ nhờ đó thẳng hàng.
              Trạng thái vẫn ĐỌC ĐƯỢC đầy đủ ở `aria-label` của thẻ và ở
              `data-kit-status` — không mất gì cho screen reader (§5.8-A3). */}
          {/* §BACKLOG-22 — DÒNG PHỤ CỦA LƯỢT GEN, ưu tiên hơn badge.
              Một chấm màu + một câu, cỡ caption: đủ để phân biệt «đang chạy 3/10» với
              «lỗi 10/10» khi lướt qua lưới, mà không biến thẻ thành bảng điều khiển.
              Chấm `aria-hidden` — nghĩa nằm ở CHỮ ngay cạnh (§5.8-A3 «không chỗ nào
              chỉ bằng màu»), đúng luật đã áp cho icon nhãn phía trên. */}
          {runLine ? (
            <p className="mt-0.5 flex min-w-0 items-center gap-2 text-caption text-fg-muted" title={runLine.long}>
              <span className={cn("size-1.5 shrink-0 rounded-full", RUN_DOT_CLASS[runLine.dot])} aria-hidden />
              <span className="truncate">{runLine.text}</span>
            </p>
          ) : st.status !== "chua-ve" ? (
            <p className="mt-0.5 flex min-w-0 items-center gap-2">
              <Badge tone={st.tone} title={st.long}>
                <span className="truncate">{st.label}</span>
              </Badge>
            </p>
          ) : null}
        </div>

        {/* Nút ⋯ — hiện khi HOVER hoặc FOCUS (§1.1). Luôn hiện trên màn cảm ứng. */}
        <KitCardMenu
          kit={project}
          actions={actions}
          gate={gate}
          className={cn(
            "shrink-0 opacity-0 transition-opacity",
            "group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
            "[@media(hover:none)]:opacity-100",
          )}
        />
      </div>

      {fromCache && (
        <span className={cn("px-1 text-caption", FLORA.fgMuted)}>bản lưu trên máy này</span>
      )}
    </article>
  );
}
