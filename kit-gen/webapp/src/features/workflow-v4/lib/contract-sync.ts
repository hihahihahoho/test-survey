/**
 * contract-sync.ts — WAVE 3 §W3-2: contract THẬT theo project.
 *
 * Trước wave này `workflow-v4` là một hòn đảo: mọi thứ người dùng điền chỉ nằm trong
 * `localStorage`. Hook này là cây cầu — và toàn bộ nó **0 đồng**: `agent/routes/contract.mjs`
 * chỉ đọc/ghi JSON + snapshot vào `.history/contract/`, không một dòng nào gọi model.
 *
 * ══ THỨ TỰ ƯU TIÊN — đọc kỹ trước khi sửa ════════════════════════════════════
 * `W1-DONE.md` §Bàn giao đã chốt: **contract trên đĩa là nguồn sự thật, bản nháp
 * local chỉ là bản nháp.** Nhưng "nguồn sự thật" KHÔNG có nghĩa là nạp ngược
 * contract vào store — §W3-1 cấm điều đó ("adapter MỘT CHIỀU", và dịch ngược thì
 * mất `brief`/`campaign`/`styleAxes` vốn không có chỗ trong contract). Nó có nghĩa
 * đúng hai điều, cả hai đều được cài ở đây:
 *
 *   ① `version` trên đĩa là thứ quyết định `If-Match` — không phải con số ta đoán.
 *   ② Nếu trên đĩa đã có một bản thiết kế **không do workflow này viết ra**, ta
 *      TUYỆT ĐỐI KHÔNG ghi đè. Xem `FOREIGN` bên dưới.
 *
 * ══ VÌ SAO CÓ `FOREIGN` — đây là cửa mất dữ liệu thật ════════════════════════
 * `ImportWizard` (màn Home) cho phép mang `styles.json` cũ vào một bộ kit. Contract
 * đó có 13 sheet, 122 component, 4 phong cách — công của cả một dự án. Nếu workflow
 * cứ vô tư autosave đè lên bằng kitset preset 5 sheet thì **một lần mở nhầm màn là
 * mất sạch**. Dấu hiệu nhận biết rẻ và chắc: contract do workflow viết luôn có đúng
 * một phong cách mang id hằng `chinh` (§W3-1). Không thấy nó mà trên đĩa lại có
 * sheet ⇒ của người khác ⇒ chỉ đọc, và NÓI RA trên màn.
 * (Bản cũ vẫn nằm trong `.history/contract/` phía agent nên kể cả khi ghi đè cũng
 * cứu được — nhưng "cứu được" không phải lý do để làm mất.)
 */
import * as React from "react";
import { useContract, useSaveContract } from "@/lib/hooks";
import type { ConnectionStatus } from "@/lib/api/connection";
import { contractJobs, type Contract } from "@/lib/types/contract";
import type { LibElement } from "@/features/design/library/lib/types";
import { MAIN_VARIANT_ID, buildKitsetContract, pickContractInput, type KitsetContractInput } from "./kitset-to-contract";

/** Nhịp gom thay đổi trước khi ghi đĩa — đúng 2s của §W3-2. */
export const AUTOSAVE_DELAY_MS = 2000;

export type SyncState =
  /** chưa đủ điều kiện làm gì (đang nạp contract, hoặc chưa có projectId) */
  | "loading"
  /** mọi thứ trên đĩa đã khớp bản nháp */
  | "saved"
  /** có thay đổi chưa ghi, đang chờ hết nhịp debounce */
  | "pending"
  | "saving"
  /** công cụ local chưa chạy ⇒ giữ nguyên chữ, ghi sau khi nối lại */
  | "offline"
  /** đĩa có bản thiết kế của người khác ⇒ CHỈ ĐỌC, không ghi đè */
  | "foreign"
  | "conflict"
  | "error";

export interface ContractSync {
  state: SyncState;
  /** Contract dựng từ bản nháp — dùng luôn cho ước lượng (§W3-4) và preview (§W3-6). */
  contract: Contract;
  /** Số lượt sinh ảnh của contract này (phong cách × sheet). */
  jobCount: number;
  version: number | null;
  savedAt: Date | null;
  /** Câu giải thích ngắn cho người dùng — `null` khi không có gì phải nói. */
  note: string | null;
  conflict: ReturnType<typeof useSaveContract>["conflict"];
  resolveConflict: ReturnType<typeof useSaveContract>["resolveConflict"];
  dismissConflict: () => void;
  /** Ghi ngay, không chờ debounce (dùng khi rời màn / bấm nút rõ ràng). */
  saveNow: () => Promise<boolean>;
}

/** Contract trên đĩa có phải của workflow này không? Xem khối `FOREIGN` ở đầu file. */
export function isForeignContract(disk: Contract | null | undefined): boolean {
  if (!disk) return false;
  if (disk.sheets.length === 0) return false; // project mới toanh — agent tạo EMPTY_CONTRACT
  const variants = disk.variants ?? disk.styles ?? [];
  return !variants.some((v) => v.id === MAIN_VARIANT_ID);
}

/**
 * So sánh hai contract bằng NỘI DUNG. Dùng `JSON.stringify` là đủ và đúng ở đây vì
 * `buildKitsetContract` sinh khoá theo thứ tự cố định (cùng một mã, cùng một thứ tự),
 * nên không có chuyện "cùng nội dung khác chuỗi".
 */
const sameContract = (a: Contract | null, b: Contract | null) =>
  a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);

