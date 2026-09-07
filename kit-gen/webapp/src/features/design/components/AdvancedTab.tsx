import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SLICE_CONST } from "../lib/shapes";

/**
 * TAB "NÂNG CAO" — `?tab=advanced` (§3-S3.6).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TRUNG THỰC VỀ THỨ KHÔNG CHẠY — vẫn là điểm quan trọng nhất của tab này, chỉ là
 * sự thật đã đổi (07/09/2026).
 * ════════════════════════════════════════════════════════════════════════════
 * Tab này từng bày bốn núm: «Ngưỡng tách», «Ngưỡng nghiêm», «Vành ngoài ô» và
 * «Chất lượng tách» (ViTMatte / PyMatting). Cả bốn thuộc về một cỗ máy TÁCH NỀN
 * mà `slice.py` không còn chạy: model trả PNG có alpha thật, nên dao cắt chỉ còn
 * crop theo toạ độ ô — không ngưỡng, không mask, không thư viện matting nào.
 *
 * Giữ lại những núm ấy là hứa suông ở mức tệ nhất: người dùng chỉnh «ngưỡng tách»,
 * chạy lại, ảnh y hệt, và không có gì giải thích. Nên chúng bị BỎ, và chỗ đó nói
 * thẳng vì sao. `SLICE_CONST` đọc thật từ `slice.py` (`scripts/extract-shapes.mjs`)
 * nên nếu ai đó cắm lại một tham số vào engine thì con số ở đây khác `null` ngay
 * và câu chữ dưới đây thành sai — `__tests__/shape-source.test.ts` canh chỗ đó.
 */
export interface AdvancedTabProps {
  onCheckMachine: () => void;
}

/** Engine còn đọc tham số cắt nào không? Rút thẳng từ `slice.py`, không đoán. */
const CO_THAM_SO =
  SLICE_CONST.threshold !== null || SLICE_CONST.growOffset !== null || SLICE_CONST.bleed !== 0;

export function AdvancedTab({ onCheckMachine }: AdvancedTabProps) {
  return (
    <div className="flex max-w-3xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Tham số cắt ảnh</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-caption text-on-tint-warn">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              {CO_THAM_SO ? (
                <>
                  <strong>Engine vừa mọc lại tham số cắt.</strong> Màn này chưa bày ra — mở{" "}
                  <code>slice.py</code> để xem đang có gì.
                </>
              ) : (
                <>
                  <strong>Không còn tham số nào để chỉnh.</strong> Máy vẽ trả ảnh có nền trong suốt
                  sẵn, nên bước cắt chỉ còn cắt theo toạ độ ô — không ngưỡng tách, không vành ngoài,
                  không thư viện tách nền. Ảnh ra sao là do <em>prompt</em> quyết, không phải do
                  thiết lập ở đây.
                </>
              )}
            </span>
          </p>
          <p className="text-caption text-fg-muted-raised">
            Muốn ô ra khác đi thì sửa mô tả của ô, cỡ đầu ra, hoặc bố cục tấm ở tab «Tấm».
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Máy của bạn</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-caption text-fg-muted-raised">
            Bước cắt chỉ cần Python + Pillow. Hai thư viện tách nền nặng (ViTMatte ~2 GB,
            PyMatting) đã bỏ khỏi engine lẫn bộ cài — không cần cài, và cài cũng không đổi gì.
          </p>
          <Button variant="secondary" size="sm" className="self-start" onClick={onCheckMachine}>
            Kiểm tra máy
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
