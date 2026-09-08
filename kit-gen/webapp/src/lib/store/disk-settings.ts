/**
 * webapp/src/lib/store/disk-settings.ts — PHẦN TUỲ CHỌN SỐNG TRÊN ĐĨA.
 *
 * ══ VÌ SAO CÓ FILE NÀY ═══════════════════════════════════════════════════════
 * Người dùng bấm Cmd+F5 giữa chừng và thấy như "mất hết". Dự án trên đĩa còn nguyên,
 * nhưng mọi tuỳ chọn thì chỉ nằm trong `localStorage` của MỘT origin — mà app này có
 * HAI đường vào (trang Pages và `http://127.0.0.1:8765/app/`), tức HAI kho localStorage
 * không thấy nhau. Xoá dữ liệu duyệt web, đổi trình duyệt, hay chỉ là vào bằng đường
 * kia: tuỳ chọn về mặc định.
 *
 * Từ nay NGUỒN SỰ THẬT là `<workspace>/.kitgen/config.json` (agent/lib/settings.mjs).
 * `localStorage` TỤT XUỐNG làm bộ nhớ đệm khởi động: nó vẽ ngay khung đúng màu trong lúc
 * chờ agent trả lời, và là đường lùi khi agent chưa chạy. Mất nó không mất gì.
 *
 * ══ VÌ SAO KHÔNG PHẢI TẤT CẢ ═════════════════════════════════════════════════
 * `filterQuery` (ô tìm) và `filterTags` (thẻ người dùng đặt) CỐ Ý ở lại localStorage.
 * Hai lý do, cả hai đều đủ để một mình quyết định:
 *   ① Chúng là CHỮ NGƯỜI DÙNG GÕ. Hợp đồng bảo mật của API mới chỉ cho enum · boolean ·
 *      số · mã do app sinh đi qua — chuỗi tự do là đúng cái đường mà một token dán nhầm
 *      hay một mẩu đường dẫn sẽ đi vào file cấu hình.
 *   ② Kể cả bỏ qua ①: mở app lên và thấy một bộ lọc từ hôm qua đang chắn hết danh sách
 *      là một lỗi, không phải một tính năng.
 *
 * Danh sách field dưới đây được LẤY RA TỪ `SCHEMAS` của persist.ts chứ không gõ lại, nên
 * kiểu và giá trị mặc định không thể trôi khỏi nhau giữa hai kho.
 *
 * Đợt 2: khối `prefs` không còn (xem `diskSettingsSchema`), chỉ còn `ui`.
 */
import { z } from "zod";
import { LS_KEYS, SCHEMAS, type StoreShape } from "./persist";

/** Field của `kitgen.ui.v1` được nâng lên đĩa. Xem khối "VÌ SAO KHÔNG PHẢI TẤT CẢ". */
export const DISK_UI_FIELDS = ["theme", "sortBy", "sortDir"] as const;

const pickShape = <T extends readonly string[]>(fields: T) =>
  Object.fromEntries(fields.map((f) => [f, true])) as { [K in T[number]]: true };

const uiDiskSchema = SCHEMAS[LS_KEYS.ui].pick(pickShape(DISK_UI_FIELDS));

/**
 * Trả lời của agent. `z.object` (không `strictObject`) nên agent bản MỚI thêm field thì
 * bundle CŨ chỉ lược bỏ field lạ chứ không vỡ — đúng luật khoan dung của `types/api.ts`
 * cho dữ liệu ĐI VÀO. Chiều ngược lại (ghi ra đĩa) khắt khe, và chỗ khắt khe đó nằm ở
 * agent chứ không ở đây: web không phải là bên được tin.
 */
/* `.default()` của zod v4 nhận giá trị ĐÃ PARSE, mà mọi field con ở đây đều có mặc định
   riêng ⇒ `{}` không hợp kiểu. Dựng sẵn bản mặc định một lần lúc nạp module thay vì gõ
   lại từng giá trị — cách này không thể lệch khỏi `SCHEMAS`.

   Khối `prefs` (maxJobs, autoSliceAfterGen…) ĐÃ RỜI KHỎI ĐÂY ở Đợt 2: luồng một-màn
   hardcode chúng ở `lib/hooks/use-generate-run.ts` nên web không còn tuỳ chọn nào thuộc
   nhóm đó để đồng bộ. Agent bản cũ vẫn trả `prefs` trong `config.json` — `z.object`
   (không `strictObject`) LƯỢC BỎ field lạ, nên web mới đọc file cũ không vỡ; nó chỉ
   thôi ghi vào khối đó. */
export const diskSettingsSchema = z.object({
  ui: uiDiskSchema.default(uiDiskSchema.parse({})),
});

/**
 * Trả lời của `GET/PATCH /api/settings`.
 *
 * `configured` là field QUAN TRỌNG NHẤT ở đây: `false` nghĩa là trên đĩa CHƯA từng có
 * tuỳ chọn nào, nên `settings` chỉ là mặc định chứ không phải sự thật. Mọi workspace
 * đang tồn tại đều rơi vào ca này (khối `ui`/`prefs` vừa mới có mặt), và nhận mặc định
 * về sẽ xoá sạch tuỳ chọn thật của người dùng đang nằm trong localStorage. Vắng field
 * (agent CŨ chưa biết trả) ⇒ `false`, tức là ngả về phía AN TOÀN: giữ bản của người dùng.
 */
export const diskSettingsResponseSchema = z.object({
  settings: diskSettingsSchema.default(diskSettingsSchema.parse({})),
  configured: z.boolean().default(false),
});

export type DiskSettingsResponse = z.infer<typeof diskSettingsResponseSchema>;
export type DiskSettings = z.infer<typeof diskSettingsSchema>;
/** Vá một phần — mọi field đều có thể vắng mặt. */
export type DiskSettingsPatch = { ui?: Partial<DiskSettings["ui"]> };

export function defaultDiskSettings(): DiskSettings {
  return diskSettingsSchema.parse({});
}

function pick<T extends object, F extends readonly (keyof T)[]>(src: T, fields: F): Pick<T, F[number]> {
  const out = {} as Pick<T, F[number]>;
  for (const f of fields) out[f] = src[f];
  return out;
}

/** Cắt phần-sống-trên-đĩa ra khỏi store trong RAM. */
export function diskSettingsOf(ui: StoreShape[typeof LS_KEYS.ui]): DiskSettings {
  return { ui: pick(ui, DISK_UI_FIELDS) };
}

/**
 * Field nào ĐÃ KHÁC so với bản trên đĩa. `null` = không có gì để ghi.
 *
 * Vì sao gửi patch chứ không gửi cả bảng: hai tab cùng mở, mỗi tab đổi một thứ. Gửi cả
 * bảng thì tab ghi sau dựng lại nguyên trạng RAM của nó, xoá mất thay đổi của tab kia.
 * Gửi đúng field đã đổi thì hai thay đổi khác nhau cộng lại được.
 */
export function diffDiskSettings(server: DiskSettings, local: DiskSettings): DiskSettingsPatch | null {
  const patch: DiskSettingsPatch = {};
  let changed = false;
  for (const f of DISK_UI_FIELDS) {
    if (JSON.stringify(server.ui[f]) === JSON.stringify(local.ui[f])) continue;
    (patch.ui ??= {})[f] = local.ui[f] as never;
    changed = true;
  }
  return changed ? patch : null;
}
