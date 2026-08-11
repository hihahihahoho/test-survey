import { useStartRun } from "@/lib/hooks";
import { contractJobs, type Contract } from "@/lib/types/contract";

/** Shared generation gateway. UI surfaces confirm quota before calling this hook. */
export function useGenerateRun(projectId: string) {
  const start = useStartRun(projectId);
  return {
    ...start,
    startContract: (contract: Contract) => start.mutateAsync({
      kind: "gen",
      jobs: contractJobs(contract).map((item) => item.job),
      maxJobs: 4,
      autoSliceAfterGen: true,
    }),
    startContractWithCallbacks: (
      contract: Contract,
      callbacks: Parameters<typeof start.mutate>[1],
    ) => start.mutate({
      kind: "gen",
      jobs: contractJobs(contract).map((item) => item.job),
      maxJobs: 4,
      autoSliceAfterGen: true,
    }, callbacks),
  };
}
