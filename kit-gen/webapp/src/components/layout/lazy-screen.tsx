import * as React from "react";
import { LoadingState } from "@/components/common";
import { ErrorBoundary } from "./ErrorBoundary";
import { ScreenPlaceholder } from "./ScreenPlaceholder";
import {
  SCREEN_EXPORT, SCREEN_LABEL, SCREEN_PATH,
  type LazyScreenId, type ScreenComponent, type ScreenProps,
} from "./screen-contract";

/**
 * BỘ NẠP MÀN — trái tim của hợp đồng lazy-mount.
 *
 * VÌ SAO `import.meta.glob` CHỨ KHÔNG PHẢI `import("…")` TRỰC TIẾP:
 * `import("../../features/kit/KitScreen")` là đường dẫn TĨNH. Rollup phân giải
 * nó lúc build; file chưa tồn tại ⇒ **build gãy**, dù có bọc try/catch bao
 * nhiêu lớp (try/catch chỉ bắt lỗi lúc chạy, không cứu được lúc build).
 * `import.meta.glob` thì ngược lại: nó liệt kê những file CÓ THẬT khớp mẫu.
 * Team chưa nộp file ⇒ key không có trong bảng ⇒ ta render placeholder.
 * Team nộp file ⇒ key xuất hiện, màn tự lên, KHÔNG ai phải sửa route.
 *
 * MẪU GLOB HẸP CÓ CHỦ ĐÍCH — `features/<nhóm>/<Tên>Screen.tsx`, đúng một cấp.
 * Bản đầu tôi để `features/**\/*.tsx` cho "an toàn", build xong đo lại thì mỗi
 * component con của team khác (ProjectCard, BulkBar, StepInstall…) đều bị
 * Rolldown cắt thành một chunk động riêng — 20+ file rời cho một màn. Mẫu hẹp
 * chỉ nhận đúng hai điểm vào; component con đi theo chunk của màn nó thuộc về.
 */
const MODULES = import.meta.glob("../../features/*/*Screen.tsx") as Record<
  string,
  () => Promise<unknown>
>;

/** `src/features/kit/KitScreen.tsx` → khoá glob `../../features/kit/KitScreen.tsx`. */
function globKey(screen: LazyScreenId): string {
  return SCREEN_PATH[screen].replace(/^src\//, "../../");
}

export function isScreenAvailable(screen: LazyScreenId): boolean {
  return Object.hasOwn(MODULES, globKey(screen));
}

/** Danh sách màn đã có file thật — dùng cho panel dev / kiểm tra nhanh. */
export function availableScreens(): LazyScreenId[] {
  return (Object.keys(SCREEN_PATH) as LazyScreenId[]).filter(isScreenAvailable);
}

/**
 * Lấy component của màn từ module đã nạp.
 * Thứ tự dò: named export đúng tên hợp đồng → `default`.
 * Không tìm thấy ⇒ ném lỗi CÓ NGHĨA (ErrorBoundary sẽ hiện, kèm chi tiết) —
 * chứ không render `undefined` để React ném một lỗi khó hiểu.
 */
function pickComponent(mod: unknown, screen: LazyScreenId): ScreenComponent {
  const m = mod as Record<string, unknown> | null;
  const named = m?.[SCREEN_EXPORT[screen]];
  const fallback = m?.default;
  const chosen = typeof named === "function" ? named : fallback;
  if (typeof chosen !== "function") {
    throw new Error(
      `${SCREEN_PATH[screen]} tồn tại nhưng không export "${SCREEN_EXPORT[screen]}" (cũng không có export default).`,
    );
  }
  return chosen as ScreenComponent;
}

/** Cache để không tạo lại `React.lazy` mỗi lần render (sẽ remount vô tận). */
const lazyCache = new Map<LazyScreenId, React.LazyExoticComponent<ScreenComponent>>();

function lazyFor(screen: LazyScreenId): React.LazyExoticComponent<ScreenComponent> {
  const hit = lazyCache.get(screen);
  if (hit) return hit;
  const loader = MODULES[globKey(screen)];
  const comp = React.lazy(async () => {
    // `loader` chắc chắn tồn tại ở nhánh này (đã kiểm `isScreenAvailable`),
    // nhưng vẫn phòng hờ để không bao giờ gọi `undefined()`.
    if (!loader) throw new Error(`Không tìm thấy ${SCREEN_PATH[screen]}`);
    const mod = await loader();
    return { default: pickComponent(mod, screen) };
  });
  lazyCache.set(screen, comp);
  return comp;
}

/**
 * Render một màn theo hợp đồng. Ba kết cục, không có kết cục thứ tư:
 *   1. file chưa có     → <ScreenPlaceholder>  (build vẫn xanh)
 *   2. file có, đang tải → skeleton (KHÔNG trắng trang)
 *   3. file có, ném lỗi  → ErrorBoundary của chính màn đó; phần khung
 *      (header, rail, bảng lệnh) VẪN sống, user vẫn đi màn khác được.
 */
export function LazyScreen({ screen, ...props }: { screen: LazyScreenId } & ScreenProps) {
  if (!isScreenAvailable(screen)) return <ScreenPlaceholder screen={screen} />;
  const Comp = lazyFor(screen);
  const resetKey = `${screen}:${props.projectId ?? ""}`;

  return (
    <ErrorBoundary resetKey={resetKey} title={`Màn «${SCREEN_LABEL[screen]}» gặp trục trặc`}>
      <React.Suspense
        fallback={
          <div className="p-6">
            <LoadingState count={3} label={`Đang mở ${SCREEN_LABEL[screen]}…`} />
          </div>
        }
      >
        <Comp {...props} />
      </React.Suspense>
    </ErrorBoundary>
  );
}
