import * as React from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";
import { STYLE_AXIS_IDS } from "@/features/kit-form/lib/form-model";
import type { StyleAxisId } from "@/features/kit-form/lib/form-model";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import { allPoseIds } from "./poses";
import { draftKey, migrateLegacyDraft, onDraftForgotten } from "./draft-storage";

export { LEGACY_DRAFT_KEY, draftKey, trashedDraftKey, migrateLegacyDraft, dropWorkflowDraft, restoreWorkflowDraft } from "./draft-storage";

/**
 * BẢN NHÁP WORKFLOW — **MỘT BẢN NHÁP CHO MỖI BỘ KIT** (UPGRADE-PLAN §W1-1).
 *
 * Bản cũ dùng đúng một key `kitgen.workflow-v4` cho cả trình duyệt ⇒ mở bộ kit B
 * ra brief của bộ kit A, và nhảy thẳng vào bước 6 của A. Đó là **mất dữ liệu**,
 * không phải khó chịu.
 *
 * Cách sửa (ít rủi ro nhất — 6 file step KHÔNG đổi một chữ):
 *   · store singleton  →  **factory có cache** theo `projectId`;
 *   · `WorkflowStoreProvider` bọc quanh nội dung màn;
 *   · tên hàm export `useWorkflowStore` GIỮ NGUYÊN, chỉ đổi thân
 *     ⇒ mọi step vẫn viết `const s = useWorkflowStore();`.
 *
 * Di trú: bản nháp cũ (key không có projectId) được **nhận** cho project đầu tiên
 * mở sau khi nâng cấp, rồi key cũ mới bị xoá. Không im lặng vứt bản nháp của ai.
 */

export type StepId = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * BƯỚC CUỐI CỦA WIZARD — 5, không phải 6.
 *
 * Bước "Kết quả" cũ đã bỏ: bấm **Tạo ảnh** ở bước Kiểm tra là đi thẳng vào màn quản lý
 * dự án, tab "Ảnh đã tạo" — nơi vốn đã có đủ phiên bản ảnh, tạo lại theo nhóm và lịch sử
 * run. Đứng lại trong stepper để xem kết quả là một bản sao nghèo hơn của màn đó.
 * `StepId` vẫn giữ số 6 vì bản nháp cũ trên đĩa có thể đang mang `step: 6`; mọi đường
 * đi mới đều kẹp về `LAST_STEP`.
 */
export const LAST_STEP = 5 satisfies StepId;

/**
 * KÍCH THƯỚC RIÊNG CỦA DỰ ÁN cho một ô skeleton — phần trăm bề rộng/cao của Ô, đúng
 * đơn vị mà `LibElement.skel.w/h` và `Contract.components[].skel.w/h` đang dùng (0–1).
 *
 * ⚠️ KHÔNG phải một nguồn sự thật thứ hai. Thư viện chung vẫn là mặc định; đây chỉ là
 * lớp ĐÈ của riêng dự án, và nó được `resolveKitset()` trộn vào `skel` của thư viện
 * TRƯỚC khi dựng contract. Bỏ trống ⇒ dùng số của thư viện (§7 sitemap: "sửa bộ khung
 * trong dự án chỉ sửa bản của dự án đó").
 */
export type KitElementSkel = { w?: number; h?: number };
export type KitElement = {
  file: string;
  label: string;
  role: string;
  cell: string;
  mock?: boolean;
  selected: boolean;
  /** Ghi đè kích thước ô của riêng dự án. Vắng mặt ⇒ theo thư viện. */
  skel?: KitElementSkel;
};

/** Kẹp một cạnh skeleton về khoảng dùng được. `null` ⇒ trả về thư viện. */
export function clampSkelSide(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0.05, Math.round(value * 100) / 100));
}
export type Chroma = "magenta" | "green";
export type SheetLimitKey = "background" | "popup" | "small" | "props" | "mascot";
/** `null` = dùng giới hạn của thư viện chung; số = ghi đè cho riêng dự án. */
export type ProjectSheetLimits = Record<SheetLimitKey, number | null>;
/**
 * Bộ trường một phiên bản chụp lại. **`stylePrompt` nằm trong đây** — nó là ô người
 * ta sửa nhiều nhất (textarea to nhất, đầu panel); thiếu nó thì badge "Cần render lại"
 * không bao giờ hiện và `restoreVersion` không có gì để khôi phục (§W1-3, §W1-4).
 */
