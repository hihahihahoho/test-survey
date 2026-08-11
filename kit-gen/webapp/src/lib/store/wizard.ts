/**
 * webapp/src/lib/store/wizard.ts — bước của các wizard/modal nhiều bước, KHÔNG persist.
 * Gồm: nhập project 3 bước (§4.6) và modal "Bắt đầu sinh ảnh" M1 (§3.5, chốt X11).
 *
 * Vì sao không persist: đây là trạng thái của MỘT thao tác đang dở. Khôi phục nó sau khi
 * đóng tab chỉ tạo ra cảm giác "app nhớ nhầm", và với M1 thì còn nguy hiểm — user có thể
 * bấm Chạy trên một tập lượt đã cũ. §4.1 của architecture cũng không cấp khoá nào cho nó.
 */
import { create } from "zustand";
import type { ImportReport } from "../types/api";

export type ImportSource = "zip" | "stylesJson" | "folder";

export interface ImportWizardState {
  step: 1 | 2 | 3;
  source: ImportSource | null;
  uploadId: string | null;
  fileName: string;
  report: ImportReport | null;
  setSource: (s: ImportSource) => void;
  setUpload: (uploadId: string, fileName: string) => void;
  setReport: (r: ImportReport) => void;
  goto: (step: 1 | 2 | 3) => void;
  reset: () => void;
}

export const useImportWizard = create<ImportWizardState>((set) => ({
  step: 1,
  source: null,
  uploadId: null,
  fileName: "",
  report: null,
  setSource: (source) => set({ source }),
  setUpload: (uploadId, fileName) => set({ uploadId, fileName }),
  /** Có báo cáo đối chiếu mới được sang bước 2 — cấm import "im lặng" (chốt X12). */
  setReport: (report) => set({ report, step: 2 }),
  goto: (step) => set({ step }),
  reset: () => set({ step: 1, source: null, uploadId: null, fileName: "", report: null }),
}));

/** Modal M1 "Bắt đầu sinh ảnh" — luôn hiện 3 số trước khi chạy (chốt X11, đóng D8). */
export interface GenModalState {
  open: boolean;
  projectId: string | null;
  /** tập lượt đã chọn — dạng `<variant>-<sheet>`, là DANH TỪ đối chiếu contract (đóng E7). */
  selectedJobs: string[];
  kind: "gen" | "slice" | "skeleton";
  openModal: (projectId: string, jobs: string[], kind?: "gen" | "slice" | "skeleton") => void;
  toggleJob: (job: string) => void;
  setJobs: (jobs: string[]) => void;
  close: () => void;
}

export const useGenModal = create<GenModalState>((set) => ({
  open: false,
  projectId: null,
  selectedJobs: [],
  kind: "gen",
  openModal: (projectId, jobs, kind = "gen") => set({ open: true, projectId, selectedJobs: jobs, kind }),
  toggleJob: (job) =>
    set((s) => ({
      selectedJobs: s.selectedJobs.includes(job) ? s.selectedJobs.filter((j) => j !== job) : [...s.selectedJobs, job],
    })),
  setJobs: (selectedJobs) => set({ selectedJobs }),
  close: () => set({ open: false, projectId: null, selectedJobs: [] }),
}));
