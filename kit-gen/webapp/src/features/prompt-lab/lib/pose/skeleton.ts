/**
 * skeleton.ts — CÂY KHỚP của manơcanh, khai bằng SỐ chứ không bằng file GLTF.
 *
 * ╔══ VÌ SAO KHÔNG DÙNG ASSET RIG SẴN ════════════════════════════════════════╗
 * ║ Một manơcanh rigged (.glb) kéo theo: file nhị phân phải commit, loader,    ║
 * ║ tên xương của người khác đặt, và một lớp retarget để map xương ↔ slider.   ║
 * ║ Demo này chỉ cần trả lời MỘT câu hỏi: "nắn khớp bằng chuột có sướng hơn    ║
 * ║ gõ chữ không?". Người que dựng bằng primitive trả lời được câu đó với 0 kB ║
 * ║ asset, và mọi con số đều đọc được ngay trong file này.                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * QUY ƯỚC HÌNH HỌC — đọc kỹ trước khi sửa số, vì dấu của góc phụ thuộc vào nó:
 *  · Trục world: +X sang phải (theo hướng NHÌN), +Y lên, +Z về phía camera mặc định.
 *  · Tư thế gốc (mọi góc = 0): đứng thẳng, HAI TAY BUÔNG THÕNG dọc thân — không
 *    phải T-pose. Chọn vậy để MỌI xương chi đều chạy theo -Y trong hệ toạ độ của
 *    khớp cha, nên chỉ có đúng hai chiều xương (`dir: +1` thân trên, `-1` chi) và
 *    dấu của góc không đổi giữa tay với chân.
 *  · Hệ quả của quy ước trên (dùng khi đặt số cho pose preset):
 *      - Chi (xương -Y): rotation.x ÂM = đưa ra TRƯỚC (+Z). Gối/khuỷu gập =
 *        rotation.x DƯƠNG ở gối (cẳng ra sau), ÂM ở khuỷu (cẳng tay ra trước).
 *      - Thân (xương +Y): rotation.x DƯƠNG = cúi ra TRƯỚC.
 *      - rotation.z DƯƠNG kéo xương về phía +X ⇒ vai TRÁI (ở +X) dang tay bằng z
 *        dương, vai PHẢI dang tay bằng z ÂM. Chân cũng vậy.
 *
 * "TRÁI/PHẢI" Ở ĐÂY LÀ TRÁI/PHẢI CỦA NGƯỜI NHÌN (khớp ở +X = "trái"), KHÔNG phải
 * trái/phải giải phẫu của nhân vật. Cố ý: người dùng bấm vào cái tay đang nằm bên
 * trái MÀN HÌNH và mong panel sáng lên chữ "trái". Nếu sau này nối vào rig thật thì
 * đây là chỗ phải đổi tên, không phải chỗ đổi số.
 *
 * TỈ LỆ CHIBI: đầu đường kính 1.0 trên tổng cao 3.17 ≈ 1/3 — hợp chất mascot của
 * KitGen, và cũng là lý do chân/tay cố ý ngắn hơn người thật.
 */

/** Bộ ba số đọc-ghi tự do (góc theo ĐỘ, hoặc toạ độ) — cố ý không `readonly` vì
 *  slider ghi thẳng vào nó và three.js cũng nhận mảng thường. */
export type Vec3 = [number, number, number];

export type JointId =
  | "hips" | "spine" | "chest" | "neck" | "head"
  | "shoulderL" | "elbowL" | "wristL"
  | "shoulderR" | "elbowR" | "wristR"
  | "hipL" | "kneeL" | "ankleL"
  | "hipR" | "kneeR" | "ankleR";

export type Axis = "x" | "y" | "z";

/** Một trục chỉnh được của khớp. `label` phải nói RÕ CHIỀU, vì dấu của góc không
 *  đoán được từ tên trục (xem quy ước trên đầu file). */
export interface AxisSpec {
  axis: Axis;
  label: string;
  min: number;
  max: number;
}

export interface JointDef {
  id: JointId;
  label: string;
  parent: JointId | null;
  /** Vị trí gốc khớp so với gốc khớp CHA, ở tư thế gốc. */
  offset: Vec3;
  /** Đoạn xương mọc từ gốc khớp, dọc trục Y cục bộ. `dir` = +1 lên, -1 xuống. */
  bone?: { length: number; radius: number; dir: 1 | -1 };
  /** Viên bi ở gốc khớp — vừa là chỗ BẤM CHỌN, vừa là dấu hiệu "chỗ này nắn được". */
  ball?: number;
  /** Chỉ khớp `head`: bán kính quả đầu (tâm đặt cách gốc khớp đúng một bán kính). */
  headRadius?: number;
  /** Bàn chân: khối hộp nhỏ chìa ra trước, để đọc được hướng mặt khi xoay camera. */
  foot?: boolean;
  axes: AxisSpec[];
}

