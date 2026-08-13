/**
 * refs-sync.ts — WAVE 3 §W3-3: ẢNH THAM KHẢO ĐI TỚI ĐĨA THẬT.
 *
 * ══ BỆNH ═════════════════════════════════════════════════════════════════════
 * `StyleStep.tsx:17-18` và `MascotStep.tsx:2` làm đúng một việc với ảnh người dùng thả vào:
 *     `Array.from(files).map(file => ({ name: file.name }))`
 * — **giữ mỗi cái tên, vứt Blob**. Ảnh không bao giờ tới `gen.sh`, mà đính ảnh chính là
 * điểm mạnh nhất của pipeline (`gen.sh:135-142` đính skeleton → ref nhân vật → inspo).
 * Người dùng thấy cái chip, tưởng đã upload, F5 một cái là mất sạch.
 *
 * ══ THUỐC ════════════════════════════════════════════════════════════════════
 * `POST /api/projects/:id/refs` (multipart). **0 đồng** — agent sniff magic byte rồi
 * `writeFileAtomic` vào `projects/<id>/refs/`, không một dòng nào gọi model.
 *
 * ══ CHỖ TINH TẾ: LÀM SAO BIẾT ẢNH NÀO THUỘC Ô THẢ NÀO SAU KHI F5 ════════════
 * `GET /api/projects/:id/refs` trả về danh sách **phẳng**: `{name, bytes, w, h, mtime,
 * usedBy}` — KHÔNG có `kind`. Nếu chỉ có thế thì reload xong không biết ảnh nào là ref
 * phong cách, ảnh nào là ref nhân vật, và chip sẽ nhảy lung tung giữa ba ô thả.
 *
 * Nhưng kind KHÔNG mất: agent **mã hoá nó vào tên file**.
 * `agent/routes/refs.mjs:118-131` (`pickRefName`):
 *     kind "character" → `char-<slug>.<ext>`
 *     kind "brand"     → `brand-<n>.<ext>`
 *     kind "inspo"     → `inspo-<n>.<ext>`
 * Nên `refKindOf(name)` đọc lại được kind từ tên, và chip về đúng ô của nó sau F5.
 * (Đây là lý do hàm dưới đây soi tiền tố chứ không đoán theo thứ tự upload.)
 */
import * as React from "react";
import { useAddRef, useRefs, useRemoveRef } from "@/lib/hooks";
import type { RefItem } from "@/lib/types/api";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";
import { refPath } from "./kitset-to-contract";

/** Ba ô thả của workflow ⇄ ba `kind` của agent. */
export type WorkflowRefKind = "inspo" | "brand" | "character";

/** Đọc `kind` NGƯỢC từ tên agent đặt — xem khối "CHỖ TINH TẾ" ở đầu file. */
export function refKindOf(name: string): WorkflowRefKind {
  if (name.startsWith("char-")) return "character";
  if (name.startsWith("brand-")) return "brand";
  return "inspo";
}

export interface RefGroups {
  inspo: RefItem[];
  brand: RefItem[];
  character: RefItem[];
}

export function groupRefs(items: readonly RefItem[]): RefGroups {
  const out: RefGroups = { inspo: [], brand: [], character: [] };
  for (const it of items) out[refKindOf(it.name)].push(it);
  return out;
}

/** Dạng mà `buildKitsetContract` cần — đường dẫn `refs/<name>`, nhân vật lấy ảnh MỚI NHẤT. */
export interface KitsetRefs {
  inspo: string[];
  brand: string[];
  character: string | null;
  /** MỌI ảnh `char-*` trên đĩa — mỗi nhân vật của bước Mascot tự nhận ảnh của nó. */
  characters: string[];
}

