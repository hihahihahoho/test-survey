import * as React from "react";
import { Check, Download, FolderOpen, Image as ImageIcon, Layers, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FOCUS } from "@/components/layout/flora";
import { cn } from "@/lib/utils";
import type { KitFile } from "@/lib/types";
import { KitImage } from "@/features/kit/components/KitImage";
import { forgetProject, loadFull } from "@/features/kit/lib/image-source";
import { saveProjectFile } from "@/features/kit/lib/download";
import { poseFileSet } from "@/features/kit/lib/export-scale";
import {
  BoardCancelled, PHASE_LABEL, buildFigmaBoard, type BoardProgress,
} from "@/features/kit/lib/figma-board";
import { BOARD_W, cellsOf, copyKitDoc, packKitDoc } from "@/features/kit/lib/figma-kit-doc";
import { toastError, toastInfo, toastSuccess } from "@/features/projects/lib/feedback";
import { useContract, useKit, useProject, useRawHistory, useRevealProject } from "@/lib/hooks";
import { cellsOfSheet, contractFramed, rawSheetImagePath } from "../../lib/result/sheet-files";
import { copySheetAsFigmaNode, measureImage } from "../../lib/result/sheet-figma";
import { currentVersion, sheetVersions } from "../../lib/result/sheet-versions";
import { PREVIEW_MAX_H } from "../../lib/ui";
import { SheetCellGrid } from "./SheetCellGrid";
import { SheetVersionBar } from "./SheetVersionBar";

