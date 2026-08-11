/**
 * Ca tối thiểu bắt buộc (brief mục 6): sanitize chặn TỪNG NHÓM secret + allowlist từ chối
 * khoá lạ. Mỗi nhóm được test riêng chứ không gộp, để khi ai đó nới một regex thì biết
 * chính xác nhóm nào mất bảo vệ.
 */
import { describe, expect, it } from "vitest";
import {
  SecretLeakError, assertNoSecret, findSecret, looksHighEntropy, maskPathSegment, shannonEntropy,
} from "../secrets";

/** Mẫu GIẢ, không phải secret thật — cấu trúc giống thật để bộ dò có việc mà làm. */
const FAKE = {
  openaiKey: "sk-proj-AAAABBBBCCCCDDDDEEEEFFFFGGGG1234",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
  bearer: "Bearer abcdefghijklmnopqrstuvwxyz012345",
  ghToken: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
};

describe("bộ dò secret — chặn theo TÊN FIELD (trục a)", () => {
  const groups: [string, Record<string, unknown>][] = [
    ["token", { refreshToken: "abc" }],
    ["key", { apiKey: "abc" }],
    ["key (viết tắt)", { api_key: "abc" }],
    ["secret", { clientSecret: "abc" }],
    ["authorization", { authorization: "abc" }],
    ["bearer", { bearerValue: "abc" }],
    ["password", { password: "abc" }],
    ["passphrase", { passphrase: "abc" }],
    ["cookie", { cookie: "abc" }],
    ["auth", { auth: "abc" }],
    ["auth.json", { authJson: "abc" }],
    ["credential", { credentials: "abc" }],
    ["session id", { sessionId: "abc" }],
    ["mã xác nhận 4 số", { confirmCode: "4821" }],
    ["field của auth.json", { access_token: "abc" }],
    ["biến môi trường", { OPENAI_API_KEY: "abc" }],
  ];

  for (const [name, obj] of groups) {
    it(`chặn nhóm «${name}»`, () => {
      expect(() => assertNoSecret(obj)).toThrow(SecretLeakError);
      const hit = findSecret(obj);
      expect(hit?.kind).toBe("field-name");
    });
  }

  it("chặn cả khi field nằm sâu trong mảng lồng object", () => {
    const deep = { items: [{ nested: { list: [{ idToken: "x" }] } }] };
    expect(() => assertNoSecret(deep)).toThrow(SecretLeakError);
  });

  it("KHÔNG chặn `authPresent` — boolean từ existsSync, agent không mở file (arch §4.4-4)", () => {
    expect(() => assertNoSecret({ authPresent: true })).not.toThrow();
  });
});

describe("bộ dò secret — chặn theo PATTERN GIÁ TRỊ (trục b)", () => {
  const cases: [string, unknown][] = [
    ["OpenAI key sk-", { note: FAKE.openaiKey }],
    ["JWT eyJ...", { note: FAKE.jwt }],
    ["Bearer ...", { note: FAKE.bearer }],
    ["GitHub token", { note: FAKE.ghToken }],
    ["private key PEM", { note: "-----BEGIN RSA PRIVATE KEY-----" }],
    ["set-cookie", { note: "set-cookie: a=b" }],
    ["path tuyệt đối có tên user (PII)", { label: "/Users/tungnt2/KitGen" }],
    ["path Linux có tên user", { label: "/home/tungnt2/KitGen" }],
    ["cặp key=value", { note: "api_key=xyz123456" }],
  ];

  for (const [name, obj] of cases) {
    it(`chặn ${name}`, () => {
      expect(() => assertNoSecret(obj)).toThrow(SecretLeakError);
    });
  }

  it("chặn chuỗi entropy cao không có tiền tố rõ ràng", () => {
    const random = "Xk29fLp84QmZa71RtVbNw35YcJd06HsE";
    expect(looksHighEntropy(random)).toBe(true);
    expect(() => assertNoSecret({ blob: random })).toThrow(SecretLeakError);
  });

  it("KHÔNG chặn nhãn workspace rút gọn `~/KitGen` (agent trả về, không phải path thật)", () => {
    expect(() => assertNoSecret({ label: "~/KitGen" })).not.toThrow();
  });

  it("KHÔNG chặn fingerprint có tiền tố sha256:", () => {
    expect(() => assertNoSecret({ fingerprint: `sha256:${"a1b2c3d4".repeat(8)}` })).not.toThrow();
  });

  it("KHÔNG chặn dữ liệu UI bình thường", () => {
    expect(() =>
      assertNoSecret({
        theme: "dark", projectsView: "grid", filterTags: ["tet", "banking"],
        maxJobs: 4, lastTab: { design: "sheets" },
      }),
    ).not.toThrow();
  });
});

describe("thông điệp lỗi KHÔNG tự làm rò secret (bài học qa-security.md §2.2)", () => {
  it("che tên field khi chính TÊN FIELD là secret", () => {
    const obj: Record<string, unknown> = { [FAKE.openaiKey]: "giá trị vô hại" };
    let caught: SecretLeakError | null = null;
    try {
      assertNoSecret(obj);
    } catch (e) {
      caught = e as SecretLeakError;
    }
    expect(caught).toBeInstanceOf(SecretLeakError);
    expect(caught!.message).not.toContain(FAKE.openaiKey);
    expect(caught!.message).toContain("redacted");
  });

  it("message không bao giờ chứa giá trị bị chặn", () => {
    let caught: SecretLeakError | null = null;
    try {
      assertNoSecret({ note: FAKE.jwt });
    } catch (e) {
      caught = e as SecretLeakError;
    }
    expect(caught!.message).not.toContain(FAKE.jwt);
    expect(caught!.message).toContain("$.note");
  });

  it("maskPathSegment giữ nguyên chuỗi ngắn, che chuỗi dài", () => {
    expect(maskPathSegment("id")).toBe("id");
    expect(maskPathSegment("abcdefghij")).toContain("redacted:10");
  });
});

describe("tiện ích", () => {
  it("entropy của chuỗi lặp là 0", () => {
    expect(shannonEntropy("aaaaaaaa")).toBe(0);
  });
  it("giá trị không serialize được bị chặn", () => {
    expect(() => assertNoSecret({ fn: () => 1 })).toThrow(SecretLeakError);
  });
  it("object tự tham chiếu không làm treo bộ quét", () => {
    const a: Record<string, unknown> = { name: "x" };
    a.self = a;
    expect(() => assertNoSecret(a)).not.toThrow();
  });
});
