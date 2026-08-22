import { contractSchema, type Component, type Contract, type Sheet } from "@/lib/types/contract";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import type { KitFormValues } from "./form-model";
import { squareCapacity } from "./scope-model";

const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "mon";
const empty = (): Component => ({ file: "", vi: "", spec: "", skel: { shape: "empty" } });
const dimensions = (capacity: number) => capacity === 1 ? 1 : capacity === 4 ? 2 : capacity === 9 ? 3 : 4;

export function uniqueId(base: string, used: Set<string>): string {
  const clean = slug(base).slice(0, 32) || "tam";
  let id = clean.length >= 2 ? clean : `${clean}-1`;
  for (let n = 2; used.has(id); n += 1) id = `${clean.slice(0, 29)}-${n}`;
  used.add(id); return id;
}

export function buildContract(values: KitFormValues): Contract {
  const used = new Set<string>(); const sheets: Sheet[] = [];
  for (let i = 0; i < values.backgroundCount; i += 1) sheets.push({ id: uniqueId(`nen-${i + 1}`, used), grid: { cols: 1, rows: 1 }, orient: "landscape", components: [{ file: `01-nen-${i + 1}`, vi: `Màn nền ${i + 1}`, spec: "Full-bleed game background scene", skel: { shape: "full", w: 1, h: 1 } }] });
  const picked = loadBundledV2().elements.filter((item) => values.items.includes(item.file)).slice(0, 16);
  if (picked.length) { const capacity = squareCapacity(picked.length); const side = dimensions(capacity); sheets.push({ id: uniqueId("giao-dien", used), grid: { cols: side, rows: side }, components: [...picked.map((item, i) => ({ file: `${String(i + 1).padStart(2, "0")}-${slug(item.file.replace(/^\d+-/, ""))}`, vi: item.vi, spec: item.spec, skel: { ...item.skel, shape: item.skel.shape === "rect" ? "rrect" as const : item.skel.shape } })), ...Array.from({ length: capacity - picked.length }, empty)] }); }
  if (values.hasCharacter && values.poseCount > 0) { const side = values.poseCount === 4 ? 2 : 4; sheets.push({ id: uniqueId("tu-the", used), grid: { cols: side, rows: side }, components: Array.from({ length: values.poseCount }, (_, i) => ({ file: `pose-${i + 1}`, vi: `Tư thế ${i + 1}`, spec: `Character pose ${i + 1}`, skel: { shape: "pose" as const, w: 0.8, h: 0.9, pose: `pose-${i + 1}` } })) }); }
  const characterId = uniqueId("nhan-vat", new Set());
  return contractSchema.parse({ schemaVersion: 4, variants: [{ id: "phong-cach-1", vi: "Phong cách chính", style: values.stylePrompt, brand: { mode: "colors", primary: values.primary, secondary: values.secondary }, characters: values.hasCharacter ? [{ id: characterId, vi: values.character.species || "Nhân vật", ref: null }] : [] }], sheets, characterPoses: values.hasCharacter ? Array.from({ length: values.poseCount }, (_, i) => `pose-${i + 1}`) : [] });
}

export const countCutItems = (contract: Contract) => contract.sheets.reduce((sum, sheet) => sum + sheet.components.filter((item) => item.skel.shape !== "empty").length, 0);
