import * as React from "react";
import { Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyableCode } from "@/components/common";
import { toast } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineBanner } from "../components/InlineBanner";
import { Disclosure } from "../components/Disclosure";
import { StepCard, StepShell, Note } from "../components/StepShell";
import { WaitingRow } from "../components/WaitingRow";
import { bashCmd, sha256sumCmd, shasumCmd } from "../lib/commands";
import { bytes } from "../lib/format";
import {
  SCRIPT_NAME, SEVEN_THINGS, downloadScript, scriptBytes, scriptSha256,
} from "../lib/installer-script";

/**
 * S0 · BƯỚC 1 — CÀI CÔNG CỤ (§3-S0 wireframe bước 1/4).
 *
 * Ràng buộc của spec, thi công đúng từng cái:
 *  · nút tải `kit-gen-setup.sh` + **SHA256 thật** + lệnh `shasum` để user tự đối chiếu;
 *  · **KHÔNG** `curl … | bash` — và nói thẳng ra trên UI vì sao;
 *  · accordion liệt kê ĐÚNG 7 việc script sẽ làm;
 *  · dòng "Đang chờ công cụ local… (tự phát hiện)" + nút [Tôi bị lỗi →];
 *  · lối "Bỏ qua, tôi đã cài rồi".
 *
 * 4 trạng thái ở bước này:
 *  loading — đang tính SHA256 (skeleton đúng 1 dòng, không đoán bừa số khối)
 *  success — đã thấy agent ⇒ banner xanh, mời sang bước 2
 *  error   — trình duyệt không cho tính chữ ký ⇒ NÓI THẬT, không hiện số bịa
 *  empty   — không có (wizard luôn có nội dung, đúng bảng trạng thái §3-S0)
 */
export interface StepInstallProps {
  connected: boolean;
  onNext: () => void;
  onTrouble: () => void;
}

export function StepInstall({ connected, onNext, onTrouble }: StepInstallProps) {
  const size = React.useMemo(() => scriptBytes().length, []);
  const [sha, setSha] = React.useState<string | null | undefined>(undefined);

  React.useEffect(() => {
    let alive = true;
    void scriptSha256().then((hex) => {
      if (alive) setSha(hex);
    });
    return () => {
      alive = false;
    };
  }, []);

  const onDownload = () => {
    const n = downloadScript();
    toast.success(`Đã tải ${SCRIPT_NAME}`, {
      description: `${bytes(n)} · mở bằng editor để đọc trước khi chạy`,
      duration: 5000,
    });
  };

  return (
    <StepShell
      title="Cài công cụ local"
      lead={
        <>
          Trang này chạy trong trình duyệt nên không tự đọc được ổ đĩa và không tự gọi được AI.
          Một script sẽ chuẩn bị máy giúp bạn: kiểm tra codex CLI, Python và các thư viện cắt ảnh.
        </>
      }
    >
      <StepCard step="1" title="Tải script">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" onClick={onDownload} data-kg-primary="">
            <Download aria-hidden />
            Tải {SCRIPT_NAME}
          </Button>
          <Note>1 file, {bytes(size)}, mã nguồn mở — mở bằng editor đọc được từng dòng</Note>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-label text-fg">
            <ShieldCheck className="size-3.5 text-accent-text" aria-hidden />
            SHA256 của đúng file bạn sắp tải
          </span>
          {sha === undefined && <Skeleton className="h-9 w-full rounded-2" />}
          {sha === null && (
            <Note>
              Trình duyệt này không cho tính chữ ký ở đây (cần https hoặc bản chạy tại máy). Bạn vẫn
              mở được toàn bộ script bằng editor để đọc trước khi chạy.
            </Note>
          )}
          {typeof sha === "string" && (
            <>
              <CopyableCode value={sha} label="Chữ ký SHA256 của script cài" />
              <Note>Chạy lệnh bên dưới rồi so hai chuỗi cho chắc chắn.</Note>
            </>
          )}
        </div>
      </StepCard>

      <StepCard step="2" title="Mở Terminal và chạy">
        <CopyableCode value={shasumCmd(SCRIPT_NAME)} label="Lệnh kiểm tra chữ ký (macOS)" />
        <Note>Trên Linux nếu không có `shasum`, dùng: </Note>
        <CopyableCode value={sha256sumCmd(SCRIPT_NAME)} label="Lệnh kiểm tra chữ ký (Linux)" />
        <CopyableCode value={bashCmd(SCRIPT_NAME)} label="Lệnh chạy script" />
        <Note>
          Chúng tôi KHÔNG dùng kiểu tải-và-chạy-một-dòng (curl rồi bash): bạn phải xem được file
          trước khi nó chạy trên máy mình.
        </Note>
      </StepCard>

      <Disclosure summary={`Script sẽ làm gì trên máy tôi? (${SEVEN_THINGS.length} việc, không cần sudo)`}>
        <ol className="flex list-decimal flex-col gap-1.5 pl-4">
          {SEVEN_THINGS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
        <Note>
          Script không đọc, không in và không gửi đi thông tin đăng nhập của bạn — việc kiểm đăng
          nhập chỉ là "file auth.json có tồn tại hay không".
        </Note>
      </Disclosure>

      <Disclosure summary="Tôi dùng Linux / không có Homebrew">
        <p>
          Script không dùng Homebrew. Nó chỉ cần bash, Node ≥ 20 và python3 có sẵn trên hệ thống.
          Trên Ubuntu/Debian, nếu thiếu module venv hãy cài gói <code className="font-mono">python3-venv</code>{" "}
          bằng trình quản lý gói của bạn rồi chạy lại script.
        </p>
      </Disclosure>

      {connected ? (
        <InlineBanner
          tone="success"
          title="Đã thấy công cụ local trên máy bạn"
          description="Không cần chạy script nữa — sang bước tiếp theo được rồi."
          actions={
            <Button variant="primary" onClick={onNext} data-kg-primary="">
              Tiếp: kiểm tra kết nối →
            </Button>
          }
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-4 border border-line-subtle bg-surface p-4">
          <WaitingRow
            label="Đang chờ công cụ local… (tự phát hiện, không cần bấm gì)"
            hint="Chúng tôi thử cổng 8765, 8766, 8767 trên chính máy bạn — không có dữ liệu nào ra Internet."
          />
          <Button variant="secondary" onClick={onTrouble}>
            Tôi bị lỗi →
          </Button>
        </div>
      )}
    </StepShell>
  );
}
