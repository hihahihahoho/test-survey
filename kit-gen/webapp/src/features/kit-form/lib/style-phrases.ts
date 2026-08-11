import type { KitFormValues, StyleAxisId } from "./form-model";

export interface StyleAxis { id: StyleAxisId; left: string; right: string; phrases: readonly string[] }
export const STYLE_AXES: readonly StyleAxis[] = [
  { id: "age", left: "Chín chắn", right: "Trẻ trung", phrases: ["mature and composed", "refined and adult", "quietly youthful", "balanced in age", "friendly and youthful", "playful and youthful", "very young and playful"] },
  { id: "energy", left: "Sống động, ồn ào", right: "Thư giãn, nhẹ nhàng", phrases: ["high-energy and bustling", "lively busy composition", "bright and active", "balanced energy", "calm and open", "relaxed gentle mood", "very quiet and soothing"] },
  { id: "lux", left: "Sang trọng", right: "Bình dị, gần gũi", phrases: ["premium and luxurious", "polished upscale feel", "tastefully refined", "balanced and welcoming", "warm everyday feel", "humble and approachable", "rustic and down-to-earth"] },
  { id: "era", left: "Hiện đại", right: "Cổ điển", phrases: ["future-facing contemporary style", "clean modern era", "subtly modern", "timeless", "classic-inspired", "traditional vintage character", "deeply nostalgic folk-art era"] },
  { id: "gender", left: "Nam tính", right: "Nữ tính", phrases: ["strong masculine character", "clearly masculine", "slightly masculine", "gender-neutral", "slightly feminine", "clearly feminine", "soft feminine character"] },
  { id: "detail", left: "Nét phẳng", right: "Đổ khối dày", phrases: ["minimal flat shapes", "clean flat shading", "mostly flat with subtle depth", "balanced dimensional shading", "layered dimensional shading", "rich sculpted volume", "deeply modeled dimensional forms"] },
  { id: "outline", left: "Không viền", right: "Viền đậm", phrases: ["no visible outline", "very soft outline", "thin restrained outline", "medium outline", "clear graphic outline", "bold outline", "very bold heavy outline"] },
] as const;

export function buildStylePrompt(style: KitFormValues["style"]): string {
  return STYLE_AXES.map((axis) => axis.phrases[style[axis.id] - 1]).join(", ");
}
export function sliderValueText(axis: StyleAxis, value: number): string {
  const lean = value === 4 ? "ở giữa" : `nghiêng về ${value < 4 ? axis.left : axis.right}`;
  return `nấc ${value} trên 7 — ${lean}`;
}
