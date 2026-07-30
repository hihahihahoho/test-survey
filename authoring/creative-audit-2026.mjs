/* ============================================================================
   Khảo sát hiện trạng công việc & công cụ — Creative Team
   ----------------------------------------------------------------------------
   Ba mục tiêu:
     1. Mỗi người làm loại việc gì, mỗi loại chiếm bao nhiêu khối lượng.
     2. Bản đồ công cụ theo từng công đoạn (research, gen ảnh, tách nền, anim, export…).
     3. Công cụ hiện tại còn thiếu / còn tắc ở đâu.

   Nguyên tắc thiết kế đã áp dụng (chuẩn survey enterprise):
     · Funnel — dễ trước, khó sau; câu nhận diện cá nhân đặt cuối cùng.
     · Grid ≤ 8 dòng × 6 cột để tránh straightlining (tick một cột cho xong).
     · Mọi thang đo gắn nhãn đầy đủ, cùng chiều thấp→cao, luôn có ô thoát
       ("Không làm" / "Không áp dụng" / "Không rõ") để không bắt người ta đoán.
     · Skip-logic — ai không làm mảng nào thì không phải xem module của mảng đó.
     · Đúng 1 câu tự luận bắt buộc; phần mở là opt-in sau khi đã xong phần chính.
     · Câu hỏi trung tính, một ý một câu, không gợi ý sẵn câu trả lời.
     · KHÔNG hỏi người trả lời chấm điểm các giải pháp chưa tồn tại — việc đó
       để workshop sau khi đã có dữ liệu; survey chỉ đo nhu cầu theo công đoạn.
   ========================================================================== */

import { PAGE, RADIO, CHECK, DROP, TXT, PARA, SCALE, GRID, NOTE, resetIds } from "./helpers.mjs";

/* ---- thang đo dùng lại, giữ nhất quán toàn form ---- */
const WORK = ["Rất nhiều", "Nhiều", "Trung bình", "Ít / rất ít", "Không làm"];
const TIME = ["Rất nhiều", "Nhiều", "Trung bình", "Ít", "Không áp dụng"];
const NEED = ["Rất cần", "Cần", "Chưa rõ", "Không cần", "Không áp dụng"];
const WEAK = ["Chậm / nặng máy", "Kết quả không nhất quán", "Phải làm tay từng file",
              "Thiếu tính năng cần có", "Đắt / không có license", "Ổn, không vấn đề"];

const WORK_ANCHOR =
  "Cách chấm: Rất nhiều = chiếm phần lớn thời gian trong tuần · Nhiều = làm thường xuyên · " +
  "Trung bình = làm đều nhưng không nhiều · Ít / rất ít = thỉnh thoảng · " +
  "Không làm = không thuộc việc của tôi.";

/* Danh sách việc cho câu "ngốn thời gian nhất".
   Giới hạn 5 (không phải không giới hạn) vì grid tỷ trọng ở trên đã là câu "chọn
   thoải mái"; nếu câu này cũng mở thì nó chỉ lặp lại grid. Giữ giới hạn mới tách
   được "việc ít gặp nhưng mỗi lần rất tốn" khỏi "việc làm hàng ngày nhưng nhanh".
   Con số 5 đủ rộng để hầu như không ai chạm trần. */
const TASKS = [
  "Icon app / icon UI", "Màn hình UI", "Character / mascot", "Illustration / key visual",
  "Banner quảng cáo", "Graphic social / thumbnail", "Ảnh sản phẩm / composite",
  "Retouch ảnh", "Infographic", "Print / OOH / pitch deck",
  "Animation UI (Lottie / Rive)", "Animation character & rigging",
  "Motion graphic / video", "Asset game", "3D modeling / render",
  "Làm biến thể từ template", "Resize & xuất đa tỷ lệ", "Bàn giao asset cho dev"
];

export const meta = {
  id: "creative-audit-2026",
  name: "Hiện trạng công việc & công cụ — Creative Team",
  note: "Đo tỷ trọng công việc, bản đồ công cụ theo công đoạn, và điểm yếu của công cụ hiện tại."
};

