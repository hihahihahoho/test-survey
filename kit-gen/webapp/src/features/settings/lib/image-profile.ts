/**
 * features/settings/lib/image-profile.ts — logic của TOGGLE "hồ sơ Codex dùng để tạo ảnh"
 * (Cài đặt → Tạo ảnh). Thuần dữ liệu, không JSX ⇒ kiểm được mà không cần DOM.
 *
 * VÌ SAO CÓ FILE NÀY (chứ không đọc thẳng `doctor.imageGen.mode`):
 *   `mode` là KẾT QUẢ DÒ của agent — chọn `~/.codex-img` mà chưa `codex login` thì
 *   `mode` = "unavailable". Nếu toggle bám `mode`, nút vừa bấm sẽ tự nhảy ngược về
 *   "mặc định" và user tưởng thao tác trượt. Toggle bám `profile` (LỰA CHỌN đã lưu ở
 *   `<workspace>/.kitgen/config.json`), còn `mode`/`available` chỉ để nói trạng thái.
 *
 * BẢO MẬT (arch §4.3, §4.4): file này chỉ chạm enum + nhãn rút gọn `~/…`.
 * Không đọc, không hiện, không lưu bất cứ gì của phiên đăng nhập Codex.
 */
import type { Doctor, ImageGenProfile } from "@/lib/types/api";
import { safeHomeLabel } from "@/features/setup/lib/doctor-view";

/** Tên hồ sơ trên dây với agent (`PATCH /api/image-profile`) — enum của §6.2. */
export type ImageProfileWire = "default" | "separate";

export interface ImageProfileOption {
  profile: ImageGenProfile;
  wire: ImageProfileWire;
  /** Nhãn nút — cố ý CÓ đường dẫn rút gọn, vì đây chính là thứ phân biệt hai hồ sơ. */
  label: string;
  home: string;
  hint: string;
}

export const IMAGE_PROFILES: readonly [ImageProfileOption, ImageProfileOption] = [
  {
    profile: "default-home",
    wire: "default",
    label: "~/.codex (mặc định)",
    home: "~/.codex",
    hint: "Dùng đúng cấu hình Codex bạn vẫn dùng hằng ngày.",
  },
  {
    profile: "img-home",
    wire: "separate",
    label: "~/.codex-img (home ảnh riêng)",
    home: "~/.codex-img",
    hint: "Home riêng chỉ để tạo ảnh — hợp khi cấu hình mặc định trỏ sang nhà cung cấp không trả ảnh về máy.",
  },
] as const;

export function optionOf(profile: ImageGenProfile): ImageProfileOption {
  return IMAGE_PROFILES.find((o) => o.profile === profile) ?? IMAGE_PROFILES[0];
}

/**
 * Hồ sơ ĐANG CHỌN. Ưu tiên `imageGen.profile` (agent ≥ bản có toggle). Agent cũ chưa
 * khai field đó ⇒ suy ra từ `mode`, và CHỈ khi `mode` nói rõ là "img-home"; mọi giá trị
 * khác ("unavailable", "unknown", …) không đủ căn cứ nên trả về mặc định.
 */
export function selectedProfile(doctor: Doctor | null | undefined): ImageGenProfile {
  const ig = doctor?.imageGen;
  if (ig?.profile === "img-home" || ig?.profile === "default-home") return ig.profile;
  return ig?.mode === "img-home" ? "img-home" : "default-home";
}

export function selectedWire(doctor: Doctor | null | undefined): ImageProfileWire {
  return optionOf(selectedProfile(doctor)).wire;
}

export interface ImageProfileView {
  profile: ImageGenProfile;
  wire: ImageProfileWire;
  option: ImageProfileOption;
  /** Nhãn home để hiện — lấy từ doctor nếu là nhãn rút gọn hợp lệ, không thì dùng nhãn tĩnh. */
  homeLabel: string;
  /** Nhãn của doctor bị bỏ vì là path tuyệt đối ⇒ đừng im lặng, nói là chưa đọc được. */
  homeLabelFromDoctor: boolean;
  tone: "ok" | "warn" | "muted";
  /** Một câu trả lời cho "hồ sơ này dùng được chưa" — không lặp lại nội dung thẻ trạng thái. */
  status: string;
  /** Hồ sơ riêng đã chọn nhưng chưa có auth.json ⇒ cần user tự `codex login`. */
  needsLogin: boolean;
}

export function imageProfileView(
  doctor: Doctor | null | undefined,
  opts: { connected?: boolean } = {},
): ImageProfileView {
  const connected = opts.connected ?? true;
  const profile = selectedProfile(doctor);
  const option = optionOf(profile);
  const ig = doctor?.imageGen;

  /* `codexHomeLabel` của doctor CHỈ được hiện khi là nhãn `~/…`. Path tuyệt đối chứa
     tên user là PII (arch §4.3-5) ⇒ bỏ, quay về nhãn tĩnh của hồ sơ. */
  const fromDoctor = safeHomeLabel(ig?.codexHomeLabel);
  const homeLabel = fromDoctor ?? option.home;

  const available = ig?.available === true;
  const needsLogin = profile === "img-home" && available === false && ig?.authPresent === false;

  const status = !connected
    ? "Chưa kiểm tra được — công cụ local đang tắt."
    : !doctor
      ? "Chưa kiểm tra."
      : available
        ? `Sẵn sàng với ${homeLabel}.`
        : needsLogin
          ? `Chưa đăng nhập ở ${homeLabel} — chạy lệnh bên dưới trong Terminal rồi bấm Kiểm tra lại.`
          : `Chưa tạo được ảnh với ${homeLabel}.`;

  return {
    profile,
    wire: option.wire,
    option,
    homeLabel,
    homeLabelFromDoctor: fromDoctor !== null,
    tone: !connected || !doctor ? "muted" : available ? "ok" : "warn",
    status,
    needsLogin,
  };
}
