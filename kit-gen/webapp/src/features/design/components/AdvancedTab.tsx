import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contractVariants, type Contract } from "@/lib/types/contract";
import { SLICE_CONST } from "../lib/shapes";
import { Field } from "./Field";

/**
 * TAB "NÂNG CAO" — `?tab=advanced` (§3-S3.6). Đóng C8 và F4.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TRUNG THỰC VỀ THỨ KHÔNG CHẠY — đây là điểm quan trọng nhất của tab này.
 * ════════════════════════════════════════════════════════════════════════════
 * `teams/design/INTEGRATION.md §5` (mục M4) nói rõ: tab này ở bản vanilla "thi công
 * xong nhưng KHÔNG CÓ TÁC DỤNG THẬT" với `bleed` và `quality`, vì `slice.py` để
 * `BLEED` là HẰNG SỐ MODULE và tự dò ViTMatte. Tôi ĐÃ KIỂM LẠI TRÊN MÃ NGUỒN, không
 * tin lời truyền miệng — `scripts/extract-shapes.mjs` rút ra
 * `SLICE_CONST.bleedIsModuleConstant`, và `__tests__/shape-source.test.ts` khẳng định
 * `slice.py` KHÔNG có `style.get("bleed")` ở đâu cả.
 *
 * Xử lý: KHÔNG giấu ô nhập (giá trị vẫn được lưu, engine mới sẽ dùng được), nhưng
 * mỗi ô vô hiệu đeo badge «chưa có tác dụng» + một câu giải thích. Hứa suông với
 * user tệ hơn nhiều so với nói thẳng là tính năng chưa tới.
 *
 * Ngược lại, `threshold`/`grow_threshold` CÓ tác dụng thật (slice.py:643–644 đọc theo
 * từng style) — hai ô đó không đeo badge.
 */
export interface AdvancedTabProps {
  contract: Contract;
  readOnly: boolean;
  readOnlyReason: string;
  /** doctor.python.deps — cho biết máy có ViTMatte/PyMatting hay không. `null` = chưa hỏi. */
  deps?: Record<string, boolean> | null;
  onPatchSlice: (patch: { threshold?: number; grow_threshold?: number; bleed?: number; quality?: "fast" | "high" }) => void;
  onCheckMachine: () => void;
}

const DEFAULTS = {
  threshold: SLICE_CONST.threshold ?? 52,
  growOffset: SLICE_CONST.growOffset ?? 60,
  bleed: SLICE_CONST.bleed ?? 0.18,
};

export function AdvancedTab({
  contract, readOnly, readOnlyReason, deps, onPatchSlice, onCheckMachine,
}: AdvancedTabProps) {
  const disProps = readOnly ? { disabled: true, title: readOnlyReason } : {};
  const variants = contractVariants(contract);
  const slice = contract.slice ?? {};

  const threshold = num(slice.threshold, num((variants[0] as { threshold?: number } | undefined)?.threshold, DEFAULTS.threshold));
  const grow = num(slice.grow_threshold, num((variants[0] as { grow_threshold?: number } | undefined)?.grow_threshold, threshold + DEFAULTS.growOffset));
  const bleed = num(slice.bleed, DEFAULTS.bleed);
  const vitmatte = deps?.vitmatte ?? deps?.transformers ?? null;
  const pymatting = deps?.pymatting ?? null;

  return (
    <div className="flex max-w-3xl flex-col gap-4 p-4">
      {/* ── Tham số cắt ── */}
      <Card>
        <CardHeader>
          <CardTitle>Tham số cắt ảnh</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="adv-threshold"
              label="Ngưỡng tách"
              hint={`Mặc định ${DEFAULTS.threshold}. Càng cao càng ăn nhiều nền (và dễ ăn cả element).`}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="number"
                  min={10}
                  max={400}
                  step={5}
                  value={threshold}
                  aria-describedby={describedBy}
                  {...disProps}
                  onChange={(e) => onPatchSlice({ threshold: Number(e.target.value) })}
                />
              )}
            </Field>
            <Field
              id="adv-grow"
              label="Ngưỡng nghiêm"
              hint={`Mặc định = ngưỡng tách + ${DEFAULTS.growOffset}.`}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="number"
                  min={10}
                  max={500}
                  step={5}
                  value={grow}
                  aria-describedby={describedBy}
                  {...disProps}
                  onChange={(e) => onPatchSlice({ grow_threshold: Number(e.target.value) })}
                />
              )}
            </Field>
          </div>
          <p className="text-caption text-fg-muted-raised">
            Hai ô trên được ghi cho <strong>mọi phong cách</strong> và engine đọc thật khi cắt.
          </p>

          {/* ── M4: ô KHÔNG có tác dụng, nói thẳng ── */}
          <div className="flex flex-col gap-2 rounded-2 border border-dashed border-line p-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="adv-bleed">Vành ngoài ô</Label>
              <Badge tone="warn">chưa có tác dụng</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="adv-bleed"
                type="number"
                min={0}
                max={0.5}
                step={0.01}
                value={bleed}
                className="w-32"
                aria-describedby="adv-bleed-why"
                {...disProps}
                onChange={(e) => onPatchSlice({ bleed: Number(e.target.value) })}
              />
              <span className="text-caption text-fg-muted-raised">
                = {Math.round(bleed * 100)}% cạnh ô, cho phần trang trí tràn ra.
              </span>
            </div>
            <p id="adv-bleed-why" className="flex items-start gap-2 text-caption text-on-tint-warn">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                <strong>Đổi số này chưa làm thay đổi kết quả cắt.</strong> Bản engine hiện tại cố định vành ngoài ở{" "}
                {DEFAULTS.bleed} và chưa đọc giá trị từ bản thiết kế. Giá trị bạn nhập vẫn được lưu để dùng khi engine
                hỗ trợ, nhưng đừng trông đợi ảnh cắt khác đi ở lần chạy tới.
              </span>
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 self-start"
            {...disProps}
            onClick={() =>
              onPatchSlice({
                threshold: DEFAULTS.threshold,
                grow_threshold: DEFAULTS.threshold + DEFAULTS.growOffset,
                bleed: DEFAULTS.bleed,
              })
            }
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Trả về mặc định
          </Button>
        </CardContent>
      </Card>

      {/* ── Chất lượng tách ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Chất lượng tách
            <Badge tone="warn">chưa chọn được</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-caption text-on-tint-warn">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              Engine <strong>tự dò</strong> thư viện có sẵn trên máy và chọn cách tách tốt nhất — không có công tắc để
              ép. Muốn chất lượng cao hơn thì cài thêm thư viện, không phải đổi thiết lập ở đây.
            </span>
          </p>
          <dl className="flex flex-col gap-1 text-caption">
            <MachineRow label="ViTMatte (chất lượng cao nhất, ~2 GB)" ok={vitmatte} />
            <MachineRow label="PyMatting (tách mềm, nhẹ)" ok={pymatting} />
          </dl>
          <Button variant="secondary" size="sm" className="self-start" onClick={onCheckMachine}>
            Kiểm tra máy
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function MachineRow({ label, ok }: { label: string; ok: boolean | null }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="text-fg">{label}</dt>
      <dd className="ml-auto">
        {ok === null ? (
          <span className="text-fg-muted-raised">chưa kiểm tra</span>
        ) : ok ? (
          <Badge tone="ok">✓ đã cài</Badge>
        ) : (
          <Badge tone="never">✗ chưa cài</Badge>
        )}
      </dd>
    </div>
  );
}

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
