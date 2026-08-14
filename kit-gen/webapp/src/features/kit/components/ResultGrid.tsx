import { AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common";
import type { KitFile } from "@/lib/types";
import { KitImage } from "./KitImage";
import { groupResults } from "../lib/w3-model";

interface ResultGridProps {
  projectId: string;
  files: readonly KitFile[];
  offline: boolean;
  filtered?: boolean;
  onShowAll?: () => void;
  onOpen: (files: readonly KitFile[], index: number) => void;
}

export function ResultGrid({ projectId, files, offline, filtered, onShowAll, onOpen }: ResultGridProps) {
  if (files.length === 0 && filtered) {
    return <EmptyState icon={Search} title="Không có món nào ở đây" description="Thử bỏ bớt bộ lọc." action={<Button onClick={onShowAll}>Xem tất cả</Button>} />;
  }

  return (
    <div className="flex flex-col gap-12">
      {groupResults(files).map((group) => (
        <section key={group.id} aria-labelledby={`result-${group.id}`} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <h2 id={`result-${group.id}`} className="shrink-0 text-label text-fg-strong">{group.label}</h2>
            <span className="h-px flex-1 bg-line-subtle" aria-hidden />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {group.files.map((file, index) => (
              <button
                key={file.path}
                type="button"
                onClick={() => onOpen(group.files, index)}
                className="group flex min-w-0 flex-col gap-2 rounded-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <p className="truncate text-caption text-fg-muted-raised" title={file.file}>{file.file.replace(/\.[^.]+$/, "")}</p>
                <KitImage projectId={projectId} path={file.path} alt={file.file} backdrop="checker" blend={file.blend} offline={offline} empty={file.empty} className="aspect-square w-full rounded-3 transition-colors group-hover:border-line-strong" />
                {file.empty && <span className="flex items-center gap-1 text-caption text-warn"><AlertTriangle aria-hidden className="size-3" /> Món này đang trống</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
