import * as React from "react";

import type { PillKind } from "../pill-registry";
import { DEFAULT_PRESET_ID } from "./pose-presets";
import { DEFAULT_VIEW, type CameraView } from "./pose-state";
import {
  hasPoseSkeleton,
  isCameraView,
  peekPoseThumb,
  poseThumb,
  poseThumbKey,
  POSE_THUMB_SIZE,
  ROW_THUMB_SIZE,
  thumbPixelRatio,
} from "./pose-thumb";

/**
 * use-pose-thumbs.ts — NỐI CÁI NHỚ ẢNH VÀO HỘP CHỌN, VÀ NÓI CHO NÓ BIẾT DÒNG NÀY
 * ĐANG Ở DÁNG NÀO · GÓC NÀO.
 *
 * ╔══ VÌ SAO PHẢI CÓ CONTEXT, KHÔNG CHỈ LÀ MỘT PROP ═════════════════════════╗
 * ║ Ô xem trước của hộp «Dáng» phải vẽ mỗi dáng Ở ĐÚNG GÓC CỦA DÒNG ẤY — bày   ║
 * ║ 19 tấm chính diện trong khi dòng đang đặt «¾ trái» là bày một bộ ảnh cho    ║
 * ║ một lựa chọn người dùng không hề chọn. Hộp «Góc» đối xứng: mỗi góc vẽ ĐÚNG  ║
 * ║ dáng của dòng.                                                             ║
 * ║ Nhưng pill KHÔNG đọc được dòng của nó: ở chế độ tự do nó là một node        ║
 * ║ ProseMirror nằm giữa câu, dựng bởi `ReactNodeViewRenderer` — không có       ║
 * ║ đường prop nào từ `FreePoseRow` xuống tới nó. Context là cửa DUY NHẤT đi    ║
 * ║ qua được cả hai chế độ, và nhờ thế `pill-ui.tsx` chỉ phải biết một luật.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

/** Hai pill có cấu trúc của MỘT dòng dáng — đủ để dựng tấm xem trước cho cả hai hộp. */
export interface PoseRowPills {
  /** Id dáng đang chọn của dòng. Rỗng/tự gõ/không có xương ⇒ rơi về `idle`. */
  pose: string;
  /** Id góc máy đang chọn của dòng. Rỗng/lạ ⇒ rơi về góc mặc định. */
  view: string;
}

/**
 * Dòng dáng đang bao quanh pill. `null` = pill này không đứng trong dòng nào
 * (ca hiếm: một pill dáng lọt vào một câu tự do ngoài thẻ Nhân vật) ⇒ dùng dáng
 * và góc mặc định, vẫn có hình để nhìn.
 */
export const PoseRowContext = React.createContext<PoseRowPills | null>(null);

/**
 * Hàm tra ảnh xem trước cho hộp chọn của pill `pose`/`view`. `undefined` với mọi
 * trục khác — và đó là điều KHÁC BIỆT có thật: `SourcePicker` chỉ chừa chỗ cho ô
 * ảnh khi có hàm này, nên hộp chọn phong cách/chủ đề giữ nguyên bố cục cũ.
 *
 * ╔══ VÌ SAO VẼ CẢ DANH SÁCH LÚC MỞ, KHÔNG VẼ THEO DÒNG LỌT VÀO TẦM MẮT ═════╗
 * ║ Cả danh mục là 19 dáng và 9 góc máy, nên một hộp mở ra là NHIỀU NHẤT 19    ║
 * ║ lượt vẽ ~10ms — và từ lần mở thứ hai là 0 lượt, vì cái nhớ                 ║
 * ║ đã giữ đủ. Dựng thêm một `IntersectionObserver` cho mỗi dòng để tiết kiệm  ║
 * ║ vài lượt ấy là thêm một bộ máy phải nhớ gỡ, đổi lấy một khoản không đo      ║
 * ║ được. Vẽ LẦN LƯỢT (await từng tấm) mới là chỗ đáng giữ: nó bảo đảm không   ║
 * ║ bao giờ có hai context WebGL sống cùng lúc.                                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * @param kind   trục của pill đang mở hộp.
 * @param values id của MỌI mục trong hộp, theo đúng thứ tự bày ra.
 * @param open   hộp có đang mở không — đóng thì không vẽ gì, và lượt đang chạy
 *               dở bị bỏ kết quả.
 */
/**
 * Trục này CÓ ô xem trước không.
 *
 * Tách khỏi `usePoseThumbs` vì câu trả lời phải có TRƯỚC khi hộp mở: `pill-ui`
 * cần nó để chọn trần cao đem đi đo phép lật, mà phép lật thì đo ngay lúc bấm.
 */
export function hasPoseThumbs(kind: PillKind): boolean {
  return kind === "pose" || kind === "view";
}

