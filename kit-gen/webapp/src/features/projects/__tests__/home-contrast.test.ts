/**
 * H1 — cổng tương phản cho tổ hợp màu mới của thẻ bộ kit (UX-V3 §8.3).
 * Chạy lại chính script `home-contrast.mjs` để số trong report và số trong CI là MỘT.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("§8.3 — tương phản của thẻ bộ kit trên màn H", () => {
  it("9/9 cặp đạt ≥4.5:1, script thoát mã 0", () => {
    const out = execFileSync("node", ["src/features/projects/__tests__/home-contrast.mjs"], {
      encoding: "utf8",
    });
    expect(out).toContain("KẾT QUẢ: 9/9 PASS");
    expect(out).not.toContain("FAIL");
  });

  it("script thật sự biết FAIL (chống cổng luôn xanh)", () => {
    // Đảo ngưỡng lên 21:1 — không cặp nào trên đời đạt được ⇒ phải thoát khác 0.
    const dir = mkdtempSync(join(tmpdir(), "kitgen-contrast-"));
    const mutant = join(dir, "h1-mutant.mjs");
    try {
      const source = readFileSync("src/features/projects/__tests__/home-contrast.mjs", "utf8")
        .replaceAll("4.5]", "21]");
      writeFileSync(mutant, source);
      expect(() =>
        execFileSync("node", [mutant], { encoding: "utf8", stdio: "pipe" }),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
