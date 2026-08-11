import { beforeEach, describe, expect, it } from "vitest";
import { SecretLeakError } from "@/lib/store";
import { configureIdb, IDB_STORES, idbGet, idbKeys, idbSet } from "../idb";
import { createFakeIdb } from "./fake-idb";

/**
 * arch §4.3 (danh sách đen) + §4.4 lớp 3: nội dung ghi vào `drafts`/`runlog`
 * PHẢI bị quét secret. Log của codex là nơi token dễ lọt nhất — agent đã redact,
 * đây là LỚP PHÒNG THỦ THỨ HAI.
 *
 * Những ca dưới đây là bằng chứng cho lời hứa "TUYỆT ĐỐI KHÔNG lưu secret ở
 * browser". Nếu ai đó gỡ `assertNoSecret` khỏi `idb.ts`, các ca này đỏ ngay.
 */
beforeEach(() => {
  configureIdb(createFakeIdb());
});

describe("bộ dò secret chặn tại cửa IndexedDB", () => {
  it("token OpenAI trong dòng log ⇒ NÉM, và KHÔNG có gì được ghi", async () => {
    const payload = {
      projectId: "p1",
      lines: [{ seq: 1, t: "", job: null, level: "info", text: "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456" }],
      updatedAt: "x",
    };
    await expect(idbSet(IDB_STORES.runlog, "r-1", payload)).rejects.toBeInstanceOf(SecretLeakError);
    expect(await idbGet(IDB_STORES.runlog, "r-1")).toBeNull();
    expect(await idbKeys(IDB_STORES.runlog)).toHaveLength(0);
  });

  it("JWT trong log ⇒ chặn", async () => {
    const payload = {
      projectId: "p1",
      lines: [{ seq: 1, t: "", job: null, level: "info", text: "Bearer eyJhbGciOi.eyJzdWIiOiIxMjM0NTY3ODkwIn0" }],
      updatedAt: "x",
    };
    await expect(idbSet(IDB_STORES.runlog, "r-2", payload)).rejects.toBeInstanceOf(SecretLeakError);
  });

  it("TÊN FIELD nghi secret cũng bị chặn, không chỉ giá trị", async () => {
    await expect(
      idbSet(IDB_STORES.drafts, "p1", { contract: {}, baseVersion: 1, accessToken: "gì đó" }),
    ).rejects.toBeInstanceOf(SecretLeakError);
  });

  it("đường dẫn tuyệt đối chứa tên user (PII, arch §4.3-5) bị chặn", async () => {
    const payload = {
      projectId: "p1",
      lines: [{ seq: 1, t: "", job: null, level: "info", text: "ghi vào /Users/tungnt2/KitGen/raw/a.png" }],
      updatedAt: "x",
    };
    await expect(idbSet(IDB_STORES.runlog, "r-3", payload)).rejects.toBeInstanceOf(SecretLeakError);
  });

  it("THÔNG ĐIỆP LỖI không được tự làm rò thứ vừa chặn (bài học qa-security §2.2)", async () => {
    const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
    try {
      await idbSet(IDB_STORES.runlog, "r-4", {
        projectId: "p", updatedAt: "x",
        lines: [{ seq: 1, t: "", job: null, level: "info", text: secret }],
      });
      throw new Error("đáng lẽ phải ném");
    } catch (e) {
      expect(e).toBeInstanceOf(SecretLeakError);
      expect(String((e as Error).message)).not.toContain(secret);
    }
  });

  it("log SẠCH thì ghi bình thường — bộ dò không được cản việc thật", async () => {
    const payload = {
      projectId: "p1",
      lines: [
        { seq: 1, t: "2026-08-06T12:00:00Z", job: "tet-main", level: "info", text: "dựng khung xương ✓" },
        { seq: 2, t: "2026-08-06T12:01:00Z", job: "tet-main", level: "info", text: "raw/tet-main.png 2.9 MB" },
      ],
      updatedAt: "2026-08-06T12:01:00Z",
    };
    await expect(idbSet(IDB_STORES.runlog, "r-5", payload)).resolves.toBe(true);
    expect(await idbGet(IDB_STORES.runlog, "r-5")).toMatchObject({ projectId: "p1" });
  });

  it("nhãn workspace rút gọn `~/KitGen` là HỢP LỆ (không phải path thật)", async () => {
    const payload = {
      projectId: "p1", updatedAt: "x",
      lines: [{ seq: 1, t: "", job: null, level: "info", text: "~/KitGen" }],
    };
    await expect(idbSet(IDB_STORES.runlog, "r-6", payload)).resolves.toBe(true);
  });
});
