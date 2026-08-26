import * as React from "react";
import { ArrowLeft, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { GLAZE_PRESETS } from "@/features/kit-core/lib/glaze";

import { SIZE_PRESETS } from "./lib/cell-size";
import {
  DECOR_LEVELS,
  resetPresets,
  setPresets,
  usePresets,
  usePresetSyncError,
  type ElementPreset,
  type MascotPreset,
  type PresetBundle,
  type StylePreset,
} from "./lib/presets-store";
import { newId } from "./lib/composer-model";

/**
 * PresetsScreen — CRUD danh mục, lưu TRONG WORKSPACE KitGen.
 *
 * ╔══ VÌ SAO MÀN NÀY TỒN TẠI ════════════════════════════════════════════════╗
 * ║ Phần đắt nhất của ý tưởng Prompt Composer không phải cái editor — mà là   ║
 * ║ câu hỏi "danh mục element/phong cách của ĐỘI này gồm những gì". Nếu danh  ║
 * ║ mục đóng cứng trong code thì demo chỉ trả lời được "UI có đẹp không";     ║
 * ║ có màn này thì nó trả lời được "quy trình này dùng cho đội tôi được       ║
 * ║ không" — mà đó mới là thứ cần biết trước khi làm thật.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Kho đã rời localStorage sang `/api/library/presets` (Wave 4·A). Vì thế màn này
 * không còn hứa "một máy · một trình duyệt" nữa — nhưng nó có một nghĩa vụ MỚI:
 * ghi lên server CÓ THỂ HỎNG (agent tắt, workspace chỉ-đọc). Bản localStorage
 * hỏng thì cùng lắm mất lúc mở lại; bản này hỏng mà im lặng thì người dùng tưởng
 * đã lưu. Nên `usePresetSyncError()` được hiện thành một dòng cảnh báo ngay dưới
 * tiêu đề, không giấu trong console.
 */

/** Ô nhập dùng lại — form ở đây toàn là "sửa một chuỗi tại chỗ". */
function Field({
  label,
  value,
  onChange,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-caption text-fg-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-1 border border-line-subtle bg-canvas px-2 py-1.5 text-body text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
          mono ? "font-mono text-mono" : ""
        }`}
      />
    </label>
  );
}

function Row({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2 border border-line-subtle bg-raised p-3">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Xoá preset này"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-1 text-fg-muted hover:bg-surface hover:text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
    </div>
  );
}

function Section({
  title,
  description,
  onAdd,
  children,
}: {
  title: string;
  description: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-3 border border-line-subtle bg-surface p-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-title text-fg-strong">{title}</h2>
          <p className="text-caption text-fg-muted">{description}</p>
        </div>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={onAdd}>
          <Plus aria-hidden />
          Thêm
        </Button>
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

export function PresetsScreen() {
  const presets = usePresets();
  const syncError = usePresetSyncError();

  /* Ghi thẳng vào kho sau mỗi phím gõ, không có nút "Lưu".
     Cân nhắc có thật: một nút Lưu thì phải có state nháp, phải cảnh báo khi rời
     trang lúc chưa lưu, và phải xử lý ca "sửa ở tab này trong khi composer mở ở
     tab kia". Với một danh mục ngắn thì ghi ngay là ít đường sai hơn — và
     composer cập nhật tức thì, nên người dùng thấy hậu quả ngay chứ không phải
     đoán. */
  const patch = (next: Partial<PresetBundle>) => setPresets({ ...presets, ...next });

  const updateStyle = (id: string, next: Partial<StylePreset>) =>
    patch({ styles: presets.styles.map((item) => (item.id === id ? { ...item, ...next } : item)) });

  const updateElement = (id: string, next: Partial<ElementPreset>) =>
    patch({ elements: presets.elements.map((item) => (item.id === id ? { ...item, ...next } : item)) });

  const updateMascot = (id: string, next: Partial<MascotPreset>) =>
    patch({ mascots: presets.mascots.map((item) => (item.id === id ? { ...item, ...next } : item)) });

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/lab/prompt-composer">
              <ArrowLeft aria-hidden />
              Về Composer
            </Link>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => {
              resetPresets();
              toast.success("Đã khôi phục danh mục mặc định");
            }}
          >
            <RotateCcw aria-hidden />
            Khôi phục mặc định
          </Button>
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="text-display-2 text-fg-strong">Preset của lab</h1>
          <p className="text-body text-fg-muted">
            Danh mục mà Composer đọc. Lưu trong <strong className="text-fg-strong">workspace KitGen</strong> — cạnh
            contract, nên nó theo cả đội chứ không theo một trình duyệt. Sửa là ghi ngay, không có nút Lưu.
          </p>
          {/* Ghi lên server hỏng thì PHẢI nói ra: người dùng không có nút Lưu để
              thử lại, nên "tưởng đã lưu mà chưa" là hỏng tệ nhất ở màn này. */}
          {syncError ? (
            <p role="alert" className="rounded-2 border border-danger/60 bg-danger/10 px-3 py-2 text-caption text-danger">
              Chưa ghi được danh mục lên workspace: {syncError}. Bản đang hiện vẫn đúng thứ bạn vừa gõ; sửa tiếp một
              lần nữa sẽ thử ghi lại.
            </p>
          ) : null}
        </header>

        <Section
          title="Phong cách"
          description="Pill “phong cách” trong Composer đọc danh sách này. Cụm tiếng Anh là thứ đi thẳng vào prompt."
          onAdd={() => patch({ styles: [...presets.styles, { id: newId("style"), vi: "Phong cách mới", en: "" }] })}
        >
          {presets.styles.map((preset) => (
            <Row key={preset.id} onRemove={() => patch({ styles: presets.styles.filter((s) => s.id !== preset.id) })}>
              <Field label="Tên (VI)" value={preset.vi} onChange={(vi) => updateStyle(preset.id, { vi })} />
              <Field
                label="Cụm tiếng Anh vào prompt"
                mono
                value={preset.en}
                onChange={(en) => updateStyle(preset.id, { en })}
                placeholder="soft rounded 3D clay-like objects…"
              />
            </Row>
          ))}
        </Section>

        <Section
          title="Element của bộ UI"
          description="Sinh ra các món trong block Bộ UI, kèm mức viền · đục nền · cỡ áp sẵn."
          onAdd={() =>
            patch({
              elements: [
                ...presets.elements,
                { id: newId("element"), vi: "Element mới", en: "", decor: 4, glazeId: "", sizeId: "" },
              ],
            })
          }
        >
          {presets.elements.map((preset) => (
            <Row
              key={preset.id}
              onRemove={() => patch({ elements: presets.elements.filter((e) => e.id !== preset.id) })}
            >
              <Field label="Tên (VI)" value={preset.vi} onChange={(vi) => updateElement(preset.id, { vi })} />
              {/* DANH TỪ, không phải câu mô tả — xem khối chú thích của
                  `ElementPreset.en`. Nhãn và placeholder nói ĐÚNG điều đó, vì đây
                  là chỗ duy nhất người dùng gõ chữ ấy ra. */}
              <Field
                label="Danh từ tiếng Anh"
                mono
                value={preset.en}
                onChange={(en) => updateElement(preset.id, { en })}
                placeholder="button · popover · health bar…"
              />
              <label className="flex flex-col gap-1">
                <span className="text-caption text-fg-muted">Mức viền</span>
                <select
                  value={String(preset.decor)}
                  onChange={(event) => updateElement(preset.id, { decor: Number(event.target.value) })}
                  className="rounded-1 border border-line-subtle bg-canvas px-2 py-1.5 text-body text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {DECOR_LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.vi}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-caption text-fg-muted">Đục nền mặc định</span>
                <select
                  value={preset.glazeId}
                  onChange={(event) => updateElement(preset.id, { glazeId: event.target.value })}
                  className="rounded-1 border border-line-subtle bg-canvas px-2 py-1.5 text-body text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  <option value="">— không đục —</option>
                  {GLAZE_PRESETS.map((glaze) => (
                    <option key={glaze.id} value={glaze.id}>
                      {glaze.vi}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-caption text-fg-muted">Cỡ mặc định</span>
                <select
                  value={preset.sizeId}
                  onChange={(event) => updateElement(preset.id, { sizeId: event.target.value })}
                  className="rounded-1 border border-line-subtle bg-canvas px-2 py-1.5 text-body text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {/* Chỉ preset: ô tự điền là chuyện của TỪNG DÒNG trong thẻ, không
                      phải của danh mục — một cỡ pixel cụ thể áp cho mọi bộ kit dùng
                      món này là đóng cứng hình học vào một danh mục dùng chung. */}
                  <option value="">— theo hệ thống —</option>
                  {SIZE_PRESETS.map((size) => (
                    <option key={size.id} value={size.id}>
                      {size.vi} · {size.w}×{size.h}px
                    </option>
                  ))}
                </select>
              </label>
            </Row>
          ))}
        </Section>

        <Section
          title="Nhân vật mẫu"
          description="Mô tả nhân vật dùng lại. Ảnh chỉ ghi TÊN — ảnh thật vẫn chọn ở pill trong block (lab không lưu ảnh)."
          onAdd={() =>
            patch({ mascots: [...presets.mascots, { id: newId("mascot"), vi: "Nhân vật mới", en: "", refName: "" }] })
          }
        >
          {presets.mascots.map((preset) => (
            <Row key={preset.id} onRemove={() => patch({ mascots: presets.mascots.filter((m) => m.id !== preset.id) })}>
              <Field label="Tên (VI)" value={preset.vi} onChange={(vi) => updateMascot(preset.id, { vi })} />
              <Field
                label="Mô tả tiếng Anh"
                mono
                value={preset.en}
                onChange={(en) => updateMascot(preset.id, { en })}
                placeholder="a friendly rounded mascot character…"
              />
              <Field
                label="Tên ảnh tham chiếu"
                value={preset.refName}
                onChange={(refName) => updateMascot(preset.id, { refName })}
                placeholder="mascot-v3.png"
              />
            </Row>
          ))}
        </Section>
      </div>
    </div>
  );
}
