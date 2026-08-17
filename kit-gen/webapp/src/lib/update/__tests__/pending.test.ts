import { describe, expect, it } from "vitest";
import { resolveUpdateResult } from "../pending";

describe("resolveUpdateResult", () => {
  it("bản chạy cao hơn bản đích vẫn là thành công", () => {
    expect(resolveUpdateResult({ targetVersion: "2.1.25", fromVersion: "2.1.24", startedAt: new Date().toISOString() }, "2.1.26").kind)
      .toBe("success");
  });
  it("bản chạy thấp hơn đích vẫn là thất bại", () => {
    expect(resolveUpdateResult({ targetVersion: "2.1.25", fromVersion: "2.1.24", startedAt: new Date().toISOString() }, "2.1.24").kind)
      .toBe("failed");
  });
});