export function build() {
  resetIds();
  return {
    info: {
      title: "Khảo sát hiện trạng công việc & công cụ — Creative Team",
      documentTitle: "Creative Workflow & Tooling Audit 2026",
      description:
        "MỤC ĐÍCH\n" +
        "Khảo sát này thu thập ba thứ: (1) mỗi người đang làm loại việc gì và mỗi loại chiếm bao nhiêu " +
        "khối lượng, (2) ở từng công đoạn mọi người đang dùng công cụ nào, (3) những công cụ đó còn " +
        "thiếu hoặc còn tắc ở đâu.\n\n" +
        "KẾT QUẢ DÙNG ĐỂ LÀM GÌ\n" +
        "Quyết định nên xây công cụ nội bộ hoặc đưa AI vào công đoạn nào để thực sự giảm việc thủ công. " +
        "Kết quả tổng hợp sẽ được chia sẻ lại cho cả team.\n\n" +
        "CAM KẾT\n" +
        "· Không dùng để đánh giá năng lực, KPI hay xếp hạng cá nhân.\n" +
        "· Không có câu trả lời đúng hay sai. Trả lời theo thực tế, không theo mong đợi.\n" +
        "· Phần tên và email nằm ở cuối và không bắt buộc.\n\n" +
        "THỜI GIAN\n" +
        "Phần chính khoảng 15 phút. Khảo sát tự bỏ qua những mảng bạn không làm, nên nhiều người sẽ " +
        "xong nhanh hơn. Hết phần chính bạn có thể gửi luôn, hoặc trả lời thêm khoảng 4 phút câu mở.\n\n" +
        "Nếu có câu nào chưa rõ nghĩa, hãy chọn phương án gần nhất rồi ghi lại ở phần Ý kiến mở — " +
        "chúng tôi sẽ sửa cho vòng khảo sát sau."
    },
    items: [

      /* ===================== P1 · Vai trò ===================== */
      PAGE("sec_profile", "Phần 1 · Vai trò của bạn",
        "Ba câu nhanh để tổng hợp kết quả theo nhóm."),
      RADIO("Vai trò chính của bạn hiện nay",
        ["Graphic Designer", "UI / Product Designer", "Illustrator / Character Artist",
         "Motion Designer / Animator", "Game Artist", "3D Artist", "Video Editor",
         "Art Director / Team Lead", "__OTHER__"],
        { req: true, desc: "Chọn vai trò chiếm phần lớn thời gian, kể cả khi bạn kiêm nhiều mảng." }),
      RADIO("Số năm kinh nghiệm trong ngành",
        ["Dưới 1 năm", "1–3 năm", "3–5 năm", "5–8 năm", "Trên 8 năm"], { req: true }),
      CHECK("Output của bạn đi vào đâu?",
        ["App / sản phẩm số", "Game", "Social media (organic)", "Ads / performance creative",
         "Website / landing page", "Video / TVC", "Print / OOH", "Brand asset / pitch deck",
         "__OTHER__"],
        { req: true, desc: "Chọn tất cả những kênh áp dụng." }),

      /* ===================== P2 · Khối lượng (1/2) ===================== */
      PAGE("sec_work_static", "Phần 2 · Khối lượng công việc (1/2)",
        "Chấm theo khối lượng công việc thực tế của bạn trong 2–3 tháng gần đây.\n" + WORK_ANCHOR),
      GRID("Thiết kế & minh hoạ",
        ["Icon app, icon UI",
         "Màn hình UI (app / web)",
         "Character / mascot",
         "Illustration / key visual",
         "Banner quảng cáo (ads, performance)",
         "Graphic social (post, story, carousel, thumbnail)"],
        WORK, { req: true }),
      GRID("Ảnh, hậu kỳ & tài liệu",
        ["Ảnh sản phẩm / ghép ảnh (composite)",
         "Retouch & chỉnh sửa ảnh có sẵn",
         "Infographic / data visual",
         "Print / OOH / pitch deck / brand asset"],
        WORK, { req: true }),

      /* ===================== P2 · Khối lượng (2/2) ===================== */
      PAGE("sec_work_motion", "Phần 2 · Khối lượng công việc (2/2)", WORK_ANCHOR),
      GRID("Chuyển động, 3D & game",
        ["Animation UI / micro-interaction (Lottie, Rive)",
         "Animation character & rigging",
         "Motion graphic / video ads / edit video",
         "Asset game (item, tile, UI game, effect)",
         "3D modeling / render"],
        WORK, { req: true }),
      CHECK("Chọn tối đa 5 việc ngốn nhiều thời gian nhất của bạn",
        TASKS.concat(["__OTHER__"]),
        { req: true,
          desc: "Câu này hỏi về THỜI GIAN, không phải tần suất — nên câu trả lời có thể khác hẳn " +
                "phần chấm khối lượng ở trên. Một việc mỗi tháng chỉ làm hai lần nhưng mỗi lần mất " +
                "hai ngày vẫn có thể là việc ngốn thời gian nhất của bạn.\n" +
                "Nếu việc của bạn không có trong danh sách, ghi vào ô Khác." }),

      /* ===================== P3 · Nhịp làm việc ===================== */
      PAGE("sec_process", "Phần 3 · Nhịp làm việc",
        "Ước lượng theo một tuần bình thường, không phải tuần cao điểm."),
      RADIO("Một tuần bạn bàn giao khoảng bao nhiêu asset hoàn chỉnh?",
        ["Dưới 5", "5–15", "16–30", "31–60", "Trên 60", "Khó ước lượng"],
        { req: true, desc: "Mỗi tỷ lệ hoặc kích thước xuất ra tính là một asset." }),
      RADIO("Một asset điển hình mất bao lâu từ lúc nhận brief đến lúc bàn giao?",
        ["Dưới 30 phút", "30 phút – 1 giờ", "1–3 giờ", "3–8 giờ", "Trên 1 ngày",
         "Rất khác nhau, không có mức điển hình"], { req: true }),
      RADIO("Trong công việc một tuần, phần là biến thể của cái đã có (cùng layout, khác nội dung) chiếm khoảng bao nhiêu?",
        ["Dưới 20%", "20–40%", "40–60%", "60–80%", "Trên 80%", "Không rõ"], { req: true }),
      GRID("Với một asset điển hình, mỗi công đoạn chiếm bao nhiêu thời gian?",
        ["Đọc brief & làm rõ yêu cầu",
         "Research / tìm reference",
         "Ideation, sketch, layout",
         "Tạo nội dung chính (vẽ, dựng, gen)",
         "Hậu kỳ (tách nền, retouch, color)",
         "Animation / rigging",
         "Resize & xuất nhiều phiên bản",
         "Đặt tên, đóng gói, bàn giao"],
        TIME, { req: true }),

      /* ===================== P4 · Công cụ dùng chung ===================== */
      PAGE("sec_tools_common", "Phần 4 · Công cụ — phần dùng chung",
        "Chọn tất cả công cụ bạn thực sự dùng, kể cả công cụ cá nhân hoặc bạn tự trả tiền.\n" +
        "Sau phần này, khảo sát chỉ hỏi tiếp về những mảng bạn thực sự làm."),
      CHECK("Bạn tìm reference ở đâu?",
        ["Pinterest", "Behance", "Dribbble", "Google Images", "Mobbin", "Savee / Cosmos",
         "ArtStation", "Instagram / TikTok", "Awwwards / Land-book", "Xem trực tiếp đối thủ",
         "Thư viện nội bộ (Notion, Milanote, Drive)", "Hỏi AI (ChatGPT, Claude, Gemini)",
         "__OTHER__"], { req: true }),
      RADIO("Tìm reference cho một việc thường mất bao lâu?",
        ["Dưới 10 phút", "10–30 phút", "30–60 phút", "Hơn 1 giờ", "Rất khác nhau"], { req: true }),
      CHECK("Bạn dùng công cụ AI nào để tạo ảnh?",
        ["Midjourney", "ComfyUI (Stable Diffusion / Flux)", "Automatic1111 / Forge",
         "Adobe Firefly", "Photoshop Generative Fill", "Gemini / Nano Banana",
         "Ideogram", "Leonardo", "Recraft", "Krea", "Freepik AI",
         { value: "Không dùng AI tạo ảnh", exclusive: true }, "__OTHER__"], { req: true }),
      CHECK("Bạn export & tối ưu file bằng gì?",
        ["Export trực tiếp từ công cụ thiết kế", "Figma export preset / plugin",
         "Photoshop Actions / Image Processor", "TinyPNG / Squoosh", "ImageOptim",
         "SVGO / SVGOMG", "LottieFiles optimizer", "Script hoặc CLI tự viết",
         "Làm tay từng file", "__OTHER__"], { req: true }),
      CHECK("Asset được lưu và bàn giao qua đâu?",
        ["Figma", "Google Drive", "Dropbox", "Slack / Telegram / Zalo", "Git repo",
         "Server / NAS nội bộ", "Jira / Asana attachment", "Notion", "__OTHER__"], { req: true }),
      CHECK("Bạn có đang dùng cơ chế tự động sẵn có nào trong công cụ không?",
        ["Photoshop Actions / Batch / Image Processor", "After Effects expression",
         "After Effects Essential Graphics", "Figma component & variants", "Figma plugin",
         "Illustrator action / script", "Rive state machine",
         { value: "Không dùng cái nào", exclusive: true }],
        { req: true, desc: "Chọn những cái bạn thực sự dùng, không phải những cái bạn biết là có." }),
      RADIO("Bạn có tự viết được script, action hoặc plugin không?",
        ["Có, viết được", "Sửa được script người khác viết",
         "Không, nhưng muốn học", "Không, và không có nhu cầu"], { req: true }),

      /* ===================== Gate A ===================== */
      PAGE("sec_gate_graphic", "Phần 5 · Bạn làm những mảng nào?",
        "Ba câu hỏi lọc, để bỏ qua những phần không liên quan đến bạn."),
      RADIO("Bạn có làm ảnh tĩnh, illustration, graphic hoặc icon không?",
        [{ value: "Có", goTo: "NEXT" }, { value: "Không", goTo: "sec_gate_motion" }], { req: true }),

      /* ===================== Module Graphic ===================== */
      PAGE("sec_mod_graphic", "Phần 5A · Công cụ cho ảnh tĩnh, illustration & graphic"),
      CHECK("Vẽ, dựng & vector — bạn dùng gì?",
        ["Photoshop", "Procreate", "Clip Studio Paint", "Krita", "Affinity Photo",
         "Illustrator", "Figma", "Affinity Designer", "Inkscape", "Sketch",
         "Icon set có sẵn (Iconify, Phosphor, Lucide, Font Awesome…)", "__OTHER__"], { req: true }),
      CHECK("Tách nền / masking — bạn dùng gì?",
        ["Photoshop Select Subject / Remove Background",
         "Photoshop làm tay (pen, channel, refine edge)",
         "remove.bg", "Photoroom", "Adobe Express / Firefly", "Figma remove background",
         "ComfyUI node (rembg, BiRefNet, SAM)", "Canva",
         { value: "Không làm phần này", exclusive: true }, "__OTHER__"], { req: true }),
      CHECK("Retouch, finishing & upscale — bạn dùng gì?",
        ["Photoshop", "Lightroom / Camera Raw", "Capture One",
         "Generative Fill / Generative Expand", "Preset & Action có sẵn",
         "Topaz (Gigapixel / Photo AI)", "Photoshop Super Resolution",
         "Upscaler trong ComfyUI (ESRGAN…)", "Magnific / Krea upscale",
         { value: "Không làm phần này", exclusive: true }, "__OTHER__"], { req: true }),

      /* ===================== Gate B ===================== */
      PAGE("sec_gate_motion", "Phần 5 · Mảng chuyển động"),
      RADIO("Bạn có làm animation, motion graphic hoặc video không?",
        [{ value: "Có", goTo: "NEXT" }, { value: "Không", goTo: "sec_gate_3d" }], { req: true }),

      /* ===================== Module Motion ===================== */
      PAGE("sec_mod_motion", "Phần 5B · Công cụ cho animation, motion & video"),
      CHECK("Animation & video — bạn dùng công cụ gì?",
        ["After Effects", "Adobe Animate", "Blender (Grease Pencil)", "Spine", "Moho",
         "Toon Boom", "Rive", "Figma prototype / Smart Animate",
         "Premiere Pro", "DaVinci Resolve", "CapCut", "Final Cut", "__OTHER__"], { req: true }),
      CHECK("Animation cho app / web — bạn bàn giao ở dạng gì?",
        ["Lottie (Bodymovin)", "dotLottie", "Rive (.riv)", "GIF / APNG", "MP4 / WebM",
         "SVG animation", "Spec để dev tự code (CSS, Compose, SwiftUI)",
         { value: "Không làm phần này", exclusive: true }, "__OTHER__"], { req: true }),
      CHECK("Bạn dùng công cụ AI nào để tạo video hoặc animation?",
        ["Runway", "Kling", "Google Veo", "Sora", "Hailuo / MiniMax", "Luma", "Pika",
         "Wan / Hunyuan (chạy local)",
         { value: "Không dùng", exclusive: true }, "__OTHER__"], { req: true }),

      /* ===================== Gate C ===================== */
      PAGE("sec_gate_3d", "Phần 5 · Mảng 3D & game"),
      RADIO("Bạn có làm 3D hoặc asset game không?",
        [{ value: "Có", goTo: "NEXT" }, { value: "Không", goTo: "sec_weak" }], { req: true }),

      /* ===================== Module 3D / Game ===================== */
      PAGE("sec_mod_3d", "Phần 5C · Công cụ cho 3D & game"),
      CHECK("3D & pipeline game — bạn dùng gì?",
        ["Blender", "Cinema 4D", "Maya", "3ds Max", "Houdini",
         "Substance Painter / Designer", "Spline", "ZBrush",
         "Unity", "Unreal Engine", "Godot", "Cocos",
         "Texture packer / atlas tool", "__OTHER__"], { req: true }),
      CHECK("Bạn dùng công cụ AI nào để tạo asset 3D?",
        ["Tripo / Rodin", "Meshy", "Hunyuan3D", "Luma / Genie",
         { value: "Không dùng", exclusive: true }, "__OTHER__"], { req: true }),

      /* ===================== P6 · Điểm yếu công cụ ===================== */
      PAGE("sec_weak", "Phần 6 · Công cụ hiện tại còn thiếu gì",
        "Với mỗi công đoạn, chọn những vấn đề bạn thực sự gặp. Mỗi dòng chọn được nhiều ô. " +
        "Công đoạn bạn không làm thì để trống cả dòng."),
      GRID("Công cụ ở mỗi công đoạn có vấn đề gì?",
        ["Research / tìm reference",
         "Tạo ảnh bằng AI",
         "Vẽ, dựng, vector & icon",
         "Tách nền, retouch, hậu kỳ",
         "Animation & bàn giao motion",
         "3D & asset game",
         "Resize và xuất nhiều phiên bản",
         "Quản lý version & bàn giao asset"],
        WEAK, { multi: true }),
      PARA("Công cụ nào làm bạn mất thời gian nhất, và tắc ở thao tác cụ thể nào?",
        { desc: "Ví dụ mẫu: “After Effects — phải duplicate comp cho từng tỷ lệ rồi canh lại text bị tràn.”\n" +
                "Không bắt buộc, nhưng đây là phần hữu ích nhất của khảo sát." }),
      CHECK("Bạn có gặp hạn chế nào về máy móc, license hoặc hạ tầng không?",
        ["GPU yếu, không chạy được AI trên máy", "RAM / CPU không đủ", "Ổ cứng hết chỗ",
         "Không được tự cài software", "Thiếu license (Adobe, Topaz, Midjourney…)",
         "Mạng chậm khi upload / download", "Policy không cho dùng AI tool bên ngoài",
         { value: "Không có hạn chế đáng kể", exclusive: true }], { req: true }),
      RADIO("Brand guideline hoặc design system hiện tại dùng được ngay chưa?",
        ["Có, đầy đủ và cập nhật", "Có nhưng thiếu hoặc lỗi thời", "Đang xây",
         "Không có, mỗi người tự làm", "Không rõ"], { req: true }),
      RADIO("Bạn có template hoặc master file dùng lại được cho việc lặp lại không?",
        ["Có, được tổ chức tốt", "Có, nhưng tự làm riêng và không chia sẻ",
         "Có, nhưng rối và tìm lại mất thời gian", "Không có"], { req: true }),

      /* ===================== P7 · AI ===================== */
      PAGE("sec_ai", "Phần 7 · AI trong công việc thật",
        "Phần này để biết AI đang đứng ở đâu trong quy trình và đang tắc ở đâu."),
      RADIO("AI đang tham gia vào công việc thật của bạn ở mức nào?",
        ["Chưa dùng", "Có thử nhưng chưa dùng cho việc thật", "Dùng cho draft / ideation",
         "Dùng ra asset cuối, nhưng phải sửa nhiều",
         "Dùng ra asset cuối, gần như không phải sửa"], { req: true }),
      CHECK("Sau khi AI ra kết quả, bạn thường phải sửa những gì?",
        ["Tách nền", "Sửa tay, mặt, chi tiết cơ thể", "Sửa logo & chi tiết brand",
         "Color grading cho khớp brand", "Text / typography", "Upscale & sharpen",
         "Sửa perspective / crop lại", "Ghép nhiều ảnh thành một",
         "Thêm grain, shadow, ánh sáng",
         { value: "Gần như không phải sửa", exclusive: true },
         { value: "Không dùng AI", exclusive: true }], { req: true }),
      RADIO("Thời gian sửa sau AI chiếm khoảng bao nhiêu tổng thời gian làm asset đó?",
        ["Dưới 20%", "20–40%", "40–60%", "60–80%", "Trên 80%", "Không dùng AI"], { req: true }),
      CHECK("Điều gì cản bạn dùng AI cho việc thật? Chọn tối đa 3.",
        ["Không giữ được nhất quán character / mascot",
         "Không giữ được nhất quán brand (màu, style, typography)",
         "Chất lượng chưa đủ chuẩn bàn giao",
         "Prompt mất quá nhiều thời gian thử",
         "Kết quả ngẫu nhiên, khó kiểm soát",
         "Vấn đề bản quyền / pháp lý",
         "Máy hoặc GPU không đủ",
         "Chưa có ai hướng dẫn",
         "Quy trình công ty chưa cho phép",
         { value: "Không có rào cản đáng kể", exclusive: true }], { req: true }),
      RADIO("Công ty có mascot hoặc character xuất hiện lặp lại qua nhiều campaign không?",
        ["Có, 1–2 nhân vật cố định", "Có nhiều nhân vật, dùng luân phiên",
         "Có, nhưng mỗi campaign vẽ lại theo style khác", "Không dùng character", "Không rõ"],
        { req: true }),

      /* ===================== P8 · Nên tự động hoá gì ===================== */
      PAGE("sec_auto", "Phần 8 · Công đoạn nào nên tự động hoá",
        "Chấm theo nhu cầu công việc của bạn. Công đoạn bạn không làm thì chọn “Không áp dụng”."),
      GRID("Ảnh, export & bàn giao",
        ["Tách nền / tạo mask đối tượng",
         "Resize & crop đa tỷ lệ (1:1, 4:5, 16:9, 9:16)",
         "Áp preset màu theo brand",
         "Upscale & sharpen",
         "Xuất đủ format & density (@1x/@2x/@3x, PNG/WebP/SVG)",
         "Đặt tên file theo convention & đóng gói bàn giao",
         "Kiểm tra tự động trước bàn giao (safe area, font, size, color profile)"],
        NEED, { req: true }),
      GRID("Chuyển động & nhân vật",
        ["Đổi text, ảnh, màu trên template motion có sẵn",
         "Nhân bản composition sang nhiều tỷ lệ & render hàng loạt",
         "Tối ưu Lottie / đóng gói dotLottie",
         "Sinh 4–8 pose từ character có sẵn",
         "Sinh biến thể màu / theme cho icon set"],
        NEED, { req: true }),
      CHECK("Bộ tỷ lệ hoặc kích thước bạn phải xuất thường xuyên",
        ["1:1 (1080×1080)", "4:5 (1080×1350)", "9:16 (1080×1920)", "16:9",
         "Banner web nhiều size lẻ", "App icon & density @1x/@2x/@3x",
         "Icon nhiều size (16/24/32/48…)", "Print (CMYK, 300dpi)", "__OTHER__"], { req: true }),
      PARA("Mô tả một quy trình lặp lại của bạn theo dạng: đầu vào → các bước → đầu ra",
        { req: true,
          desc: "Đây là câu tự luận duy nhất bắt buộc, vì nó là input trực tiếp để xây công cụ.\n" +
                "Ví dụ mẫu: “1 ảnh sản phẩm + 1 dòng headline → tách nền, đặt vào 4 artboard, " +
                "đổi màu nền theo campaign, export PNG và WebP → 8 file.”" }),

      /* ===================== P9 · Bàn giao & QA ===================== */
      PAGE("sec_handoff", "Phần 9 · Bàn giao & chất lượng"),
      CHECK("Khi bàn giao cho dev hoặc marketing, bạn thường gặp vấn đề gì?",
        ["Sai naming, bên nhận phải hỏi lại", "Thiếu size / density",
         "Sai format (cần SVG nhưng nhận PNG…)", "File quá nặng",
         "Animation chạy sai trên app", "Lottie dùng feature platform không hỗ trợ",
         "Thiếu linked asset hoặc thiếu font", "Phải export lại nhiều lần",
         "Không biết version nào là mới nhất",
         { value: "Không gặp vấn đề đáng kể", exclusive: true }], { req: true }),
      RADIO("Một tuần bạn phải export lại vì sai spec khoảng bao nhiêu lần?",
        ["0", "1–2", "3–5", "6–10", "Trên 10", "Không rõ"], { req: true }),
      RADIO("Bạn có checklist kiểm tra trước khi bàn giao không?",
        ["Có, dạng văn bản dùng chung", "Có, checklist riêng của tôi",
         "Chỉ nhớ trong đầu", "Không có"], { req: true }),

      /* ===================== Cổng phần mở rộng ===================== */
      PAGE("sec_gate_extra", "Xong phần chính — cảm ơn bạn",
        "Đến đây là đã đủ dữ liệu cho phần định lượng. Còn khoảng 4 phút câu mở, " +
        "hoàn toàn tuỳ bạn. Nếu đang gấp, cứ gửi luôn."),
      RADIO("Bạn muốn làm gì tiếp?",
        [{ value: "Trả lời thêm phần mở (khoảng 4 phút)", goTo: "NEXT" },
         { value: "Gửi luôn", goTo: "SUBMIT" }], { req: true }),

      /* ===================== P10 · Phần mở ===================== */
      PAGE("sec_extra", "Phần 10 · Ý kiến mở",
        "Tất cả câu ở phần này đều không bắt buộc. Đây thường là phần cho ra insight tốt nhất."),
      SCALE("Trong một ngày làm việc, phần là thao tác thủ công lặp lại chiếm bao nhiêu?",
        1, 5, "Gần như không có", "Gần như toàn bộ"),
      PARA("Điều gì làm bạn mất hứng nhất trong công việc hàng ngày?"),
      PARA("Nếu được một điều ước cho quy trình của team, bạn ước gì?"),
      PARA("Có công đoạn nào bạn nghĩ không nên để AI hoặc công cụ làm thay không? Vì sao?"),
      PARA("Có câu nào trong khảo sát này bạn thấy khó hiểu hoặc không khớp với công việc thật của bạn?",
        { desc: "Giúp chúng tôi sửa cho những vòng khảo sát sau." }),
      RADIO("Bạn sẵn sàng dành bao nhiêu thời gian để học một công cụ nội bộ mới?",
        ["Dưới 30 phút", "1–2 giờ", "Nửa ngày", "1 ngày hoặc hơn",
         "Không có thời gian — công cụ phải dùng được ngay"]),
      RADIO("Bạn có muốn dùng thử sớm và góp ý trực tiếp (pilot user) không?",
        ["Có", "Tuỳ, nếu không ảnh hưởng deadline", "Không"]),
      TXT("Tên hoặc nickname",
        { desc: "Không bắt buộc. Chỉ dùng để hỏi thêm nếu cần, không gắn vào báo cáo." }),
      TXT("Email hoặc Slack handle", { desc: "Không bắt buộc." })
    ]
  };
}
