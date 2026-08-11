/**
 * features/setup/hooks/use-setup-wizard.ts — TRẠNG THÁI CỦA WIZARD S0.
 *
 * Ba việc, không hơn:
 *  1. Bước hiện tại, có NHỚ QUA PHIÊN (Zustand persist của R0, khoá `kitgen.setup.v1`)
 *     ⇒ user tắt tab giữa chừng, mở lại vẫn đứng đúng chỗ.
 *  2. Tự tiến từ bước 1 sang bước 2 khi phát hiện agent — nhưng CHỈ MỘT LẦN và chỉ khi
 *     user chưa tự bấm đi đâu (xem `autoAdvancedRef`). Nếu tự nhảy mỗi lần agent nhấp
 *     nháy thì user đang đọc hướng dẫn sẽ bị giật màn hình.
 *  3. Ghi nhận kết quả khi xong: version + protocol đã thấy, enum mode tạo ảnh, cờ hoàn tất.
 *
 * KHÔNG lưu: lý do lỗi chi tiết, đường dẫn thật, bất cứ thứ gì liên quan đăng nhập.
 * Chỉ enum + boolean + nhãn rút gọn (arch §4.1). Bộ dò secret của R0 sẽ ném lỗi nếu
 * ai đó lỡ tay — nhưng state ở đây ngay từ đầu đã không có chỗ cho những thứ đó.
 */
import * as React from "react";
import { useSetupStore } from "@/lib/store";
import type { ImageGenMode } from "@/lib/types/api";
import {
  STEP_IDS, fromPersistedStep, stepAt, stepIndex, toPersistedStep, type WizardStep,
} from "../lib/steps";

export interface SetupWizard {
  step: WizardStep;
  index: number;
  /** bước đã đi qua ⇒ stepper cho bấm lùi (§3-S0). */
  visited: readonly WizardStep[];
  /** user đã từng hoàn tất setup và đang chạy lại (từ S6 → [Chạy lại hướng dẫn cài]). */
  rerun: boolean;
  goto: (s: WizardStep) => void;
  next: () => void;
  back: () => void;
  /** "Bỏ qua, tôi đã cài rồi" — §3-S0 nói rõ: nhảy tới bước 3 (Thư mục). */
  skipToWorkspace: () => void;
  /** Ghi nhận đã thấy agent (version/protocol) — KHÔNG tự đổi bước. */
  rememberAgent: (o: { version?: string | null; protocol?: number | null }) => void;
  /** Đánh dấu xong: ghi enum mode + cờ completed. */
  finish: (mode: ImageGenMode) => void;
  /** Bước 1 tự tiến sang bước 2 khi thấy agent — gọi từ SetupScreen. */
  autoAdvanceOnConnect: (connected: boolean) => void;
}

export function useSetupWizard(): SetupWizard {
  const persistedStep = useSetupStore((s) => s.step);
  const completed = useSetupStore((s) => s.completed);
  const setStep = useSetupStore((s) => s.setStep);
  const markImageGen = useSetupStore((s) => s.markImageGen);
  const complete = useSetupStore((s) => s.complete);
  const markConnected = useSetupStore((s) => s.markConnected);

  /**
   * Bước hiện tại sống ở state cục bộ, được KHỞI TẠO từ store rồi ghi ngược lại khi đổi.
   * Vì sao không đọc thẳng store: `markConnected` của R0 cố định nhảy sang "imagegen"
   * (xem lib/store/setup.ts) — nếu bước UI bám thẳng vào store thì việc ghi nhận version
   * sẽ kéo user nhảy 2 bước. Ở đây store là NƠI LƯU, không phải nguồn điều hướng.
   */
  const rerunRef = React.useRef(completed === true);
  const [step, setLocal] = React.useState<WizardStep>(() =>
    // Chạy lại wizard (đã completed) ⇒ vào thẳng bước 3 để đổi thư mục làm việc.
    rerunRef.current ? "workspace" : fromPersistedStep(persistedStep)
  );
  const [visited, setVisited] = React.useState<WizardStep[]>(() =>
    STEP_IDS.slice(0, stepIndex(rerunRef.current ? "workspace" : fromPersistedStep(persistedStep)))
  );
  const stepRef = React.useRef<WizardStep>(step);
  const autoAdvancedRef = React.useRef(false);
  const touchedRef = React.useRef(false);

  const goto = React.useCallback(
    (s: WizardStep) => {
      touchedRef.current = true;
      /* CHÚ Ý: KHÔNG gọi `setVisited` bên trong updater của `setLocal`. Hàm updater
         phải thuần — React StrictMode gọi nó hai lần và mọi tác dụng phụ bên trong sẽ
         chạy đôi. Dùng `stepRef` để biết bước trước mà không cần đọc state trong updater. */
      const prev = stepRef.current;
      if (prev !== s) {
        stepRef.current = s;
        setLocal(s);
        setVisited((v) => (v.includes(prev) ? v : [...v, prev]));
      }
      // Tới bước cuối CHƯA phải là "xong" — cờ `completed` chỉ do `finish()` đặt.
      setStep(toPersistedStep(s));
    },
    [setStep]
  );

  const next = React.useCallback(() => goto(stepAt(stepIndex(step) + 1)), [goto, step]);
  const back = React.useCallback(() => goto(stepAt(stepIndex(step) - 1)), [goto, step]);
  const skipToWorkspace = React.useCallback(() => goto("workspace"), [goto]);

  const rememberAgent = React.useCallback(
    (o: { version?: string | null; protocol?: number | null }) => {
      markConnected({
        version: o.version ?? "",
        protocol: typeof o.protocol === "number" ? o.protocol : 0,
      });
      // `markConnected` của R0 tự đặt step="imagegen"; trả lại bước thật để không nhảy cóc.
      setStep(toPersistedStep(step));
    },
    [markConnected, setStep, step]
  );

  const finish = React.useCallback(
    (mode: ImageGenMode) => {
      markImageGen(mode);
      complete();
    },
    [markImageGen, complete]
  );

  const autoAdvanceOnConnect = React.useCallback(
    (connected: boolean) => {
      if (!connected) return;
      if (autoAdvancedRef.current || touchedRef.current) return;
      if (step !== "install") return;
      autoAdvancedRef.current = true;
      goto("connect");
    },
    [goto, step]
  );

  return {
    step,
    index: stepIndex(step),
    visited,
    rerun: rerunRef.current,
    goto,
    next,
    back,
    skipToWorkspace,
    rememberAgent,
    finish,
    autoAdvanceOnConnect,
  };
}
