/**
 * features/home/lib/useHomeData.ts — NGUỒN DỮ LIỆU của màn H.
 *
 * Mỏng có chủ đích. Nó KHÔNG phải bản sao thứ hai của `useProjectsData` (FE-1): nó **gọi**
 * hàm đó rồi bỏ đi những thứ IA mới không dùng (chip đếm, tập tag, sắp xếp nhiều kiểu),
 * và áp `applyHomeView`. Viết một hook nạp dữ liệu thứ hai sẽ tạo queryKey thứ hai và
 * làm cache §2.5 vỡ đôi — đúng lỗi FE3-PLAN §0-N2 cấm.
 *
 * `useProjectsData` là CHỈ-ĐỌC với H (nó ở `features/projects/lib/`, thuộc glob H theo
 * bảng §1.1 chỉ ở mức *component*, không phải mức hook dữ liệu) — tôi không sửa một dòng nào.
 */
import * as React from "react";
import type { ConnectionStatus } from "@/lib/api";
import type { Project } from "@/lib/types";
import { useProjectsData } from "@/features/projects/lib/useProjectsData";
import { applyHomeView } from "./home-view";

export interface HomeData {
  /** Danh sách ĐÃ lọc + sắp — thứ đem đi render. */
  visible: Project[];
  /** Toàn bộ (chưa lọc) — dùng cho dialog kiểm trùng tên và cho ngưỡng hiện ô tìm. */
  all: Project[];
  fromCache: boolean;
  isLoading: boolean;
  isFetching: boolean;
  /** Chỉ khác null khi KHÔNG còn gì để vẽ (không API, không cache). */
  fatalError: unknown;
  refetch: () => void;
}

/** Bộ chọn cố định: Home chỉ có MỘT thứ tự («sửa gần nhất») nên không truyền `sortBy`. */
const HOME_VIEW_OPTS = { query: "", chip: "all", tags: [], sortBy: "updated", dir: "desc" } as const;

export function useHomeData(status: ConnectionStatus, query: string): HomeData {
  // Truyền bộ lọc RỖNG xuống dưới rồi tự lọc ở `applyHomeView`: lọc ở tầng dưới sẽ dùng
  // `matchChip`/`fuzzyScore` trên `id` và `slug` — hai thứ IA mới không cho user nhìn thấy.
  const base = useProjectsData(status, HOME_VIEW_OPTS);
  const visible = React.useMemo(() => applyHomeView(base.all, query), [base.all, query]);

  return {
    visible,
    all: base.all,
    fromCache: base.fromCache,
    isLoading: base.isLoading,
    isFetching: base.isFetching,
    fatalError: base.fatalError,
    refetch: base.refetch,
  };
}
