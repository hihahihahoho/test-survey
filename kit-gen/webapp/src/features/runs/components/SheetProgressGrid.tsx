import type { Contract, Run } from "@/lib/types";
import { SheetProgressCard } from "./SheetProgressCard";

export function SheetProgressGrid({
  run, contract, onLog, onRetry, readOnly,
}: {
  run: Run;
  contract: Contract | null;
  onLog: (job: string) => void;
  onRetry: (job: string) => void;
  readOnly: boolean;
}) {
  return (
    <section aria-label={`Tiến trình của ${run.jobs.length} tấm`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {run.jobs.map((job) => (
        <SheetProgressCard
          key={job.job}
          job={job}
          run={run}
          contract={contract}
          onLog={() => onLog(job.job)}
          onRetry={() => onRetry(job.job)}
          readOnly={readOnly}
        />
      ))}
    </section>
  );
}
