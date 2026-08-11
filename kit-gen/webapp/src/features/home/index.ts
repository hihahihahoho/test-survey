/**
 * features/home — component + logic của **màn H «Bộ kit của bạn»** (FE3-PLAN §3-H1, UX-V3 §1).
 *
 * ⚠️ MÀN (phần điều phối) KHÔNG nằm ở đây mà ở `features/projects/ProjectsScreen.tsx` —
 * đó là entry lazy-mount do `screen-contract.ts` (glob E) chốt tên, và một test vô chủ
 * (`src/__tests__/qa-lead-regressions.test.ts` V-3) đọc thẳng file đó. Lý do đầy đủ nằm
 * trong đầu file ấy. Thư mục này giữ **mọi thứ còn lại** của màn H.
 *
 * Điểm import DUY NHẤT của nhánh khác: `import { KitCard } from "@/features/home"`.
 * Đừng import thẳng đường dẫn sâu.
 */
export { KitCard } from "./components/KitCard";
export { KitCover } from "./components/KitCover";
export { KitCardMenu, type KitActions } from "./components/KitCardMenu";
export { CreateKitTile } from "./components/CreateKitTile";
export { HomeGrid } from "./components/HomeGrid";
export { HomeHeader } from "./components/HomeHeader";
export {
  HomeAgentOffline, HomeEmpty, HomeError, HomeNoMatch, HomeSkeleton,
} from "./components/HomeStates";
export { applyHomeView, haystackOf, shouldShowSearch, sortByRecent, SEARCH_THRESHOLD } from "./lib/home-view";
export { HOME_COPY, trashLabel } from "./lib/home-copy";
export { useHomeData, type HomeData } from "./lib/useHomeData";
