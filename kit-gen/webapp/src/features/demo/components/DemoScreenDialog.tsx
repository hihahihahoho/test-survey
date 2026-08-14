import * as React from "react";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useKit } from "@/lib/hooks";
import type { KitFile } from "@/lib/types";
import { GLOW_FIGMA_HINT } from "@/features/kit/lib/blend";
import { loadFull } from "@/features/kit/lib/image-source";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";
import { DEMO_SCREENS } from "../data/screens.default";
import {
  charactersOf, resolveScenes, sceneImageCount, sceneIsUsable, type ResolvedScene,
} from "../lib/resolve-scene";
import { buildSceneDom, scenePaths } from "../lib/scene-dom";
import { copyScenesAsFigmaNodes, type SceneCopyMode } from "../lib/scene-figma";

/**
 * MÀN DEMO — **CỬA RA**, KHÔNG PHẢI NƠI LÀM VIỆC.
 *
 * ╔══ VÌ SAO LÀ MỘT DIALOG, KHÔNG PHẢI MỘT MÀN ═══════════════════════════════╗
 * ║ Chủ sản phẩm chốt hai điều: (1) demo là cửa ra để bắn sang Figma, xem rồi   ║
 * ║ copy — không kéo thả chỉnh bố cục; (2) *"ĐỂ HẾT TRONG 1 CÁI POPUP THÔI,     ║
 * ║ ĐỪNG LỘ RA NGOÀI"* (`docs/PRODUCT-SITEMAP.md:522`). Vì vậy cả tính năng là  ║
 * ║ MỘT nút cạnh `Tải .zip`/`Copy sang Figma` + dialog này: không route mới     ║
 * ║ (`routeTree.ts:34-36` cấm), không nút sidebar thứ 5 (`SITEMAP:576`).        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Bản xem trước và bản đem chụp dùng **chung `buildSceneDom`** — thứ bạn thấy đúng là
 * thứ được encode. Khác nhau duy nhất: xem trước bị thu nhỏ bằng `transform` đặt trên
 * KHUNG BAO ngoài (không phải trên cây đem chụp — luật §5.3 ①).
 */

const EMPTY_FILES: readonly KitFile[] = [];
/** Khung 400×600 thu nhỏ cho vừa dialog. Chỉ ảnh hưởng bản xem trước. */
const PREVIEW_SCALE = 0.62;

