/**
 * PRESET THỂ LOẠI GAME (feedback team 24/08 §2a) — bảy phím tắt điền form.
 *
 * Thứ đáng hỏng nhất ở đây không phải chữ, mà là SỰ ĐẦY ĐỦ: một preset khai thiếu một
 * trục thì trục ấy giữ nấc của preset bấm trước đó, và người dùng nhận một phong cách
 * lai không ai chọn — mà chẳng có gì trên màn hình nói ra điều đó. Nên phép kiểm chính
 * là "đủ 8 trục, đúng tên trục của form".
 */
import { describe, expect, it } from "vitest";
import { STYLE_AXIS_IDS } from "@/features/kit-core/lib/form-model";
import { buildStylePrompt } from "@/features/kit-core/lib/style-phrases";
import { GENRE_PRESETS, applyGenrePreset, genrePresetOverwrites, matchesGenrePreset } from "../genre-presets";

const IDS = ["merge", "match3", "casual", "farm", "puzzle", "rpg", "arcade"];

describe("bảng preset thể loại", () => {
  it("đủ bảy thể loại team gọi tên, id không trùng", () => {
    expect(GENRE_PRESETS.map((p) => p.id)).toEqual(IDS);
    expect(new Set(GENRE_PRESETS.map((p) => p.vi)).size).toBe(GENRE_PRESETS.length);
  });

  it("mỗi preset khai ĐỦ 8 trục, mỗi trục ở nấc 1–7", () => {
    for (const preset of GENRE_PRESETS) {
      expect(Object.keys(preset.axes).sort(), preset.id).toEqual([...STYLE_AXIS_IDS].sort());
      for (const id of STYLE_AXIS_IDS) {
        const v = preset.axes[id];
        expect(Number.isInteger(v), `${preset.id}.${id}`).toBe(true);
        expect(v >= 1 && v <= 7, `${preset.id}.${id} = ${v}`).toBe(true);
      }
      // Nấc của preset phải ra được câu thật cho cả 8 trục — không `undefined` nào lọt
      // vào chuỗi gửi `gen.sh`.
      expect(buildStylePrompt(preset.axes).split(", ")).toHaveLength(STYLE_AXIS_IDS.length);
    }
  });

  it("stylePrompt là brief tiếng Anh có nội dung, không phải tên thể loại", () => {
    for (const preset of GENRE_PRESETS) {
      expect(preset.stylePrompt.length, preset.id).toBeGreaterThan(80);
      expect(preset.stylePrompt.split(",").length, preset.id).toBeGreaterThanOrEqual(2);
      expect(preset.stylePrompt, preset.id).toBe(preset.stylePrompt.trim());
      // Không nhắc tên thể loại: model vẽ được "clay-like objects", không vẽ được "merge".
      expect(preset.stylePrompt.toLowerCase(), preset.id).not.toContain(`${preset.id} game`);
    }
    // Không hai thể loại nào dùng chung một brief (chép-dán là cách bảng này chết dần).
    expect(new Set(GENRE_PRESETS.map((p) => p.stylePrompt)).size).toBe(GENRE_PRESETS.length);
  });
});

describe("bấm chip = điền form", () => {
  const merge = GENRE_PRESETS.find((p) => p.id === "merge")!;

  it("điền cả stylePrompt lẫn 8 trục, và KHÔNG giữ lại nấc của preset trước", () => {
    const patch = applyGenrePreset(merge);
    expect(patch.stylePrompt).toBe(merge.stylePrompt);
    expect(patch.styleAxes).toEqual(merge.axes);
    // Ô mô tả vừa được điền ⇒ bước này đang đi bằng CHỮ, không bằng ảnh tham chiếu.
    expect(patch.styleMode).toBe("prompt");
  });

  it("trả object mới — sửa state sau đó không bò ngược vào bảng preset", () => {
    const patch = applyGenrePreset(merge);
    patch.styleAxes.ornament = 1;
    expect(merge.axes.ornament).not.toBe(1);
  });

  it("chip sáng khi form đang khớp, tắt ngay khi người dùng chỉnh một nấc", () => {
    const form = { stylePrompt: merge.stylePrompt, styleAxes: { ...merge.axes } };
    expect(matchesGenrePreset(merge, form)).toBe(true);
    expect(matchesGenrePreset(merge, { ...form, styleAxes: { ...merge.axes, ornament: 7 } })).toBe(false);
    expect(matchesGenrePreset(merge, { ...form, stylePrompt: `${merge.stylePrompt}, và thêm ý của tôi` })).toBe(false);
    // Hai preset khác nhau không bao giờ cùng sáng.
    for (const other of GENRE_PRESETS.filter((p) => p.id !== merge.id)) {
      expect(matchesGenrePreset(other, form), other.id).toBe(false);
    }
  });

  it("chỉ hỏi trước khi đè khi THẬT SỰ có chữ để mất", () => {
    expect(genrePresetOverwrites({ stylePrompt: "" })).toBe(false);
    expect(genrePresetOverwrites({ stylePrompt: "   " })).toBe(false);
    expect(genrePresetOverwrites({ stylePrompt: "tông pastel, nét mảnh" })).toBe(true);
  });
});
