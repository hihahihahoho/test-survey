import { z } from "zod";
import { prefillValues, type BriefReadResult } from "@/features/docs/lib/brief-read";

export const STYLE_AXIS_IDS = ["age", "energy", "lux", "era", "gender", "detail", "outline"] as const;
export type StyleAxisId = (typeof STYLE_AXIS_IDS)[number];

const slider = z.number().int().min(1).max(7);
export const kitFormSchema = z.object({
  name: z.string().trim().min(2, "Nhập tên bộ kit để tiếp tục.").max(80),
  hasCharacter: z.boolean(),
  character: z.object({ species: z.string().max(120), traits: z.string().max(180), costume: z.string().max(180) }),
  style: z.object({ age: slider, energy: slider, lux: slider, era: slider, gender: slider, detail: slider, outline: slider }),
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Nhập màu dạng #RRGGBB."),
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Nhập màu dạng #RRGGBB."),
  avoid: z.string().max(300),
  stylePrompt: z.string().max(800),
  backgroundCount: z.number().int().min(0).max(8),
  poseCount: z.union([z.literal(4), z.literal(16)]),
  items: z.array(z.string()).max(16),
  characterRefUploaded: z.boolean(),
});
export type KitFormValues = z.infer<typeof kitFormSchema>;

export const DEFAULT_VALUES: KitFormValues = {
  name: "", hasCharacter: false,
  character: { species: "", traits: "", costume: "" },
  style: { age: 4, energy: 4, lux: 4, era: 4, gender: 4, detail: 4, outline: 4 },
  /* VNPAY-RECOLOR: cặp màu gợi ý mặc định của bộ kit đi theo nhận diện VNPAY
     (primary #005BAA · cyan phụ trợ #00B0F0). Đây là DỮ LIỆU brand của kit, không
     phải màu chrome của app — nên là hex thật, không phải token CSS. */
  primary: "#005BAA", secondary: "#00B0F0", avoid: "", stylePrompt: "",
  backgroundCount: 1, poseCount: 4, items: [], characterRefUploaded: false,
};

const text = (v: unknown) => Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "";
const score = (v: unknown) => typeof v === "number" && v >= 1 && v <= 7 ? v : undefined;

/** Chỉ lấy dữ liệu đã qua cổng cao/tb của intake parser; thap/trong luôn để trống. */
export function briefToForm(result: BriefReadResult): Partial<KitFormValues> {
  const p = prefillValues(result);
  const style = Object.fromEntries(STYLE_AXIS_IDS.flatMap((id) => {
    const value = score(p[`sc_${id}`]);
    return value === undefined ? [] : [[id, value]];
  })) as Partial<KitFormValues["style"]>;
  return {
    ...(text(p.project_name) ? { name: text(p.project_name) } : {}),
    ...(typeof p.need_mascot === "boolean" ? { hasCharacter: p.need_mascot } : {}),
    character: { species: text(p.char_species), traits: text(p.char_traits), costume: text(p.char_costume) },
    style: { ...DEFAULT_VALUES.style, ...style },
    ...(text(p.color_primary).match(/^#[0-9a-fA-F]{6}$/) ? { primary: text(p.color_primary) } : {}),
    ...(text(p.color_secondary).match(/^#[0-9a-fA-F]{6}$/) ? { secondary: text(p.color_secondary) } : {}),
    avoid: text(p.style_avoid),
  };
}
