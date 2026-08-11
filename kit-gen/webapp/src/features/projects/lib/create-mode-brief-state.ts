/**
 * features/projects/lib/create-mode-brief-state.ts — STATE của khối "đọc đầu bài khách".
 *
 * Tách khỏi JSX để: (a) test được bằng vitest environment node, (b) `CreateProjectDialog`
 * không phình thêm 60 dòng state. Hook này **không** gọi API, không đọc đĩa, không lưu gì:
 * mọi thứ sống trong bộ nhớ của dialog và biến mất khi đóng (§1.4: draft chỉ trong memory).
 *
 * ⚠ KHÔNG persist nội dung brief. Đó là dữ liệu khách hàng; ghi vào localStorage/IndexedDB
 * sẽ để nó nằm lại trên máy sau khi tab đóng mà người dùng không biết. FE2-PLAN §4 cũng
 * cấm thêm khoá lưu trữ mới.
 */
import * as React from "react";
import {
  parseBriefText,
  type BriefReadFailure,
  type BriefSource,
  type BriefSummary,
} from "./create-mode-brief";
import type { BriefReadResult } from "@/features/docs/lib/brief-read";

export interface BriefIntakeState {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  source: BriefSource;
  setSource: (s: BriefSource) => void;
  fileName: string | null;
  pasted: string;
  setPasted: (v: string) => void;
  /** Đọc nội dung đã lấy được từ tệp. */
  readText: (text: string, fileName: string | null) => void;
  /** Lỗi mức hệ thống tệp (FileReader), khác lỗi nội dung. */
  failWith: (message: string, detail: string) => void;
  summary: BriefSummary | null;
  result: BriefReadResult | null;
  error: BriefReadFailure | null;
  reset: () => void;
}

export function useBriefIntake(): BriefIntakeState {
  const [enabled, setEnabledRaw] = React.useState(false);
  const [source, setSource] = React.useState<BriefSource>("file");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [pasted, setPastedRaw] = React.useState("");
  const [summary, setSummary] = React.useState<BriefSummary | null>(null);
  const [result, setResult] = React.useState<BriefReadResult | null>(null);
  const [error, setError] = React.useState<BriefReadFailure | null>(null);

  const clearRead = React.useCallback(() => {
    setSummary(null);
    setResult(null);
    setError(null);
  }, []);

  const reset = React.useCallback(() => {
    setEnabledRaw(false);
    setSource("file");
    setFileName(null);
    setPastedRaw("");
    clearRead();
  }, [clearRead]);

  const readText = React.useCallback((text: string, name: string | null) => {
    const out = parseBriefText(text, name);
    setFileName(name);
    if (out.ok) {
      setSummary(out.summary);
      setResult(out.result);
      setError(null);
    } else {
      setSummary(null);
      setResult(null);
      setError(out.error);
    }
  }, []);

  /** Ô dán: đọc lại mỗi lần gõ xong một nội dung có thể là JSON; rỗng ⇒ xoá kết quả cũ. */
  const setPasted = React.useCallback(
    (v: string) => {
      setPastedRaw(v);
      if (v.trim() === "") clearRead();
      else readText(v, null);
    },
    [clearRead, readText],
  );

  const setEnabled = React.useCallback(
    (v: boolean) => {
      setEnabledRaw(v);
      if (!v) {
        // Tắt khối ⇒ bỏ luôn dữ liệu đã đọc. Không giữ brief "ẩn" rồi âm thầm dùng lại.
        setFileName(null);
        setPastedRaw("");
        clearRead();
      }
    },
    [clearRead],
  );

  const failWith = React.useCallback((message: string, detail: string) => {
    setSummary(null);
    setResult(null);
    setError({ title: message, hint: "Bạn vẫn tạo được project bình thường mà không cần đầu bài.", detail });
  }, []);

  return {
    enabled, setEnabled, source, setSource, fileName, pasted, setPasted,
    readText, failWith, summary, result, error, reset,
  };
}
