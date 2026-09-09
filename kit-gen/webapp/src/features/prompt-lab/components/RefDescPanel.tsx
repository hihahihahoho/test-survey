import * as React from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRefDesc, useRefs, useSaveRefDesc } from "@/lib/hooks";
import type { RefDescRole } from "@/lib/types/api";

/**
 * RefDescPanel — TẤM ẢNH NÀY TỚI MÁY VẼ BẰNG ĐƯỜNG NÀO, VÀ BẰNG NHỮNG CHỮ NÀO.
 *
 * ╔══ VÌ SAO MỘT DÒNG CAPTION VÀ MỘT Ô SOẠN LẠI ĐÁNG CÓ MẶT Ở ĐÂY ═══════════╗
 * ║ `gen.sh` rẽ hai đường theo NỀN của chính tấm ảnh:                         ║
 * ║  · nền TRONG SUỐT thật ⇒ đính thẳng vào lời gọi image_gen — giống nhất,   ║
 * ║    không tốn thêm lượt codex nào;                                         ║
 * ║  · nền ĐỤC ⇒ một lượt codex nhìn ảnh rồi TẢ THÀNH CHỮ, và máy vẽ chỉ thấy ║
 * ║    đoạn chữ ấy (đính một tấm ảnh đục vào là kéo cả sheet về RGB, mất nền  ║
 * ║    trong suốt của mọi ô — đo được 09/09/2026).                            ║
 * ║ Chủ sản phẩm hỏi *"con nhân vật nó khác với con nhân vật ref"* đúng ở ca  ║
 * ║ thứ hai: thứ quyết định độ giống không phải tấm ảnh nữa mà là ĐOẠN VĂN —  ║
 * ║ và cho tới bản này thì đoạn văn ấy không có cửa nào để đọc, chứ đừng nói  ║
 * ║ sửa. Nên hai thứ ở đây: NÓI RA đang đi đường nào, và MỞ đoạn văn ra.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ CHỈ DÙNG CHO PILL NHÂN VẬT, và đó là một giới hạn có lý do chứ không phải
 * một việc còn dở. Luật "trong suốt thì đính, đục thì tả" chỉ đúng với tấm CẦN
 * nền trong suốt; tấm cảnh nền full-bleed thì đính TẤT CẢ, kể cả ảnh đục. Một
 * tấm ảnh phong cách đi vào cả hai loại sheet cùng lúc, nên một dòng caption
 * khẳng định "ảnh này sẽ được tả thành chữ" ở đó là nói đúng một nửa. Lưới nhân
 * vật thì không bao giờ full-bleed, nên ở đây câu ấy luôn đúng.
 */
export function RefDescPanel({
  projectId,
  refName,
  role,
}: {
  projectId: string | null;
  refName: string;
  role: RefDescRole;
}) {
  const refs = useRefs(projectId);
  const desc = useRefDesc(projectId, refName);
  const save = useSaveRefDesc(projectId ?? "", refName);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const alpha = refs.data?.items.find((item) => item.name === refName)?.alpha === true;
  const text = desc.data?.text ?? "";

  const open = () => {
    setDraft(text);
    setEditing(true);
  };

  return (
    <span className="flex flex-col gap-2 border-t border-line-subtle pt-3">
      {/* ĐƯỜNG ĐI, nói bằng một câu người dùng đọc được — không phải "alpha
          channel present". Điều họ cần biết là ảnh của mình tới máy vẽ nguyên
          vẹn hay đi qua một lượt phiên dịch. */}
      <span className="text-caption text-fg-muted">
        {alpha
          ? "Ảnh nền trong suốt: sẽ đính thẳng cho máy vẽ"
          : "Ảnh nền đục: máy vẽ nhận mô tả bằng chữ"}
      </span>

      {/* Ảnh đính thẳng thì đoạn mô tả KHÔNG được dùng — bày một ô soạn cho nó là
          mời người ta viết một thứ sẽ không đi đâu cả. */}
      {!alpha && (
        <>
          <span className="flex items-center gap-2">
            <span className="text-caption text-fg-muted">Mô tả cho máy vẽ</span>
            {!editing && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={open}>
                <Pencil aria-hidden strokeWidth={1.5} />
                {text ? "Sửa" : "Viết"}
              </Button>
            )}
          </span>

          {editing ? (
            <>
              <textarea
                autoFocus
                rows={6}
                value={draft}
                aria-label={`Mô tả cho máy vẽ của ${refName}`}
                placeholder="Tả con này cho hoạ sĩ chưa từng thấy ảnh: tỉ lệ, đầu và mặt, màu theo vùng kèm mã hex, dấu hiệu nhận dạng…"
                onChange={(event) => setDraft(event.target.value)}
                className={cn(
                  "w-full resize-none rounded-1 border border-line bg-raised px-2 py-1.5 text-body text-fg-strong",
                  "outline-none placeholder:text-fg-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
                )}
              />
              <span className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={save.isPending}
                  onClick={() => {
                    save.mutate(
                      { text: draft.trim(), role },
                      { onSuccess: () => setEditing(false) },
                    );
                  }}
                >
                  Lưu mô tả
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Huỷ
                </Button>
                {/* Chữ rỗng KHÔNG phải một mô tả rỗng: agent xoá file cache đi và
                    lượt Vẽ tới tả lại như mới. Nói ra để người ta biết cách quay
                    về mà không phải đoán. */}
                <span className="ml-auto text-caption text-fg-muted">
                  {draft.trim() === "" ? "Để trống = máy tự tả lại" : "Chữ của bạn, máy không tả đè"}
                </span>
              </span>
            </>
          ) : (
            <span className="text-caption text-fg">
              {text || "Chưa có — sẽ tự tả ở lượt Vẽ đầu"}
            </span>
          )}

          {/* Ảnh đã bị thay sau khi mô tả được viết ⇒ chữ đang hiện tả một con vật
              khác. Im lặng ở đây là để người dùng tin vào một đoạn văn đã chết. */}
          {!editing && desc.data?.stale && text !== "" && (
            <span className="text-caption text-fg-muted">Ảnh đã đổi từ lúc viết — lượt Vẽ tới sẽ tả lại.</span>
          )}
          {save.isError && (
            <span className="text-caption text-fg-muted">Không lưu được mô tả. Thử lại nhé.</span>
          )}
        </>
      )}
    </span>
  );
}
