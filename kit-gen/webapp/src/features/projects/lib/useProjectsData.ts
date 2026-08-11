/**
 * features/projects/lib/useProjectsData.ts — NGUỒN DỮ LIỆU của S1.
 *
 * Ba việc, tách khỏi màn để màn chỉ còn lo bố cục:
 *  1. Gọi `useProjects()` (hook của R0) và GHI CACHE mỗi lần có dữ liệu tươi.
 *  2. Khi agent tắt / lỗi ⇒ rơi về cache `kitgen.projects.cache.v1` và báo rõ
 *     `fromCache = true` để mọi thẻ đeo nhãn `cache` (§2.5-4).
 *  3. Áp bộ lọc/sắp xếp (`applyView`) + đếm chip + gom tag.
 *
 * VÌ SAO KHÔNG TRUYỀN `q`/`tag`/`sort` XUỐNG API dù #7 có hỗ trợ:
 * lọc phía server ⇒ mỗi lần gõ một ký tự là một lần agent QUÉT ĐĨA, và mỗi bộ
 * lọc là một queryKey riêng ⇒ cache vỡ vụn, chuyển chip nào cũng thấy skeleton.
 * Số project của một người dùng thật là hàng chục, lọc ở client tốn vài chục
 * micro giây. Giữ đúng MỘT queryKey `projects.list({})` cũng làm cache §2.5 đơn
 * giản: một bản chụp, không phải N bản theo bộ lọc.
 */
import * as React from "react";
import { useProjects } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import type { ConnectionStatus } from "@/lib/api";
import { readListCache, writeListCache } from "./cache";
import { allTags, applyView, chipCounts, type ChipCounts, type ViewOptions } from "./view";

export interface ProjectsData {
  /** Danh sách ĐÃ lọc/sắp xếp — thứ đem đi render. */
  visible: Project[];
  /** Toàn bộ danh sách (chưa lọc) — dùng cho đếm chip, kiểm trùng tên, ⌘K. */
  all: Project[];
  counts: ChipCounts;
  tags: [string, number][];
  fromCache: boolean;
  /** Thời điểm quét (API) hoặc thời điểm lưu cache. */
  scannedAt: string | null;
  isLoading: boolean;
  isFetching: boolean;
  /** Chỉ khác null khi KHÔNG có gì để vẽ (không API, không cache). */
  fatalError: unknown;
  refetch: () => void;
}

export function useProjectsData(status: ConnectionStatus, view: ViewOptions): ProjectsData {
  const query = useProjects();
  const fingerprint = status.health?.workspaceFingerprint ?? null;

  // Ghi cache mỗi lần có dữ liệu tươi. Chạy trong effect (không phải lúc render)
  // vì đây là side-effect ra localStorage.
  React.useEffect(() => {
    if (query.data) writeListCache(query.data, null);
  }, [query.data]);

  // Đọc cache chỉ khi CẦN — tránh parse JSON mỗi lần gõ vào ô tìm.
  const cache = React.useMemo(
    () => (query.data ? null : readListCache(fingerprint)),
    [query.data, fingerprint],
  );

  const all = React.useMemo<Project[]>(
    () => query.data?.items ?? cache?.items ?? [],
    [query.data, cache],
  );

  const visible = React.useMemo(() => applyView(all, view), [all, view]);
  const counts = React.useMemo(() => chipCounts(all), [all]);
  const tags = React.useMemo(() => allTags(all), [all]);

  return {
    visible,
    all,
    counts,
    tags,
    fromCache: !query.data && cache !== null,
    scannedAt: query.data?.scannedAt ?? cache?.fetchedAt ?? null,
    isLoading: query.isLoading && cache === null,
    isFetching: query.isFetching,
    // Chỉ là lỗi CHẶN MÀN khi không có cả cache để vẽ. Có cache thì §2.5 nói phải
    // vẽ danh sách + banner, chứ không phải một màn lỗi trắng trơn.
    fatalError: query.isError && cache === null ? query.error : null,
    refetch: () => void query.refetch(),
  };
}
