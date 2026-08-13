/**
 * LUỒNG CẬP NHẬT ĐẦU-CUỐI, chạy trên máy trạng thái thật (`useUpdateInstall`) chứ không
 * phải đọc code rồi tin. Mọi tác dụng phụ đều tiêm vào, nên test không chạm mạng,
 * không chạm `window.location`, không chờ giây nào.
 *
 * Bốn điều được khoá ở đây, cả bốn đều là thứ user chịu hậu quả nếu vỡ:
 *  ① bấm Cập nhật ⇒ app bị CHẶN ngay (`phase` khác `idle` ⇒ lớp phủ tồn tại);
 *  ② chỉ tải lại trang KHI ĐÃ CÓ BẰNG CHỨNG agent sống lại — không còn hẹn giờ mù 5s;
 *  ③ quá hạn ⇒ KHÔNG tải lại, nhường quyền cho user (nút tải lại thủ công);
 *  ④ ý định cập nhật được ghi ra đĩa TRƯỚC khi trang biến mất, để sau reload còn chào.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LS_KEYS, _setBackend, memoryBackend, storeGet } from "../../store/persist";
import { useUpdateInstall } from "../install-store";
import { markUpdatePending, readUpdatePending } from "../pending";
import type { RestartResult } from "../restart";

let mem: ReturnType<typeof memoryBackend>;
beforeEach(() => {
  mem = memoryBackend();
  _setBackend(mem);
  useUpdateInstall.getState()._reset();
});

/** Ca "thuận buồm" dùng lại nhiều lần: cài xong, agent lên đúng bản đích. */
const okInstall = () => Promise.resolve({ previousVersion: "2.1.13" });
const updated: RestartResult = { outcome: "updated", version: "2.2.0" };

describe("bấm [Cập nhật]", () => {
  it("huỷ ở hộp xác nhận ⇒ KHÔNG chặn app, không gọi agent", async () => {
    const install = vi.fn(okInstall);
    await useUpdateInstall.getState().start("2.2.0", {
      confirm: () => false, install, wait: async () => updated, reload: vi.fn(),
    });
    expect(install).not.toHaveBeenCalled();
    expect(useUpdateInstall.getState().phase).toBe("idle");
  });

  it("chặn CẢ APP ngay khi gọi agent, không chờ tới lúc reload", async () => {
    const phases: string[] = [];
    const unsub = useUpdateInstall.subscribe((s) => phases.push(s.phase));
    await useUpdateInstall.getState().start("2.2.0", {
      confirm: () => true,
      install: async () => {
        phases.push(`during-install:${useUpdateInstall.getState().phase}`);
        return { previousVersion: "2.1.13" };
      },
      wait: async () => {
        phases.push(`during-wait:${useUpdateInstall.getState().phase}`);
        return updated;
      },
      reload: vi.fn(),
    });
    unsub();
    expect(phases).toContain("during-install:installing");
    expect(phases).toContain("during-wait:waiting");
  });

  it("chỉ tải lại KHI CÓ BẰNG CHỨNG agent sống lại — và truyền đúng hai mốc version", async () => {
    const reload = vi.fn();
    const wait = vi.fn(async () => updated);
    await useUpdateInstall.getState().start("2.2.0", {
      confirm: () => true, install: okInstall, wait, reload,
    });
    expect(wait).toHaveBeenCalledWith({ targetVersion: "2.2.0", fromVersion: "2.1.13" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ghi ý định ra đĩa TRƯỚC khi tải lại (không thì sau reload chẳng ai nhớ gì)", async () => {
    let pendingAtReload: unknown = null;
    await useUpdateInstall.getState().start("2.2.0", {
      confirm: () => true,
      install: okInstall,
      wait: async () => updated,
      reload: () => {
        pendingAtReload = readUpdatePending();
      },
    });
    expect(pendingAtReload).toMatchObject({ targetVersion: "2.2.0", fromVersion: "2.1.13" });
    expect(storeGet(LS_KEYS.update).startedAt).not.toBe("");
  });

  it("quá hạn ⇒ KHÔNG tải lại, chuyển sang màn 'tải lại thủ công'", async () => {
    const reload = vi.fn();
    await useUpdateInstall.getState().start("2.2.0", {
      confirm: () => true,
      install: okInstall,
      wait: async () => ({ outcome: "timeout", version: "2.1.13" }),
      reload,
    });
    expect(reload).not.toHaveBeenCalled();
    const s = useUpdateInstall.getState();
    expect(s.phase).toBe("timeout");
    expect(s.message).toContain("90 giây");
  });

  it("cài xong mà version y nguyên ⇒ VẪN tải lại (để app đọc lại sự thật rồi báo hỏng)", async () => {
    const reload = vi.fn();
    await useUpdateInstall.getState().start("2.2.0", {
      confirm: () => true,
      install: okInstall,
      wait: async () => ({ outcome: "unchanged", version: "2.1.13" }),
      reload,
    });
    expect(reload).toHaveBeenCalledTimes(1);
    // bản ghi vẫn còn để sau reload nói "chưa thành công"
    expect(readUpdatePending()).toMatchObject({ targetVersion: "2.2.0" });
  });

  it("gửi lệnh cập nhật hỏng ⇒ nói tiếng Việt, KHÔNG ghi ý định, KHÔNG tải lại", async () => {
    const reload = vi.fn();
    await useUpdateInstall.getState().start("2.2.0", {
      confirm: () => true,
      install: () => Promise.reject(new TypeError("Failed to fetch")),
      wait: async () => updated,
      reload,
    });
    const s = useUpdateInstall.getState();
    expect(s.phase).toBe("failed");
    expect(s.message).toMatch(/công cụ local/i);
    expect(reload).not.toHaveBeenCalled();
    expect(readUpdatePending()).toBeNull();
  });

  it("bấm ở hai chỗ khác nhau KHÔNG thành hai lượt cài chồng nhau", async () => {
    const install = vi.fn(okInstall);
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const first = useUpdateInstall.getState().start("2.2.0", {
      confirm: () => true,
      install,
      wait: async () => {
        await gate;
        return updated;
      },
      reload: vi.fn(),
    });
    // trong lúc lượt 1 còn đang chờ, popover header bấm thêm một phát
    await useUpdateInstall.getState().start("2.2.0", {
      confirm: () => true, install, wait: async () => updated, reload: vi.fn(),
    });
    release!();
    await first;
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("đang cài thì KHÔNG có đường thoát; hỏng rồi mới đóng được", () => {
    useUpdateInstall.setState({ phase: "waiting", targetVersion: "2.2.0" });
    useUpdateInstall.getState().dismiss();
    expect(useUpdateInstall.getState().phase).toBe("waiting");

    useUpdateInstall.setState({ phase: "timeout" });
    useUpdateInstall.getState().dismiss();
    expect(useUpdateInstall.getState().phase).toBe("idle");
  });
});

describe("bản ghi ý định sống đúng một nhịp reload", () => {
  it("bản ghi mồ côi quá hạn ⇒ bị bỏ qua và dọn đi, không bật ra vài ngày sau", () => {
    markUpdatePending({ targetVersion: "2.2.0", fromVersion: "2.1.13", startedAt: new Date(0).toISOString() });
    expect(readUpdatePending(60 * 60 * 1000)).toBeNull();
    expect(storeGet(LS_KEYS.update).startedAt).toBe("");
  });

  it("không có bản ghi ⇒ `null` (đường im lặng của 99,9% lần mở app)", () => {
    expect(readUpdatePending()).toBeNull();
  });
});
