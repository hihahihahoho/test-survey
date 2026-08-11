/**
 * webapp/src/lib/store/setup.ts — trạng thái wizard S0 (`kitgen.setup.v1`) + workspace đang dùng.
 *
 * Lưu ý bảo mật: chỉ lưu **enum** `imageGenMode` và **cờ boolean**, không bao giờ lưu
 * lý do chi tiết, đường dẫn thật hay bất cứ thứ gì từ `auth.json` (arch §4.3-2).
 * Bộ dò secret ở persist.ts sẽ chặn nếu ai đó lỡ tay, nhưng thiết kế state ngay từ đầu
 * đã không có chỗ cho những thứ đó.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LS_KEYS, createPersistStorage, defaultsFor, pickAllowed } from "./persist";
import type { ImageGenMode } from "../types/api";

const d = defaultsFor(LS_KEYS.setup);

export type SetupStep = "download" | "run" | "connect" | "imagegen" | "done";
export const SETUP_STEPS: SetupStep[] = ["download", "run", "connect", "imagegen", "done"];

const PERSISTED_FIELDS = ["completed", "step", "agentVersionSeen", "protocolSeen", "imageGenMode", "checkedAt"] as const;

export interface SetupState {
  completed: boolean;
  step: SetupStep;
  agentVersionSeen: string;
  protocolSeen: number;
  imageGenMode: ImageGenMode;
  checkedAt: string;
  setStep: (s: SetupStep) => void;
  next: () => void;
  back: () => void;
  markConnected: (o: { version?: string; protocol?: number }) => void;
  markImageGen: (mode: ImageGenMode) => void;
  complete: () => void;
  /** [Chạy lại hướng dẫn cài] ở S6?tab=agent */
  restart: () => void;
}

export const useSetupStore = create<SetupState>()(
  persist(
    (set, get) => ({
      completed: d.completed,
      step: d.step as SetupStep,
      agentVersionSeen: d.agentVersionSeen,
      protocolSeen: d.protocolSeen,
      imageGenMode: d.imageGenMode as ImageGenMode,
      checkedAt: d.checkedAt,
      setStep: (step) => set({ step }),
      next: () => {
        const i = SETUP_STEPS.indexOf(get().step);
        set({ step: SETUP_STEPS[Math.min(i + 1, SETUP_STEPS.length - 1)]! });
      },
      back: () => {
        const i = SETUP_STEPS.indexOf(get().step);
        set({ step: SETUP_STEPS[Math.max(i - 1, 0)]! });
      },
      markConnected: ({ version, protocol }) =>
        set({
          agentVersionSeen: version ?? "",
          protocolSeen: protocol ?? 0,
          checkedAt: new Date().toISOString(),
          step: "imagegen",
        }),
      markImageGen: (imageGenMode) => set({ imageGenMode, checkedAt: new Date().toISOString() }),
      complete: () => set({ completed: true, step: "done", checkedAt: new Date().toISOString() }),
      restart: () => set({ completed: false, step: "download" }),
    }),
    {
      name: LS_KEYS.setup,
      version: 1,
      storage: createPersistStorage(LS_KEYS.setup, 1),
      partialize: (s) => pickAllowed(s, PERSISTED_FIELDS),
    },
  ),
);

/** S0 tự mở khi `completed !== true` (§2.1). */
export function shouldShowSetup(): boolean {
  return useSetupStore.getState().completed !== true;
}
