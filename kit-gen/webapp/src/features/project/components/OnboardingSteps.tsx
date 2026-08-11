import { Link } from "@tanstack/react-router";
import { Download, Info, Pencil, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Gate } from "@/features/projects/lib/gate";

/**
 * TRẠNG THÁI EMPTY của S2 (§3-S2 bảng trạng thái, hàng "empty"):
 * project mới, 0 sheet ⇒ THAY TOÀN BỘ nội dung bằng khối hướng dẫn 3 bước, và
 * MA TRẬN KHÔNG HIỆN (một ma trận 0×0 chỉ làm user hoang mang).
 *
 * Spec chốt sẵn cả trạng thái nút: bước 1 primary → S3 · bước 2 và 3 xám, KÈM LÝ
 * DO ngay cạnh nút. §2.5-2 cấm ẩn nút, và một nút xám không nói vì sao thì cũng
 * tệ ngang việc ẩn — nên mỗi nút xám ở đây đều có dòng `ⓘ` giải thích.
 */
const STEPS = [
  {
    n: 1,
    title: "Tạo bản thiết kế",
    desc: "Chọn những thành phần cần có trong bộ kit.",
  },
  {
    n: 2,
    title: "Sinh ảnh",
    desc: "Tạo ảnh cho từng phần của bản thiết kế. Bước này dùng lượt tạo ảnh.",
    blockedBy: "Cần có bản thiết kế",
  },
  {
    n: 3,
    title: "Tải bộ kit",
    desc: "Sau khi cắt, tải bộ PNG trong suốt về máy.",
    blockedBy: "Cần ảnh đã cắt",
  },
] as const;

export function OnboardingSteps({ projectId, gate }: { projectId: string; gate: Gate }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="kg-onboarding-title">
      <div className="flex flex-col gap-1">
        <h2 id="kg-onboarding-title" className="text-title text-fg-strong">
          Bắt đầu từ đâu
        </h2>
        <p className="text-body text-fg">
          Dự án này chưa có nội dung thiết kế. Bắt đầu theo ba bước dưới đây.
        </p>
      </div>

      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n}>
            <Card className="flex h-full flex-col">
              <CardContent className="flex flex-1 flex-col gap-2 p-4">
                <span className="text-caption uppercase tracking-label text-fg-muted-raised">
                  Bước {s.n}
                </span>
                <h3 className="text-subtitle text-fg-strong">{s.title}</h3>
                <p className="flex-1 text-caption text-fg">{s.desc}</p>

                {s.n === 1 ? (
                  <div className="flex flex-col gap-1.5">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={gate.readOnly}
                      aria-disabled={gate.readOnly || undefined}
                      title={gate.readOnly ? gate.reason : undefined}
                      asChild={!gate.readOnly}
                    >
                      {gate.readOnly ? (
                        <>
                          <Pencil aria-hidden />
                          Tạo bản thiết kế
                        </>
                      ) : (
                        <Link to="/p/$projectId/design" params={{ projectId }} search={{ tab: "sheets" }}>
                          <Pencil aria-hidden />
                          Tạo bản thiết kế
                        </Link>
                      )}
                    </Button>
                    {gate.readOnly && <Reason text={gate.longReason} />}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Button variant="secondary" size="sm" disabled aria-disabled title={s.blockedBy}>
                      {s.n === 2 ? <Zap aria-hidden /> : <Download aria-hidden />}
                      {s.n === 2 ? "Sinh ảnh" : "Tải bộ kit"}
                    </Button>
                    <Reason text={s.blockedBy ?? ""} />
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Nút xám PHẢI nói lý do — không chỉ dựa vào tooltip (tooltip không tới được bàn phím trên mọi nền tảng). */
function Reason({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="flex items-start gap-1.5 text-caption text-fg-muted-raised">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
