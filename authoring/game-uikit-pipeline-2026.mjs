/* ============================================================================
   Khảo sát pipeline UI kit cho campaign mini-game
   ----------------------------------------------------------------------------
   Câu hỏi cần trả lời: có nên xây pipeline "ý tưởng → bộ UI kit" cho campaign
   mini-game hay không, và nếu có thì nó phải nhả ra cái gì.

   Vì sao tách thành survey riêng, không nhét vào creative-audit-2026:
     · Survey kia đã đầy ở mức 15 phút; thêm module này là vượt.
     · Đối tượng khác nhau. Câu về định dạng bàn giao và engine PHẢI có dev trả
       lời, câu về thể lệ và quà phải có PM/marketing — không chỉ designer.
     · Campaign game là loại việc bản chất đã template hoá: mỗi campaign đổi chủ
       đề nhưng khung screen và component gần như y nhau. Đo riêng thì thấy rõ
       phần nào tái dùng được, phần nào buộc phải làm mới.

   Có câu sàng lọc ngay đầu: ai không tham gia làm campaign game thì gửi form
   luôn, không phải xem tiếp.
   ========================================================================== */

import { PAGE, RADIO, CHECK, DROP, TXT, PARA, GRID, resetIds } from "./helpers.mjs";

/* ---- thang đo dùng lại ---- */
const FREQ = ["Rất nhiều", "Nhiều", "Trung bình", "Ít", "Chưa từng làm"];
const NEEDED = ["Luôn cần", "Thường cần", "Thỉnh thoảng", "Không cần", "Không rõ"];
const WANT = ["Rất cần", "Cần", "Chưa rõ", "Không cần", "Không áp dụng"];

const GATE = "Bạn có tham gia làm campaign mini-game không?";

export const meta = {
  id: "game-uikit-pipeline-2026",
  name: "Pipeline UI kit cho campaign mini-game",
  note: "Đo bộ screen & component tối thiểu, định dạng bàn giao cần thiết, và mức tự động hoá mong muốn cho pipeline ý tưởng → UI kit.",
  testPaths: {
    "có làm game": { [GATE]: "Có, tôi trực tiếp làm" },
    "không làm (sàng lọc)": { [GATE]: "Không tham gia" }
  }
};

