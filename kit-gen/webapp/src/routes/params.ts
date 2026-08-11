import { isProjectId, isRunId } from "@/lib/types";

/**
 * PARAMS TYPE-SAFE. Trả `false` ⇒ TanStack coi là KHÔNG KHỚP route ⇒ 404.
 *
 * Vì sao không để id lọt qua rồi báo lỗi ở màn: id sai dạng mà vẫn đi tiếp thì
 * mỗi màn phải tự phòng, và sớm muộn có màn quên. Chặn ở một chỗ, đúng regex
 * của agent, là rẻ nhất.
 */
export function parseProjectParams(raw: Record<string, string>): { projectId: string } | false {
  const projectId = raw.projectId ?? "";
  return isProjectId(projectId) ? { projectId } : false;
}

export function parseRunParams(
  raw: Record<string, string>,
): { projectId: string; runId: string } | false {
  const projectId = raw.projectId ?? "";
  const runId = raw.runId ?? "";
  return isProjectId(projectId) && isRunId(runId) ? { projectId, runId } : false;
}
