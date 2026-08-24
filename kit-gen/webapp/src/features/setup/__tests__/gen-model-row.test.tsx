/* @vitest-environment jsdom */
/**
 * "ẢNH NÀY SẼ ĐƯỢC TẠO BẰNG MODEL NÀO?" — CÂU TRẢ LỜI PHẢI ĐÚNG CẢ KHI NÓ XẤU.
 *
 * `gen.sh` ép model rẻ + mức nghĩ vừa vì việc của model ở đây rất nhẹ. Nhưng cái ép
 * đó có MỘT CỔNG: nếu bản Codex trên máy không có tên model trong danh mục thì engine
 * bỏ `-m` và chạy bằng model của hồ sơ — có thể nghĩ sâu hơn và tốn token hơn. Trước
 * bản này app không hiện gì cả, nên câu hỏi "sao tốn token thế" không có cách nào tự
 * trả lời.
 *
 * Ca đắt nhất ở đây là ca `known: false`: hiện tên model mà KHÔNG nói nó đang bị bỏ
 * qua thì tệ hơn hẳn không hiện gì — người dùng đọc ra một lời cam đoan sai.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Doctor } from "@/lib/types/api";
import { ImageGenCard } from "../steps/parts/ImageGenCard";

vi.mock("@/lib/hooks", () => ({
  useCodexLogin: () => ({
    session: { status: "idle", verificationUrl: null, userCode: null, codexHomeLabel: null, reason: null },
    starting: false, active: false, start: vi.fn(), cancel: vi.fn(), reset: vi.fn(),
  }),
  // ImageGenCard nay chứa CodexAccountRow — mock "chưa đăng nhập" để hàng tự ẩn,
  // test này chỉ soi GenModelRow.
  useCodexAccount: () => ({ data: undefined }),
  useCodexLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));

type GenModel = NonNullable<NonNullable<Doctor["imageGen"]>["model"]>;

const doctorWith = (model: GenModel | undefined): Doctor => ({
  imageGen: {
    mode: "default-home", profile: "default-home", available: true,
    codexHomeLabel: "~/.codex", authPresent: true, reason: null, needsFallbackHome: false,
    model,
  },
} as Doctor);

const textOf = (model: GenModel | undefined) =>
  render(<ImageGenCard doctor={doctorWith(model)} />).container.textContent ?? "";

afterEach(cleanup);

describe("hàng «sẽ yêu cầu model …» của thẻ Tạo ảnh AI", () => {
  it("đọc được từ engine ⇒ nêu ĐÍCH DANH tên model và mức nghĩ", () => {
    const all = textOf({ requested: "gpt-5.6-luna", effort: "medium", known: true, source: "engine" });
    expect(all).toContain("gpt-5.6-luna");
    expect(all).toContain("medium");
  });

  it("codex KHÔNG biết model ⇒ nói thẳng là engine sẽ bỏ qua, không cam đoan suông", () => {
    const all = textOf({ requested: "gpt-5.6-luna", effort: "medium", known: false, source: "engine" });
    expect(all).toContain("gpt-5.6-luna");
    expect(all).toContain("mặc định của hồ sơ");
    expect(all).toContain("tốn token");
  });

  it("bị đặt bằng biến môi trường ⇒ nói ra, để không ai đi tìm chỗ sửa trong app", () => {
    const all = textOf({ requested: "gpt-5.6-sol", effort: "high", known: true, source: "env" });
    expect(all).toContain("gpt-5.6-sol");
    expect(all).toContain("KITGEN_GEN_MODEL");
  });

  it("engine cố ý KHÔNG ép model ⇒ nói đúng chuyện đó, không hiện một tên trống", () => {
    const all = textOf({ requested: null, effort: null, known: null, source: "env" });
    expect(all).toContain("không ép model");
    expect(all).not.toContain("Sẽ yêu cầu");
  });

  it("agent đời cũ không có field ⇒ IM LẶNG, không bịa ra tên model", () => {
    const all = textOf(undefined);
    expect(all).not.toContain("Sẽ yêu cầu");
    expect(all).not.toContain("gpt-");
  });

  it("không đọc được gen.sh ⇒ cũng im lặng, vì đoán bừa còn tệ hơn", () => {
    const all = textOf({ requested: null, effort: null, known: null, source: "unknown" });
    expect(all).not.toContain("Sẽ yêu cầu");
    expect(all).not.toContain("không ép model");
  });
});
