/**
 * features/projects/lib/create-mode-firstdoc-run.ts — CHẠY việc tạo file con đầu tiên.
 *
 * Đây là chỗ thi công quyết định đã chốt của chủ dự án (FE2-PLAN §8-2):
 * **project tạo thật + doc local lỗi ⇒ GIỮ PROJECT, cho [Thử tạo file lại]. KHÔNG tự xoá.**
 *
 * NĂM RÀNG BUỘC, mỗi cái có lý do:
 *
 *  ① **`POST /api/projects` KHÔNG chạy lại.** Hook này chỉ nhận `projectId` của một project
 *    ĐÃ TỒN TẠI. Retry chỉ gọi `docsRepo.create`. Đây là cách duy nhất để "thử lại" mà không
 *    đẻ ra project thứ hai — rủi ro **cao** ở FE2-PLAN §6.
 *
 *  ② **Chạy ĐÚNG MỘT LẦN cho mỗi (project, lần thử).** `useEffect` có khoá `startedFor` để
 *    StrictMode double-invoke hay một lần re-render thừa không tạo hai file trùng tên
 *    (repo sẽ trả `DOC_NAME_TAKEN`, người dùng thấy lỗi vô cớ).
 *
 *  ③ **Đọc `sheetIds` là VIỆC PHỤ, không được chặn.** Có thì file workflow lọc sẵn; không
 *    đọc được (agent tắt, contract hỏng, quá `SHEETS_WAIT_MS`) thì vẫn tạo file với
 *    `sheetIds = null` và nói ra bằng `FIRST_DOC_NO_SHEETS_NOTE`. Không bịa id sheet.
 *
 *  ④ **Không `fetch()` trực tiếp.** Contract đi qua `api.contract.get` của tầng `lib/api`,
 *    và qua `queryClient.fetchQuery` với đúng khoá `qk.contract.current` của R0 — nhờ vậy
 *    màn S3 mở ra sau đó dùng lại cache thay vì gọi lần nữa. File con đi qua `useCreateDoc`
 *    (một cửa `docsRepo`, FE2-PLAN §4).
 *
 *  ⑤ **Không nuốt lỗi.** Mọi thất bại đều ra `failure` có `title` đời thường + `detail`
 *    kỹ thuật riêng; `detail` KHÔNG BAO GIỜ được hiện ở thân UI.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/hooks";
import { useCreateDoc } from "@/features/docs/hooks";
import { docErrorDetail, docErrorTitle } from "@/features/docs/hooks";
import type { Doc } from "@/features/docs/lib";
import type { CreateIntent } from "./create-mode";
import { firstDocInput, needsSheetIds, SHEETS_WAIT_MS } from "./create-mode-firstdoc";

export type FirstDocPhase = "creating" | "done" | "failed";

export interface FirstDocFailure {
  title: string;
  detail: string;
}

export interface FirstDocRun {
  phase: FirstDocPhase;
  doc: Doc | null;
  failure: FirstDocFailure | null;
  /** `true` khi file workflow được tạo mà chưa biết sheet nào (ràng buộc ③). */
  withoutSheets: boolean;
  retry: () => void;
}

/**
 * Đọc danh sách id sheet của project. **Không bao giờ ném** — thất bại là `null`.
 * Có trần thời gian riêng để agent chậm/treo không giữ người dùng ở màn "Đang tạo…".
 */
async function readSheetIds(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
  waitMs: number,
): Promise<string[] | null> {
  const load = qc
    .fetchQuery({
      queryKey: qk.contract.current(projectId),
      queryFn: () => api.contract.get(projectId),
    })
    .then((res) => res.contract.sheets.map((s) => s.id))
    .catch(() => null);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  try {
    return await Promise.race([load, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export interface UseFirstDocRunInput {
  projectId: string;
  intent: CreateIntent;
  /** Gọi ngay khi file có thật. `withoutSheets` = file workflow chưa lọc sheet nào (③). */
  onCreated: (doc: Doc, withoutSheets: boolean) => void;
  /** Đổi để test bơm trần thời gian ngắn; mặc định `SHEETS_WAIT_MS`. */
  sheetsWaitMs?: number;
}

export function useFirstDocRun(input: UseFirstDocRunInput): FirstDocRun {
  const { projectId, intent, onCreated, sheetsWaitMs = SHEETS_WAIT_MS } = input;
  const qc = useQueryClient();
  const create = useCreateDoc(projectId);

  const [attempt, setAttempt] = React.useState(0);
  const [phase, setPhase] = React.useState<FirstDocPhase>("creating");
  const [doc, setDoc] = React.useState<Doc | null>(null);
  const [failure, setFailure] = React.useState<FirstDocFailure | null>(null);
  const [withoutSheets, setWithoutSheets] = React.useState(false);

  // Giữ callback trong ref: đổi identity của nó KHÔNG được kích hoạt lần tạo thứ hai.
  const onCreatedRef = React.useRef(onCreated);
  onCreatedRef.current = onCreated;
  const createRef = React.useRef(create);
  createRef.current = create;

  const startedFor = React.useRef<string>("");

  React.useEffect(() => {
    const token = `${projectId}#${attempt}`;
    if (startedFor.current === token) return; // ràng buộc ②
    startedFor.current = token;

    let alive = true;
    setPhase("creating");
    setFailure(null);

    void (async () => {
      const sheetIds = needsSheetIds(intent) ? await readSheetIds(qc, projectId, sheetsWaitMs) : null;
      if (!alive) return;
      try {
        const created = await createRef.current.mutateAsync(firstDocInput(intent, sheetIds));
        if (!alive) return;
        const noSheets = needsSheetIds(intent) && sheetIds === null;
        setDoc(created);
        setWithoutSheets(noSheets);
        setPhase("done");
        onCreatedRef.current(created, noSheets);
      } catch (err) {
        if (!alive) return;
        setFailure({ title: docErrorTitle(err), detail: docErrorDetail(err) });
        setPhase("failed");
      }
    })();

    return () => {
      alive = false;
    };
  }, [projectId, attempt, intent, qc, sheetsWaitMs]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);

  return { phase, doc, failure, withoutSheets, retry };
}