export type VersionSettings = { chroma: Chroma; kitsetSummary: string; mascot: string; sliceThreshold: number; stylePrompt: string };
export type KitVersion = { id: string; label: `v${number}`; createdAt: string; status: "mock" | "rendering" | "ready" | "failed"; runId?: string; prompt: string; settings: VersionSettings };
export type StyleAxes = Record<StyleAxisId, number>;

/**
 * UI-FIX §3b — MỘT NHÂN VẬT TRONG DANH SÁCH.
 *
 * Bước Mascot trước đây là form inline cho **đúng một** con: [Tên] [Mô tả] [vùng thả ảnh].
 * Thêm con thứ hai là chuyện không làm được, dù `Contract.variants[].characters` vốn là
 * MẢNG. Nay bước này là danh sách thẻ + modal "Thêm nhân vật", đúng nhịp màn Nhận dạng
 * thương hiệu / thư viện Mascot.
 *
 * `ref.name` là **tên agent đặt trên đĩa** (`char-*.png`, `agent/routes/refs.mjs:118`),
 * không phải tên file gốc của người dùng — nhờ vậy mỗi nhân vật giữ đúng ảnh CỦA NÓ
 * ngay cả khi có 3 con cùng nằm trong `refs/`.
 */
export type WorkflowMascot = {
  id: string;
  name: string;
  description: string;
  ref: { name: string } | null;
};

