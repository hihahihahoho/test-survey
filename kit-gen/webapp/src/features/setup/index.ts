/**
 * Bề mặt công khai của màn S0.
 *
 * HỢP ĐỒNG VỚI R1-P1 (lazy-mount): điểm vào là `features/setup/SetupScreen.tsx`,
 * có **cả** `export default` lẫn named export `SetupScreen` — `React.lazy` cần default,
 * còn import tĩnh thì dùng named cho rõ nghĩa. Đừng đổi tên file này.
 *
 * Props: `{ onDone?: (intent: "create" | "import" | "home") => void }` — TUỲ CHỌN.
 * Không truyền thì màn tự về gốc bundle, nên route mount trần vẫn chạy đúng.
 */
export { SetupScreen, default, type SetupScreenProps } from "./SetupScreen";
