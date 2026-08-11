import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { routeTree } from "../../routeTree";
import { readMode } from "@/features/kitfile";

const paths = () => JSON.stringify(routeTree).replaceAll("\\/", "/");

describe("FE3 E1 route wiring", () => {
  it("registers the kit entry and form before legacy routes", () => {
    expect(paths()).toContain("/k/$projectId");
    expect(paths()).toContain("/k/$projectId/form");
  });

  it("defaults missing and conflicting mode tags to the form-led kit", () => {
    expect(readMode({ tags: [] })).toBe("workflow");
    expect(readMode({ tags: ["kg-workflow", "kg-canvas"] })).toBe("workflow");
    expect(readMode({ tags: ["kg-canvas"] })).toBe("canvas");
  });

  it("keeps the file breadcrumb at exactly two levels", () => {
    const source = readFileSync(resolve(__dirname, "../../components/layout/AppBreadcrumb.tsx"), "utf8");
    expect(source).toContain("Bộ kit của bạn");
    expect(source).not.toContain("SCREEN_LABEL[screen]");
  });

  it("keeps primary navigation on the new kit route", () => {
    const jump = readFileSync(resolve(__dirname, "../../components/layout/ProjectJump.tsx"), "utf8");
    const kitRoute = readFileSync(resolve(__dirname, "../k.$projectId.tsx"), "utf8");
    expect(jump).toContain('to: "/k/$projectId"');
    expect(kitRoute).not.toContain('to: "/p/$projectId/kit"');
  });
});
