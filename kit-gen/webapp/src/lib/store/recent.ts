/**
 * webapp/src/lib/store/recent.ts — 10 project mở gần nhất (`kitgen.recent.v1`, đóng J5).
 * Dùng cho ⌘P "Nhảy nhanh giữa project" và khối "Gần đây" ở S1.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LS_KEYS, createPersistStorage, defaultsFor, pickAllowed } from "./persist";

const d = defaultsFor(LS_KEYS.recent);
const PERSISTED_FIELDS = ["projectIds", "lastOpenedId"] as const;
const MAX_RECENT = 10;

export interface RecentState {
  projectIds: string[];
  lastOpenedId: string;
  touch: (id: string) => void;
  forget: (id: string) => void;
}

export const useRecentStore = create<RecentState>()(
  persist(
    (set) => ({
      projectIds: d.projectIds,
      lastOpenedId: d.lastOpenedId,
      touch: (id) =>
        set((s) => ({
          projectIds: [id, ...s.projectIds.filter((x) => x !== id)].slice(0, MAX_RECENT),
          lastOpenedId: id,
        })),
      forget: (id) =>
        set((s) => ({
          projectIds: s.projectIds.filter((x) => x !== id),
          lastOpenedId: s.lastOpenedId === id ? "" : s.lastOpenedId,
        })),
    }),
    {
      name: LS_KEYS.recent,
      version: 1,
      storage: createPersistStorage(LS_KEYS.recent, 1),
      partialize: (s) => pickAllowed(s, PERSISTED_FIELDS),
    },
  ),
);
