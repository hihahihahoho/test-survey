import { LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCodexAccount, useCodexLogout } from "@/lib/hooks";

/**
 * "ĐANG ĐĂNG NHẬP LÀ AI" + NÚT ĐĂNG XUẤT — mảnh còn thiếu của vòng đời tài khoản.
 *
 * Trước đây app chỉ có nửa vòng: đăng nhập xong là "xanh", nhưng xanh CỦA AI thì
 * không nơi nào nói, và muốn thoát ra (đổi tài khoản, máy dùng chung) là phải mở
 * Terminal. Quyết định của chủ sản phẩm 24/08/2026: hiện email + cho đăng xuất.
 *
 * Ranh giới giữ nguyên: web chỉ nhận email · tên · enum gói cước · nhãn `~/…` từ
 * `GET /api/codex/account` (token không có đường ra khỏi agent — xem
 * `agent/lib/codex-account.mjs`), và không lưu gì vào localStorage.
 *
 * TỰ ẨN khi chưa đăng nhập: màn nào cũng đã có khối đăng nhập riêng
 * (`CodexLoginPanel`), thẻ này mà hiện "chưa đăng nhập" nữa là hai khối cãi nhau.
 */
export function CodexAccountRow() {
  const account = useCodexAccount();
  const logout = useCodexLogout();
  const a = account.data;
  if (!a?.loggedIn) return null;

  const who = a.email ?? a.name ?? "Tài khoản Codex";
  const sub = [
    a.planType ? `gói ${a.planType}` : null,
    a.codexHomeLabel ? `hồ sơ ${a.codexHomeLabel}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2 border border-line-subtle bg-canvas p-3">
      <div className="flex min-w-0 items-center gap-2">
        <UserRound className="size-4 shrink-0 text-fg-muted" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-body text-fg-strong">{who}</p>
          {sub && <p className="truncate font-mono text-caption text-fg-muted">{sub}</p>}
        </div>
      </div>
      <Button variant="ghost" loading={logout.isPending} onClick={() => logout.mutate()}>
        {!logout.isPending && <LogOut aria-hidden />}
        Đăng xuất
      </Button>
    </div>
  );
}