/**
 * PANEL KẾT QUẢ dưới chân MỘT block của Prompt Canvas.
 *
 * ╔══ PHẠM VI — ĐỌC TRƯỚC KHI THÊM BẤT CỨ THỨ GÌ ════════════════════════════╗
 * ║ Chủ sản phẩm chốt: **2 tab xem + chọn phiên bản + Copy Figma + Tải về**.   ║
 * ║ KHÔNG có pipeline tách element mới ở đây. Mọi dữ liệu đã có sẵn:           ║
 * ║   · ảnh gốc     ← `raw/<job>.png` | `runs/<runId>/artifacts/<job>.png`     ║
 * ║   · ô đã crop   ← `#42 GET …/kit`, lọc theo `sheet`                        ║
 * ║   · phiên bản   ← `#39`/`#40` (3 đời)                                      ║
 * ║ Panel chỉ ghép chúng lại. Thêm một đường tính toán ảnh mới ở tầng webapp   ║
 * ║ là tạo bản thứ hai của sự thật, và bản thứ hai luôn là bản không ai đo.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ TAB «KHUNG XƯƠNG» ĐÃ BỊ BỎ — QUYẾT ĐỊNH SẢN PHẨM, KHÔNG PHẢI VIỆC DỞ ══╗
 * ║ Engine THÔI GỬI ẢNH KHUNG XƯƠNG cho máy vẽ: vùng an toàn nay đi vào prompt║
 * ║ bằng TOẠ ĐỘ SỐ. Cái tab ấy vì thế mất chỗ đứng — nó vẽ một tấm ảnh mà     ║
 * ║ không ai còn nhìn, và đó là kiểu sai tệ nhất của một màn kết quả: nó       ║
 * ║ trông như đang cho xem thứ engine dùng, trong khi engine không dùng nữa.  ║
 * ║ Bỏ hẳn, không ẩn đi: một tab ẩn là một chỗ để ai đó bật lại vì tưởng nó    ║
 * ║ chỉ đang tắt tạm. `SkeletonPreview` VẪN CÒN — màn Thiết kế cũ             ║
 * ║ (`features/design/preview/SheetPreviewPanel`) còn dùng nó thật; thứ bị     ║
 * ║ cắt ở đây là ĐƯỜNG DẪN TỚI nó từ màn soạn, không phải bản thân component. ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO TAB MẶC ĐỊNH LÀ «ẢNH GỐC» ══════════════════════════════════════╗
 * ║ Engine bắn `sheet.image` NGAY khi ghi xong ảnh raw, rồi mới `sheet.ready`  ║
 * ║ sau bước cắt. Vừa gen xong mà mở thẳng vào tab «Đã crop» thì thứ người     ║
 * ║ dùng thấy là một khung trống — trong khi ảnh họ vừa chờ mấy phút ĐÃ có     ║
 * ║ rồi, chỉ nằm ở tab bên cạnh. Nên mặc định là tab CHẮC CHẮN CÓ HÀNG, và     ║
 * ║ nó cũng là tab đứng đầu để thứ tự nhìn khớp thứ tự dữ liệu về.             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ KHÔNG TỰ NGHE STREAM ══════════════════════════════════════════════════╗
 * ║ Màn cha đã có `useRunStream` cho cả lượt chạy. Mở thêm một stream nữa cho  ║
 * ║ mỗi block là N kết nối cho cùng một nguồn, và hai bên sẽ lệch nhau lúc     ║
 * ║ stream đứt/hạ xuống poll. Panel nhận `artifactPath` + `cutting` qua props. ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ NÚT FIGMA CHÍNH LÀ «TỪNG Ô», KHÔNG PHẢI «CẢ TẤM» ══════════════════════╗
 * ║ Chủ sản phẩm báo đúng chỗ hỏng: *"copy cả tấm sang figma → nó lại copy cái ║
 * ║ ảnh gốc, mà không phải element riêng đã quy định khung… cái nút cũ là nó   ║
 * ║ copy riêng nhé"*. Bản trước ở đây chỉ có MỘT nút, và nó dán `raw/<job>.png`║
 * ║ — một tấm lưới thô nguyên khối. Designer nhận về một ảnh chữ nhật phải tự  ║
 * ║ cắt lại bằng tay, tức là ném đi đúng thứ lượt cắt vừa làm xong.            ║
 * ║                                                                            ║
 * ║ Nút cũ mà chủ sản phẩm nhắc tới là `features/kit/components/KitExits`      ║
 * ║ (`CopyFigmaButton`): mỗi ô đã cắt thành MỘT khung riêng đúng cỡ vùng an    ║
 * ║ toàn, ảnh đặt lệch âm khi ruột tràn ra ngoài — số học của                  ║
 * ║ `kit-core/lib/figma-node.ts:buildFigmaNodeForAsset`, thứ đã dán thử thật   ║
 * ║ ra Figma desktop. Panel này TÁI DÙNG nguyên đường đó, chỉ khác một điều:   ║
 * ║ danh sách ô là `cellsOfSheet(kit, sheetId)` — ô của ĐÚNG tấm đang đứng     ║
 * ║ dưới chân, không phải cả bộ kit. Không chép lại một dòng số học nào sang   ║
 * ║ đây: hai bản số sẽ trôi khỏi nhau và bản trôi sai là bản không ai đo lại.  ║
 * ║                                                                            ║
 * ║ Ảnh gốc thô KHÔNG chết — nó lùi xuống nút phụ và chỉ hiện ở tab «Ảnh gốc», ║
 * ║ đúng nơi người dùng đang nhìn chính tấm ấy. Ở tab «Đã crop» mà bày một nút ║
 * ║ dán nguyên tấm là mời bấm nhầm lần nữa.                                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ «CLIP CONTENT» BẬT KHI DÁN — ĐÃ TRUY, VÀ WEB KHÔNG TẮT ĐƯỢC ═══════════╗
 * ║ Chủ sản phẩm chụp lại một khung dán ra Figma có Clip content BẬT, tức phần ║
 * ║ trang trí tràn ra ngoài khung bị cắt mất. Đã truy tới đáy:                 ║
 * ║  ① `figma-node.ts` KHAI `clipsContent: false` và `renderSpec` để frame ở    ║
 * ║    `overflow` mặc định (`visible`) — phía web nói đúng thứ mình muốn;       ║
 * ║  ② `assertDocShape` còn CHẶN payload nào có `overflow:"hidden"`;            ║
 * ║  ③ NHƯNG `figma-h2d.global.js:429` để `overflow:"visible"` trong bảng       ║
 * ║    `STYLE_DEFAULTS`, và encoder chỉ chở những style KHÁC mặc định ⇒ payload  ║
 * ║    KHÔNG mang theo một chữ nào về clip, và bên nhận (trình đọc H2D trong    ║
 * ║    Figma desktop) tự quyết — nó chọn BẬT.                                   ║
 * ║ ⇒ Không có đường nào tắt clip từ web mà không sửa `vendor/figma-h2d/`, thứ  ║
 * ║ đang bị test khoá theo hash. Việc phải xin duyệt riêng, không lặng lẽ làm.  ║
 * ║ Đỡ được phần nào: nay ảnh đã co để LÕI vừa khít khung, nên thứ bị cắt chỉ   ║
 * ║ còn là trang trí tràn — không còn cảnh cắt cụt cả thân element như trước.   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export interface SheetResultPanelProps {
  projectId: string;
  /** Id sheet trong contract — dùng để lọc ô đã cắt và vẽ khung xương. */
  sheetId: string;
  /** Tên job của tấm (`raw/<job>.png`). Thường là `<variant>-<sheetId>`. */
  job: string;
  /**
   * Có ⇒ ảnh gốc đọc từ `runs/<runId>/artifacts/` — BẤT BIẾN, không bị lượt gen sau
   * ghi đè. Không có ⇒ đọc `raw/<job>.png` (bản hiện hành).
   */
  runId?: string | null;
  /**
   * Đường ảnh mà `sheet.image` vừa báo (tương đối trong project). Đổi giá trị ⇒ panel
   * quên ảnh cũ trong cache và tải lại — cùng một đường dẫn `raw/<job>.png` sau một
   * lượt gen mới vẫn là BYTE KHÁC.
   */
  artifactPath?: string | null;
  /** true ⇒ đã có ảnh raw nhưng lượt chạy chưa tới `sheet.ready` (chưa cắt xong). */
  cutting?: boolean;
  /** true ⇒ tấm đang chạy: khoá các thao tác ghi (khôi phục phiên bản). */
  busy?: boolean;
  className?: string;
}

