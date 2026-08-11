import { TrashTab } from "@/features/settings/tabs/TrashTab";
import { HomeWorkspaceShell } from "./components/HomeWorkspaceShell";

export function TrashScreen() {
  return (
    <HomeWorkspaceShell active="trash" title="Thùng rác">
      <TrashTab />
    </HomeWorkspaceShell>
  );
}
