/**
 * features/kit/lib/useKitData.ts — TẦNG DỮ LIỆU của S5.
 *
 * Gọi API CHỈ qua hook của R0 (`@/lib/hooks`) — không `fetch` trực tiếp (§6.5-1).
 *
 * BA VIỆC:
 *  ① `useKitScreenData` — project + contract + kit của phong cách đang xem (tab Assets/Xuất).
 *  ② `useAllKits`       — kit của MỌI phong cách, cho tab Ma trận. Dùng `useQueries` để
 *     N phong cách = N query độc lập: một phong cách chưa cắt (404 KIT_NOT_CUT) KHÔNG
 *     được làm chết cả bảng — ô của nó hiện "chưa có" + nút, đúng yêu cầu J1
 *     ("không bao giờ 404 câm"; v1: 18/78 ảnh 404 im lặng).
 *  ③ `useSliceRun`      — cắt lại: `kind:"slice"` là thao tác "tái tạo rẻ" (§1.2) nên
 *     KHÔNG qua modal M1; sinh ảnh thì luôn qua M1 của S4 (`GenerateDialog`).
 */
import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Kit } from "@/lib/types";
import { qk, useContract, useKit, useProject, useStartRun } from "@/lib/hooks";
import { STALE } from "@/lib/hooks/query-client";
import { usePrefsStore } from "@/lib/store";
import type { Contract } from "@/lib/types/contract";
import { variantOptions, type VariantOption } from "./kit-model";

export interface KitScreenData {
  projectQuery: ReturnType<typeof useProject>;
  contractQuery: ReturnType<typeof useContract>;
  kitQuery: ReturnType<typeof useKit>;
  contract: Contract | null;
  variants: VariantOption[];
  /** Phong cách đang xem — đã bảo đảm tồn tại trong contract, hoặc null khi chưa có. */
  variantId: string | null;
}

/**
 * @param wantVariant phong cách lấy từ `?variant=` trên URL (deep-link được).
 */
export function useKitScreenData(projectId: string, wantVariant: string | undefined): KitScreenData {
  const projectQuery = useProject(projectId);
  const contractQuery = useContract(projectId);
  const contract = contractQuery.data?.contract ?? null;
  const variants = React.useMemo(() => variantOptions(contract), [contract]);

  /**
   * `?variant=` lạ (link cũ, phong cách vừa bị xoá) ⇒ rơi về phong cách đầu, KHÔNG
   * ném lỗi làm trắng màn — cùng nguyên tắc "tab lạ → tab đầu" của `search-schemas.ts`.
   * Khi contract chưa tải xong thì vẫn dùng `wantVariant` để không phải chờ 2 vòng
   * request mới bắt đầu tải kit.
   */
  const variantId = React.useMemo(() => {
    if (variants.length === 0) return wantVariant ?? null;
    if (wantVariant !== undefined && variants.some((v) => v.id === wantVariant)) return wantVariant;
    return variants[0]!.id;
  }, [variants, wantVariant]);

  const kitQuery = useKit(projectId, variantId ?? undefined);

  return { projectQuery, contractQuery, kitQuery, contract, variants, variantId };
}

export interface AllKitsResult {
  /** variantId → kit; `null` = phong cách đó CHƯA CẮT (404 KIT_NOT_CUT), không phải lỗi. */
  kits: Map<string, Kit | null>;
  loading: boolean;
  /** Lỗi THẬT (không phải KIT_NOT_CUT) của ít nhất một phong cách. */
  error: unknown;
  refetch: () => void;
}

/**
 * Kit của mọi phong cách — chỉ bật khi user thực sự mở tab Ma trận (`enabled`).
 * Vì sao có `enabled`: N phong cách = N lần quét thư mục + đọc cỡ ảnh phía agent.
 * Tải sẵn khi user chỉ xem tab Assets là tiêu công của máy user vô ích.
 */
export function useAllKits(
  projectId: string,
  variants: readonly VariantOption[],
  enabled: boolean,
): AllKitsResult {
  const results = useQueries({
    queries: variants.map((v) => ({
      queryKey: qk.kit.variant(projectId, v.id),
      queryFn: () => api.files.kit(projectId, v.id),
      enabled: enabled && projectId !== "",
      staleTime: STALE.kit,
      /** Chưa cắt là TRẠNG THÁI BÌNH THƯỜNG của một phong cách mới ⇒ đừng thử lại. */
      retry: false,
    })),
  });

  return React.useMemo(() => {
    const kits = new Map<string, Kit | null>();
    let loading = false;
    let error: unknown = null;
    results.forEach((r, i) => {
      const id = variants[i]?.id;
      if (id === undefined) return;
      if (r.isLoading) loading = true;
      if (r.data) kits.set(id, r.data);
      else if (r.error) {
        const code = (r.error as { code?: string }).code;
        // KIT_NOT_CUT = "phong cách này chưa cắt" ⇒ ô hiện "chưa có" + [Sinh].
        if (code === "KIT_NOT_CUT" || code === "NOT_FOUND") kits.set(id, null);
        else if (error === null) error = r.error;
      }
    });
    return {
      kits,
      loading,
      error,
      refetch: () => results.forEach((r) => void r.refetch()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => `${r.status}:${r.dataUpdatedAt}`).join("|"), variants]);
}

/**
 * CẮT LẠI — §1.2 nhóm "tái tạo rẻ": không tốn quota, chạy lại được bất cứ lúc nào
 * ⇒ 1 confirm nhẹ ở tầng UI, KHÔNG modal M1, KHÔNG cảnh báo quota.
 * `autoSliceAfterGen:false` vì đây ĐÃ là lượt cắt; bật nó sẽ vô nghĩa.
 */
export function useSliceRun(projectId: string) {
  const startRun = useStartRun(projectId);
  const maxJobs = usePrefsStore((s) => s.maxJobs);
  return {
    ...startRun,
    sliceJobs: (jobs: string[]) =>
      startRun.mutateAsync({ kind: "slice", jobs, maxJobs, autoSliceAfterGen: false }),
  };
}
