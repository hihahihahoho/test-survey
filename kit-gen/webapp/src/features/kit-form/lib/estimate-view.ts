import { contractJobs, type Contract } from "@/lib/types/contract";
import { estimateRun, rangeMinutes } from "@/features/runs/lib/estimate";
import { countCutItems } from "./form-to-contract";
export function estimateContract(contract: Contract) { const jobs = contractJobs(contract).length; const estimate = estimateRun(jobs, 4); return { sheets: jobs, items: countCutItems(contract), quota: `${estimate.quotaUnits[0]}–${estimate.quotaUnits[1]}`, time: rangeMinutes(estimate.seconds) }; }