export function toKitsetRefs(groups: RefGroups): KitsetRefs {
  const characters = [...groups.character]
    .sort((a, b) => String(b.mtime ?? "").localeCompare(String(a.mtime ?? "")))
    .map((r) => refPath(r.name))
    .filter(Boolean);
  return {
    inspo: groups.inspo.map((r) => refPath(r.name)).filter(Boolean),
    brand: groups.brand.map((r) => refPath(r.name)).filter(Boolean),
    // Bản nháp MỘT mascot không ghi tên ref của agent, nên nó chỉ biết "ảnh nhân vật mới
    // nhất" — giữ nguyên đường lùi ấy. Danh sách nhiều nhân vật dùng `characters`.
    character: characters[0] ?? null,
    characters,
  };
}

export interface WorkflowRefsApi {
  groups: RefGroups;
  /** `true` khi đã đọc được danh sách trên đĩa (chip hiện là sự thật, không phải bản nháp). */
  ready: boolean;
  pending: boolean;
  add: (files: FileList | File[] | null, kind: WorkflowRefKind) => void;
  /**
   * Upload MỘT ảnh và trả về **tên agent đã đặt trên đĩa** (`char-meo.png`), hoặc `null`
   * khi hỏng. Modal "Thêm nhân vật" cần đúng cái tên đó để gắn ảnh cho riêng con nó —
   * `add()` chỉ bắn đi rồi quên, nên không dùng được cho việc này.
   */
  addOne: (file: File, kind: WorkflowRefKind) => Promise<string | null>;
  remove: (name: string) => void;
}

/**
 * Nối ba ô thả của workflow vào `refsApi` thật.
 *
 * Upload nhiều ảnh: gửi **tuần tự**, không `Promise.all`. Agent đặt tên bằng cách dò
 * `inspo-1`, `inspo-2`… trên đĩa (`pickRefName` + `exists`), nên bắn song song thì hai
 * request cùng thấy `inspo-1` trống và request sau ghi đè request trước.
 */
export function useWorkflowRefs(projectId: string): WorkflowRefsApi {
  const list = useRefs(projectId);
  const addRef = useAddRef(projectId);
  const removeRef = useRemoveRef(projectId);

  const groups = React.useMemo(() => groupRefs(list.data?.items ?? []), [list.data]);

  const add = React.useCallback(
    (files: FileList | File[] | null, kind: WorkflowRefKind) => {
      const arr = files ? Array.from(files) : [];
      if (arr.length === 0) return;
      void (async () => {
        let ok = 0;
        for (const file of arr) {
          try {
            await addRef.mutateAsync({ file, kind, hintName: file.name });
            ok += 1;
          } catch (err) {
            // Nói ra NGAY ảnh nào hỏng, rồi dừng — im lặng là đúng cái bệnh đang chữa.
            toastError(err, {});
            break;
          }
        }
        /* P-SWEEP·5 — bỏ dòng mô tả "Ảnh nằm trong bộ kit, F5 vẫn còn.": toast hai
           dòng cao gấp rưỡi và chính chiều cao đó là thứ phủ lên nút "Tiếp theo"
           (ảnh 12). Tiêu đề đã nói xong việc vừa xảy ra. */
        if (ok > 0) toastSuccess(ok === 1 ? "Đã lưu 1 ảnh tham khảo" : `Đã lưu ${ok} ảnh tham khảo`);
      })();
    },
    [addRef],
  );

  const addOne = React.useCallback(
    async (file: File, kind: WorkflowRefKind): Promise<string | null> => {
      try {
        const saved = await addRef.mutateAsync({ file, kind, hintName: file.name });
        toastSuccess("Đã lưu 1 ảnh tham khảo");
        return saved.name;
      } catch (err) {
        toastError(err, {});
        return null;
      }
    },
    [addRef],
  );

  const remove = React.useCallback(
    (name: string) => {
      removeRef.mutate(
        { name, force: true },
        {
          onError: (err) => toastError(err, {}),
        },
      );
    },
    [removeRef],
  );

  return {
    groups,
    ready: list.isSuccess,
    pending: addRef.isPending || removeRef.isPending,
    add,
    addOne,
    remove,
  };
}