export function build() {
  resetIds();
  return {
    info: {
      title: "Khảo sát pipeline UI kit cho campaign mini-game",
      documentTitle: "Game UI Kit Pipeline Survey 2026",
      description:
        "MỤC ĐÍCH\n" +
        "Chúng tôi đang xem xét xây một pipeline đi từ ý tưởng campaign đến bộ UI kit dùng được ngay: " +
        "chọn loại game, sinh sơ đồ screen, dựng component theo brand kit, rồi xuất ra thứ mà bên nhận " +
        "cần (Figma, demo HTML bấm được, Lottie, sprite sheet…).\n\n" +
        "Khảo sát này để biết bộ screen và component tối thiểu của một campaign game thực tế gồm những " +
        "gì, và định dạng bàn giao nào là thật sự cần thiết chứ không phải làm cho có.\n\n" +
        "AI NÊN TRẢ LỜI\n" +
        "Bất kỳ ai từng tham gia một campaign mini-game: designer, illustrator, animator, dev, QA, PM, " +
        "marketing. Mỗi vai trò thấy một phần khác nhau của cùng một quy trình, nên cần đủ các góc.\n\n" +
        "CAM KẾT\n" +
        "· Không dùng để đánh giá cá nhân.\n" +
        "· Câu đầu tiên là câu sàng lọc — nếu bạn không tham gia làm campaign game thì gửi luôn, " +
        "không phải trả lời tiếp.\n\n" +
        "THỜI GIAN\n" +
        "Khoảng 10–12 phút nếu bạn có tham gia."
    },
    items: [

      /* ===================== Sàng lọc ===================== */
      PAGE("sec_screen", "Câu sàng lọc",
        "Campaign mini-game ở đây là các game nhỏ gắn với chiến dịch marketing: vòng xoay may mắn, " +
        "thẻ cào, lật thẻ, quiz, bắt vật rơi, điểm danh tích điểm… Thường sống vài tuần rồi tắt."),
      RADIO(GATE,
        [{ value: "Có, tôi trực tiếp làm", goTo: "NEXT" },
         { value: "Có, tôi review hoặc điều phối", goTo: "NEXT" },
         { value: "Không tham gia", goTo: "SUBMIT" }],
        { req: true }),

      /* ===================== P1 · Vai trò ===================== */
      PAGE("sec_role", "Phần 1 · Bạn đứng ở đâu trong quy trình"),
      RADIO("Vai trò chính của bạn",
        ["UI / Product Designer", "Graphic Designer", "Illustrator / Character Artist",
         "Motion Designer / Animator", "Game Artist", "Dev game / frontend",
         "QA", "PM / Project Manager", "Marketing", "Art Director / Lead", "__OTHER__"],
        { req: true }),
      CHECK("Trong một campaign game, bạn phụ trách phần nào?",
        ["Lên ý tưởng & cơ chế game", "Sơ đồ screen / flow", "UI design", "Illustration & art",
         "Animation & hiệu ứng", "Dựng game (code)", "Tích hợp & bàn giao", "QA / kiểm thử",
         "Nội dung & thể lệ", "Điều phối & deadline", "__OTHER__"], { req: true }),
      RADIO("Team bạn làm khoảng bao nhiêu campaign game?",
        ["Dưới 1 cái / tháng", "1–2 cái / tháng", "3–5 cái / tháng",
         "Trên 5 cái / tháng", "Không đều, theo mùa chiến dịch", "Không rõ"], { req: true }),

      /* ===================== P2 · Loại game & nhịp ===================== */
      PAGE("sec_types", "Phần 2 · Loại game và nhịp làm",
        "Chấm theo thực tế 6–12 tháng gần đây."),
      GRID("Các loại campaign game bạn làm nhiều hay ít?",
        ["Vòng xoay may mắn",
         "Thẻ cào / lật thẻ / mở hộp quà",
         "Quiz, trắc nghiệm, đoán đúng",
         "Bắt vật rơi / tap nhanh / lắc điện thoại",
         "Ghép hình, memory, tìm điểm khác",
         "Điểm danh & tích điểm, nuôi cây",
         "Runner / jump / endless đơn giản",
         "Đua top, bảng xếp hạng, chuỗi nhiệm vụ"],
        FREQ, { req: true }),
      RADIO("Từ lúc nhận brief đến lúc game lên live thường mất bao lâu?",
        ["Dưới 3 ngày", "3–7 ngày", "1–2 tuần", "2–4 tuần", "Trên 1 tháng",
         "Rất khác nhau"], { req: true }),
      RADIO("Một campaign game mới tái dùng được khoảng bao nhiêu phần từ game trước?",
        ["Gần như làm mới hết (dưới 20%)", "20–40%", "40–60%", "60–80%",
         "Phần lớn chỉ đổi chủ đề (trên 80%)", "Không rõ"],
        { req: true,
          desc: "Con số này quyết định trực tiếp việc pipeline có đáng xây hay không." }),

      /* ===================== P3 · Bộ screen ===================== */
      PAGE("sec_screens", "Phần 3 · Bộ screen tối thiểu",
        "Với một campaign game điển hình, mỗi screen dưới đây cần đến mức nào?"),
      GRID("Mức cần thiết của từng screen",
        ["Landing / intro + nút Chơi ngay",
         "Thể lệ & điều khoản",
         "Màn chơi (gameplay)",
         "Popup thắng + lộ quà",
         "Popup thua / hết lượt",
         "Form nhận quà (tên, SĐT, địa chỉ)",
         "Kho quà / lịch sử trúng thưởng",
         "Bảng xếp hạng"],
        NEEDED, { req: true }),
      CHECK("Screen nào hay bị phát hiện thiếu vào phút cuối?",
        ["Loading & trạng thái chờ", "Lỗi mạng / lỗi hệ thống", "Hết hạn campaign",
         "Hết quà / hết suất", "Nạp thêm lượt (đổi điểm, xem quảng cáo)",
         "Điểm danh hằng ngày", "Mời bạn / chia sẻ", "Xác nhận trước khi dùng lượt",
         "Trạng thái chưa đăng nhập", "Empty state (chưa có quà, chưa có ai trên bảng xếp hạng)",
         { value: "Không bị thiếu, luôn đủ từ đầu", exclusive: true }],
        { req: true,
          desc: "Đây là danh sách hay bị quên nhất — chọn những cái bạn từng phải làm gấp." }),

      /* ===================== P4 · Bộ component & asset ===================== */
      PAGE("sec_components", "Phần 4 · Bộ component và asset",
        "Cùng cách chấm như phần trước."),
      GRID("Mức cần thiết của từng component",
        ["Button đủ state (thường, nhấn, mờ, đang tải)",
         "Khung popup dùng chung (header, nút đóng, CTA)",
         "Input & form nhận quà (text, số, tỉnh/thành, checkbox điều khoản)",
         "Toast / thông báo ngắn",
         "Bộ đếm lượt chơi & điểm",
         "Thẻ quà (prize card)",
         "Thanh tiến độ / chuỗi nhiệm vụ",
         "Đồng hồ đếm ngược"],
        NEEDED, { req: true }),
      CHECK("Ngoài UI, một campaign game thường cần thêm asset gì?",
        ["Background dọc (portrait)", "Background ngang (landscape)",
         "Hoạ tiết trang trí / khung viền", "Hiệu ứng particle (lấp lánh, confetti)",
         "Ảnh quà theo từng loại", "Mascot / character + nhiều pose",
         "Icon set riêng cho game", "Số & chữ dạng hoạ tiết (number art)",
         "Sprite sheet / atlas", "Âm thanh & nhạc nền", "__OTHER__"], { req: true }),

      /* ===================== P5 · Định dạng bàn giao (core) ===================== */
      PAGE("sec_output", "Phần 5 · Bộ UI kit phải nhả ra cái gì",
        "Phần quan trọng nhất. Chấm theo cái thật sự dùng đến, không phải cái nghe hợp lý.\n" +
        "Nếu bạn là dev hoặc QA, đây là chỗ ý kiến của bạn quan trọng nhất."),
      GRID("Bản thiết kế & bản trình bày",
        ["Figma component set + variants",
         "Figma prototype bấm được",
         "Demo HTML/CSS bấm được (mở link là chơi thử)",
         "PDF / slide deck bàn giao (sơ đồ screen + ảnh preview + spec)",
         "Spec bàn giao dạng văn bản (state, kích thước, safe area)"],
        WANT, { req: true }),
      GRID("Asset & dữ liệu cho dev",
        ["Lottie / Rive cho animation",
         "Sprite sheet / atlas",
         "PNG & SVG export đủ kích thước",
         "Design token dạng JSON (màu, spacing, radius)"],
        WANT, { req: true }),
      DROP("Nếu chỉ được có MỘT thứ, bạn chọn dạng nào?",
        ["Figma component set", "Figma prototype bấm được", "Demo HTML bấm được",
         "PDF / slide deck bàn giao", "Spec bàn giao dạng văn bản",
         "Lottie / Rive", "Sprite sheet / atlas", "PNG & SVG export",
         "Design token JSON"], { req: true }),
      RADIO("Demo HTML bấm được có giúp gì thật sự cho bạn không?",
        ["Rất cần — để review với marketing trước khi dev dựng",
         "Cần — để chốt cảm giác chuyển động & luồng",
         "Có thì tốt, không có cũng được",
         "Không cần — Figma prototype là đủ",
         "Không cần — làm demo là tốn thêm công vô ích",
         "Không rõ"], { req: true,
          desc: "Trả lời thẳng. Nếu demo HTML không ai dùng thì không nên đưa vào pipeline." }),
      CHECK("Dev dựng game bằng gì?",
        ["HTML / CSS / JS thuần", "React / Vue", "Phaser", "PixiJS", "Cocos Creator",
         "Unity", "Godot", "Chỉ nhúng WebView trong app", "Lottie thuần, không có engine",
         "Không rõ", "__OTHER__"], { req: true }),

      /* ---- PDF / slide bàn giao: hỏi riêng vì đây là bước hay làm tay,
             hay bị bỏ ra ngoài pipeline, mà lại tốn thời gian mỗi lần lặp ---- */
      RADIO("Lúc bàn giao có phải làm PDF hoặc slide không?",
        ["Có, gần như mỗi lần",
         "Có, khi cần trình bày với khách hoặc cấp trên",
         "Có, nhưng làm tay nên rất mất thời gian",
         "Không, chỉ gửi link Figma",
         "Không bao giờ làm",
         "Không rõ"], { req: true }),
      CHECK("Nếu có PDF hoặc slide bàn giao, trong đó cần những gì?",
        ["Sơ đồ screen flow", "Ảnh từng screen kèm chú thích",
         "Danh sách state & trường hợp biên (hết quà, lỗi, hết hạn)",
         "Bảng màu & font", "Danh sách asset kèm tên file",
         "Spec animation (thời lượng, easing)", "Thể lệ & nội dung copy",
         "Changelog giữa các phiên bản", "Link Figma & link demo",
         "Tỉ lệ trúng & cơ chế quà",
         { value: "Không cần PDF hay slide", exclusive: true }], { req: true }),
      RADIO("Ai là người đọc bản PDF hoặc slide đó nhiều nhất?",
        ["Khách hàng / đối tác", "Marketing & PM nội bộ", "Dev", "QA",
         "Cấp trên duyệt", "Chỉ để lưu trữ, gần như không ai đọc",
         "Không có bản này"], { req: true }),

      /* ===================== P6 · Pipeline ý tưởng → UI kit (core) ===================== */
      PAGE("sec_pipeline", "Phần 6 · Từ ý tưởng đến UI kit",
        "Phần này quyết định pipeline sẽ nhận đầu vào gì và tự động đến đâu."),
      PARA("Hiện tại, từ lúc có ý tưởng đến lúc có bộ UI kit dùng được, quy trình đi qua những bước nào?",
        { req: true,
          desc: "Câu tự luận duy nhất bắt buộc. Viết dạng: đầu vào → các bước → đầu ra, kèm ai làm bước nào.\n" +
                "Ví dụ mẫu: “PM gửi brief + danh sách quà → designer tìm ref 1 buổi → vẽ 6 screen trong " +
                "Figma 2 ngày → illustrator vẽ background & mascot 2 ngày → export PNG rồi gửi dev qua " +
                "Drive → dev hỏi lại thiếu state hết quà.”" }),
      GRID("Dựng khung & component — nên tự động đến mức nào?",
        ["Chọn loại game từ thư viện mẫu có sẵn",
         "Sinh sơ đồ screen từ mô tả ý tưởng",
         "Sinh wireframe từng screen",
         "Dựng bộ component theo brand kit (màu, font, logo)"],
        WANT, { req: true }),
      GRID("Sinh art & xuất bản bàn giao — nên tự động đến mức nào?",
        ["Sinh background & hoạ tiết bằng AI",
         "Sinh ảnh quà và icon",
         "Xuất Figma component set",
         "Xuất demo HTML bấm được",
         "Xuất PDF / slide bàn giao (sơ đồ screen + ảnh preview + spec)"],
        WANT, { req: true }),
      CHECK("Bạn muốn đưa gì vào làm đầu vào cho pipeline?",
        ["Mô tả ý tưởng bằng chữ", "Chọn loại game từ danh sách có sẵn",
         "Brand kit (màu, font, logo)", "Danh sách quà & tỉ lệ trúng",
         "Mascot / character có sẵn", "Ảnh reference / moodboard",
         "Thể lệ & nội dung copy", "Nền tảng đích (web, app, WebView)",
         "Deadline", "__OTHER__"], { req: true }),
      RADIO("Bạn muốn pipeline nhả ra bản hoàn thiện đến mức nào?",
        ["Chỉ khung wireframe — art tôi tự làm hết",
         "Khung + component đã đúng brand, chưa có art",
         "Gần hoàn chỉnh, tôi chỉnh lại nhiều",
         "Gần như xong, chỉ sửa chi tiết nhỏ",
         "Xong hẳn, không cần sửa"],
        { req: true,
          desc: "Trả lời theo mức bạn thật sự muốn kiểm soát, không theo mức nghe tham vọng nhất." }),
      CHECK("Có phần nào bạn cho rằng KHÔNG nên để pipeline tự làm?",
        ["Cơ chế game & tỉ lệ trúng", "Hướng art & concept", "Character / mascot",
         "Màu sắc & typography", "Nội dung, thể lệ, câu chữ",
         "Bố cục screen chính", "Animation & cảm giác chuyển động",
         "Kiểm tra pháp lý & điều khoản",
         { value: "Không có phần nào — tự động được hết thì càng tốt", exclusive: true }],
        { req: true }),

      /* ===================== P7 · Vướng mắc hiện tại ===================== */
      PAGE("sec_issues", "Phần 7 · Chỗ đang tắc"),
      CHECK("Làm campaign game hiện tại vướng gì?",
        ["Deadline quá ngắn so với lượng screen",
         "Brief đổi giữa đường", "Thể lệ chốt muộn nên UI phải sửa",
         "Danh sách quà đến muộn", "Thiếu state (hết quà, lỗi, hết hạn) đến cuối mới phát hiện",
         "Mỗi game lại dựng lại component từ đầu",
         "Không có thư viện dùng lại", "Bàn giao cho dev phải qua lại nhiều lần",
         "Không khớp giữa Figma và game chạy thật",
         "Asset nặng, game tải chậm",
         { value: "Không vướng gì đáng kể", exclusive: true }], { req: true }),
      PARA("Phần nào lặp lại nhiều nhất giữa các campaign game?",
        { desc: "Không bắt buộc. Càng cụ thể càng tốt — đây là phần đầu tiên pipeline nên làm." }),
      RADIO("Team đã có thư viện hoặc template dùng lại cho campaign game chưa?",
        ["Có, được tổ chức tốt và ai cũng dùng",
         "Có nhưng mỗi người một bản riêng",
         "Có nhưng cũ, tìm lại mất thời gian hơn làm mới",
         "Chưa có", "Không rõ"], { req: true }),

      /* ===================== P8 · Kết ===================== */
      PAGE("sec_end", "Phần 8 · Ý kiến thêm",
        "Tất cả câu ở phần này đều không bắt buộc."),
      PARA("Bạn hình dung pipeline này lý tưởng thì dùng như thế nào? Mô tả một lần dùng cụ thể."),
      PARA("Có câu nào trong khảo sát này bạn thấy khó hiểu hoặc không khớp với thực tế của bạn?"),
      RADIO("Bạn có muốn dùng thử sớm và góp ý trực tiếp không?",
        ["Có", "Tuỳ, nếu không ảnh hưởng deadline", "Không"]),
      TXT("Tên hoặc nickname", { desc: "Không bắt buộc." }),
      TXT("Email hoặc Slack handle", { desc: "Không bắt buộc." })
    ]
  };
}