/** Id ổn định cho một nhân vật mới. `crypto.randomUUID` không có ở mọi runtime test. */
export function newMascotId(): string {
  const rnd = globalThis.crypto?.randomUUID?.();
  return rnd ?? `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * §W3-5 — MỘT DANH SÁCH ELEMENT DUY NHẤT.
 *
 * Trước wave này có **ba** danh sách đá nhau: `luckyElements` 11 món hardcode ở đây ·
 * `SCOPE_CHOICES` 12 món (export chết, không ai import) · `element-lib` 42 món thật.
 * Nay `model.ts` **không còn giữ dữ liệu element nào** — chỉ giữ DANH SÁCH ID trỏ vào
 * thư viện. Nhãn, `spec`, `skel` đều lấy từ thư viện, nên kho và kitset không thể lệch nhau.
 */
export const LUCKY_PRESET_FILES = [
  "01-btn-pill-red", "09-popup-panel-short", "24-popup-panel-tall", "41-btn-close",
  "10-popup-ribbon", "25-bg-home", "26-bg-play",
] as const;

/**
 * ⚠️ CHỜ CHỦ DỰ ÁN CHỐT (plan §C3) — món preset **không có** trong thư viện 42 món.
 * `element-lib.json` không có vòng quay / kim quay / ô kết quả, nên preset "quay số
 * may mắn" đang bán một thứ contract không sinh được. Giữ lại + gắn `mock:true` là
 * cách trung thực nhất hiện có: người dùng thấy nó, biết nó chưa vẽ được, và
 * `buildKitsetContract` loại nó ra nên KHÔNG bị tính tiền.
 */
export const PRESET_MISSING_DESIGN: readonly KitElement[] = [
  { file: "wheel-board", label: "Vòng quay", role: "Bàn quay chính", cell: "dọc", mock: true, selected: true },
];

/** Ô của thư viện (`landscape|portrait|full`) → chữ hiện trên thẻ. Nhận cả giá trị cũ. */
export function cellLabel(cell: string): string {
  return cell === "landscape" ? "ngang" : cell === "portrait" ? "dọc" : cell;
}

/** Metadata hiển thị của một element, lấy từ thư viện đóng gói (đồng bộ, không chờ mạng). */
function libMeta(file: string): { label: string; role: string; cell: string } | null {
  const hit = loadBundledV2().elements.find((e) => e.file === file);
  if (!hit) return null;
  return { label: hit.vi, role: hit.group ? `Nhóm ${hit.group}` : "Element giao diện", cell: cellLabel(hit.cell ?? "landscape") };
}

/** Kitset khởi tạo của preset — dựng TỪ THƯ VIỆN, không phải từ một mảng chép tay. */
export function presetKitset(): KitElement[] {
  const picked = LUCKY_PRESET_FILES.map((f): KitElement | null => {
    const file: string = f;
    const meta = libMeta(file);
    return meta ? { file, ...meta, selected: true } : null;
  }).filter((e): e is KitElement => e !== null);
  return [...PRESET_MISSING_DESIGN.map((e) => ({ ...e })), ...picked];
}

/**
 * UI-FIX §2 — **MẶC ĐỊNH CHỌN HẾT**.
 *
 * Bản cũ mở wizard ra là 7 món của preset "quay số may mắn" được tick, 35 món còn lại
 * mang dấu `+`. Người dùng phải CỘNG THÊM từng món để có bộ khung của mình — mà việc
 * họ thật sự làm là *bớt* những món không cần. Nay kitset khởi tạo là TOÀN BỘ thư viện,
 * đã tick sẵn; `KitsetStep` còn nới tiếp cho kho của agent + bộ khung người dùng tự thêm
 * (xem `kitsetTouched` bên dưới).
 *
 * `wheel-board` (mock) vẫn giữ: nó là món preset chưa có bản thiết kế và UI phải nói ra
 * điều đó, không phải giấu đi (§C3).
 */
export function defaultKitset(): KitElement[] {
  const all = loadBundledV2().elements.map((e): KitElement => ({
    file: e.file,
    label: e.vi,
    role: e.group ? `Nhóm ${e.group}` : "Element giao diện",
    cell: cellLabel(e.cell ?? "landscape"),
    selected: true,
  }));
  return [...PRESET_MISSING_DESIGN.map((e) => ({ ...e })), ...all];
}

export type WorkflowState = {
  step: StepId;
  unlocked: StepId;
  kitName: string;
  /** §W1-6: ô "Mục tiêu / campaign" trước đây không bind — gõ xong đổi bước là mất chữ. */
  campaign: string;
  brief: string;
  stylePrompt: string;
  styleMode: "prompt" | "inspo";
  brandProfileId: string | null;
  styleRefs: { name: string; kind: "style" | "brand" }[];
  styleAxes: StyleAxes;
  primaryColor: string;
  secondaryColor: string;
  styleAvoid: string;
  chroma: Chroma;
  kitsetSummary: string;
  sliceThreshold: number;
  sheetLimits: ProjectSheetLimits;
  brandRefs: { name: string }[];
  mascotEnabled: boolean;
  /**
   * Ba trường `mascotName` / `mascotDescription` / `mascotRef` là **TIẾNG VỌNG của
   * `mascots[0]`**, không phải nguồn sự thật. Chúng ở lại vì `contract-import.ts`,
   * `versionSettingsOf` và các bản nháp đã ghi ra đĩa đều nói bằng chúng — xoá đi là
   * làm mất bản nháp của người dùng. Mọi hành động mascot đi qua `syncPrimaryMascot`
   * nên hai bên không thể lệch.
   */
  mascotName: string;
  mascotDescription: string;
  mascotRef: { name: string } | null;
  /** Danh sách nhân vật của dự án — nguồn sự thật của bước Mascot (UI-FIX §3b). */
  mascots: WorkflowMascot[];
  /** LUÔN là id tiếng Anh (`idle|cheer|sad|present`) — nhãn tiếng Việt ở tầng UI (§W1-7). */
  mascotPoses: string[];
  elements: KitElement[];
  /**
   * UI-FIX §2 — người dùng ĐÃ tự tay chỉnh kitset chưa.
   *
   * Khi còn `false`, `KitsetStep` tick sẵn mọi món mới thấy trong kho (kho của agent và
   * bộ khung người dùng tự thêm về SAU bản nháp, nên chỉ dựa vào `defaultKitset()` là
   * thiếu). Vừa bấm một món là cờ bật, và app THÔI tự chọn thay người dùng — nếu không,
   * món vừa bỏ tick sẽ được tick lại ở lần render sau.
   */
  kitsetTouched: boolean;
  versions: KitVersion[];
  activeVersion: string;
  set: (patch: Partial<WorkflowState>) => void;
  next: () => void;
  back: () => void;
  go: (step: StepId) => void;
  /**
   * §W3-5: kho nay là **42 món của thư viện**, còn `elements` là KITSET (thứ đã chọn).
   * Bấm một món chưa có trong kitset ⇒ THÊM nó vào, không phải lật cờ của thứ không tồn tại.
   * `meta` để nơi gọi truyền nhãn của thư viện AGENT (mới hơn bản đóng gói); thiếu thì
   * tự tra bản đóng gói.
   */
  toggleElement: (file: string, meta?: { label: string; role: string; cell: string }) => void;
  /**
   * UI-FIX §2 — tick sẵn mọi món của kho mà kitset chưa biết. KHÔNG bật `kitsetTouched`
   * (đây là app tự làm, không phải người dùng), và KHÔNG đụng tới món đã có trong kitset
   * — kể cả món người dùng vừa bỏ tick.
   */
  adoptCatalogue: (items: ReadonlyArray<{ file: string; label: string; role: string; cell: string }>) => void;
  /** Chọn / bỏ chọn hàng loạt (nút "Chọn tất cả" · "Bỏ chọn" của bước Skeleton UI). */
  setElementsSelected: (files: readonly string[], selected: boolean) => void;
  /**
   * Đè kích thước ô của MỘT thành phần. `null` cho một cạnh = trả cạnh đó về thư viện;
   * cả hai cạnh `null` ⇒ xoá hẳn lớp đè để bản nháp không phình ra vì số trùng mặc định.
   */
  setElementSkel: (file: string, patch: { w?: number | null; h?: number | null }) => void;
  addMascot: (input: { name: string; description: string; ref?: { name: string } | null }) => string;
  patchMascot: (id: string, patch: Partial<Omit<WorkflowMascot, "id">>) => void;
  removeMascot: (id: string) => void;
  addVersion: (prompt: string, status?: KitVersion["status"], runId?: string) => string;
  /** §W3-9(c) — đường để C1 (nút Vẽ thật) lật `mock → rendering → ready/failed`. */
  markVersionStatus: (id: string, status: KitVersion["status"]) => void;
  restoreVersion: (id: string) => void;
};

/** Mascot được chụp thành MỘT chuỗi trong version — đây là bộ mã hoá/giải mã của nó. */
const MASCOT_OFF = "Không dùng";
const MASCOT_ON_UNNAMED = "Đã bật";
export function mascotLabelOf(s: Pick<WorkflowState, "mascotEnabled" | "mascotName">): string {
  return s.mascotEnabled ? s.mascotName || MASCOT_ON_UNNAMED : MASCOT_OFF;
}
function mascotStateOf(label: string): Pick<WorkflowState, "mascotEnabled" | "mascotName"> {
  if (label === MASCOT_OFF) return { mascotEnabled: false, mascotName: "" };
  return { mascotEnabled: true, mascotName: label === MASCOT_ON_UNNAMED ? "" : label };
}

/**
 * MỘT nguồn duy nhất cho bộ trường của phiên bản. `addVersion` chụp bằng hàm này và
 * `ResultStep` so "cần render lại" cũng bằng hàm này ⇒ hai bên không thể lệch bộ trường
 * (đúng chỗ bản cũ sai: `dirty` so 4 trường, snapshot ghi 4 trường khác).
 */
export function versionSettingsOf(
  s: Pick<WorkflowState, "chroma" | "kitsetSummary" | "mascotEnabled" | "mascotName" | "sliceThreshold" | "stylePrompt">,
): VersionSettings {
  return {
    chroma: s.chroma,
    kitsetSummary: s.kitsetSummary,
    mascot: mascotLabelOf(s),
    sliceThreshold: s.sliceThreshold,
    stylePrompt: s.stylePrompt,
  };
}

/** `true` khi state hiện tại đã khác bản đã render ⇒ badge "Cần render lại". */
export function settingsDirty(
  version: Pick<KitVersion, "settings" | "prompt"> | undefined | null,
  s: Parameters<typeof versionSettingsOf>[0],
): boolean {
  if (!version) return false;
  const snap = { ...version.settings, stylePrompt: version.settings.stylePrompt ?? version.prompt };
  const now = versionSettingsOf(s);
  return (Object.keys(now) as (keyof VersionSettings)[]).some((k) => snap[k] !== now[k]);
}

/**
 * §W3-9 — NHÃN PHIÊN BẢN CÓ NGHĨA: `"v2 · 14:32 · đổi mô tả phong cách"`.
 *
 * Trước đây dropdown chỉ có `"v1"`, `"v2"` — hai phiên bản không phân biệt được bằng
 * mắt, nên "Khôi phục bản này" là một cú bấm mù. Mẩu mô tả sinh bằng cách **diff trên
 * `VersionSettings`**, đúng lời dặn của `W1-DONE` §Bàn giao (*"nên diff trên
 * `VersionSettings` thay vì bịa bộ trường thứ hai"*) — nhờ vậy nhãn không bao giờ nói
 * khác badge "Cần render lại", vì cả hai đọc chung một bộ trường.
 */
const SETTING_VI: Record<keyof VersionSettings, string> = {
  stylePrompt: "đổi mô tả phong cách",
  chroma: "đổi màu nền tách",
  kitsetSummary: "đổi tóm tắt kitset",
  mascot: "đổi mascot",
  sliceThreshold: "đổi ngưỡng tách",
};

/** Giờ:phút của lần tạo — người dùng nhớ "bản lúc 14:32", không nhớ id. */
function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function versionLabel(v: KitVersion, prev?: KitVersion): string {
  const parts: string[] = [v.label];
  const t = hhmm(v.createdAt);
  if (t) parts.push(t);
  if (prev) {
    const changed = (Object.keys(v.settings) as (keyof VersionSettings)[])
      .filter((k) => prev.settings[k] !== v.settings[k])
      .map((k) => SETTING_VI[k]);
    if (changed.length === 1) parts.push(changed[0]!);
    else if (changed.length > 1) parts.push(`đổi ${changed.length} thứ`);
  }
  if (v.status === "rendering") parts.push("đang tạo…");
  if (v.status === "ready") parts.push("đã tạo");
  if (v.status === "failed") parts.push("hỏng");
  // "mock" is retained for old local drafts created before real generation was connected.
  if (v.status === "mock") parts.push("bản nháp");
  return parts.join(" · ");
}

/**
 * Nghịch đảo của `versionSettingsOf` — dùng cho "Khôi phục bản này".
 *
 * ⚠️ KHÔNG BAO GIỜ ĐƯỢC TRẢ VỀ `undefined` CHO MỘT TRƯỜNG CÓ KIỂU ĐẶC.
 * `KitVersion.settings` là kiểu ĐẦY ĐỦ trên giấy, nhưng ở runtime nó đến từ
 * `localStorage` — tức là từ một bản build CŨ HƠN, hoặc từ dữ liệu bị sửa tay.
 * Bản cũ tin tuyệt đối vào kiểu và spread thẳng, nên một version thiếu trường
 * sẽ ghi `undefined` đè lên state đang đúng. Hậu quả đo được (probe
 * playwright, 2026-08-08): `settings: {}` ⇒ `mascotStateOf(undefined)` trả
 * `{ mascotEnabled: true, mascotName: undefined }` ⇒ `buildKitsetContract`
 * gọi `s.mascotName.trim()` ⇒ **TypeError trong useMemo ⇒ error boundary nuốt
 * cả màn ⇒ `#result-prompt` biến mất khỏi DOM.** Người dùng thấy "Không mở
 * được trang này" chỉ vì bấm đổi phiên bản.
 *
 * Nay: trường nào KHÔNG có trong snapshot thì BỎ QUA (zustand giữ giá trị đang
 * chạy), không ghi đè bằng `undefined`. Khôi phục thiếu vẫn tốt hơn sập màn.
 */
export function stateFromVersion(v: KitVersion): Partial<WorkflowState> {
  const raw = (v.settings ?? {}) as Partial<VersionSettings>;
  const out: Partial<WorkflowState> = {
    chroma: raw.chroma,
    kitsetSummary: raw.kitsetSummary,
    sliceThreshold: raw.sliceThreshold,
    stylePrompt: raw.stylePrompt ?? v.prompt,
    // `mascot` là MỘT chuỗi mã hoá cả hai trường; thiếu nó thì không giải mã
    // được gì cả ⇒ để nguyên mascot hiện tại, không đoán bừa.
    ...(typeof raw.mascot === "string" ? mascotStateOf(raw.mascot) : {}),
  };
  for (const k of Object.keys(out) as (keyof WorkflowState)[]) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   KHOÁ BẢN NHÁP THEO BỘ KIT — chỗ chứa ở `./draft-storage`
   ══════════════════════════════════════════════════════════════════════════ */

export type WorkflowStore = StoreApi<WorkflowState>;

const stores = new Map<string, WorkflowStore>();

/* Bộ kit bị xoá (hoặc được hoàn tác) ⇒ store đang cache trong RAM phải bị quên,
   nếu không lần mở sau sẽ dựng lại từ bộ nhớ và ghi đè chính cái vừa dọn. */
onDraftForgotten((projectId) => void stores.delete(projectId));

type WorkflowActionKey =
  | "set" | "next" | "back" | "go" | "toggleElement" | "adoptCatalogue" | "setElementsSelected" | "setElementSkel"
  | "addMascot" | "patchMascot" | "removeMascot"
  | "addVersion" | "markVersionStatus" | "restoreVersion";

function initialState(): Omit<WorkflowState, WorkflowActionKey> {
  return {
    step: 1,
    unlocked: 1,
    kitName: "Dự án mới",
    campaign: "",
    brief: "",
    stylePrompt: "Vui tươi, 3D bóng nhẹ, màu xanh dương VNPAY và xanh cyan, sạch và dễ đọc trên màn hình game.",
    styleMode: "prompt",
    brandProfileId: null,
    styleRefs: [],
    styleAxes: Object.fromEntries(STYLE_AXIS_IDS.map((id) => [id, 4])) as StyleAxes,
    primaryColor: "#005BAA",
    secondaryColor: "#00B0F0",
    styleAvoid: "",
    chroma: "magenta",
    kitsetSummary: "Bộ khung UI đã chọn",
    sliceThreshold: 120,
    sheetLimits: { background: null, popup: null, small: null, props: null, mascot: null },
    brandRefs: [],
    mascotEnabled: true,
    mascotName: "",
    mascotDescription: "",
    mascotRef: null,
    mascots: [],
    // UI-FIX §3a — mặc định chọn HẾT dáng, cùng nguyên tắc với bộ khung UI.
    mascotPoses: allPoseIds(),
    elements: defaultKitset(),
    kitsetTouched: false,
    versions: [],
    activeVersion: "",
  };
}

/**
 * `mascots` ⇄ ba trường cũ. Gọi sau MỌI thay đổi danh sách nhân vật.
 *
 * Nhân vật đầu là nhân vật CHÍNH của contract, nên nó là cái được chiếu xuống ba
 * trường cũ. Danh sách rỗng ⇒ ba trường về rỗng, không giữ lại xác của con vừa xoá.
 */
function syncPrimaryMascot(mascots: readonly WorkflowMascot[]): Pick<WorkflowState, "mascots" | "mascotName" | "mascotDescription" | "mascotRef"> {
  const first = mascots[0];
  return {
    mascots: [...mascots],
    mascotName: first?.name ?? "",
    mascotDescription: first?.description ?? "",
    mascotRef: first?.ref ?? null,
  };
}

/**
 * Bản nháp cũ (một mascot, ba trường rời) → danh sách. Trả `null` khi không có gì để
 * nâng cấp, để nơi gọi khỏi `set()` thừa một vòng.
 *
 * Idempotent: chạy lại trên state đã nâng cấp thì trả `null`.
 */
export function migrateMascots(s: Pick<WorkflowState, "mascots" | "mascotName" | "mascotDescription" | "mascotRef">): WorkflowMascot[] | null {
  if (s.mascots.length > 0) return null;
  const name = s.mascotName?.trim() ?? "";
  const description = s.mascotDescription?.trim() ?? "";
  if (!name && !description && !s.mascotRef) return null;
  return [{ id: newMascotId(), name: s.mascotName, description: s.mascotDescription, ref: s.mascotRef }];
}

export const workflowDraftOf = (s: WorkflowState) => ({
  step: s.step, unlocked: s.unlocked, kitName: s.kitName, campaign: s.campaign, brief: s.brief,
  stylePrompt: s.stylePrompt, styleMode: s.styleMode, brandProfileId: s.brandProfileId, styleRefs: s.styleRefs, styleAxes: s.styleAxes,
  primaryColor: s.primaryColor, secondaryColor: s.secondaryColor, styleAvoid: s.styleAvoid,
  chroma: s.chroma, kitsetSummary: s.kitsetSummary, sliceThreshold: s.sliceThreshold,
  sheetLimits: s.sheetLimits,
  brandRefs: s.brandRefs, mascotEnabled: s.mascotEnabled, mascotName: s.mascotName,
  mascotDescription: s.mascotDescription, mascotRef: s.mascotRef, mascots: s.mascots,
  mascotPoses: s.mascotPoses,
  elements: s.elements, kitsetTouched: s.kitsetTouched, versions: s.versions, activeVersion: s.activeVersion,
});
const partialize = workflowDraftOf;

export function hydrateWorkflowStore(store: WorkflowStore, draft: Record<string, unknown> | null | undefined): void {
  if (!draft) return;
  const initial = initialState();
  const safe = Object.fromEntries(Object.keys(initial).filter(key => draft[key] !== undefined).map(key => [key, draft[key]])) as Partial<WorkflowState>;
  store.setState(safe);
  // Bản nháp ghi từ bản build CŨ chỉ có ba trường mascot rời — nâng lên danh sách NGAY
  // ở đây, để bước Mascot không phải biết tới hai hình dạng dữ liệu.
  const next = migrateMascots(store.getState());
  if (next) store.setState(syncPrimaryMascot(next));
}

/** Factory CÓ CACHE: mở lại cùng một bộ kit trong một phiên thì vẫn là một store. */
export function createWorkflowStore(projectId: string): WorkflowStore {
  const cached = stores.get(projectId);
  if (cached) return cached;
  migrateLegacyDraft(projectId);
  const store = createStore<WorkflowState>()(
    persist(
      (set, get) => ({
        ...initialState(),
        set: (patch) => set(patch),
        next: () => { const n = Math.min(LAST_STEP, get().step + 1) as StepId; set({ step: n, unlocked: Math.max(get().unlocked, n) as StepId }); },
        back: () => set({ step: Math.max(1, get().step - 1) as StepId }),
        go: (step) => { if (step <= get().unlocked) set({ step }); },
        toggleElement: (file, meta) => set((s) => {
          if (s.elements.some((e) => e.file === file)) {
            return { kitsetTouched: true, elements: s.elements.map((e) => (e.file === file ? { ...e, selected: !e.selected } : e)) };
          }
          const info = meta ?? libMeta(file) ?? { label: file, role: "Element giao diện", cell: "ngang" };
          return { kitsetTouched: true, elements: [...s.elements, { file, ...info, selected: true }] };
        }),
        adoptCatalogue: (items) => {
          // Thoát TRƯỚC khi `set`: một `set({})` rỗng vẫn tạo state object mới ⇒ render
          // thừa + một nhịp autosave ghi đĩa cho thứ không đổi.
          const s = get();
          const known = new Set(s.elements.map((e) => e.file));
          const fresh = items.filter((it) => !known.has(it.file)).map((it): KitElement => ({ ...it, selected: true }));
          if (fresh.length === 0) return;
          set({ elements: [...s.elements, ...fresh] });
        },
        setElementsSelected: (files, selected) => set((s) => {
          const want = new Set(files);
          return {
            kitsetTouched: true,
            elements: s.elements.map((e) => (want.has(e.file) ? { ...e, selected } : e)),
          };
        }),
        setElementSkel: (file, patch) => set((s) => ({
          kitsetTouched: true,
          elements: s.elements.map((e) => {
            if (e.file !== file) return e;
            const next: KitElementSkel = { ...(e.skel ?? {}) };
            if ("w" in patch) {
              const w = clampSkelSide(patch.w ?? null);
              if (w === null) delete next.w; else next.w = w;
            }
            if ("h" in patch) {
              const h = clampSkelSide(patch.h ?? null);
              if (h === null) delete next.h; else next.h = h;
            }
            const { skel: _drop, ...rest } = e;
            return Object.keys(next).length > 0 ? { ...rest, skel: next } : rest;
          }),
        })),
        addMascot: ({ name, description, ref = null }) => {
          const id = newMascotId();
          set((s) => syncPrimaryMascot([...s.mascots, { id, name, description, ref }]));
          return id;
        },
        patchMascot: (id, patch) => set((s) => syncPrimaryMascot(
          s.mascots.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        )),
        removeMascot: (id) => set((s) => syncPrimaryMascot(s.mascots.filter((m) => m.id !== id))),
        /**
         * §W3-9(c) — TRẠNG THÁI PHIÊN BẢN THÔI NÓI DỐI.
         *
         * Bản cũ đặt `status:"ready"` NGAY LẬP TỨC dù chưa có một pixel nào. Plan đề
         * nghị `"rendering"` → `"ready"`. Tôi dùng **`"mock"`**, và đây là lệch có chủ ý:
         * nút Vẽ vẫn đang khoá chờ chủ dự án chốt (§C1), nên KHÔNG có gì đang render cả.
         * Hiện `"rendering"` rồi tự nhảy sang `"ready"` sau một `setTimeout` là dựng
         * một màn kịch — đúng loại nói dối mà cả wave này sinh ra để dọn. `"mock"` là
         * sự thật, và nhãn hiện ra chữ "bản nháp" để người dùng biết.
         * Khi C1 được chốt: `markVersionStatus(id, "rendering")` lúc bấm, rồi
         * `"ready"`/`"failed"` theo `run.finished` — model KHÔNG phải đổi thêm gì.
         */
        addVersion: (prompt, status = "mock", runId) => {
          const n = get().versions.length + 1;
          const id = `v${n}`;
          set((s) => {
          const version: KitVersion = {
            id, label: id as `v${number}`, createdAt: new Date().toISOString(), status,
            ...(runId ? { runId } : {}), prompt,
            settings: versionSettingsOf({ ...s, stylePrompt: prompt }),
          };
          /* Bước "Kết quả" trong stepper đã bị bỏ (bấm Tạo ảnh là vào thẳng màn quản lý
             dự án, tab "Ảnh đã tạo"). Nên phiên bản mới KHÔNG còn đẩy wizard sang bước 6
             — nó dừng ở bước cuối cùng còn tồn tại, để bản nháp cũ mở lại không rơi vào
             một bước không có nội dung. */
          return { versions: [...s.versions, version], activeVersion: id, step: LAST_STEP, unlocked: LAST_STEP };
          });
          return id;
        },
        markVersionStatus: (id, status) => set((s) => ({
          versions: s.versions.map((v) => (v.id === id ? { ...v, status } : v)),
        })),
        /**
         * §W1-3: nạp lại SETTINGS THẬT chứ không chỉ đổi cái nhãn. Bản cũ
         * `set({activeVersion:id})` ⇒ chọn v1 xong vẫn đang sửa trên nháp của v2.
         */
        restoreVersion: (id) => set((s) => {
          const v = s.versions.find((x) => x.id === id);
          if (!v) return { activeVersion: id };
          const patch = stateFromVersion(v);
          // Snapshot chỉ chụp TÊN nhân vật chính (một chuỗi). Chiếu nó ngược vào
          // `mascots[0]` để thẻ ở bước Mascot không nói khác thẻ recap ở bước Kiểm tra.
          const mascots = typeof patch.mascotName === "string" && s.mascots.length > 0
            ? s.mascots.map((m, i) => (i === 0 ? { ...m, name: patch.mascotName! } : m))
            : s.mascots;
          return { activeVersion: id, ...patch, mascots };
        }),
      }),
      { name: draftKey(projectId), partialize },
    ),
  );
  stores.set(projectId, store);
  return store;
}

/** CHỈ dùng trong test — dọn cache factory giữa hai ca. */
export function resetWorkflowStores(): void {
  stores.clear();
}

const WorkflowStoreCtx = React.createContext<WorkflowStore | null>(null);

/**
 * §W3-3 — `projectId` cũng phải xuống tới bước.
 *
 * Từ WAVE 3 các bước gọi API THẬT theo bộ kit (upload ref, đọc kit, chạy cắt), mà API
 * nào cũng cần `projectId`. Chuyền tay qua prop thì phải sửa cả 6 file step; đặt cạnh
 * store — nơi ĐÃ có `projectId` — thì bước nào cần thì lấy, bước nào không cần thì
 * không biết gì cả. Cùng một provider, nên không thể có chuyện store của bộ kit này
 * đứng cạnh id của bộ kit khác.
 */
const WorkflowProjectCtx = React.createContext<string>("");

export function WorkflowStoreProvider({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const store = React.useMemo(() => createWorkflowStore(projectId), [projectId]);
  return React.createElement(
    WorkflowProjectCtx.Provider,
    { value: projectId },
    React.createElement(WorkflowStoreCtx.Provider, { value: store }, children),
  );
}

/** Id bộ kit đang mở. Rỗng chỉ khi component nằm ngoài provider (test cô lập). */
export function useWorkflowProjectId(): string {
  return React.useContext(WorkflowProjectCtx);
}

/** API store thô (getState/setState) — cho chỗ cần đọc ngoài render. */
export function useWorkflowStoreApi(): WorkflowStore {
  const store = React.useContext(WorkflowStoreCtx);
  if (!store) throw new Error("useWorkflowStore phải nằm trong <WorkflowStoreProvider projectId=…>");
  return store;
}

/** TÊN GIỮ NGUYÊN — 6 file step không phải sửa một chữ nào. */
export function useWorkflowStore(): WorkflowState {
  return useStore(useWorkflowStoreApi());
}