export function DemoScreenDialog({
  open, onOpenChange, projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}) {
  const kit = useKit(projectId);
  const files = kit.data?.files ?? EMPTY_FILES;

  /* Nhân vật: lát 1 lấy nhân vật đầu tiên của kit. Kit kiểu `candy`/`tet` đặt tên
     `28-pose-wave` (không có tên nhân vật) ⇒ danh sách rỗng là chuyện thường,
     `resolveScene` vẫn tìm được dáng. Ô chọn nhân vật là việc của lát sau. */
  const characters = React.useMemo(() => charactersOf(files), [files]);
  const char = characters[0] ?? null;

  const scenes = React.useMemo(
    () => resolveScenes(DEMO_SCREENS, files, { char }),
    [files, char],
  );
  const usable = React.useMemo(() => scenes.filter(sceneIsUsable), [scenes]);

  const [screenId, setScreenId] = React.useState<string>("");
  const scene: ResolvedScene | null = React.useMemo(
    () => usable.find((s) => s.id === screenId) ?? usable[0] ?? null,
    [usable, screenId],
  );

  const [mode, setMode] = React.useState<SceneCopyMode>("nested");
  const [urls, setUrls] = React.useState<ReadonlyMap<string, string> | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const previewRef = React.useRef<HTMLDivElement | null>(null);

  /* ── Tải ẢNH GỐC, không thumbnail ────────────────────────────────────────────
     `<img src>` trỏ thẳng agent trả 403 (`image-source.ts:1-29`), nên ảnh phải đi qua
     transport rồi thành `blob:` object URL — cũng chính là dạng encoder nhúng được
     (`isRemoteUrl` trả false cho `blob:` ⇒ nó `fetch` lại và nhúng thật).
     ⚠️ `loadFull` chứ KHÔNG `loadThumb`: thumbnail bị ép `?w=256` và sẽ dán ra Figma
     một màn mờ. */
  React.useEffect(() => {
    if (!open || scene === null) return;
    let alive = true;
    setUrls(null);
    setLoadError(null);
    const handles = scenePaths(scene).map((path) => ({ path, handle: loadFull(projectId, path) }));
    void (async () => {
      try {
        const pairs = await Promise.all(
          handles.map(async ({ path, handle }) => [path, await handle.promise] as const),
        );
        if (alive) setUrls(new Map(pairs));
      } catch (err) {
        if (alive) setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
      for (const { handle } of handles) handle.cancel();
    };
  }, [open, projectId, scene]);

  React.useEffect(() => {
    const host = previewRef.current;
    if (host === null || scene === null || urls === null) return;
    host.replaceChildren();
    try {
      buildSceneDom(scene, urls, host);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
    return () => host.replaceChildren();
  }, [scene, urls]);

  const onCopy = () => {
    if (scene === null || urls === null) return;
    setBusy(true);
    void (async () => {
      try {
        const res = await copyScenesAsFigmaNodes([scene], urls, mode);
        toastSuccess(
          `Đã copy ${res.screens} màn · ${res.nodes} thành phần`,
          `${scene.name} · ${Math.round(res.bytes / 1024)} KB — dán vào Figma (Ctrl/Cmd+V).`,
        );
      } catch (err) {
        /* Không bao giờ báo "đã copy" khi chưa copy được — nói đúng chỗ hỏng. */
        toastError(err, {});
      } finally {
        setBusy(false);
      }
    })();
  };

  const ready = scene !== null && urls !== null && loadError === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[min(52rem,calc(100dvh-2rem))]">
        <DialogHeader>
          <DialogTitle>Màn demo</DialogTitle>
          <DialogDescription>
            Màn game lắp từ ảnh đã cắt của dự án. Copy sang Figma ra frame màn kèm từng ô một node
            riêng, đúng hitbox — sửa được từng cái.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {usable.length === 0 ? (
            <EmptyScenes scenes={scenes} />
          ) : (
            <>
              {usable.length > 1 && (
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={scene?.id ?? ""}
                  onValueChange={(v) => { if (v) setScreenId(v); }}
                  aria-label="Chọn màn demo"
                >
                  {usable.map((s) => (
                    <ToggleGroupItem key={s.id} value={s.id}>{s.name}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}

              <div className="flex flex-wrap items-start gap-5">
                <div
                  className="shrink-0 overflow-hidden rounded-3 border border-line-subtle bg-canvas"
                  style={{
                    width: (scene?.size.w ?? 0) * PREVIEW_SCALE,
                    height: (scene?.size.h ?? 0) * PREVIEW_SCALE,
                  }}
                >
                  {/* `transform` nằm ở KHUNG BAO của bản xem trước; cây đem chụp được
                      dựng lại sạch trên sân khấu tàng hình nên không dính nhánh ma trận. */}
                  <div
                    ref={previewRef}
                    style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}
                  />
                </div>

                <div className="min-w-56 flex-1 space-y-3">
                  <SceneReport scene={scene} />
                  <div className="space-y-1.5">
                    <p className="text-caption text-fg-muted-raised">Cách dán</p>
                    <ToggleGroup
                      type="single"
                      size="sm"
                      value={mode}
                      onValueChange={(v) => { if (v) setMode(v as SceneCopyMode); }}
                      aria-label="Cách dán sang Figma"
                    >
                      <ToggleGroupItem value="nested">Một frame màn</ToggleGroupItem>
                      <ToggleGroupItem value="flat">Nhiều node rời</ToggleGroupItem>
                    </ToggleGroup>
                    <p className="text-caption text-fg-muted">
                      {mode === "nested"
                        ? "Một frame «" + (scene?.name ?? "") + "» chứa từng ô. Nếu Figma làm phẳng các ô bên trong, đổi sang «Nhiều node rời»."
                        : "Nền và mỗi ô là một node riêng, vị trí giữ nguyên — bạn tự Ctrl/Cmd+G để gộp."}
                    </p>
                  </div>
                  {loadError !== null && (
                    <p className="text-caption text-danger">Không tải được ảnh: {loadError}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter className="border-t border-line-subtle">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Đóng</Button>
          <Button
            variant="primary"
            disabled={!ready || busy}
            title={ready ? "Copy màn này vào bộ nhớ tạm để dán sang Figma" : "Đang tải ảnh của màn…"}
            onClick={onCopy}
          >
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Copy aria-hidden />}
            {busy ? "Đang dựng payload…" : "Copy màn này sang Figma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Kit không đủ ô để dựng màn nào — nói THIẾU CÁI GÌ, không chỉ "không có dữ liệu". */
function EmptyScenes({ scenes }: { scenes: readonly ResolvedScene[] }) {
  return (
    <div className="space-y-2">
      <p className="text-body text-fg">Bộ ảnh này chưa dựng được màn nào.</p>
      {scenes.map((s) => (
        <p key={s.id} className="text-caption text-fg-muted">
          {s.name}: thiếu {s.missing.length > 0 ? s.missing.join(", ") : "—"}
          {s.broken.length > 0 ? ` · lỗi hình học: ${s.broken.map((b) => `${b.file} (${b.reason})`).join("; ")}` : ""}
        </p>
      ))}
    </div>
  );
}

/** Ba câu về màn đang xem: dựng được bao nhiêu, thiếu gì, ô nào cần chỉnh tay. */
function SceneReport({ scene }: { scene: ResolvedScene | null }) {
  if (scene === null) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-body text-fg">
        {scene.name} · {scene.size.w}×{scene.size.h} · {sceneImageCount(scene)} thành phần
      </p>
      {scene.missing.length > 0 && (
        <p className="text-caption text-fg-muted">
          Kit thiếu {scene.missing.length} ô — màn vẫn dựng, bỏ qua: {scene.missing.join(", ")}.
        </p>
      )}
      {scene.broken.length > 0 && (
        <p className="text-caption text-fg-muted">
          Bỏ qua {scene.broken.length} ô sai hình học: {scene.broken.map((b) => `${b.file} (${b.reason})`).join("; ")}
        </p>
      )}
      {scene.glow.length > 0 && (
        <p className="text-caption text-fg-muted">
          Ô phát sáng ({scene.glow.join(", ")}): {GLOW_FIGMA_HINT}
        </p>
      )}
    </div>
  );
}
