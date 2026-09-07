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
     *  · `autoSliceAfterGen: true` — ĐẢO lại quyết định đời trước (`false`, "cắt là
     *    việc của bước sau và có nút riêng"). Nút riêng ấy chưa bao giờ tồn tại ở
     *    màn một-màn-duy-nhất: tab «Đã crop» và nút «Copy cả tấm sang Figma» của
     *    từng thẻ đều đọc `kits/manifest.json` do `slice.py` ghi, nên tắt cắt là
     *    tab trống vĩnh viễn và Figma nhận một tấm không ô (lỗi hiện trường
     *    07/09/2026: lượt r-0001 `done`, ảnh 716 KB nằm trong `raw/`, `kits/` rỗng).
     *    Agent cắt HẸP từng tấm ngay sau khi ảnh về (`run-handle.sliceSheet` →
     *    `sheet.ready` → kho kit được mời lại), nên ảnh gốc vẫn hiện trước, ô cắt
     *    đến sau vài giây — không ai phải đợi cắt mới thấy ảnh.
     * Vẫn đi qua đúng cửa `useStartRun` này để không mọc thêm lối tiêu quota thứ hai.
     */
    startJobs: (jobs: string[]) => start.mutateAsync({
      kind: "gen",
      jobs,
      maxJobs: 1,
      autoSliceAfterGen: true,
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
