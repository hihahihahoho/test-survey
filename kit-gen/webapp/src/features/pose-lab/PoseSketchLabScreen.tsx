import * as React from "react";
import { FlaskConical } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ShotStrip } from "./components/ShotStrip";
import { Pose3DTab } from "./tabs/Pose3DTab";
import { SketchTab } from "./tabs/SketchTab";
import { addShot, makeShot, removeShot, type Shot, type ShotKind } from "./lib/shots";

/**
 * PoseSketchLabScreen — DEMO "Pose & Sketch Lab".
 *
 * ╔══ ĐÂY LÀ LAB, KHÔNG PHẢI TÍNH NĂNG ═══════════════════════════════════════╗
 * ║ Không gọi API nào, không đọc/ghi workspace, không nằm trong sitemap §2.1,  ║
 * ║ không có link nào trong UI chính trỏ tới. Vào bằng URL trực tiếp:          ║
 * ║   /lab/pose-editor                                                         ║
 * ║ Đi đúng tiền lệ của `/lab/prompt-composer` và `/__preview`.                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ CÂU HỎI MÀ DEMO NÀY TRẢ LỜI ═══════════════════════════════════════════
 * Hôm nay muốn mascot "một tay chống hông, tay kia chỉ xuống nút", người dùng
 * phải GÕ RA câu đó bằng chữ và cầu cho máy vẽ hiểu đúng. Cả hai tab ở đây thay
 * chữ bằng MỘT TẤM ẢNH: manơcanh 3D nắn khớp rồi chụp, hoặc phác tay một element.
 * Cùng một đích đến — `refs/` của project — nên chúng dùng CHUNG một dải ảnh ở
 * dưới thay vì mỗi tab một dải.
 *
 * Toàn bộ trạng thái nằm trong RAM của tab trình duyệt: F5 là mất. Cố ý — lab
 * không được phép chạm workspace của người ta.
 */
export function PoseSketchLabScreen() {
  const [shots, setShots] = React.useState<readonly Shot[]>([]);

  /* Một `onShot` chung cho hai tab, phân biệt bằng `kind`. Ổn định qua `useCallback`
     vì `Pose3DTab` giữ nó trong deps của hàm chụp. */
  const push = React.useCallback((kind: ShotKind) => (label: string, dataUrl: string) => {
    setShots((prev) => addShot(prev, makeShot(kind, label, dataUrl)));
  }, []);

  const onPoseShot = React.useMemo(() => push("pose-3d"), [push]);
  const onSketchShot = React.useMemo(() => push("sketch"), [push]);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 p-6">
      <header className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-label font-medium text-warn">
          <FlaskConical className="size-4" aria-hidden />
          🧪 Lab demo — chưa nối vào luồng tạo kit
        </p>
        <h1 className="text-display-2 text-fg-strong">Pose &amp; Sketch Lab</h1>
        <p className="max-w-[70ch] text-body text-fg-muted">
          Hai đường để nói cho máy vẽ biết bạn muốn gì mà KHÔNG phải tả bằng chữ: chọn dáng + góc nhìn rồi
          để công cụ tự dựng ảnh tham chiếu, hoặc phác tay đúng một element. Ảnh ra ở dải dưới cùng, tải về được.
        </p>
      </header>

      <Tabs defaultValue="pose">
        <TabsList>
          <TabsTrigger value="pose">Pose 3D</TabsTrigger>
          <TabsTrigger value="sketch">Sketch</TabsTrigger>
        </TabsList>

        {/* `forceMount` cố ý KHÔNG dùng: giữ canvas WebGL sống ở tab ẩn là giữ một
            context GPU cho thứ không ai nhìn. Đổi lại, chuyển tab thì pose bị dựng
            lại từ preset — chấp nhận được với một demo, và là chỗ đầu tiên phải sửa
            nếu làm thật (nâng state pose lên màn cha). */}
        <TabsContent value="pose">
          <Pose3DTab onShot={onPoseShot} />
        </TabsContent>
        <TabsContent value="sketch">
          <SketchTab onShot={onSketchShot} />
        </TabsContent>
      </Tabs>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-body font-medium text-fg-strong">Ảnh đã chụp ({shots.length})</h2>
        </div>
        <ShotStrip shots={shots} onRemove={(id) => setShots((prev) => removeShot(prev, id))} />
        <p className="max-w-[80ch] text-caption text-fg-muted">
          Khi nối thật: ảnh <b>pose-3d</b> sẽ được đính làm pose reference cho block Mascot; ảnh <b>sketch</b> đính
          làm tham chiếu cho đúng element đó trong spritesheet (1 sketch = 1 element). Cả hai đi vào thư mục
          <code className="mx-1 font-mono">refs/</code> của project rồi vào <code className="font-mono">referenced_image_paths</code>.
        </p>
      </section>
    </div>
  );
}
