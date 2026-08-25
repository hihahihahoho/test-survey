import * as React from "react";
import { Camera, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

import { JointPanel } from "../components/JointPanel";
import {
  POSE_REF_PREVIEW_SIZE, POSE_REF_SIZE, capturePoseRef, poseRefLabel,
} from "../lib/capture-pose-ref";
import { DEFAULT_PRESET_ID, POSE_PRESETS, presetById, presetLabel } from "../lib/pose-presets";
import {
  CAMERA_VIEWS, DEFAULT_VIEW, cameraView, expandPose, isDirty, setAxis, setJointRotation,
  type CameraView, type PoseAngles,
} from "../lib/pose-state";
import type { JointId, Vec3 } from "../lib/skeleton";
import { joint } from "../lib/skeleton";

/**
 * NẠP MUỘN cả khối three.js. Xem khối chú thích đầu `PoseViewport.tsx` để biết vì
 * sao đây không phải tối ưu bundle cho vui mà là điều kiện để test chạy được.
 */
const PoseViewport = React.lazy(() => import("../components/PoseViewport"));

export interface Pose3DTabProps {
  /** Bắn ảnh vừa dựng lên màn cha — dải thumbnail dùng chung với tab Sketch. */
  onShot: (label: string, dataUrl: string) => void;
}

/** Đổi lựa chọn là dựng lại ảnh; 180ms để lướt nhanh qua 9 góc không đốt 9 lượt
 *  render (mỗi lượt tạo và huỷ một context WebGL). */
const PREVIEW_DEBOUNCE_MS = 180;

export function Pose3DTab({ onShot }: Pose3DTabProps) {
  /* ── ĐƯỜNG CHÍNH: chỉ hai lựa chọn ─────────────────────────────────────── */
  const [poseId, setPoseId] = React.useState(DEFAULT_PRESET_ID);
  const [view, setView] = React.useState<CameraView>(DEFAULT_VIEW);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  /**
   * XEM TRƯỚC — gọi CHÍNH `capturePoseRef`, cùng hàm mà composer sẽ gọi lúc Gen.
   *
   * Cố ý không dùng một đường vẽ riêng cho preview: nếu preview đi đường khác thì
   * nó không còn chứng minh được điều duy nhất nó có mặt để chứng minh — rằng cái
   * người dùng thấy đúng bằng cái sẽ được gửi cho máy vẽ.
   */
  React.useEffect(() => {
    let alive = true;
    setBusy(true);
    const timer = setTimeout(() => {
      capturePoseRef(poseId, view, { size: POSE_REF_PREVIEW_SIZE })
        .then((url) => {
          /* `alive` chặn tình huống kinh điển: đổi góc ba lần thật nhanh, ba lượt
             render về không đúng thứ tự, và preview đứng lại ở góc thứ hai. */
          if (!alive) return;
          setPreview(url);
          setPreviewError(null);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          setPreview(null);
          setPreviewError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => { if (alive) setBusy(false); });
    }, PREVIEW_DEBOUNCE_MS);

    return () => { alive = false; clearTimeout(timer); };
  }, [poseId, view]);

  /** "Chụp thử" — MÔ PHỎNG đúng thứ composer làm khi người dùng bấm Gen. */
  const submit = React.useCallback(() => {
    capturePoseRef(poseId, view, { size: POSE_REF_SIZE })
      .then((url) => onShot(poseRefLabel(poseId, view), url))
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Không dựng được ảnh pose reference.");
      });
  }, [onShot, poseId, view]);

  /* ── ĐƯỜNG NÂNG CAO: nắn tay ───────────────────────────────────────────── */
  const [advanced, setAdvanced] = React.useState(false);
  const base = React.useMemo(() => presetById(poseId), [poseId]);
  const [angles, setAngles] = React.useState<PoseAngles>(() => expandPose(base.data));
  const [rootY, setRootY] = React.useState(() => base.data.rootY ?? 0);
  const [selected, setSelected] = React.useState<JointId | null>(null);
  const [viewNonce, setViewNonce] = React.useState(0);

  /**
   * `mounted` — CHỐT AN TOÀN cho render đầu tiên.
   *
   * Effect không chạy khi `renderToString` (ca test chạy ở môi trường `node`) và
   * cũng chưa chạy ở nhịp render đầu trên trình duyệt. Nhờ vậy `<PoseViewport>`
   * — và qua đó cả `import("three")` — KHÔNG BAO GIỜ được đụng tới ở môi trường
   * không có WebGL. Đây là bản sao ý tưởng `immediatelyRender: false` mà lab
   * Prompt Composer dùng cho TipTap.
   */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const captureRef = React.useRef<(() => string) | null>(null);
  const handleCaptureReady = React.useCallback((fn: (() => string) | null) => {
    captureRef.current = fn;
  }, []);

  const applyPreset = React.useCallback((id: string) => {
    const preset = presetById(id);
    setPoseId(preset.id);
    setAngles(expandPose(preset.data));
    setRootY(preset.data.rootY ?? 0);
    setSelected(null);
  }, []);

  const handleRotate = React.useCallback((id: JointId, euler: Vec3) => {
    setAngles((prev) => setJointRotation(prev, id, euler));
  }, []);

  const handleAxis = React.useCallback((id: JointId, axis: "x" | "y" | "z", value: number) => {
    setAngles((prev) => setAxis(prev, id, axis, value));
  }, []);

  const handleView = React.useCallback((next: CameraView) => {
    setView(next);
    setViewNonce((n) => n + 1);
  }, []);

  const dirty = isDirty(angles, expandPose(base.data), rootY, base.data.rootY ?? 0);

  /** Chụp THỦ CÔNG từ viewport — chỉ dùng cho dáng đã nắn tay, vì `capturePoseRef`
   *  chỉ biết các dáng có trong danh mục chứ không biết bảng góc người dùng vừa sửa. */
  const shootManual = React.useCallback(() => {
    const capture = captureRef.current;
    if (!capture) {
      toast.error("Khung 3D chưa sẵn sàng — đợi một nhịp rồi chụp lại.");
      return;
    }
    onShot(`${presetLabel(poseId)} · ${cameraView(view).vi} (đã nắn tay)`, capture());
  }, [onShot, poseId, view]);

  return (
    <div className="flex flex-col gap-5">
      {/* ══ ĐƯỜNG CHÍNH ═══════════════════════════════════════════════════ */}
      <section className="grid gap-4 rounded-3 border border-line bg-surface p-4 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-subtitle text-fg-strong">Chọn dáng &amp; góc nhìn</h2>
            <p className="text-caption text-fg-muted">
              Chỉ hai lựa chọn. Khi nối thật, người dùng dừng ở đây — công cụ tự dựng ảnh tham chiếu lúc bấm Gen,
              không ai phải mở khung 3D hay bấm nút chụp nào.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pose-preset" className="mb-1 block text-label font-medium text-fg-strong">
                Dáng
              </label>
              <select
                id="pose-preset"
                value={poseId}
                onChange={(e) => applyPreset(e.target.value)}
                className="h-ctl-md w-full rounded-1 border border-line bg-canvas px-2 text-body text-fg-strong"
              >
                {POSE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{presetLabel(p.id)}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pose-view" className="mb-1 block text-label font-medium text-fg-strong">
                Góc nhìn
              </label>
              <select
                id="pose-view"
                value={view}
                onChange={(e) => handleView(e.target.value as CameraView)}
                className="h-ctl-md w-full rounded-1 border border-line bg-canvas px-2 text-body text-fg-strong"
              >
                {CAMERA_VIEWS.map((v) => (
                  <option key={v.id} value={v.id}>{v.vi}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-caption text-fg-muted">{base.note}</p>
          <p className="text-caption text-fg-muted">
            Dáng lấy từ 19 dáng thật của KitGen (<code className="font-mono">kit-core/lib/poses.ts</code>); {CAMERA_VIEWS.length} góc
            máy khai trong <code className="font-mono">pose-state.ts</code>.
          </p>

          <div>
            <Button variant="primary" onClick={submit} disabled={!!previewError}>
              <Camera aria-hidden /> Chụp thử (mô phỏng lúc bấm Gen)
            </Button>
            <p className="mt-1 text-caption text-fg-muted">
              Gọi đúng hàm <code className="font-mono">capturePoseRef(poseId, view)</code> mà composer sẽ gọi — ảnh {POSE_REF_SIZE}²
              nền trắng, dựng ngầm, không cần khung 3D nào đang mở.
            </p>
          </div>
        </div>

        {/* Bản xem trước — cùng một hàm dựng với ảnh sẽ gửi đi, chỉ khác cỡ. */}
        <figure className="flex flex-col gap-1">
          <div className="relative aspect-square w-full overflow-hidden rounded-2 border border-line bg-[rgb(255_255_255)]">
            {preview ? (
              <img src={preview} alt={poseRefLabel(poseId, view)} className="size-full object-contain" />
            ) : null}
            {previewError ? (
              <p className="absolute inset-0 flex items-center justify-center p-3 text-center text-caption text-danger">
                {previewError}
              </p>
            ) : null}
            {busy && !previewError ? (
              <span className="absolute bottom-1.5 right-1.5 rounded-full bg-[rgb(17_20_24_/_0.72)] px-2 py-0.5 text-caption text-[rgb(255_255_255)]">
                đang dựng…
              </span>
            ) : null}
          </div>
          <figcaption className="text-center text-caption text-fg-muted">
            {poseRefLabel(poseId, view)}
          </figcaption>
        </figure>
      </section>

      {/* ══ ĐƯỜNG NÂNG CAO ════════════════════════════════════════════════ */}
      <div className="rounded-3 border border-line">
        <button
          type="button"
          onClick={() => {
            /* Thu panel lại thì BỎ CHỌN khớp: gizmo còn bám vào một khớp mà panel
               giải thích nó thì đã biến mất là một cái bẫy. */
            if (advanced) setSelected(null);
            setAdvanced((v) => !v);
          }}
          aria-expanded={advanced}
          className="flex w-full items-center gap-2 rounded-3 px-3 py-2.5 text-left text-label font-medium text-fg-strong hover:bg-raised"
        >
          {advanced ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
          Nâng cao — tự nắn khớp, xoay camera tự do, chụp thủ công
        </button>

        {advanced ? (
          <div className="grid gap-4 border-t border-line-subtle p-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-col gap-3">
              <div className="relative h-[520px] overflow-hidden rounded-3 border border-line bg-[rgb(255_255_255)]">
                {mounted ? (
                  <React.Suspense fallback={<ViewportPlaceholder text="Đang tải khung 3D…" />}>
                    <PoseViewport
                      angles={angles}
                      rootY={rootY}
                      selected={selected}
                      view={view}
                      viewNonce={viewNonce}
                      onSelect={setSelected}
                      onRotate={handleRotate}
                      onCaptureReady={handleCaptureReady}
                    />
                  </React.Suspense>
                ) : (
                  <ViewportPlaceholder text="Đang dựng khung 3D…" />
                )}

                {/* Nhắc cách dùng nằm ĐÈ LÊN canvas chứ không phải trong panel: người
                    ta nhìn vào chỗ đang bối rối, không nhìn sang cột bên. */}
                <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[rgb(17_20_24_/_0.72)] px-3 py-1 text-caption text-[rgb(255_255_255)]">
                  Bấm vào khớp để chọn · kéo vòng gizmo để xoay · kéo nền để quay camera · lăn chuột để zoom
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-caption text-fg-muted">Góc nhanh:</span>
                {CAMERA_VIEWS.map((v) => (
                  <Button
                    key={v.id}
                    size="sm"
                    variant={view === v.id ? "primary" : "secondary"}
                    onClick={() => handleView(v.id)}
                  >
                    {v.vi}
                  </Button>
                ))}
                <span className="mx-1 h-4 w-px bg-line" aria-hidden />
                <Button size="sm" variant="primary" onClick={shootManual}>
                  <Camera aria-hidden /> 📸 Chụp pose đã nắn
                </Button>
              </div>
            </div>

            <div className="flex max-h-[600px] flex-col gap-3 overflow-y-auto rounded-3 border border-line bg-surface p-3">
              <Button
                size="sm"
                variant="secondary"
                disabled={!dirty}
                onClick={() => applyPreset(poseId)}
              >
                <RotateCcw aria-hidden /> Reset về dáng gốc
              </Button>

              <div className={cn("rounded-2 px-2.5 py-2 text-caption", selected ? "bg-accent/[var(--kg-tint-a)] text-fg-strong" : "bg-raised text-fg-muted")}>
                {selected ? <>Đang chỉnh: <b>{joint(selected).label}</b></> : "Chưa chọn khớp nào — bấm vào manơcanh hoặc vào một dòng bên dưới."}
              </div>

              <JointPanel
                angles={angles}
                selected={selected}
                onSelect={setSelected}
                onAxisChange={handleAxis}
                rootY={rootY}
                onRootY={setRootY}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ViewportPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-body text-fg-muted">{text}</div>
  );
}