export function usePoseThumbs(
  kind: PillKind,
  values: readonly string[],
  open: boolean,
): ((value: string) => string | null) | undefined {
  const row = React.useContext(PoseRowContext);
  const axis: PoseAxis | null = hasPoseThumbs(kind) ? (kind as PoseAxis) : null;

  /* Đo dpr MỘT LẦN cho cả vòng đời pill: nó nằm trong khoá nhớ, và một phép đo
     lại giữa chừng (kéo cửa sổ sang màn hình thứ hai) chỉ tổ sinh một bộ khoá mới
     cho cùng những tấm ảnh ấy. */
  const dpr = React.useMemo(() => thumbPixelRatio(), []);

  /* DÁNG NỀN của hộp «Góc»: dáng của dòng, nhưng chỉ khi nó dựng được hình. Dòng
     đang để trống, đang mang chữ tự gõ, hay đang ở một dáng chưa có bảng góc khớp
     thì vẫn phải THẤY ĐƯỢC GÓC — nên rơi về `idle` thay vì bày 9 ô trống. */
  const base = row && hasPoseSkeleton(row.pose) ? row.pose : DEFAULT_PRESET_ID;
  /* GÓC NỀN của hộp «Dáng»: góc của dòng, id lạ/rỗng rơi về góc mặc định. */
  const angle: CameraView = row && isCameraView(row.view) ? row.view : DEFAULT_VIEW;

  /* Cái nhớ ở `pose-thumb.ts` LÀ kho chứa; state ở đây chỉ là một nhịp đếm để
     React vẽ lại khi có tấm mới. Giữ thêm một `Map` trong state là dựng bản sao
     thứ hai của cùng dữ liệu, rồi hai bản lệch nhau ngay lần hộp thứ hai mở ra. */
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  /* Danh sách id thành MỘT CHUỖI để làm dependency: mảng `values` được dựng mới
     mỗi lần render, nên để nguyên nó ở đây là effect chạy lại vô hạn. */
  const list = values.join("\n");

  React.useEffect(() => {
    if (!axis || !open) return;

    let alive = true;
    void (async () => {
      for (const value of list.split("\n")) {
        if (!alive) return;
        const spec = specOf(axis, value, base, angle, dpr);
        if (!spec || peekPoseThumb(poseThumbKey(spec))) continue;
        const url = await poseThumb(spec);
        if (!alive) return;
        if (url) bump();
      }
    })();

    return () => {
      alive = false;
    };
  }, [axis, open, base, angle, dpr, list]);

  if (!axis) return undefined;
  return (value: string) => {
    const spec = specOf(axis, value, base, angle, dpr);
    return spec ? peekPoseThumb(poseThumbKey(spec)) : null;
  };
}

type PoseAxis = "pose" | "view";

/* ══════════════════════════════════════════════════════════════════════════
   Ô XEM TRƯỚC Ở ĐẦU DÒNG
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Tấm ảnh của DÒNG NÀY — dáng đang chọn, ở góc đang chọn. `null` = không có gì
 * để bày (ô dáng để trống, chữ tự gõ, hoặc máy này không dựng được hình).
 *
 * ╔══ VÌ SAO ĐẦU DÒNG CẦN MỘT TẤM NỮA TRONG KHI HỘP CHỌN ĐÃ CÓ ══════════════╗
 * ║ Hộp chọn trả lời "dáng nào là dáng nào" — nhưng nó ĐÓNG LẠI ngay sau cú    ║
 * ║ bấm, và thứ còn lại trên màn là đúng hai chữ «Giới thiệu» trong một pill.  ║
 * ║ Một bản nháp 12 dòng ⇒ 12 dòng chữ, tức là quay về đúng cái danh mục chữ   ║
 * ║ mà ô xem trước vừa chữa, chỉ dời chỗ. Chủ sản phẩm nói thẳng: chọn xong     ║
 * ║ phải THẤY mình vừa chọn cái gì, ngay trên dòng.                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * TRẢ ĐỒNG BỘ nếu cái nhớ đã có tấm ấy (`peek`) — đó là thứ giữ cho một bản nháp
 * mở lại không nháy một loạt ô trống. Chưa có thì đặt một lượt vẽ vào HÀNG ĐỢI
 * một-làn của `pose-thumb.ts` và vẽ lại đúng component này khi tấm về; 20 dòng
 * cùng mở ra là 20 lượt NỐI ĐUÔI, không phải 20 context WebGL cùng lúc.
 */
export function useRowPoseThumb(pose: string, view: string): string | null {
  const dpr = React.useMemo(() => thumbPixelRatio(), []);

  /* Không rơi về `idle`/góc mặc định như hộp chọn: ô này nói "DÒNG NÀY đang ở
     dáng nào", nên một dáng không dựng được hình phải ra ô TRỐNG. Bày tấm «Đứng
     chờ» ở đây là dán một câu trả lời sai lên đúng chỗ người dùng đi tìm. */
  const spec =
    hasPoseSkeleton(pose) && isCameraView(view)
      ? { poseId: pose, view, size: ROW_THUMB_SIZE, dpr }
      : null;
  const key = spec ? poseThumbKey(spec) : "";

  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    if (!spec || peekPoseThumb(key)) return;

    let alive = true;
    void poseThumb(spec).then((url) => {
      if (alive && url) bump();
    });
    return () => {
      alive = false;
    };
    /* `key` gói trọn bốn thứ của `spec`, nên nó là dependency ĐỦ — để cả `spec`
       vào đây là một object mới mỗi lần render, tức là effect chạy lại vô hạn. */
  }, [key]);

  return key ? peekPoseThumb(key) : null;
}

/**
 * Mục thứ `value` của trục này tả TẤM ẢNH NÀO. `null` = mục không vẽ được (mục
 * «— để trống —», dáng chưa có xương, id góc lạ) ⇒ ô giữ chỗ.
 */
function specOf(axis: PoseAxis, value: string, base: string, angle: CameraView, dpr: number) {
  const shot =
    axis === "pose"
      ? { poseId: value, view: angle }
      : { poseId: base, view: value as CameraView };
  if (!hasPoseSkeleton(shot.poseId) || !isCameraView(shot.view)) return null;
  return { ...shot, size: POSE_THUMB_SIZE, dpr };
}
