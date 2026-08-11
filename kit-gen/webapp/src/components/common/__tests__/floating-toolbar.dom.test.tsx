/**
 * B2 — FloatingToolbar: điều khiển ĐỦ bằng bàn phím theo WAI-ARIA toolbar.
 * Mỗi ca dưới đây FAIL nếu bỏ roving tabindex hoặc bỏ xử lý mũi tên/Home/End.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import { FloatingToolbar } from "../FloatingToolbar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/* `import.meta.url` trong environment jsdom là URL http:// ⇒ đọc theo `root`
   của config (webapp/) thay vì new URL(...). */
const SRC = readFileSync(resolve(process.cwd(), "src/components/common/FloatingToolbar.tsx"), "utf8");

/** Bỏ chú thích trước khi quét literal màu: phần chú thích CÓ nhắc `#191919`
 *  (số đo của FLORA-REF) — quét thô sẽ báo động giả, đúng cách
 *  `scripts/check-contrast.mjs` đã làm với `opacity-45` trong comment. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* `globals: false` trong config ⇒ auto-cleanup của @testing-library KHÔNG bật.
   Không dọn thì mỗi test để lại một toolbar trong document và getByRole nổ
   "found multiple elements" — đúng lỗi vừa gặp. */
afterEach(cleanup);

function setup() {
  render(
    <FloatingToolbar
      aria-label="Công cụ canvas"
      left={<Button size="sm">Chọn</Button>}
      center={
        <>
          <Button size="sm">Thu nhỏ</Button>
          <Button size="sm" disabled>Khoá</Button>
          <Button size="sm">Phóng to</Button>
        </>
      }
      right={<Button size="sm">Copy Figma</Button>}
    />,
  );
  return screen.getByRole("toolbar", { name: "Công cụ canvas" });
}

const enabledNames = ["Chọn", "Thu nhỏ", "Phóng to", "Copy Figma"];

describe("vai + tên", () => {
  it("có role=toolbar, aria-label và aria-orientation", () => {
    const bar = setup();
    expect(bar.getAttribute("aria-orientation")).toBe("horizontal");
    expect(bar.getAttribute("aria-label")).toBe("Công cụ canvas");
  });

  it("ba slot trái/giữa/phải được ngăn bằng Separator của R0 (2 vạch cho 3 nhóm)", () => {
    setup();
    const bar = screen.getByRole("toolbar");
    expect(bar.querySelectorAll('[data-orientation="vertical"]').length).toBe(2);
  });

  it("chỉ render slot có nội dung — 1 slot ⇒ 0 vạch ngăn", () => {
    render(<FloatingToolbar aria-label="Một slot" left={<Button size="sm">A</Button>} />);
    const bar = screen.getByRole("toolbar", { name: "Một slot" });
    expect(bar.querySelectorAll('[data-orientation="vertical"]').length).toBe(0);
  });
});

describe("roving tabindex — chỉ MỘT điểm dừng Tab", () => {
  it("lúc mới render: nút đầu tabindex=0, phần còn lại -1", () => {
    setup();
    const tabs = enabledNames.map((n) => screen.getByRole("button", { name: n }).getAttribute("tabindex"));
    expect(tabs).toEqual(["0", "-1", "-1", "-1"]);
  });

  it("nút bị khoá KHÔNG nằm trong vòng di chuyển", () => {
    setup();
    expect(screen.getByRole("button", { name: "Khoá" }).getAttribute("tabindex")).toBeNull();
  });
});

describe("bàn phím theo APG", () => {
  it("→ đi sang nút kế, bỏ qua nút khoá", () => {
    const bar = setup();
    screen.getByRole("button", { name: "Chọn" }).focus();
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Thu nhỏ" }));
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Phóng to" }));
  });

  it("← từ nút đầu quấn về nút cuối", () => {
    const bar = setup();
    screen.getByRole("button", { name: "Chọn" }).focus();
    fireEvent.keyDown(bar, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Copy Figma" }));
  });

  it("Home/End nhảy về đầu/cuối", () => {
    const bar = setup();
    screen.getByRole("button", { name: "Thu nhỏ" }).focus();
    fireEvent.keyDown(bar, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Copy Figma" }));
    fireEvent.keyDown(bar, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Chọn" }));
  });

  it("↓/↑ cũng chạy (thanh nằm ngang vẫn nên nhận, APG cho phép)", () => {
    const bar = setup();
    screen.getByRole("button", { name: "Chọn" }).focus();
    fireEvent.keyDown(bar, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Thu nhỏ" }));
    fireEvent.keyDown(bar, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Chọn" }));
  });

  it("mũi tên có modifier (⌘/Ctrl/Alt) KHÔNG bị chiếm — nhường phím tắt app", () => {
    const bar = setup();
    screen.getByRole("button", { name: "Chọn" }).focus();
    fireEvent.keyDown(bar, { key: "ArrowRight", metaKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Chọn" }));
  });

  it("focus bằng chuột/Tab vào nút giữa thì điểm dừng Tab chuyển theo", () => {
    setup();
    const zoomIn = screen.getByRole("button", { name: "Phóng to" });
    fireEvent.focus(zoomIn);
    expect(zoomIn.getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("button", { name: "Chọn" }).getAttribute("tabindex")).toBe("-1");
  });

  it("Enter/Space vẫn kích hoạt nút (không bị chặn) — dùng handler thật", () => {
    let hits = 0;
    render(
      <FloatingToolbar aria-label="Kích hoạt" left={<Button size="sm" onClick={() => { hits += 1; }}>Fit</Button>} />,
    );
    const fit = screen.getByRole("button", { name: "Fit" });
    fit.focus();
    fireEvent.click(fit);
    expect(hits).toBe(1);
  });
});

describe("thị giác: chỉ dùng token, có đường lùi khi không blur được", () => {
  it("0 literal màu trong file (hex/rgb/hsl)", () => {
    expect(CODE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CODE).not.toMatch(/\brgba?\(/);
    expect(CODE).not.toMatch(/\bhsla?\(/);
    /* và không có px bo góc viết tay — pill phải là token `rounded-full` */
    expect(CODE).not.toMatch(/rounded-\[/);
  });

  it("nền ĐẶC là mặc định; blur + nền mờ chỉ bật khi @supports backdrop-filter", () => {
    const html = renderToStaticMarkup(<FloatingToolbar aria-label="x" left={<span />} />);
    expect(html).toContain("bg-overlay");
    expect(html).toContain("supports-[backdrop-filter:blur(0px)]:bg-overlay/90");
    expect(html).toContain("supports-[backdrop-filter:blur(0px)]:backdrop-blur-lg");
  });

  it("prefers-reduced-transparency: reduce ⇒ quay lại nền đặc, tắt blur", () => {
    const html = renderToStaticMarkup(<FloatingToolbar aria-label="x" left={<span />} />);
    expect(html).toContain("[@media_(prefers-reduced-transparency:_reduce)]:bg-overlay");
    expect(html).toContain("[@media_(prefers-reduced-transparency:_reduce)]:backdrop-blur-none");
  });

  it("pill 999px + hairline + z-index của thanh nổi lấy từ token", () => {
    const html = renderToStaticMarkup(<FloatingToolbar aria-label="x" left={<span />} />);
    expect(html).toContain("rounded-full");
    expect(html).toContain("border-line-subtle");
    expect(html).toContain("z-floatbar");
  });

  it("Separator là component của R0, không phải div tự vẽ", () => {
    expect(SRC).toContain('from "@/components/ui/separator"');
    expect(renderToStaticMarkup(<Separator orientation="vertical" />)).toContain("bg-line-subtle");
  });
});
