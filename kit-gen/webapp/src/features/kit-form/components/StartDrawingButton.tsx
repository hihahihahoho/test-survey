import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { modeTags } from "@/features/kitfile";
import { useContract, useCreateProject, useSaveContract, useStartRun, useValidateContract } from "@/lib/hooks";
import { contractJobs, slugify, type Contract } from "@/lib/types/contract";
import type { KitFormValues } from "../lib/form-model";

type ValidationError = { code: string; path?: string; message?: string };
export function StartDrawingButton({ values, contract, projectId, onStarted }: { values: KitFormValues; contract: Contract; projectId?: string; onStarted?: (projectId: string, runId: string) => void }) {
  const [id, setId] = useState(projectId ?? ""); const [waiting, setWaiting] = useState(false); const [notice, setNotice] = useState(""); const [errors, setErrors] = useState<ValidationError[]>([]);
  const create = useCreateProject(); const current = useContract(id || null); const validate = useValidateContract(id); const save = useSaveContract(id); const run = useStartRun(id);
  const finish = async (version: number) => { try { setErrors([]); setNotice(""); const checked = await validate.mutateAsync(contract); if (checked.errors.length) { setErrors(checked.errors); return; } await save.mutateAsync({ version, contract }); const started = await run.mutateAsync({ kind: "gen", jobs: contractJobs(contract).map((item) => item.job), maxJobs: 4, autoSliceAfterGen: true }); onStarted?.(id, started.runId); } catch { setNotice("Chưa bắt đầu vẽ được. Bộ kit đã được giữ lại; bấm Thử lại sẽ không tạo thêm bộ mới."); } };
  useEffect(() => { if (waiting && current.data) { setWaiting(false); void finish(current.data.version); } }, [current.data, waiting]);
  const begin = async () => { if (id) { if (current.data) await finish(current.data.version); else setWaiting(true); return; } try { const made = await create.mutateAsync({ name: values.name, slug: slugify(values.name), template: "basic", firstVariant: { id: "phong-cach-1", vi: "Phong cách chính" }, tags: modeTags("workflow") }); setId(made.project.id); setWaiting(true); } catch { setNotice("Chưa tạo được bộ kit. Kiểm tra máy hỗ trợ đang chạy rồi thử lại."); } };
  const busy = create.isPending || current.isFetching || validate.isPending || save.isPending || run.isPending;
  return <div className="grid justify-items-end gap-3"><Button type="button" variant="primary" loading={busy} onClick={() => void begin()}>{id && notice ? "Thử lại" : "Bắt đầu vẽ"}</Button>{notice && <p role="alert" className="max-w-xl text-right text-caption text-danger">{notice}</p>}{errors.length > 0 && <div role="alert" className="max-w-xl rounded-2 border border-danger/60 bg-raised p-3 text-body text-fg"><p>{errors.some((e) => e.code === "V-03") ? "Có hai tấm trùng tên. Hãy quay lại để máy xếp lại tên." : errors.some((e) => e.code === "V-04") ? "Số món chưa vừa tấm. Hãy quay lại chọn lại các món." : "Có chỗ chưa hợp lệ. Hãy quay lại kiểm tra."}</p><details className="mt-2 text-caption text-fg-muted-raised"><summary>Chi tiết cho lập trình viên</summary>{errors.map((e, i) => <p key={`${e.code}-${i}`}>{e.code} · {e.path} · {e.message}</p>)}</details></div>}</div>;
}