type TabId = "raw" | "cut";

/**
 * Nhãn pha 3 của nút chính. Ba pha còn lại dùng thẳng `PHASE_LABEL` của
 * `figma-board.ts`; riêng pha này KHÔNG ghép bảng nào — nó dựng từng khung một, và
 * một thanh tiến trình nói sai việc đang làm là thanh tiến trình vô dụng.
 */
const CELL_PHASE_3 = "Dựng khung cho từng ô";

export function SheetResultPanel({
  projectId, sheetId, job, runId = null,
  artifactPath = null, cutting = false, busy = false, className,
}: SheetResultPanelProps) {
  const [tab, setTab] = React.useState<TabId>("raw");
  const [zoom, setZoom] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  /** Tiến trình của nút chính (4 pha). `null` = đang rảnh — đây cũng là cờ "đang bận". */
  const [progress, setProgress] = React.useState<BoardProgress | null>(null);
  /** Số ô vừa dán được; > 0 ⇒ nhãn nút đổi thành «Đã copy N ô» trong 2 giây. */
  const [copied, setCopied] = React.useState(0);
  const abortRef = React.useRef<AbortController | null>(null);

  const contract = useContract(projectId);
  const kit = useKit(projectId);
  const reveal = useRevealProject(projectId);

  /**
   * ══ TẤM NÀY ĐÃ TỪNG ĐƯỢC VẼ CHƯA ═══════════════════════════════════════════
   *
   * Chủ sản phẩm mở một dự án mới và thấy ô ảnh đỏ *"Thiếu file · Thử lại"* dưới
   * MỌI thẻ. Ô ấy không nói dối — file `raw/<job>.png` đúng là không có — nhưng nó
   * trả lời SAI CÂU HỎI: chưa ai bấm Vẽ thì lấy đâu ra file, và không có gì để
   * "thử lại" cả. Một ô lỗi ở chỗ đáng lẽ là một lời mời khiến người dùng đi tìm
   * một hỏng hóc không tồn tại.
   *
   * `state.jobs[job]` của agent phân biệt được đúng chuyện đó: `"never"` (hoặc
   * vắng mặt) = CHƯA CHẠY LẦN NÀO, mọi giá trị khác = đã có một lượt chạm vào tấm
   * này. Nên `"never"` ⇒ khối rỗng mời bấm Vẽ; mọi giá trị khác mà thiếu file ⇒
   * ĐÚNG là lỗi, và ô đỏ kèm nút thử lại là câu trả lời đúng.
   *
   * Hai cửa lách, cả hai đều có thật:
   *  · `artifactPath` vừa được stream báo ⇒ ảnh có rồi, dù `#9` chưa mời lại;
   *  · `busy` (tấm đang chạy) ⇒ đừng nói "chưa vẽ" giữa lúc nó đang được vẽ.
   * `useProject` dùng CHUNG query key với màn cha nên không sinh request thứ hai.
   */
  const project = useProject(projectId);
  const jobState = project.data?.state?.jobs?.[job] ?? "never";
  const neverDrawn =
    jobState === "never" && !busy && !(typeof artifactPath === "string" && artifactPath !== "");

  /**
   * TÊN TẤM rút ra TRƯỚC rồi mới ghép vào câu — cùng lý do (và cùng cách) với `OnePrompt`
   * ở `CanvasBlock.tsx:300` và `stateOf` ở `lib/gen-queue.ts:167`.
   *
   * Cổng từ cấm §5.4 (`features/kitfile/__tests__/banned-scan.ts`) quét CẢ BIỂU THỨC nằm
   * trong chuỗi mẫu: một câu tiếng Việt có `${job}` bị đọc đúng như nó hiện ra — chữ kỹ
   * thuật lọt vào lời nói với người dùng. Rút ra ngoài thì câu chỉ còn chữ người đọc được,
   * và tên tấm (`sheetId`) vốn cũng dễ hiểu hơn tên lượt vẽ nội bộ.
   */
  const name = sheetId || job;

  /* `artifactPath` là sự thật do engine vừa báo; chỉ khi không có nó mới tự suy đường. */
  const rawPath = React.useMemo(
    () => (typeof artifactPath === "string" && artifactPath !== "" ? artifactPath : rawSheetImagePath(job, runId)),
    [artifactPath, job, runId],
  );

  /**
   * KHOÁ PHIÊN BẢN CỦA ẢNH GỐC = thời điểm ghi của bản ĐANG DÙNG.
   *
   * `raw/<tấm>.png` giữ nguyên đường dẫn qua mọi lượt gen và mọi lần khôi phục, nên
   * đường dẫn một mình không đủ để phân biệt hai đời ảnh — và đó là lý do panel này
   * từng phải dọn cache cả dự án. Lịch sử ảnh (`#39`) đã nói đúng con số ấy, và
   * `SheetVersionBar` ngay cạnh cũng hỏi cùng khoá query ⇒ không thêm một request nào.
   * Ảnh của một LƯỢT CHẠY thì nằm trong thư mục mang mã lượt: đã bất biến sẵn, khoá
   * phiên bản là thừa nhưng vô hại.
   */
  const history = useRawHistory(projectId, job);
  const rawVersion = React.useMemo(
    () => currentVersion(sheetVersions(history.data?.items))?.at ?? null,
    [history.data?.items],
  );

  /**
   * Đổi số này ⇒ `KitImage` mount lại và xin ảnh lần nữa.
   *
   * Cần vì cache của `image-source.ts` khoá theo (project, path, width) — mà
   * `raw/<job>.png` GIỮ NGUYÊN đường dẫn sau mỗi lượt gen và sau mỗi lần khôi phục.
   * Không dọn thì panel hiện lại đúng ảnh cũ, và người dùng kết luận là "gen không
   * ăn". `forgetProject` là cửa dọn DUY NHẤT được export; nó thô (dọn cả dự án) nhưng
   * chỉ chạy ở hai mốc hiếm và có thật: ảnh mới về, và đổi/xoá phiên bản xong.
   */
  const [reloadKey, setReloadKey] = React.useState(0);
  const reloadImage = React.useCallback(() => {
    forgetProject(projectId);
    setReloadKey((n) => n + 1);
  }, [projectId]);
  React.useEffect(() => {
    if (artifactPath === null || artifactPath === "") return;
    reloadImage();
  }, [artifactPath, reloadImage]);

  const cells = React.useMemo(
    () => cellsOfSheet(kit.data?.files ?? [], sheetId),
    [kit.data?.files, sheetId],
  );
  const poseFiles = React.useMemo(
    () => poseFileSet(contract.data?.contract ?? null),
    [contract.data?.contract],
  );

  /**
   * KHUNG = HỘP HỢP ĐỒNG, ẢNH CO SAO CHO LÕI VỪA KHÍT — tính TRƯỚC, ngoài lượt bấm.
   *
   * Cả hai đường (khung riêng và bảng ảnh phẳng) đọc chung một kết quả, nên không
   * có cách nào để hai đường co ảnh khác nhau. Lý do đầy đủ nằm ở `contractFramed`
   * (`sheet-files.ts`) — đây chỉ là chỗ nối dây.
   */
  const framed = React.useMemo(() => contractFramed(cells), [cells]);

  /* TẤM ĐỤC PHẢI TỰ KHAI — MỘT DÒNG, KHÔNG CHẶN GÌ.
     Chủ sản phẩm chốt 09/09/2026: "cái này cứ để cho nó gen tự nhiên nhé, ko block".
     Engine thôi đánh trượt tấm nền đục (không thử lại, không loại ảnh), nên chỗ duy
     nhất còn nói được sự thật là cờ `mode` mà `slice.py` ghi cho từng ô. Câu này đứng
     ngay dưới ảnh gốc, cạnh thanh phiên bản — nơi có sẵn nút vẽ lại và «Xoá bản này»,
     tức người dùng đọc xong là quyết được ngay. Tab «Đã crop» đã có lời cảnh báo dài
     của riêng nó (`SheetCellGrid`) nên ở đây KHÔNG lặp lại.
     Kit cắt bằng bản slice.py cũ không có khoá `mode` ⇒ im lặng đúng như trước. */
  const ducNen = React.useMemo(() => cells.some((c) => c.mode === "rgb"), [cells]);
  const fitScale = React.useCallback(
    (f: KitFile) => framed.scales.get(f.path) ?? 1,
    [framed],
  );

  /**
   * NÓI RA PHÉP CO — nó là thứ người dùng sẽ đo lại đầu tiên.
   *
   * Ảnh dán ra không còn là pixel gốc nữa, và im lặng về chuyện đó nghĩa là để
   * designer tự phát hiện lúc so hai con số. Nói cả KHOẢNG khi mỗi ô một tỉ lệ:
   * đó chính là chân dung của lượt vẽ (ô nào máy vẽ lố bao nhiêu).
   */
  const fitNote = React.useMemo(() => {
    if (framed.fitted.length === 0) return "";
    const pcts = framed.fitted.map((f) => f.percent);
    const lo = Math.min(...pcts);
    const hi = Math.max(...pcts);
    const range = lo === hi ? `${lo}%` : `${lo}–${hi}%`;
    const soO = framed.fitted.length;
    /* Mọi ô cùng một cỡ đầu ra ⇒ nói thẳng con số ấy, vì đó là thứ người dùng vừa
       chọn và sắp đo lại. Nhiều cỡ khác nhau ⇒ đừng chọn bừa một cái để in ra. */
    const sizes = new Set(framed.fitted.map((f) => `${f.w}×${f.h}`));
    const co = sizes.size === 1 ? `cỡ xuất ${[...sizes][0]}` : "đúng cỡ xuất đã chọn";
    return ` Máy vẽ luôn vẽ to hết ô cho nét, nên ${soO} ô được co về ${co} (${range}).`;
  }, [framed]);

  /* Nhãn «Đã copy N ô» tự tắt sau 2 giây — cùng cách với nút «Copy prompt» của
     `CanvasBlock.tsx:426`. Dọn timer khi khối gỡ sớm: người dùng cuộn qua thẻ khác
     ngay sau khi bấm thì `setCopied` sẽ chạy trên một khối không còn nữa. */
  React.useEffect(() => {
    if (copied === 0) return;
    const t = setTimeout(() => setCopied(0), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  /* Rời panel giữa lúc đang tải ảnh ⇒ huỷ luôn, đừng để hàng đợi chạy tiếp cho một
     khối đã chết (cùng lý do với `KitExits.CopyFigmaButton`). */
  React.useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * ĐƯỜNG LÙI của nút chính: bảng ảnh phẳng.
   *
   * Chỉ chạy khi đường khung riêng đã hỏng thật (thiếu toạ độ vùng an toàn, encoder
   * không nạp được, bộ nhớ tạm từ chối). Nó vẫn nhận ĐÚNG danh sách ô của tấm này,
   * nên tệ nhất người dùng cũng còn một bảng các ô đã cắt — không bao giờ tụt về
   * nguyên tấm thô. Và phải NÓI RÕ là đang đi đường lùi: báo "đã copy" trơn ở đây là
   * để designer phát hiện ra mình cầm một tấm ảnh phẳng lúc đã dán vào file thật.
   */
  const copyBoardFallback = async (why: string, signal: AbortSignal) => {
    const res = await buildFigmaBoard({
      projectId, files: cells, poseFiles, variantLabel: name, onProgress: setProgress, signal,
      /* Cùng tỉ lệ với đường node: bấm một nút mà ra hai bố cục khác nhau tuỳ hôm
         nay encoder có chạy hay không là cách chắc chắn để không ai tin nút này. */
      scaleOf: fitScale,
    });
    if (res.outcome === "clipboard") {
      setCopied(res.files);
      toastInfo(
        "Chưa dựng được khung riêng cho từng ô",
        `${why} Đã copy một ảnh phẳng ${res.width}×${res.height} gồm ${res.files} ô — dán vẫn được, nhưng không tách lớp.`,
      );
      return;
    }
    toastInfo(
      "Đã tải bảng ô về máy",
      `${why} Trình duyệt không cho ghi ảnh vào bộ nhớ tạm nên bảng ${res.width}×${res.height} được lưu thành file để bạn tự kéo vào Figma.`
      + (res.fallbackReason === undefined ? "" : ` (${res.fallbackReason})`),
    );
  };

  /**
   * NÚT CHÍNH — mỗi ô đã cắt của TẤM NÀY thành một khung Figma riêng.
   *
   * Bốn pha, nhãn lấy từ `PHASE_LABEL` để thanh tiến trình của panel và của màn
   * «Kết quả & xuất kit» nói cùng một thứ tiếng. Pha 3 là chỗ duy nhất khác: ở đây
   * không ghép bảng nào cả, mà chụp từng ô thành một khung — nên nó có nhãn riêng.
   *
   * KHÔNG chia đợt như `KitExits`: chỗ ấy copy CẢ BỘ KIT (80 ô, ~24 MB đã đo) nên
   * phải cắt theo nhóm; ở đây một tấm chỉ có vài ô, chia đợt chỉ thêm một trạng thái
   * "bấm lại để lấy tiếp" mà không bao giờ chạy tới. Payload có vỡ thì đường lùi bắt.
   */
  const copyCells = () => {
    if (cells.length === 0) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setProgress({ phase: 1, label: PHASE_LABEL[1], done: 0, total: cells.length });
    void (async () => {
      try {
        /* KHUNG = HỘP HỢP ĐỒNG, ẢNH CO CHO LÕI VỪA KHÍT — hai nửa của cùng một lời
           hứa. Người dùng vừa đặt cỡ bằng pixel và đọc đúng con số ấy trong prompt;
           khung dán ra Figma phải là con số đó, còn ảnh thì co theo phần lố của
           chính ô đó (máy vẽ không bao giờ vẽ đúng px). Tỉ lệ đi THEO TỪNG Ô — xem
           `contractFramed` (`sheet-files.ts`) và `PackOptions.scale`. */
        const nodes = cellsOf(packKitDoc(framed.files, poseFiles, BOARD_W, { scale: fitScale }).groups);
        if (nodes.length === 0) {
          throw new Error("Không ô nào của tấm này có đủ toạ độ vùng an toàn để dựng khung.");
        }

        /* 2/4 — ẢNH GỐC, không bản thu nhỏ: `loadFull` không kèm `?w=`, còn `loadThumb`
           ép 256px và sẽ dán sang Figma một bộ ô mờ. */
        const paths = [...new Set(nodes.map((c) => c.file.path))];
        const handles = paths.map((path) => ({ path, handle: loadFull(projectId, path) }));
        const onAbort = () => handles.forEach((h) => h.handle.cancel());
        ac.signal.addEventListener("abort", onAbort, { once: true });
        const urls = new Map<string, string>();
        try {
          for (const [i, { path, handle }] of handles.entries()) {
            if (ac.signal.aborted) throw new BoardCancelled();
            setProgress({ phase: 2, label: PHASE_LABEL[2], done: i, total: handles.length });
            urls.set(path, await handle.promise);
          }
        } finally {
          ac.signal.removeEventListener("abort", onAbort);
        }

        /* 3/4 + 4/4 — chụp rồi ghi bộ nhớ tạm trong CÙNG một cử chỉ người dùng. */
        setProgress({ phase: 3, label: CELL_PHASE_3, done: 0, total: nodes.length });
        const res = await copyKitDoc(nodes, urls, (done, total) => {
          setProgress({ phase: 3, label: CELL_PHASE_3, done, total });
        });
        setProgress({ phase: 4, label: PHASE_LABEL[4], done: 1, total: 1 });
        setCopied(res.docs);
        /* NÓI RA khi có ô phải dùng khung ĐO ĐƯỢC: kit cắt bằng bản engine cũ không
           có `contractSafe`, và lúc ấy con số ở Figma khác con số trong prompt. Báo
           "đã copy" trơn ở đây là để designer tự phát hiện lúc đã dán vào file thật. */
        const doPhong = framed.measured.length;
        toastSuccess(
          "Đã copy các ô sang Figma",
          `${name} · ${res.docs} ô, mỗi ô một khung riêng đúng cỡ xuất đã chọn.`
          + fitNote
          + " Dán bằng Ctrl/Cmd+V."
          + (doPhong === 0 ? "" : ` Riêng ${doPhong} ô cắt bằng bản cũ thì khung lấy theo cỡ đo được, có thể lệch cỡ bạn đã chọn.`),
        );
      } catch (err) {
        if (err instanceof BoardCancelled || ac.signal.aborted) return;
        try {
          await copyBoardFallback(err instanceof Error ? err.message : String(err), ac.signal);
        } catch (fallbackErr) {
          if (!(fallbackErr instanceof BoardCancelled)) toastError(fallbackErr, {});
        }
      } finally {
        setProgress(null);
        abortRef.current = null;
      }
    })();
  };

  /**
   * COPY CẢ TẤM sang Figma — nay là nút PHỤ, chỉ ở tab «Ảnh gốc».
   *
   * Đo cỡ ảnh THẬT trước khi dựng spec (`measureImage`) thay vì lấy khổ trong contract:
   * contract nói khổ *đáng lẽ*, còn `assertDocShape` bên trong encoder đo frame THẬT
   * và sẽ ném nếu lệch quá 1px. Lấy số sai ở đây = lỗi khó hiểu ở tận đáy encoder.
   */
  const copySheet = () => {
    setCopying(true);
    void (async () => {
      try {
        const url = await loadFull(projectId, rawPath).promise;
        const size = await measureImage(url);
        const spec = await copySheetAsFigmaNode(url, size, job);
        /* Số đo cũng rút ra trước: `spec.frame.w` nằm giữa câu tiếng Việt thì cổng §5.4
           đọc thấy chữ «frame» — và nó nói đúng, câu báo cho người dùng không nên có
           chữ ấy. Ở đây gọi bằng tiếng Việt: «khung». */
        const w = Math.round(spec.frame.w);
        const h = Math.round(spec.frame.h);
        toastSuccess(
          "Đã copy cả tấm sang Figma",
          `${name} · khung ${w}×${h}. Dán bằng Ctrl/Cmd+V.`,
        );
      } catch (err) {
        /* Không im lặng đổi sang bitmap: panel này không có đường lùi nào, và báo
           "đã copy" khi chưa copy được là lời nói dối tốn của người dùng cả buổi. */
        toastError(err, {});
      } finally {
        setCopying(false);
      }
    })();
  };

  const downloadSheet = () => {
    void saveProjectFile(projectId, rawPath)
      .then((saved) => toastSuccess("Đã tải ảnh gốc", saved.fileName))
      .catch((err: unknown) => toastError(err, {}));
  };

  /**
   * NHÃN NÚT CHÍNH — bốn trạng thái, mỗi trạng thái nói đúng một sự thật:
   * đang chạy (pha + đếm) · vừa xong (số ô đã dán) · sẵn sàng (số ô sẽ dán) ·
   * chưa có gì để dán. Con số rút ra ngoài chuỗi mẫu để câu vẫn đọc được thành
   * một câu tiếng Việt — cùng lý do với `name` ở trên.
   */
  const busyCells = progress !== null;
  const n = cells.length;
  const cellsButtonLabel = progress !== null
    ? `${progress.label}${progress.total > 0 ? ` ${progress.done}/${progress.total}` : ""}`
    : copied > 0 ? `Đã copy ${copied} ô`
      : n > 0 ? `Copy ${n} ô sang Figma`
        : "Copy ô sang Figma · chờ cắt";

  return (
    <section className={cn("rounded-4 border border-line-subtle bg-surface p-3", className)} aria-label={`Kết quả tấm ${name}`}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="raw"><ImageIcon aria-hidden strokeWidth={1.5} />Ảnh gốc</TabsTrigger>
            <TabsTrigger value="cut">Đã crop{cells.length > 0 ? ` (${cells.length})` : ""}</TabsTrigger>
          </TabsList>
          <SheetVersionBar projectId={projectId} job={job} name={name} busy={busy} onSwapped={reloadImage} />
        </div>

        <TabsContent value="raw" className="mt-3">
          {neverDrawn ? (
            <NotDrawnYet what="Chưa vẽ tấm này" />
          ) : (
            <>
              {/* Bấm vào ảnh = xem ở độ nét thật. Lưới dùng bản `?w=512` cho nhẹ, còn popup
                  mới xin ảnh gốc — cùng quy ước với `AssetZoomDialog` của tab kết quả cũ. */}
              <button
                type="button"
                onClick={() => setZoom(true)}
                aria-label={`Phóng to ảnh gốc ${name}`}
                className={cn("block w-full", FOCUS)}
              >
                <KitImage
                  key={reloadKey}
                  projectId={projectId}
                  path={rawPath}
                  version={rawVersion}
                  alt={`Ảnh gốc tấm ${name}`}
                  full={false}
                  width={512}
                  className={cn(PREVIEW_MAX_H, "w-full")}
                  imgClassName={PREVIEW_MAX_H}
                />
              </button>
              <p className="mt-2 text-caption text-fg-muted">
                Bấm vào ảnh để phóng to ở độ nét thật.{" "}
                {runId === null || runId === ""
                  ? "Đây là bản hiện hành — mỗi lượt vẽ ghi đè lên nó."
                  : "Đây là ảnh của đúng lượt chạy này — không bị lượt sau ghi đè."}
              </p>
              {ducNen && (
                <p className="mt-1 text-caption text-fg-muted">
                  Tấm này không có kênh alpha thật — máy vẽ trả nền đục. Vẽ lại hoặc xoá bản
                  này ở thanh phiên bản nếu bạn cần nền trong suốt.
                </p>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="cut" className="mt-3">
          {neverDrawn ? (
            <NotDrawnYet what="Chưa có ô nào để crop" />
          ) : (
            <SheetCellGrid
              projectId={projectId}
              cells={cells}
              cutting={cutting}
              loading={kit.isLoading}
              poseFiles={poseFiles}
            />
          )}
        </TabsContent>

      </Tabs>

      {/* HÀNG NÀY BIẾN MẤT KHI CHƯA CÓ ẢNH. Ba nút đều thao tác trên `raw/<job>.png`;
          bày chúng ra dưới một khối "chưa vẽ" là mời người dùng bấm ba lần để nhận ba
          thông báo lỗi. §2.5-2 cấm ẩn nút *có thể dùng được* — ở đây thì chưa có gì để
          dùng cả, và khối rỗng ngay trên đã nói rõ việc phải làm trước. */}
      {!neverDrawn && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-subtle pt-4">
          {/* NÚT CHÍNH. Chưa cắt xong ⇒ vô hiệu và NÓI RA vì sao ngay trên nhãn: một nút
              «Copy 0 ô» bấm được là một lời hứa rỗng, còn một nút xám không lời giải thích
              thì người dùng đọc thành "tính năng hỏng" (§2.5-2 chỉ cấm ẩn nút DÙNG ĐƯỢC). */}
          <Button
            type="button" variant="secondary" size="sm" onClick={copyCells}
            disabled={cells.length === 0 || busyCells} loading={busyCells}
            title={cells.length === 0
              ? "Chờ máy cắt xong tấm này thì mới có ô để copy"
              : `Mỗi ô một khung riêng đúng cỡ xuất đã chọn, ảnh co cho phần chính vừa khít khung.${fitNote}`}
          >
            {copied > 0 && !busyCells
              ? <Check aria-hidden strokeWidth={1.5} />
              : <Layers aria-hidden strokeWidth={1.5} />}
            {cellsButtonLabel}
          </Button>
          {busyCells && (
            <Button type="button" variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
              <X aria-hidden strokeWidth={1.5} />
              Huỷ
            </Button>
          )}
          {/* Nút PHỤ, và chỉ ở tab «Ảnh gốc»: nó dán nguyên tấm lưới thô — thứ chỉ có
              nghĩa khi người dùng đang nhìn chính tấm ấy. Bày nó cạnh lưới ô đã cắt là
              đặt lại đúng cái bẫy vừa gỡ. */}
          {tab === "raw" && (
            <Button type="button" variant="ghost" size="sm" onClick={copySheet} disabled={copying} loading={copying}>
              <ImageIcon aria-hidden strokeWidth={1.5} />
              Copy ảnh gốc sang Figma
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={downloadSheet}>
            <Download aria-hidden strokeWidth={1.5} />
            Tải PNG
          </Button>
          {/* `#21` mở đúng THƯ MỤC DỰ ÁN (agent bỏ qua `path` — projects.mjs:299-306),
              nên nhãn nói "thư mục dự án" chứ không hứa là trỏ thẳng vào file. */}
          <Button type="button" variant="ghost" size="sm" onClick={() => reveal.mutate(undefined)}>
            <FolderOpen aria-hidden strokeWidth={1.5} />
            Mở thư mục dự án
          </Button>
        </div>
      )}

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent size="xl" className="!max-h-[min(90dvh,720px)]">
          <DialogHeader>
            <DialogTitle className="font-mono text-subtitle">{job}</DialogTitle>
            <DialogDescription>Ảnh gốc ở độ nét thật — {rawPath}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <KitImage
              key={`zoom-${reloadKey}`}
              projectId={projectId}
              path={rawPath}
              alt={`Ảnh gốc tấm ${name} ở độ nét thật`}
              eager
              className="w-full"
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * KHỐI RỖNG «CHƯA VẼ» — thay cho ô đỏ "Thiếu file · Thử lại".
 *
 * Nó KHÔNG có nút. Nút Vẽ nằm ở đầu thẻ, cách đây vài chục pixel, và nó là nút
 * primary duy nhất của thẻ — thêm một bản sao ở đây là hai CTA cho cùng một việc
 * và hai chỗ phải sửa mỗi khi luật "vẽ được hay chưa" đổi (thẻ rỗng, agent tắt,
 * đang có lượt khác chạy). Nên khối này chỉ CHỈ ĐƯỜNG, và nói đúng nút nào.
 */
function NotDrawnYet({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2 border border-dashed border-line-subtle bg-raised/40 px-4 py-8 text-center">
      <Sparkles aria-hidden strokeWidth={1.5} className="size-5 text-fg-muted" />
      <p className="text-body text-fg">{what}</p>
      <p className="text-caption text-fg-muted">Bấm «Vẽ · tiêu lượt» ở đầu thẻ để tạo ảnh cho tấm này.</p>
    </div>
  );
}