/* Ba bộ trục hay lặp — gom lại để sửa dải góc một chỗ, và để bảng khớp bên dưới
   đọc được như một bảng chứ không phải một bức tường. */
const TORSO_AXES = (name: string): AxisSpec[] => [
  { axis: "x", label: `${name}: cúi ↔ ngửa`, min: -45, max: 60 },
  { axis: "y", label: `${name}: xoay trái ↔ phải`, min: -75, max: 75 },
  { axis: "z", label: `${name}: nghiêng`, min: -40, max: 40 },
];

const shoulderAxes = (side: "trái" | "phải"): AxisSpec[] => [
  { axis: "x", label: `Vai ${side}: đưa trước (âm) ↔ ra sau`, min: -180, max: 90 },
  { axis: "z", label: `Vai ${side}: dang tay`, min: -180, max: 180 },
  { axis: "y", label: `Vai ${side}: xoay cánh tay`, min: -90, max: 90 },
];

const hipAxes = (side: "trái" | "phải"): AxisSpec[] => [
  { axis: "x", label: `Háng ${side}: đá trước (âm) ↔ ra sau`, min: -120, max: 60 },
  { axis: "z", label: `Háng ${side}: dang chân`, min: -60, max: 60 },
  { axis: "y", label: `Háng ${side}: xoay đùi`, min: -60, max: 60 },
];

/**
 * BẢNG KHỚP — thứ tự khai báo phải là CHA TRƯỚC CON, vì `childrenOf()` và mọi
 * vòng lặp dựng cây đều dựa vào nó.
 */
export const JOINTS: readonly JointDef[] = [
  { id: "hips", label: "Hông (gốc)", parent: null, offset: [0, 1.3, 0], ball: 0.17,
    axes: [
      { axis: "y", label: "Cả người: xoay", min: -180, max: 180 },
      { axis: "x", label: "Cả người: ngả trước/sau", min: -45, max: 45 },
      { axis: "z", label: "Cả người: nghiêng", min: -45, max: 45 },
    ] },
  { id: "spine", label: "Bụng", parent: "hips", offset: [0, 0.05, 0],
    bone: { length: 0.42, radius: 0.2, dir: 1 }, ball: 0.1, axes: TORSO_AXES("Bụng") },
  { id: "chest", label: "Ngực", parent: "spine", offset: [0, 0.42, 0],
    bone: { length: 0.3, radius: 0.22, dir: 1 }, ball: 0.1, axes: TORSO_AXES("Ngực") },
  { id: "neck", label: "Cổ", parent: "chest", offset: [0, 0.3, 0],
    bone: { length: 0.1, radius: 0.09, dir: 1 }, ball: 0.08, axes: TORSO_AXES("Cổ") },
  { id: "head", label: "Đầu", parent: "neck", offset: [0, 0.1, 0], headRadius: 0.5,
    axes: [
      { axis: "x", label: "Đầu: cúi ↔ ngẩng", min: -40, max: 45 },
      { axis: "y", label: "Đầu: quay trái ↔ phải", min: -80, max: 80 },
      { axis: "z", label: "Đầu: nghiêng", min: -40, max: 40 },
    ] },

  { id: "shoulderL", label: "Vai trái", parent: "chest", offset: [0.34, 0.24, 0],
    bone: { length: 0.5, radius: 0.11, dir: -1 }, ball: 0.13, axes: shoulderAxes("trái") },
  { id: "elbowL", label: "Khuỷu trái", parent: "shoulderL", offset: [0, -0.5, 0],
    bone: { length: 0.46, radius: 0.095, dir: -1 }, ball: 0.11,
    axes: [
      { axis: "x", label: "Khuỷu trái: gập (âm) ↔ duỗi", min: -150, max: 10 },
      { axis: "y", label: "Khuỷu trái: xoay cẳng tay", min: -90, max: 90 },
    ] },
  { id: "wristL", label: "Cổ tay trái", parent: "elbowL", offset: [0, -0.46, 0], ball: 0.13,
    axes: [
      { axis: "x", label: "Cổ tay trái: gập", min: -70, max: 70 },
      { axis: "z", label: "Cổ tay trái: nghiêng", min: -45, max: 45 },
    ] },

  { id: "shoulderR", label: "Vai phải", parent: "chest", offset: [-0.34, 0.24, 0],
    bone: { length: 0.5, radius: 0.11, dir: -1 }, ball: 0.13, axes: shoulderAxes("phải") },
  { id: "elbowR", label: "Khuỷu phải", parent: "shoulderR", offset: [0, -0.5, 0],
    bone: { length: 0.46, radius: 0.095, dir: -1 }, ball: 0.11,
    axes: [
      { axis: "x", label: "Khuỷu phải: gập (âm) ↔ duỗi", min: -150, max: 10 },
      { axis: "y", label: "Khuỷu phải: xoay cẳng tay", min: -90, max: 90 },
    ] },
  { id: "wristR", label: "Cổ tay phải", parent: "elbowR", offset: [0, -0.46, 0], ball: 0.13,
    axes: [
      { axis: "x", label: "Cổ tay phải: gập", min: -70, max: 70 },
      { axis: "z", label: "Cổ tay phải: nghiêng", min: -45, max: 45 },
    ] },

  { id: "hipL", label: "Háng trái", parent: "hips", offset: [0.18, -0.06, 0],
    bone: { length: 0.62, radius: 0.145, dir: -1 }, ball: 0.145, axes: hipAxes("trái") },
  { id: "kneeL", label: "Gối trái", parent: "hipL", offset: [0, -0.62, 0],
    bone: { length: 0.56, radius: 0.115, dir: -1 }, ball: 0.12,
    axes: [{ axis: "x", label: "Gối trái: gập", min: -5, max: 150 }] },
  { id: "ankleL", label: "Cổ chân trái", parent: "kneeL", offset: [0, -0.56, 0], ball: 0.095, foot: true,
    axes: [
      { axis: "x", label: "Cổ chân trái: mũi xuống (âm) ↔ lên", min: -50, max: 40 },
      { axis: "y", label: "Cổ chân trái: xoay bàn", min: -40, max: 40 },
    ] },

  { id: "hipR", label: "Háng phải", parent: "hips", offset: [-0.18, -0.06, 0],
    bone: { length: 0.62, radius: 0.145, dir: -1 }, ball: 0.145, axes: hipAxes("phải") },
  { id: "kneeR", label: "Gối phải", parent: "hipR", offset: [0, -0.62, 0],
    bone: { length: 0.56, radius: 0.115, dir: -1 }, ball: 0.12,
    axes: [{ axis: "x", label: "Gối phải: gập", min: -5, max: 150 }] },
  { id: "ankleR", label: "Cổ chân phải", parent: "kneeR", offset: [0, -0.56, 0], ball: 0.095, foot: true,
    axes: [
      { axis: "x", label: "Cổ chân phải: mũi xuống (âm) ↔ lên", min: -50, max: 40 },
      { axis: "y", label: "Cổ chân phải: xoay bàn", min: -40, max: 40 },
    ] },
];

