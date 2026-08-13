/**
 * TOGGLE "Hồ sơ Codex dùng để tạo ảnh" (Cài đặt → Tạo ảnh).
 *
 * Hai tầng được kiểm ở đây:
 *   1. LOGIC (`lib/image-profile`) — hồ sơ nào đang được chọn, nhãn home nào được phép
 *      hiện. Đây là chỗ dễ sai nhất: `mode` là kết quả DÒ, `profile` mới là LỰA CHỌN.
 *   2. RENDER — thẻ thật sự vẽ ra 2 nút và đánh dấu đúng nút đang bật.
 *
 * Giới hạn giống `update-check.test.tsx`: repo chưa có jsdom/@testing-library nên dùng
 * `renderToString`. Vì vậy phần "bấm nút → gọi PATCH" được kiểm ở tầng agent
 * (`agent/test/suite-system.mjs`, nhóm "hồ sơ tạo ảnh"): ở đó mới chứng minh được điều
 * quan trọng nhất — lựa chọn LƯU BỀN vào `<workspace>/.kitgen/config.json`.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConnectionStatus } from "@/lib/api";
import type { Doctor } from "@/lib/types/api";
import { IMAGE_PROFILES, imageProfileView, optionOf, selectedProfile, selectedWire } from "../lib/image-profile";
import { ImageProfileToggle } from "../components/ImageProfileToggle";

const CONNECTED = { connected: true, pill: "connected" } as unknown as ConnectionStatus;
const OFFLINE = { connected: false, pill: "not-found" } as unknown as ConnectionStatus;

function doctorWith(imageGen: Record<string, unknown>): Doctor {
  return {
    codex: { ok: true, version: "0.147.0" },
    imageGen: { available: false, mode: "unknown", ...imageGen },
  } as unknown as Doctor;
}

describe("hồ sơ tạo ảnh — chọn hồ sơ nào", () => {
  it("dùng `profile` (lựa chọn đã lưu) chứ không phải `mode` (kết quả dò)", () => {
    // Ca quan trọng nhất: đã chọn ~/.codex-img nhưng chưa `codex login` ⇒ mode=unavailable.
    // Nếu toggle bám `mode`, nút sẽ tự nhảy về "mặc định" ngay sau khi user bấm.
    const d = doctorWith({ profile: "img-home", mode: "unavailable", available: false, authPresent: false });
    expect(selectedProfile(d)).toBe("img-home");
    expect(selectedWire(d)).toBe("separate");
  });

  it("agent cũ chưa có `profile` ⇒ suy ra từ `mode`, và chỉ khi mode nói rõ là img-home", () => {
    expect(selectedProfile(doctorWith({ mode: "img-home", available: true }))).toBe("img-home");
    expect(selectedProfile(doctorWith({ mode: "default-home", available: true }))).toBe("default-home");
    // "unavailable"/"unknown" KHÔNG đủ căn cứ ⇒ không được đoán bừa là hồ sơ riêng.
    expect(selectedProfile(doctorWith({ mode: "unavailable" }))).toBe("default-home");
    expect(selectedProfile(doctorWith({ mode: "unknown" }))).toBe("default-home");
  });

  it("không có doctor (agent tắt) ⇒ mặc định, không văng lỗi", () => {
    expect(selectedProfile(null)).toBe("default-home");
    expect(selectedProfile(undefined)).toBe("default-home");
  });

  it("hai hồ sơ đúng tên thư mục, và `wire` khớp enum của agent", () => {
    expect(IMAGE_PROFILES.map((o) => o.home)).toEqual(["~/.codex", "~/.codex-img"]);
    expect(IMAGE_PROFILES.map((o) => o.wire)).toEqual(["default", "separate"]);
    expect(optionOf("img-home").label).toContain("~/.codex-img");
  });
});

describe("hồ sơ tạo ảnh — nhãn đường dẫn và trạng thái", () => {
  it("hiện nhãn rút gọn của doctor khi hợp lệ", () => {
    const v = imageProfileView(doctorWith({ profile: "img-home", mode: "img-home", available: true, codexHomeLabel: "~/.codex-img" }));
    expect(v.homeLabel).toBe("~/.codex-img");
    expect(v.homeLabelFromDoctor).toBe(true);
    expect(v.tone).toBe("ok");
    expect(v.status).toContain("Sẵn sàng");
  });

  it("path TUYỆT ĐỐI từ doctor bị bỏ (PII) — quay về nhãn tĩnh của hồ sơ", () => {
    const v = imageProfileView(doctorWith({ profile: "img-home", codexHomeLabel: "/Users/ai-do/.codex-img" }));
    expect(v.homeLabel).toBe("~/.codex-img");
    expect(v.homeLabelFromDoctor).toBe(false);
    expect(v.status).not.toContain("/Users/");
  });

  it("hồ sơ riêng chưa đăng nhập ⇒ needsLogin, câu chữ chỉ đường tới Terminal", () => {
    const v = imageProfileView(doctorWith({ profile: "img-home", mode: "unavailable", available: false, authPresent: false }));
    expect(v.needsLogin).toBe(true);
    expect(v.tone).toBe("warn");
    expect(v.status).toContain("Chưa đăng nhập");
  });

  it("đã có auth nhưng vẫn chưa tạo được ảnh ⇒ KHÔNG đổ oan là chưa đăng nhập", () => {
    const v = imageProfileView(doctorWith({ profile: "img-home", mode: "unavailable", available: false, authPresent: true }));
    expect(v.needsLogin).toBe(false);
    expect(v.status).toContain("Chưa tạo được ảnh");
  });

  it("agent tắt ⇒ nói 'chưa kiểm tra được', không phải 'chưa tạo được ảnh'", () => {
    const v = imageProfileView(null, { connected: false });
    expect(v.tone).toBe("muted");
    expect(v.status).toContain("công cụ local đang tắt");
  });
});

function render(doctorData: Doctor | undefined, status: ConnectionStatus): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const doctorQuery = {
    data: doctorData, error: null, isLoading: false, refetch: vi.fn(),
  } as unknown as Parameters<typeof ImageProfileToggle>[0]["doctor"];
  return renderToString(
    <QueryClientProvider client={qc}>
      <ImageProfileToggle doctor={doctorQuery} status={status} />
    </QueryClientProvider>,
  );
}

describe("hồ sơ tạo ảnh — thẻ vẽ ra thật", () => {
  it("vẽ đủ 2 lựa chọn với tên thư mục thật", () => {
    const html = render(doctorWith({ profile: "default-home", mode: "default-home", available: true }), CONNECTED);
    expect(html).toContain("~/.codex (mặc định)");
    expect(html).toContain("~/.codex-img (home ảnh riêng)");
  });

  it("đánh dấu đúng nút đang bật theo hồ sơ đã lưu (aria-pressed/data-state)", () => {
    const html = render(doctorWith({ profile: "img-home", mode: "unavailable", available: false, authPresent: false }), CONNECTED);
    const on = html.match(/data-state="on"[^>]*aria-label="([^"]+)"/) ?? html.match(/aria-label="([^"]+)"[^>]*data-state="on"/);
    expect(on?.[1]).toBe("~/.codex-img (home ảnh riêng)");
  });

  it("chưa đăng nhập ⇒ hiện lệnh cho user tự chạy, KHÔNG có nút chạy hộ", () => {
    const html = render(doctorWith({ profile: "img-home", mode: "unavailable", available: false, authPresent: false }), CONNECTED);
    expect(html).toContain("CODEX_HOME=~/.codex-img codex login");
  });

  it("không bao giờ in path tuyệt đối, kể cả khi doctor lỡ trả path", () => {
    const html = render(doctorWith({ profile: "img-home", codexHomeLabel: "/Users/ai-do/.codex-img" }), CONNECTED);
    expect(html).not.toContain("/Users/");
  });

  it("agent tắt ⇒ toggle bị vô hiệu hoá, không cho đổi vào chỗ không kiểm được", () => {
    const html = render(undefined, OFFLINE);
    expect(html).toContain("disabled");
  });
});
