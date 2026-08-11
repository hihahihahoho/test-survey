/**
 * features/project/lib/useProjectData.ts — NGUỒN DỮ LIỆU của S2 và S2b.
 *
 * Gom bốn thứ mà hai màn cần và một luật §2.5 mà cả hai phải tuân:
 *   #9  project (stats + state.jobs + state.activeRun)  ← ma trận, việc tiếp theo
 *   #22 bản thiết kế                                     ← tên phong cách/sheet của ma trận
 *   #33 3 lượt chạy gần nhất                             ← thẻ "Lượt chạy gần đây"
 *   #42 kit đã cắt của phong cách đầu                    ← thẻ "Kit đã cắt"
 *
 * §2.5 "AGENT CHƯA CHẠY KHÔNG PHẢI LÀ MÀN HÌNH TRẮNG": khi #9 thất bại, ta dựng
 * lại project từ `kitgen.projects.cache.v1` (cache của S1) và đặt `fromCache=true`
 * để màn đeo nhãn `dữ liệu đã lưu trên máy này`, khoá nút ghi, và KHÔNG thử tải ảnh.
 * Dùng lại đúng cache của S1 (`features/projects/lib/cache.ts`) thay vì tạo cache
 * thứ hai: hai bản chụp song song sẽ lệch nhau và không ai biết bản nào đúng.
 *
 * Ba query phụ (contract/runs/kit) CHỈ chạy khi #9 thành công: agent tắt thì gọi
 * thêm chỉ để ăn ba lần timeout, làm màn treo lâu hơn trước khi hiện banner.
 */
import * as React from "react";
import { useContract, useKit, useProject, useRuns } from "@/lib/hooks";
import { AgentError } from "@/lib/api";
import type { Contract, Kit, Project, Run } from "@/lib/types";
import { readListCache } from "@/features/projects/lib/cache";
import type { ConnectionStatus } from "@/lib/api";
import { buildMatrix, variantsOf, type ProgressMatrix } from "./matrix";

export interface ProjectData {
  /** `null` khi không có cả API lẫn cache ⇒ màn hiện khối lỗi. */
  project: Project | null;
  contract: Contract | null;
  contractVersion: number | null;
  /** Lỗi riêng của bản thiết kế — ma trận thiếu nhưng màn vẫn vẽ được. */
  contractError: unknown;
  runs: Run[];
  kit: Kit | null;
  matrix: ProgressMatrix;
  /** Phong cách đầu tiên — dùng cho `?variant=` của thư viện kit. */
  firstVariantId: string | undefined;
  fromCache: boolean;
  isLoading: boolean;
  isFetching: boolean;
  /** Lỗi CHẶN MÀN: chỉ khi không có gì để vẽ (không API, không cache). */
  fatalError: unknown;
  /** true khi lỗi là PROJECT_IN_TRASH — màn hiện copy riêng (§3.9). */
  inTrash: boolean;
  notFound: boolean;
  refetch: () => void;
}

export function useProjectData(projectId: string, status: ConnectionStatus): ProjectData {
  const projectQuery = useProject(projectId);
  const ok = Boolean(projectQuery.data);

  const contractQuery = useContract(ok ? projectId : null);
  const runsQuery = useRuns(ok ? projectId : null, 3);

  const contract = contractQuery.data?.contract ?? null;
  const firstVariantId = React.useMemo(() => variantsOf(contract)[0]?.id, [contract]);
  const kitQuery = useKit(ok && firstVariantId ? projectId : null, firstVariantId);

  const code = errorCode(projectQuery.error);
  const notFound = code === "PROJECT_NOT_FOUND";
  const inTrash = code === "PROJECT_IN_TRASH";

  // Cache chỉ đọc khi CẦN — parse JSON mỗi lần render là phí.
  // Project trong thùng rác / không tồn tại thì KHÔNG dựng từ cache: vẽ một
  // project đã bị xoá là nói dối, và §3.9 có màn riêng cho hai ca đó.
  const fingerprint = status.health?.workspaceFingerprint ?? null;
  const cached = React.useMemo(() => {
    if (projectQuery.data || notFound || inTrash) return null;
    return readListCache(fingerprint)?.items.find((p) => p.id === projectId) ?? null;
  }, [projectQuery.data, notFound, inTrash, fingerprint, projectId]);

  const project = projectQuery.data ?? cached;
  const matrix = React.useMemo(() => buildMatrix(contract, project), [contract, project]);

  const refetch = React.useCallback(() => {
    void projectQuery.refetch();
    if (ok) {
      void contractQuery.refetch();
      void runsQuery.refetch();
      void kitQuery.refetch();
    }
  }, [projectQuery, contractQuery, runsQuery, kitQuery, ok]);

  return {
    project,
    contract,
    contractVersion: contractQuery.data?.version ?? null,
    // KIT_NOT_CUT là trạng thái BÌNH THƯỜNG (chưa cắt lần nào), không phải lỗi
    // đáng báo — nên nó không lọt vào `contractError` và không hiện dải đỏ.
    contractError: contractQuery.error,
    runs: runsQuery.data?.items ?? [],
    kit: kitQuery.data ?? null,
    matrix,
    firstVariantId,
    fromCache: !projectQuery.data && cached !== null,
    isLoading: projectQuery.isLoading && cached === null,
    isFetching:
      projectQuery.isFetching || contractQuery.isFetching || runsQuery.isFetching || kitQuery.isFetching,
    fatalError: project === null && projectQuery.isError ? projectQuery.error : null,
    inTrash,
    notFound,
    refetch,
  };
}

function errorCode(err: unknown): string | null {
  return err instanceof AgentError ? err.code : null;
}
