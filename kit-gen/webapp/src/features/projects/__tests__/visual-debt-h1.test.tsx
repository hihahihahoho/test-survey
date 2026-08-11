/**
 * FE-2 §3-A2 #7 — H1 màn Projects phải theo công thức "nhấn ĐÚNG MỘT TỪ" của FLORA.
 *
 * Kiểm bằng render THẬT (`renderToString`) chứ không đọc source: cái sai của #7 là thứ
 * chỉ nhìn thấy trong DOM đã dựng — bao nhiêu chữ nằm trong `<em>` serif.
 * Dùng renderToString vì jsdom/@testing-library chưa nằm trong devDependencies của repo
 * (R0 sở hữu package.json) — cùng lý do đã ghi ở features/setup/__tests__/render-smoke.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProjectsHeader } from "../components/ProjectsHeader";

/** `TooltipProvider` là bối cảnh mà AppShell thật luôn cung cấp — Radix bắt buộc có. */
const html = () =>
  renderToString(
    <TooltipProvider>
    <ProjectsHeader
      total={3} shown={3} scannedAt={null} fromCache={false} isFetching={false} trashCount={0}
      gate={{ readOnly: false, reason: "", longReason: "", code: null }}
      onCreate={() => {}} onImport={() => {}} onRefresh={() => {}} onOpenTrash={() => {}}
    />
    </TooltipProvider>,
  );

/** Nội dung của các thẻ <em> trong H1 — đây chính là phần được in nghiêng serif. */
function emsInH1(markup: string): string[] {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(markup)?.[1] ?? "";
  return [...h1.matchAll(/<em\b[^>]*>([\s\S]*?)<\/em>/g)].map((m) =>
    m[1]!.replace(/<[^>]+>/g, "").replace(/<!--[\s\S]*?-->/g, "").trim(),
  );
}

function h1Text(markup: string): string {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(markup)?.[1] ?? "";
  return h1.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

describe("#7 — H1 Projects nhấn đúng một từ", () => {
  it("có đúng MỘT <em> trong h1", () => {
    expect(emsInH1(html())).toHaveLength(1);
  });

  it("phần nhấn dài đúng MỘT từ (đây là cái #7 phàn nàn: «của bạn» là hai từ)", () => {
    const accent = emsInH1(html())[0]!;
    expect(accent.split(/\s+/).filter(Boolean)).toHaveLength(1);
  });

  it("từ được nhấn là DANH TỪ mang nghĩa, không phải cụm chức năng", () => {
    expect(emsInH1(html())[0]).toBe("project");
    // «của bạn» là cụm sở hữu, nhấn nó thì mắt dừng vào chỗ không có thông tin.
    expect(h1Text(html())).not.toContain("của bạn");
  });

  it("phần nhấn được in nghiêng serif — dấu ấn nhận diện FLORA (§2.5)", () => {
    const h1 = /<h1\b[^>]*>[\s\S]*?<\/h1>/.exec(html())![0];
    const em = /<em\b[^>]*class="([^"]*)"/.exec(h1)?.[1] ?? "";
    expect(em).toContain("font-serif");
    expect(em).toContain("italic");
  });

  it("accessible name của heading vẫn đọc trọn câu (em không cắt tên)", () => {
    // Chữ nghiêng vẫn là text con của h1 ⇒ screen reader đọc liền mạch "Bộ project".
    expect(h1Text(html())).toBe("Bộ project");
  });

  it("h1 vẫn là level 1 duy nhất của khối đầu màn", () => {
    expect([...html().matchAll(/<h1\b/g)]).toHaveLength(1);
  });

  it("mật độ chữ giảm so với bản cũ «Project của bạn» (FLORA-REF §2.8)", () => {
    expect(h1Text(html()).length).toBeLessThan("Project của bạn".length);
  });
});
