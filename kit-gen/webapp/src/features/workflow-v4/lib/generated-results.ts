import type { Run, RunJob } from "@/lib/types";

export type ResultCategory = "background" | "popup" | "small" | "mascot" | "other";
export type ResultGroup = ResultCategory | "all";

export interface GeneratedResultItem {
  job: string;
  sheet: string;
  variant: string;
  category: ResultCategory;
  status: RunJob["status"];
  diagnosis: RunJob["diagnosis"];
  path: string | null;
  geometryOk: boolean | null;
  invalidCells: number;
}

export interface GeneratedRunGroup {
  id: string;
  at: string | null;
  status: Run["status"];
  items: GeneratedResultItem[];
}

export function categoryOfSheet(sheet: string): ResultCategory {
  const value = sheet.toLowerCase();
  if (/^(bg|background)(-|$)/.test(value)) return "background";
  if (/^(popup|modal|panel)(-|$)/.test(value)) return "popup";
  if (/^(pose|mascot|character)(-|$)/.test(value)) return "mascot";
  if (/^(small|ui|prop|item)(-|$)/.test(value)) return "small";
  return "other";
}

export function sheetLabel(sheet: string): string {
  const value = sheet.toLowerCase();
  const suffix = /-(\d+)$/.exec(value)?.[1];
  const number = suffix ? ` ${Number(suffix)}` : "";
  if (/^(nen|bg|background)(-|$)/.test(value)) return `Nền${number}`;
  if (/^(popup-doc|popup|modal|panel)(-|$)/.test(value)) return `Popup${number}`;
  if (/^(ui-doc|small|ui|prop|item)(-|$)/.test(value)) return `UI nhỏ & đạo cụ${number}`;
  if (/^(pose-nhan-vat|pose|mascot|character)(-|$)/.test(value)) return `Mascot pose${number}`;
  return sheet.replaceAll("-", " ");
}

export function generatedRuns(runs: readonly Run[]): GeneratedRunGroup[] {
  return runs.filter((run) => run.kind === "gen").map((run) => ({
    id: run.id,
    at: run.finishedAt ?? run.startedAt ?? null,
    status: run.status,
    items: run.jobs.map((job) => ({
      job: job.job,
      sheet: job.sheet ?? job.job,
      variant: job.variant ?? "",
      category: categoryOfSheet(job.sheet ?? job.job),
      status: job.status,
      diagnosis: job.diagnosis,
      path: job.artifact?.path ?? null,
      geometryOk: job.artifact?.validation?.ok ?? null,
      invalidCells: job.artifact?.validation?.cells.filter((cell) => cell.status === "regenerate").length ?? 0,
    })),
  }));
}

export function jobsForGroup(jobs: readonly Pick<RunJob, "job" | "sheet">[], group: ResultGroup): string[] {
  return jobs
    .filter((job) => group === "all" || categoryOfSheet(job.sheet ?? job.job) === group)
    .map((job) => job.job);
}
