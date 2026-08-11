import * as React from "react";
import { CheckerboardImage } from "@/components/common";
import { loadThumb } from "@/features/kit/lib/image-source";

export function StudioArtifactImage({ projectId, path, alt }: { projectId: string; path: string; alt: string }) {
  const [src, setSrc] = React.useState<string>();
  React.useEffect(() => {
    const handle = loadThumb(projectId, path);
    let alive = true;
    void handle.promise.then(url => alive && setSrc(url)).catch(() => alive && setSrc(undefined));
    return () => { alive = false; handle.cancel(); };
  }, [projectId, path]);
  return <CheckerboardImage src={src} alt={alt} fallbackText="Chưa có ảnh cho phiên bản này" className="aspect-[4/2]" />;
}
