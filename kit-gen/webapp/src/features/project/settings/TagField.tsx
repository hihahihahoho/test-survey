import * as React from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeTag } from "@/features/projects/lib/slug";
import { MAX_TAGS } from "./schema";

/**
 * Ô TAG của S2b (§3-S2b wireframe: `[tet ×] [banking ×] [+]`).
 *
 * Tag được chuẩn hoá bằng `normalizeTag` của S1 (bỏ dấu → chữ thường → gạch nối):
 * S1 lọc theo tag, nên nếu S2b cho lưu "Tết" mà S1 tìm "tet" thì chip lọc sẽ
 * không bao giờ khớp. Một luật, một hàm.
 *
 * §3.9 điều cấm 3 (không từ chối im lặng): mọi lần nhập trượt đều có chữ hiện ra
 * — trùng tag, quá 12 tag, hoặc gõ toàn ký tự bị bỏ ("!!!" → rỗng).
 *
 * A11y: nút xoá của mỗi tag là `<button>` có `aria-label` đầy đủ ("Bỏ tag tet");
 * `aria-live` cho câu lỗi để screen reader nghe được ngay khi bấm Enter.
 */
export function TagField({
  value,
  onChange,
  disabled,
  disabledReason,
}: {
  value: readonly string[];
  onChange: (tags: string[]) => void;
  disabled: boolean;
  disabledReason: string | undefined;
}) {
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const inputId = React.useId();
  const errId = `${inputId}-err`;

  const add = () => {
    const raw = draft.trim();
    if (raw === "") return;
    const tag = normalizeTag(raw);
    if (tag === null) {
      setError("Tag cần có ít nhất một chữ hoặc số.");
      return;
    }
    if (value.includes(tag)) {
      setError(`Đã có tag «${tag}».`);
      return;
    }
    if (value.length >= MAX_TAGS) {
      setError(`Tối đa ${MAX_TAGS} tag.`);
      return;
    }
    setError(null);
    setDraft("");
    onChange([...value, tag]);
  };

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5">
          {value.map((t) => (
            <li key={t}>
              <Badge tone="outline" className="gap-1 pr-1">
                <span>{t}</span>
                <button
                  type="button"
                  disabled={disabled}
                  aria-disabled={disabled || undefined}
                  title={disabled ? disabledReason : undefined}
                  aria-label={`Bỏ tag ${t}`}
                  onClick={() => onChange(value.filter((x) => x !== t))}
                  className="rounded-full p-0.5 text-fg-muted-raised transition-colors duration-fast hover:bg-raised hover:text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:text-fg-muted"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Input
            id={inputId}
            value={draft}
            disabled={disabled || value.length >= MAX_TAGS}
            placeholder={value.length === 0 ? "vd: tet, banking" : "thêm tag…"}
            aria-label="Thêm tag"
            aria-invalid={error !== null}
            aria-describedby={error ? errId : undefined}
            className="max-w-64"
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Enter trong ô tag KHÔNG được submit cả form (§3-S2b: Lưu là hành động
              // riêng, và submit sớm sẽ lưu mất một tag user chưa thêm xong).
              e.preventDefault();
              add();
            }}
          />
          {error !== null && (
            <p id={errId} role="alert" className="text-caption text-danger">
              {error}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="md"
          disabled={disabled || draft.trim() === "" || value.length >= MAX_TAGS}
          onClick={add}
        >
          <Plus aria-hidden />
          Thêm
        </Button>
      </div>

      <p className="text-caption text-fg-muted-raised">
        Tag dùng để lọc ở trang danh sách. Dấu tiếng Việt được bỏ tự động ({value.length}/{MAX_TAGS}).
      </p>
    </div>
  );
}
