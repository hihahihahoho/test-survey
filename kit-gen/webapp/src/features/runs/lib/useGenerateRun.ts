import { useStartRun } from "@/lib/hooks";
import { contractJobs, type Contract } from "@/lib/types/contract";

/** Shared generation gateway. UI surfaces confirm quota before calling this hook. */
export function useGenerateRun(projectId: string) {
  const start = useStartRun(projectId);
  return {
    ...start,
    /**
     * VẼ ĐÚNG MẤY TẤM ĐƯỢC NÊU TÊN — cửa của màn prompt-first.
     *
     * Ba tham số khác hẳn `startContract`, và cả ba là cố ý:
     *  · `jobs` do NƠI GỌI chọn (một thẻ trên màn = một khối tấm), không phải cả
     *    contract — người dùng bấm Gen trên một thẻ thì chỉ tấm ấy được vẽ;
     *  · `maxJobs: 1` — hàng đợi nằm ở PHÍA WEB (mỗi dự án chỉ một run sống), nên
     *    song song ở đây chỉ làm mờ ranh giới "một thẻ, một lượt";
     *  · `autoSliceAfterGen: false` — màn này soi ẢNH THÔ của từng tấm; cắt là
     *    việc của bước sau và có nút riêng.
     * Vẫn đi qua đúng cửa `useStartRun` này để không mọc thêm lối tiêu quota thứ hai.
     */
    startJobs: (jobs: string[]) => start.mutateAsync({
      kind: "gen",
      jobs,
      maxJobs: 1,
      autoSliceAfterGen: false,
    }),
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