export interface ContractSyncOptions {
  lib?: readonly LibElement[];
  /** Ref có thật trên đĩa (§W3-3) — thắng bản nháp khi được truyền. */
  refs?: { inspo: readonly string[]; brand: readonly string[]; character: string | null };
  /** Tắt hẳn autosave — cho test và cho màn chỉ muốn dựng contract để xem. */
  autosave?: boolean;
}

/**
 * Dựng contract từ bản nháp và giữ cho bản trên đĩa khớp theo.
 *
 * KHÔNG tự nạp ngược vào store: xem khối "THỨ TỰ ƯU TIÊN" ở đầu file.
 */
export function useContractSync(
  projectId: string,
  state: KitsetContractInput,
  status: ConnectionStatus,
  opts: ContractSyncOptions = {},
): ContractSync {
  const autosave = opts.autosave ?? true;
  const disk = useContract(projectId);
  const saver = useSaveContract(projectId);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);

  /** Bản đã ghi thành công gần nhất — mốc để biết "có gì mới không". */
  const savedRef = React.useRef<Contract | null>(null);
  /** Version cầm trong tay để đặt `If-Match`; cập nhật từ CẢ đĩa lẫn kết quả ghi. */
  const versionRef = React.useRef<number | null>(null);

  const lib = opts.lib;
  const refs = opts.refs;
  /* Băm ĐÚNG phần state mà contract phụ thuộc: store trả object mới mỗi `set()`,
     và `WorkflowState` còn mang cả hàm — băm cả state thì memo không bao giờ trúng. */
  const inputKey = JSON.stringify(pickContractInput(state));
  const refsKey = JSON.stringify(refs ?? null);
  const contract = React.useMemo(
    () => buildKitsetContract(state, { ...(lib ? { lib } : {}), ...(refs ? { refs } : {}) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputKey, lib, refsKey],
  );

  const foreign = isForeignContract(disk.data?.contract ?? null);
  const canWrite = autosave && status.connected && !status.readOnly && !foreign && !disk.isLoading && Boolean(disk.data);
  const dirty = !sameContract(savedRef.current, contract);

  const write = React.useCallback(async (): Promise<boolean> => {
    const version = versionRef.current;
    if (version === null) return false;
    const payload = contract;
    try {
      const res = await saver.mutateAsync({ version, contract: payload });
      versionRef.current = res.version;
      savedRef.current = payload;
      setSavedAt(new Date());
      return true;
    } catch {
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract]);

  React.useEffect(() => {
    if (!canWrite || !dirty || saver.isPending) return;
    const t = setTimeout(() => void write(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [canWrite, dirty, saver.isPending, write]);

  /* Đĩa được nạp lại (sau invalidate, hoặc sau khi giải quyết xung đột) ⇒ nhận version mới. */
  React.useEffect(() => {
    if (disk.data && (versionRef.current === null || disk.data.version > versionRef.current)) {
      versionRef.current = disk.data.version;
    }
  }, [disk.data]);

  const state_: SyncState = disk.isLoading
    ? "loading"
    : foreign
      ? "foreign"
      : saver.conflict
        ? "conflict"
        : !status.connected || status.readOnly
          ? "offline"
          : saver.isPending
            ? "saving"
            : saver.isError
              ? "error"
              : dirty
                ? "pending"
                : "saved";

  const saveNow = React.useCallback(async (): Promise<boolean> => {
    if (!canWrite) return !dirty;
    if (!dirty) return true;
    return write();
  }, [canWrite, dirty, write]);

  return {
    state: state_,
    contract,
    jobCount: contractJobs(contract).length,
    version: versionRef.current,
    savedAt,
    note: NOTE[state_] ?? null,
    conflict: saver.conflict,
    resolveConflict: saver.resolveConflict,
    dismissConflict: saver.dismissConflict,
    saveNow,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Chia contract cho các bước — MỘT lần dựng, nhiều nơi đọc
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Bước ⑤ (ước lượng) và bước ⑥ (preview khung xương) cần CÙNG một contract. Dựng hai
 * lần thì hai bước có thể nói hai con số khác nhau — đúng loại lỗi mà cả wave này
 * đang đi chữa. Nên `WorkflowScreen` dựng một lần rồi phát xuống.
 */
const ContractCtx = React.createContext<ContractSync | null>(null);

export function ContractSyncProvider({ value, children }: { value: ContractSync; children: React.ReactNode }) {
  return React.createElement(ContractCtx.Provider, { value }, children);
}

/**
 * `null` khi bước được render CÔ LẬP (test một bước, hoặc trang preview nội bộ) —
 * nơi gọi phải tự lo đường lùi, không được giả vờ có contract.
 */
export function useKitsetContract(): ContractSync | null {
  return React.useContext(ContractCtx);
}

/** Câu hiện trên màn cho từng trạng thái — nói đúng thứ đang xảy ra, không hứa hão. */
const NOTE: Partial<Record<SyncState, string>> = {
  loading: "Đang mở bản thiết kế…",
  offline: "Chưa lưu được — công cụ local chưa chạy. Chữ của bạn vẫn còn trên máy này.",
  foreign: "Đang dùng bản thiết kế đã nhập. Form này chỉ để xem.",
  conflict: "Bản trên đĩa vừa đổi ở nơi khác. Chọn giữ bản nào.",
  error: "Lưu chưa được. Sẽ thử lại — chữ của bạn vẫn còn.",
  pending: "Đang chờ lưu…",
  saving: "Đang lưu…",
};