/** Mọi id khớp, đúng thứ tự khai báo (cha trước con). */
export const JOINT_IDS: readonly JointId[] = JOINTS.map((j) => j.id);

const BY_ID = new Map<JointId, JointDef>(JOINTS.map((j) => [j.id, j]));

/** Định nghĩa của một khớp. Ném khi id lạ — id khớp là hằng trong mã, không phải
 *  dữ liệu người dùng, nên sai id là bug chứ không phải trường hợp cần chịu đựng. */
export function joint(id: JointId): JointDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`pose-ref: không có khớp "${id}"`);
  return def;
}

/** Các khớp con trực tiếp — dùng để dựng cây `<group>` lồng nhau trong R3F. */
export function childrenOf(id: JointId | null): JointDef[] {
  return JOINTS.filter((j) => j.parent === id);
}

/** Khớp gốc của cây (đúng một cái, khoá bằng test). */
export function rootJoints(): JointDef[] {
  return childrenOf(null);
}

/** Nhóm khớp cho panel bên phải — để 17 khớp không đổ thành một danh sách phẳng. */
export const JOINT_GROUPS: readonly { label: string; ids: readonly JointId[] }[] = [
  { label: "Thân & đầu", ids: ["hips", "spine", "chest", "neck", "head"] },
  { label: "Tay trái", ids: ["shoulderL", "elbowL", "wristL"] },
  { label: "Tay phải", ids: ["shoulderR", "elbowR", "wristR"] },
  { label: "Chân trái", ids: ["hipL", "kneeL", "ankleL"] },
  { label: "Chân phải", ids: ["hipR", "kneeR", "ankleR"] },
];

export const DEG = Math.PI / 180;

/** Độ → radian (three.js nhận radian; bảng pose và slider đều viết bằng ĐỘ vì độ
 *  là thứ người đọc được, radian thì không). */
export function rad(deg: number): number {
  return deg * DEG;
}

/** Radian → độ, làm tròn 0.1° — dùng khi gizmo xoay xong phải chép ngược ra slider. */
export function deg(radians: number): number {
  return Math.round((radians / DEG) * 10) / 10;
}
