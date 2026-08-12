import { useProject } from "@/lib/hooks";
import { useWorkflowProjectId } from "../lib/model";
import { useKitsetContract } from "../lib/contract-sync";
import { GeneratedResults } from "../components/GeneratedResults";
import { Step } from "./BriefStep";

export function ResultStep() {
  const projectId = useWorkflowProjectId();
  const sync = useKitsetContract();
  const project = useProject(projectId);


  return (
    <Step title="Ảnh đã tạo" copy="Xem kết quả hoặc tạo lại sau khi chỉnh sửa.">
      <GeneratedResults projectId={projectId} contract={sync?.contract ?? null} jobStates={project.data?.state?.jobs ?? {}} />
      <p className="mt-6 text-caption text-fg-muted">Ảnh cũ được giữ theo từng lần tạo để bạn có thể đối chiếu và tạo lại đúng phần cần sửa.</p>
    </Step>
  );
}
