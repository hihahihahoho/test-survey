/**
 * webapp/src/lib/store/prefs.ts — ƯU TIÊN NGƯỜI DÙNG (`kitgen.prefs.v1`), tab S6?tab=prefs.
 * `maxJobs` và `autoSliceAfterGen` đi vào payload của #32 nên đây không chỉ là chuyện giao diện.
 * `autoSliceAfterGen` mặc định BẬT — chốt X9.
 *
 * ⚠ NGUỒN SỰ THẬT NẰM TRÊN ĐĨA: cả năm field ở đây được lưu vào
 * `<workspace>/.kitgen/config.json` (`prefs`, và `maxJobs` còn được giữ đồng bộ ở gốc file
 * cho tương thích ngược). localStorage chỉ còn là bộ nhớ đệm khởi động. Xem
 * `./disk-settings.ts` + `./settings-sync.ts`.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LS_KEYS, createPersistStorage, defaultsFor, pickAllowed } from "./persist";

const d = defaultsFor(LS_KEYS.prefs);

const PERSISTED_FIELDS = ["maxJobs", "autoSliceAfterGen", "confirmDestructive", "showEmptyCells", "logTail"] as const;

export interface PrefsState {
  /** số lượt sinh ảnh chạy song song, 1–8. Mặc định 4 (arch R3). */
  maxJobs: number;
  autoSliceAfterGen: boolean;
  confirmDestructive: boolean;
  showEmptyCells: boolean;
  logTail: number;
  setMaxJobs: (n: number) => void;
  setAutoSlice: (v: boolean) => void;
  setConfirmDestructive: (v: boolean) => void;
  setShowEmptyCells: (v: boolean) => void;
  setLogTail: (n: number) => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      maxJobs: d.maxJobs,
      autoSliceAfterGen: d.autoSliceAfterGen,
      confirmDestructive: d.confirmDestructive,
      showEmptyCells: d.showEmptyCells,
      logTail: d.logTail,
      setMaxJobs: (n) => set({ maxJobs: Math.min(8, Math.max(1, Math.round(n))) }),
      setAutoSlice: (autoSliceAfterGen) => set({ autoSliceAfterGen }),
      setConfirmDestructive: (confirmDestructive) => set({ confirmDestructive }),
      setShowEmptyCells: (showEmptyCells) => set({ showEmptyCells }),
      setLogTail: (n) => set({ logTail: Math.min(20000, Math.max(200, Math.round(n))) }),
    }),
    {
      name: LS_KEYS.prefs,
      version: 1,
      storage: createPersistStorage(LS_KEYS.prefs, 1),
      partialize: (s) => pickAllowed(s, PERSISTED_FIELDS),
    },
  ),
);
