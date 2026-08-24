/* ============================================================================
   FORM INTAKE ĐẦU BÀI DESIGN — VCB Look back 2025 & Game Chợ Tết 2026
   ----------------------------------------------------------------------------
   Đây KHÔNG phải khảo sát ý kiến. Đây là form thu đầu bài (design brief intake):
   khách hàng điền một lần, team design đọc ra được (a) đủ dữ kiện để estimate
   man-day, (b) đủ dữ kiện để bơm thẳng vào pipeline sinh UI kit (kit-gen).

   Vì sao phải làm form thay vì nhận note rời (bằng chứng, không phải phỏng đoán):
     · "Phản hồi 28.08 của VNPAY": cùng một tính năng Lookback ra BA bản estimate
       52 / 33.5 / 30 man-day, chỉ vì thiếu danh sách màn hình và danh sách
       trophy đã chốt. 1 dòng brief thiếu = ±22 man-day.
     · Thang thuộc tính visual khách tự vẽ trong sheet nhưng KHÔNG ai mark →
       không suy ra được độ chi tiết → không biết dùng rate 1.5 hay 3 ngày/màn.
     · Ba nhóm ảnh tham khảo khách gửi là BA hướng phong cách khác nhau, chưa
       chốt hướng nào là chính.

   Nguyên tắc thiết kế form (bám ANALYSIS.md §3):
     1. Ép ĐẾM ĐƯỢC. Mọi thứ vào công thức estimate đều là DROP số, không phải
        chữ: số màn, số badge, số vật phẩm, số câu chúc, số mẫu voucher.
        man_day = sketch + n_screens×rate_screen + n_badges×rate_badge
                  + n_gifts×rate_gift + buffer
     2. Đổi câu style tự do thành thang trượt + chọn hướng có sẵn.
     3. Mỗi câu có description nói RÕ VÌ SAO HỎI, để khách không bấm qua.
     4. Câu nào note của khách đã trả lời thì description ghi sẵn giá trị gợi ý
        + trích nguồn, khách chỉ xác nhận. Câu nào note KHÔNG có thì để trống và
        nói thẳng "thiếu mục này chính là lý do estimate lệch 30↔52 man-day".

   GIỚI HẠN ĐÃ BIẾT (ghi trung thực, không che):
     · Google Forms KHÔNG có "default answer". Prefill thật phải làm bằng
       prefilled-URL (entry.*) — xem kit-gen/teams/brief-intake/prefill-vcb.json
       và INTAKE-SPEC.md §3. Trong bản form này, giá trị gợi ý nằm ở phần mô tả
       của câu hỏi (khách vẫn phải bấm chọn) — đó là cách trung thực nhất mà
       riêng file JSON schema làm được.
     · DSL của repo (helpers.mjs) không có kiểu semantic-differential. Kiểu gần
       nhất là SCALE(1..7) với hai nhãn cực — mỗi cặp đối cực là MỘT câu, đúng
       như bản vẽ tay của khách (5 hàng thanh trượt = 5 câu). Không dùng GRID vì
       7 cột vượt ngưỡng lint (maxGridCols = 6) và grid không có nhãn hai cực.
       Không chế thêm cú pháp ngoài helpers.mjs.
   ========================================================================== */

import { PAGE, NOTE, RADIO, CHECK, DROP, TXT, PARA, GRID, SCALE, resetIds } from "./helpers.mjs";

/* ---- thang đo dùng lại ---- */
const nums = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
const SIZE = ["Rất lớn", "Lớn", "Vừa", "Nhỏ", "Chưa quyết"];

const DELIVERABLE = "Form này đang brief hạng mục nào?";
const GATE_LB = "Brief lần này có kèm luôn phần Game Đi chợ Tết không?";

/* Nhãn dùng trong description để người đọc biết dữ liệu chảy đi đâu:
   →kit = bơm vào pipeline sinh UI kit · →est = vào công thức man-day · →adm = quản trị */

export const meta = {
  id: "vcb-brief-intake-2026",
  name: "Đầu bài design — VCB Look back 2025 & Chợ Tết 2026",
  note: "Form intake đầu bài design: khách xác nhận thay vì viết tự do. Đầu ra đủ để estimate man-day và bơm thẳng vào pipeline sinh UI kit.",
  testPaths: {
    "chỉ Look back":  { [DELIVERABLE]: "Look back 2025", [GATE_LB]: "Không, lần này chỉ brief Look back 2025" },
    "chỉ Game":       { [DELIVERABLE]: "Game Đi chợ Tết cùng VCB Digibank" },
    "cả hai hạng mục":{ [DELIVERABLE]: "Cả hai (Look back + Game)", [GATE_LB]: "Có, brief cả hai hạng mục trong lần này" }
  }
};

export function build() {
  resetIds();
  return {
    info: {
      title: "Đầu bài design — VCB Look back 2025 & Game Chợ Tết 2026",
      documentTitle: "VCB Design Brief Intake 2026",
      description:
        "FORM NÀY DÙNG ĐỂ LÀM GÌ\n" +
        "Thu đủ dữ kiện của một đầu bài design để team design (1) báo được man-day ngay trong " +
        "ngày, (2) bắt tay vẽ mà không phải hỏi lại vòng vo.\n\n" +
        "VÌ SAO KHÔNG NHẬN BRIEF DẠNG NOTE NHƯ TRƯỚC\n" +
        "Trong phản hồi ngày 28.08 về tính năng Look back, cùng MỘT tính năng đã ra ba bản " +
        "estimate khác nhau: 52 / 33.5 / 30 man-day. Chênh lệch không đến từ việc làm nhiều hay " +
        "ít, mà đến từ hai thứ brief chưa nói rõ: SỐ LƯỢNG (bao nhiêu màn hình, bao nhiêu " +
        "trophy) và ĐỘ CHI TIẾT của nét vẽ (1.5 ngày/màn hay 3 ngày/màn). Form này khoá đúng " +
        "hai biến đó.\n\n" +
        "CÁCH ĐIỀN\n" +
        "· Phần lớn câu đã có sẵn GỢI Ý rút từ chính note anh/chị đã gửi (Brief Mascot, Game Chợ " +
        "Tết, Mô tả chi tiết yêu cầu design, Timeline). Gợi ý nằm ngay dưới câu hỏi, kèm nguồn. " +
        "Nếu đúng thì chọn theo, sai thì sửa — không phải viết lại từ đầu.\n" +
        "· Câu nào KHÔNG có gợi ý nghĩa là note hiện chưa nói tới. Đó chính là các câu đang chặn " +
        "estimate, mong anh/chị ưu tiên trả lời.\n" +
        "· Mỗi hạng mục nên điền một lần cho gọn. Nếu brief cả hai cùng lúc thì chọn “Cả hai”.\n\n" +
        "THỜI GIAN\n" +
        "Khoảng 12–15 phút nếu chỉ xác nhận các gợi ý có sẵn."
    },
    items: [

      /* ==================== Trang 0 · Thông tin hạng mục ==================== */
      PAGE("sec_meta", "Phần 0 · Hạng mục đang brief",
        "Vài thông tin khung trước khi vào phần nội dung."),

      NOTE("⚠ 5 điểm trong note hiện đang mâu thuẫn hoặc bỏ trống — form sẽ hỏi lại từng điểm",
        "1. Danh sách vật phẩm chợ Tết ghi ở hai chỗ khác nhau: sheet “Game Chợ Tết” liệt kê 7 món, " +
        "phần Concept game trong “Mô tả chi tiết yêu cầu design” liệt kê ~10 món và kết thúc bằng “…”.\n" +
        "2. Cơ chế bốc quà: một chỗ ghi “random chọn một món đồ”, chỗ khác ghi “chọn vào bao lì xì” " +
        "— random hay người chơi tự chọn?\n" +
        "3. Hướng phong cách Look back: brief chọn “tranh cổ động”, nhưng phản hồi 28.08 cảnh báo " +
        "hướng này có thể lệch tinh thần số hoá 2025–2026 của VCB.\n" +
        "4. Ba nhóm ảnh tham khảo đã gửi thuộc ba phong cách khác nhau (dân gian chibi màu nước / " +
        "poster chợ Tết phẳng / tranh cổ động) — chưa rõ hướng nào là chính.\n" +
        "5. Thang thuộc tính visual trong sheet chưa được mark ô nào, cả phần Look back lẫn phần Game."),

      TXT("Tên chiến dịch", { req: true,
        desc: "Gợi ý: “VCB Look back 2025 & Chợ Tết 2026”. · mã field: project_name · →adm" }),
      TXT("Đầu mối phía khách hàng (tên + kênh liên hệ)", { req: true,
        desc: "Cần một người chốt được nội dung, để mỗi lần vướng chỉ hỏi một đầu mối thay vì hỏi cả nhóm. · mã field: pic_client · →adm" }),
      CHECK("Thiết bị hiển thị",
        ["Mobile app", "Web responsive", "Tablet", "Màn hình LED / TVC", "__OTHER__"],
        { req: true,
          desc: "Quyết định tỷ lệ khung vẽ (dọc 2:3 cho mobile, ngang cho web) — vẽ sai tỷ lệ là vẽ lại từ đầu.\n" +
                "Gợi ý từ note: Mobile app + Web responsive (nguồn: Mô tả chi tiết yêu cầu design, cột GAME mục 11 “Thiết bị hiển thị: mobile và web”). · mã field: devices · →kit, →est" }),
      RADIO("Đã có tài liệu FE / URD chưa?",
        ["Có, đã xong (dán link ở câu dưới)", "Đang soạn, sẽ gửi sau", "Chưa có"],
        { req: true,
          desc: "Không có URD thì design không biết ràng buộc kỹ thuật (safe area, tỷ lệ, giới hạn dung lượng) và phải đoán.\n" +
                "Note hiện KHÔNG có gợi ý: cả mục “Tài liệu FE/URD” của Look back và của Game đều đang để trống. · mã field: has_urd · →est" }),
      TXT("Link tài liệu FE / URD",
        { desc: "Bỏ trống nếu chưa có. · mã field: urd_link · →adm" }),
      /* Câu phân nhánh PHẢI là câu cuối của section — Google Forms chỉ áp dụng
         điều hướng theo lựa chọn cho câu cuối cùng của mỗi phần. */
      RADIO(DELIVERABLE,
        [{ value: "Look back 2025" },
         { value: "Game Đi chợ Tết cùng VCB Digibank", goTo: "sec_game" },
         { value: "Cả hai (Look back + Game)" }],
        { req: true,
          desc: "Hai hạng mục có bộ câu hỏi riêng nên form sẽ tự bỏ qua phần không liên quan.\n" +
                "Note KHÔNG có gợi ý cho câu này: hai hạng mục là hai đầu bài khác nhau, không được gộp làm một. · mã field: deliverable · →adm" }),

      /* ==================== Trang 1 · Riêng Look back 2025 ==================== */
      PAGE("sec_lb", "Phần 1 · Riêng Look back 2025",
        "Phần này là nơi ba bản estimate 52 / 33.5 / 30 man-day lệch nhau. Bốn câu đầu " +
        "quyết định gần như toàn bộ con số."),
      PARA("Danh sách trophy / achievement đã chốt (mỗi dòng một cái)",
        { desc: "Đây đúng là thứ phản hồi 28.08 xin: “nhờ team MKT hỗ trợ gửi lại nội dung các màn hình " +
                "(bao gồm danh sách các trophy/achievement đã chốt) để team design estimate được sát nhất”.\n" +
                "Note hiện KHÔNG có danh sách này. Chênh 10 hay 13 badge = chênh 5 đến 13 man-day. · mã field: badge_list · →est" }),
      DROP("Tổng số trophy / achievement cần vẽ", ["Chưa chốt", ...nums(0, 30)],
        { req: true,
          desc: "Nhân tử trực tiếp trong công thức: n_badges × rate_badge. Chọn “Chưa chốt” cũng được, nhưng khi đó estimate sẽ phải báo dạng khoảng. · mã field: badge_count · →est" }),
      RADIO("Có storyline hay concept xuyên suốt không?",
        ["Có, có storyline (mô tả ở câu dưới)",
         "Không — graphic chỉ minh hoạ, phụ hoạ cho nội dung insight",
         "Chưa rõ"],
        { req: true,
          desc: "Có storyline thì phần phác thảo ý tưởng dài hơn; không storyline thì mỗi màn vẽ độc lập, rẻ hơn nhưng cần chú thích từng màn.\n" +
                "Gợi ý từ note: “Không — graphic chỉ minh hoạ…” (nguồn: Mô tả chi tiết yêu cầu design, cột LOOK BACK mục 2: “sử dụng graphic là phong cách tranh cổ động, không có storyline. Hình vẽ miêu tả, phụ hoạ cho nội dung insights”). · mã field: has_storyline · →est" }),
      PARA("Graphic gắn với nội dung từng màn như thế nào?",
        { desc: "Câu này để gỡ đúng chỗ đang tắc. Phản hồi 28.08 ghi: “Team design VNPAY vẫn chưa hình dung " +
                "được rõ về việc kết hợp tranh cổ động vào các content”. Mô tả giúp 1–2 màn ví dụ là đủ để " +
                "phác thảo chạy tiếp. · mã field: storyline_desc · →est, →kit (ghi chú sheet)" }),
      RADIO("Có bắt buộc dùng VCB Digibot không?",
        ["Bắt buộc dùng", "Không dùng Digibot", "Tuỳ design đề xuất"],
        { req: true,
          desc: "Gợi ý từ note: “Không dùng Digibot” (nguồn: Mô tả chi tiết yêu cầu design, cột LOOK BACK mục 3). · mã field: digibot_use · →kit (điều cấm)" }),
      RADIO(GATE_LB,
        [{ value: "Có, brief cả hai hạng mục trong lần này" },
         { value: "Không, lần này chỉ brief Look back 2025", goTo: "sec_char" }],
        { req: true,
          desc: "Chọn “Có” thì phần tiếp theo là bộ câu hỏi riêng của Game Chợ Tết. · →adm" }),

      /* ==================== Trang 2 · Riêng Game Chợ Tết ==================== */
      PAGE("sec_game", "Phần 2 · Riêng Game Đi chợ Tết",
        "Phần này ép ra các con số mà Timeline Game đang nhân lên thành man-day " +
        "(“MH quà tặng: 3 ngày = 3 loại quà × 1 ngày/quà”)."),
      TXT("Tên game hiển thị trên giao diện", { req: true,
        desc: "Design phải chừa chỗ đúng độ dài của tên, nên cần bản chữ cuối cùng chứ không phải bản tạm.\n" +
              "Gợi ý từ note: “ĐI CHỢ TẾT CÙNG VCB DIGIBANK” (nguồn: Mô tả chi tiết yêu cầu design, cột GAME mục 2 — note ghi “dự kiến”, mong anh/chị xác nhận đã chốt chưa). · mã field: game_display_name · →kit" }),
      TXT("Chữ trên nút bấm chính", { req: true,
        desc: "Gợi ý từ note: “Đi chợ ngay” (nguồn: sheet Game Chợ Tết, dòng Action của màn Home). · mã field: cta_label · →kit" }),
      PARA("Luồng người chơi (mỗi dòng một bước)",
        { desc: "Gợi ý từ note (sheet Game Chợ Tết, 6 bước) — xác nhận hoặc sửa:\n" +
                "1. Khách hàng giao dịch tài chính → 2. Có lượt chơi → 3. Vào game → " +
                "4. Bấm “Đi chợ ngay” → 5. Nhân vật random bốc một món trong gian hàng → " +
                "6. Kết quả: tiền / voucher VNPAY / câu chúc.\n" +
                "Mỗi bước là một trạng thái màn hình phải vẽ. · mã field: flow_steps · →kit, →est" }),
      RADIO("Cơ chế bốc quà",
        ["Random hoàn toàn", "Người chơi tự chọn món trên sạp", "Random nhưng có cấu hình tỷ lệ", "Chưa chốt"],
        { req: true,
          desc: "⚠ Hai chỗ trong note đang ghi khác nhau: bước 5 ghi “Random chọn một món đồ”, phần mô tả " +
                "Level 3 lại ghi “Chọn vào bao lì xì”. Random và tự chọn cần hai bộ màn hình khác nhau " +
                "(tự chọn phải vẽ thêm trạng thái hover/được chọn cho từng món). · mã field: randomness · →kit, →est" }),
      CHECK("Các loại kết quả người chơi có thể nhận",
        ["Tiền mặt", "Voucher VNPAY", "Câu chúc", "Lượt chơi thêm", "Không trúng gì", "__OTHER__"],
        { req: true,
          desc: "Mỗi loại kết quả là một biến thể popup phải vẽ riêng.\n" +
                "Gợi ý từ note: Tiền mặt + Voucher VNPAY + Câu chúc (nguồn: sheet Game Chợ Tết, bước 6). · mã field: result_types · →kit" }),
      CHECK("Các vật phẩm bày trên sạp chợ Tết",
        ["Bao lì xì", "Con gà", "Cây đào", "Cây mai", "Cây quất", "Bánh chưng", "Bánh tét",
         "Miếng thịt mỡ", "Hành muối", "Giò / chả", "Cây hoa", "__OTHER__"],
        { req: true,
          desc: "⚠ Hai note đang lệch nhau: sheet “Game Chợ Tết” liệt kê 7 món (cây hoa, cây đào, gà, bánh " +
                "chưng, thịt, giò/chả, bao lì xì); phần Concept game liệt kê thêm cây mai, cây quất, bánh " +
                "tét, hành và kết thúc bằng “…”. Danh sách gợi ý dưới đây là HỢP của hai danh sách — mong " +
                "anh/chị bỏ bớt món không cần. Mỗi món là một hình phải vẽ riêng. · mã field: item_list · →kit" }),
      DROP("Tổng số vật phẩm cần vẽ", nums(1, 30),
        { req: true,
          desc: "Gợi ý: 11 (đếm theo danh sách hợp ở câu trên). Timeline Game đang tính 1 ngày/quà. · mã field: item_count · →est" }),
      DROP("Số câu chúc cần thiết kế đồ hoạ", ["Chưa chốt", ...nums(0, 30)],
        { req: true,
          desc: "Note ghi “sẽ cần thiết kế đồ hoạ cho từng loại món ăn + lời chúc” nhưng KHÔNG có con số. " +
                "Không có số thì không nhân ra được man-day cho phần này. · mã field: wish_count · →est, →kit" }),
      DROP("Số mẫu frame voucher VNPAY", ["Chưa chốt", ...nums(0, 20)],
        { req: true,
          desc: "Note ghi “cần thiết kế frame cho từng loại voucher VNPAY” nhưng KHÔNG có con số. " +
                "Mỗi mẫu frame là một biến thể hình phải vẽ. · mã field: voucher_count · →est, →kit" }),
      DROP("Số mệnh giá tiền mặt", ["Chưa chốt", ...nums(0, 20)],
        { desc: "Nếu mỗi mệnh giá hiện bằng một hình riêng thì đây cũng là số hình phải vẽ. · mã field: cash_tiers · →kit" }),
      GRID("Trọng số kích thước các loại quà khi hiện trên màn hình",
        ["Tiền mặt", "Voucher VNPAY", "Câu chúc"], SIZE,
        { desc: "Mục 10 trong note đang để trống. Quà nào to hơn thì được vẽ chi tiết hơn và chiếm bố cục " +
                "trung tâm — chốt sớm thì không phải dựng lại layout. · mã field: gift_weight · →kit" }),
      RADIO("Có yêu cầu thiết kế cho ngày/giờ đặc biệt không?",
        ["Không", "Có (giao thừa, mùng 1… — mô tả ở phần ghi chú cuối form)", "Chưa rõ"],
        { req: true,
          desc: "Mục 13 trong note để trống. Nếu có, mỗi mốc đặc biệt thường phát sinh thêm một biến thể " +
                "màn hình, tức là nhân thẳng vào số màn. · mã field: special_date · →est" }),

      /* ==================== Trang 3 · Nhân vật ==================== */
      PAGE("sec_char", "Phần 3 · Nhân vật đại diện",
        "Bám theo sheet “Brief Mascot” — mảnh đầy đủ nhất trong bộ note. Ba câu cuối phần " +
        "này là ba thứ sheet chưa nói mà không có thì không dựng được bộ pose."),
      RADIO("Có dùng nhân vật đại diện (mascot) không?",
        ["Có", "Không", "Chưa quyết"],
        { req: true,
          desc: "Gợi ý từ note: “Có” (nguồn: Mô tả chi tiết yêu cầu design, cột GAME mục 6). · mã field: need_mascot · →kit" }),
      TXT("Loài / hình tượng nhân vật", { req: true,
        desc: "Gợi ý từ note: “Con ngựa” (nguồn: Brief Mascot, dòng “Nhân vật”). · mã field: char_species · →kit" }),
      RADIO("Giới tính thể hiện",
        ["Nam", "Nữ", "Trung tính", "Không quan trọng"],
        { req: true,
          desc: "Gợi ý từ note: “Nam” (nguồn: Brief Mascot: “Con ngựa (prefer giới tính nam)”). · mã field: char_gender · →kit" }),
      CHECK("Tính cách nhân vật",
        ["Vui vẻ", "Thân thiện", "Gần gũi", "Đáng tin cậy", "Hài hước", "Tinh nghịch", "Điềm đạm", "__OTHER__"],
        { req: true,
          desc: "Gợi ý từ note: Vui vẻ + Thân thiện + Gần gũi + Đáng tin cậy (nguồn: Brief Mascot, dòng “Tính cách”). · mã field: char_traits · →kit" }),
      TXT("Biểu cảm chủ đạo",
        { desc: "Gợi ý từ note: “Tươi cười, thân thiện, phong thái hân hoan ngày Tết” (nguồn: Brief Mascot, dòng “Biểu cảm”). · mã field: char_expression · →kit" }),
      TXT("Trang phục",
        { desc: "Gợi ý từ note: “Trang phục Tết (áo dài nam)” — note tự ghi là “gợi ý, không fixed” và có dấu hỏi, nên mong anh/chị xác nhận đã chốt chưa. · mã field: char_costume · →kit" }),
      RADIO("Tỷ lệ cơ thể nhân vật",
        ["Chibi 2 đầu (đầu rất to, thân nhỏ)", "Chibi 3 đầu", "Cách điệu 4–5 đầu", "Tả thực 7–8 đầu", "Để design đề xuất"],
        { req: true,
          desc: "Note KHÔNG nói tỷ lệ, mà đây là thứ quyết định nhân vật trông ra sao hơn cả màu sắc. " +
                "Chọn sai tỷ lệ là vẽ lại toàn bộ pose. · mã field: char_proportion · →kit, →est" }),
      RADIO("Cần bao nhiêu tư thế (pose) của nhân vật?",
        ["4 pose", "8 pose", "16 pose", "Chưa rõ, để design đề xuất"],
        { req: true,
          desc: "Bộ pose được dựng theo lưới: 4 pose = lưới 2×2, 16 pose = lưới 4×4. " +
                "Gợi ý 16 nếu nhân vật xuất hiện xuyên suốt game. · mã field: char_pose_count · →kit, →est" }),
      CHECK("Các tư thế cần có",
        ["Đứng chờ (idle)", "Vẫy tay", "Chỉ tay", "Cầm quà", "Ăn mừng", "Buồn / tiếc",
         "Chạy", "Suy nghĩ", "Ngồi", "Nhảy", "Cúi chào", "Giơ ngón cái", "Trao quà",
         "Góc 3/4", "Góc nghiêng", "Góc lưng", "__OTHER__"],
        { req: true,
          desc: "Gợi ý suy từ luồng chơi: Đứng chờ + Ăn mừng + Chỉ tay + Cầm quà + Trao quà. " +
                "Chọn đủ số pose đã khai ở câu trên. · mã field: char_pose_list · →kit" }),
      RADIO("Đã có ảnh mascot chốt chưa?",
        ["Đã có, sẽ gửi file", "Chưa có, cần vẽ mới"],
        { req: true,
          desc: "Có ảnh chốt thì bỏ được vòng thiết kế nhân vật; chưa có thì phải chạy một vòng " +
                "duyệt tạo hình trước khi vẽ pose. · mã field: char_ref_image · →kit, →est" }),

      /* ==================== Trang 4 · Phong cách thị giác ==================== */
      PAGE("sec_style", "Phần 4 · Phong cách thị giác",
        "Phần này thay cho bảng thanh trượt vẽ tay trong sheet — bảng đó hiện chưa mark ô nào.\n" +
        "Mỗi thang là một câu, kéo từ 1 (cực trái) đến 7 (cực phải); 4 là ở giữa."),

      NOTE("Kéo thang là kéo cả chi phí — nói trước cho minh bạch",
        "Thang càng lệch về phía “vẽ chi tiết, tả thực, nhiều chi tiết” thì man-day mỗi màn càng " +
        "cao. Theo đúng ba bản estimate ngày 28.08: nét đơn giản ≈ 1.5 ngày/màn, nét chi tiết " +
        "≈ 3 ngày/màn. Với 10 màn, chênh lệch là 15 man-day."),

      SCALE("Chín chắn ↔ Trẻ trung", 1, 7, "1 · Chín chắn (tả thực, nhiều chi tiết)", "7 · Trẻ trung (chibi)",
        { req: true,
          desc: "Gợi ý 6 — suy từ “dân gian, mộc mạc, dễ gần, đáng yêu” (Brief Mascot) và nhóm ảnh tham khảo " +
                "vẽ trẻ em chibi màu nước. Đây là suy luận của team design, không phải câu anh/chị đã nói — " +
                "mong xác nhận. · mã field: sc_age · →kit, →est" }),
      SCALE("Sống động, ồn ào ↔ Thư giãn, nhẹ nhàng", 1, 7,
        "1 · Sống động, ồn ào (nhiều chi tiết & màu)", "7 · Thư giãn, nhẹ nhàng (đơn giản)",
        { req: true,
          desc: "Gợi ý 2 — chợ Tết đông vui, tông “vui vẻ, hài hước”, ảnh tham khảo poster chợ Tết rất nhiều " +
                "chi tiết. Lưu ý: lệch về trái làm tăng man-day mỗi màn. · mã field: sc_energy · →kit, →est" }),
      SCALE("Sang trọng ↔ Bình dị, gần gũi", 1, 7, "1 · Sang trọng", "7 · Bình dị, gần gũi",
        { req: true,
          desc: "Gợi ý 6 — “mộc mạc, dễ gần” (Brief Mascot, dòng Phong cách đồ hoạ). · mã field: sc_lux · →kit" }),
      SCALE("Hiện đại ↔ Cổ điển", 1, 7, "1 · Hiện đại", "7 · Cổ điển",
        { req: true,
          desc: "⚠ Đây là điểm đang mâu thuẫn, mong anh/chị chốt giúp: note chọn “tranh cổ động” (nghiêng cổ " +
                "điển), nhưng phản hồi 28.08 lo hướng này “có thể không phản ánh được tinh thần số hoá mà VCB " +
                "đang hướng tới 2025–2026”. Con số anh/chị kéo ở đây là câu trả lời cuối cùng cho tranh luận đó. · mã field: sc_era · →kit" }),
      SCALE("Nam tính ↔ Nữ tính", 1, 7, "1 · Nam tính", "7 · Nữ tính",
        { req: true,
          desc: "Gợi ý 3 — mascot “prefer giới tính nam” (Brief Mascot). · mã field: sc_gender · →kit" }),
      SCALE("Nét phẳng ↔ Đổ khối dày", 1, 7, "1 · Nét mảnh, mảng phẳng (flat)", "7 · Đổ khối, chất liệu dày (3D)",
        { req: true,
          desc: "Thang này KHÔNG có trong sheet của anh/chị, team design thêm vào vì nó là thứ quyết định " +
                "trực tiếp rate 1.5 hay 3 ngày/màn. Gợi ý 3 — các ảnh tham khảo đều là màu nước / minh hoạ phẳng. · mã field: sc_detail · →kit, →est" }),
      SCALE("Không viền ↔ Viền đậm", 1, 7, "1 · Không viền", "7 · Viền đậm rõ",
        { desc: "Gợi ý 2 — ảnh tham khảo poster chợ Tết không dùng outline đậm. · mã field: sc_outline · →kit" }),

      RADIO("Chọn MỘT hướng phong cách chính",
        ["A. Dân gian chibi vẽ tay màu nước (nhóm ảnh trẻ em múa lân, chọi gà)",
         "B. Minh hoạ phẳng kiểu poster chợ Tết nhìn từ trên",
         "C. Tranh cổ động hiện đại hoá (màu tươi, không khắc khổ)",
         "D. Hướng khác (mô tả ở câu ghi chú)"],
        { req: true,
          desc: "Ba nhóm ảnh anh/chị gửi thuộc ba phong cách khác nhau, và đây chính là chỗ đã tốn một vòng " +
                "trao đổi hồi 28.08. Chốt một hướng chính thì phác thảo chỉ vẽ một lần. Note KHÔNG có gợi ý " +
                "cho câu này — mong anh/chị chọn. · mã field: style_direction · →kit" }),
      GRID("Ở mỗi nhóm ảnh tham khảo, anh/chị thích cái gì?",
        ["Nhóm A · dân gian chibi màu nước", "Nhóm B · poster chợ Tết phẳng", "Nhóm C · tranh cổ động"],
        ["Bảng màu", "Nét vẽ", "Bố cục", "Nhân vật", "Không dùng nhóm này"],
        { req: true, multi: true,
          desc: "Gửi ảnh mà không nói thích gì ở ảnh thì design phải đoán, và thường đoán trúng phần " +
                "anh/chị không quan tâm. Một dòng có thể tick nhiều ô. · mã field: ref_like_what · →kit" }),
      PARA("Link ảnh / thư mục tham khảo",
        { req: true,
          desc: "Gợi ý từ note: link Google Drive ở mục 7 phần Game, cùng Link 1 và Link 2 ở mục 4 phần Look " +
                "back, và 12 ảnh trong thư mục resources đã gửi kèm. Dán lại đầy đủ để chắc không thiếu bản nào. · mã field: ref_links · →kit" }),
      CHECK("Điều KHÔNG muốn thấy trong bản vẽ",
        ["Hoài cổ, khắc khổ", "Quá trẻ con", "Quá sang chảnh, xa cách", "Quá 3D bóng bẩy",
         "Màu quá chói", "__OTHER__"],
        { desc: "Gợi ý từ note: “Hoài cổ, khắc khổ” (nguồn: phản hồi 28.08 về hướng tranh cổ động). " +
                "Câu này dùng làm danh sách cấm khi dựng ảnh. · mã field: style_avoid · →kit" }),
      TXT("Màu chính (mã hex)", { req: true,
        desc: "Note mới có tên màu tiếng Việt (“đỏ”), chưa có mã. Không có mã hex thì mỗi người vẽ ra một " +
              "sắc đỏ khác nhau. Gợi ý: #d42a1e (đỏ Tết). · mã field: color_primary · →kit" }),
      TXT("Màu phụ (mã hex)", { req: true,
        desc: "Gợi ý: #f5c64a (vàng). · mã field: color_secondary · →kit" }),
      CHECK("Các màu khác trong bảng màu",
        ["Đỏ", "Vàng", "Cam", "Hồng", "Xanh lá bánh chưng", "Xanh VCB", "Nâu đất", "__OTHER__"],
        { req: true,
          desc: "Gợi ý từ note: Đỏ + Vàng + Cam + Hồng + Xanh lá bánh chưng (nguồn: Mô tả chi tiết yêu cầu " +
                "design, cột GAME mục 4 “màu của tết (đỏ, cam, vàng, hồng, xanh lá bánh chưng)”; Brief Mascot " +
                "ghi đỏ, vàng, hồng, cam). · mã field: color_palette · →kit" }),
      CHECK("Tông cảm xúc chung của sản phẩm",
        ["Vui vẻ", "Hài hước", "Dân gian", "Gần gũi", "Sang trọng", "Kịch tính", "Ấm áp", "__OTHER__"],
        { req: true,
          desc: "Gợi ý từ note: Vui vẻ + Hài hước + Dân gian + Gần gũi (nguồn: Mô tả chi tiết yêu cầu design, " +
                "cột GAME mục 1 “Tính cách game”). · mã field: game_tone · →kit" }),

      /* ==================== Trang 5 · Phạm vi màn hình ==================== */
      PAGE("sec_scope", "Phần 5 · Phạm vi màn hình & thành phần giao diện",
        "Đây là phần nặng nhất của estimate: số màn nhân với đơn giá mỗi màn."),
      PARA("Liệt kê từng màn hình, mỗi dòng một màn",
        { req: true,
          desc: "Câu quan trọng nhất form này. Phản hồi 28.08 xin đúng thứ này: “nhờ team MKT hỗ trợ gửi lại " +
                "nội dung các màn hình… để team design đánh giá chi tiết và estimate được sát nhất”. Ba bản " +
                "estimate lệch nhau (9 màn / 14 màn / 10 màn) chỉ vì mỗi bản đếm một kiểu.\n" +
                "Gợi ý từ note cho phần Game (sheet Game Chợ Tết): Màn Home — khung cảnh chợ Tết, các gian " +
                "hàng, người dân mua sắm / Level 2 — nhân vật đứng trước sạp hàng bày đồ Tết / Level 3 — " +
                "màn kết quả (câu chúc, voucher, tiền). · mã field: screen_list · →kit, →est" }),
      DROP("Tổng số màn hình", nums(1, 20),
        { req: true,
          desc: "Đếm đúng số dòng ở câu trên. Gợi ý cho phần Game: 3. · mã field: screen_count · →est" }),
      DROP("Trong đó, bao nhiêu màn cần vẽ mới cả khung cảnh nền?", nums(0, 10),
        { req: true,
          desc: "Nền vẽ mới đắt hơn nhiều so với popup dùng lại khung. Timeline Game đang tính “Home + Gian " +
                "hàng = 7 man-day” cho 2 nền, tức khoảng 3.5 ngày một nền.\n" +
                "Gợi ý cho phần Game: 2. · mã field: screen_bg_count · →est, →kit" }),
      CHECK("Thành phần giao diện cần có trong bộ kit",
        ["Nút bấm chính (kèm trạng thái nhấn và mờ)", "Nút đóng / quay lại", "Popup ngang",
         "Popup dọc", "Ruy băng tiêu đề", "Bộ đếm lượt chơi", "Thanh tiến độ",
         "Khung voucher", "Hộp quà", "Bao lì xì (thân + nắp)", "Hiệu ứng nổ sáng khi trúng",
         "Bảng xếp hạng", "Khung thể lệ", "__OTHER__"],
        { req: true,
          desc: "Đây là danh sách vẽ ra file rời cho bên lập trình. Thiếu một thành phần thì đến lúc ráp mới " +
                "phát hiện và phải vẽ bổ sung gấp.\n" +
                "Gợi ý suy từ luồng 6 bước: nút bấm chính, popup ngang, popup dọc, ruy băng, bộ đếm lượt, " +
                "khung voucher, bao lì xì, hiệu ứng nổ sáng. · mã field: ui_components · →kit" }),

      /* ==================== Trang 6 · Thương hiệu & điều cấm ==================== */
      PAGE("sec_brand", "Phần 6 · Thương hiệu và điều cấm",
        "Phần ngắn nhưng đắt nhất nếu bỏ sót: vi phạm một điều cấm là vẽ lại."),
      CHECK("Yếu tố BẮT BUỘC phải xuất hiện",
        ["Tên game trên giao diện", "Logo VCB trên giao diện", "Logo VNPAY",
         "Màu xanh VCB", "__OTHER__"],
        { req: true,
          desc: "Gợi ý từ note: “Tên game trên giao diện” (nguồn: Mô tả chi tiết yêu cầu design, cột GAME " +
                "mục 5: yếu tố bắt buộc là tên game “Đi chợ Tết cùng VCB Digibank”). · mã field: brand_must · →kit" }),
      CHECK("Yếu tố có thì tốt, không có cũng được",
        ["Màu xanh VCB trên nhân vật", "Hoạ tiết nhận diện VCB", "__OTHER__"],
        { desc: "Gợi ý từ note: “Màu xanh VCB trên nhân vật” (nguồn: Brief Mascot, dòng Yếu tố thương hiệu: " +
                "“Nếu được, có yếu tố màu xanh VCB” — note ghi rõ là nice to have). · mã field: brand_nice · →kit" }),
      CHECK("ĐIỀU CẤM — những thứ tuyệt đối không được xuất hiện",
        ["Cấm đưa logo VCB lên nhân vật", "Cấm đưa chữ “VCB” lên nhân vật",
         "Cấm dùng VCB Digibot", "Cấm hình ảnh hoài cổ, khắc khổ", "__OTHER__"],
        { req: true,
          desc: "Loại thông tin hiếm và quý — ít brief nào ghi, mà sai thì phải vẽ lại từ đầu.\n" +
                "Gợi ý từ note: cả bốn mục (nguồn: Brief Mascot “Không đưa logo VCB, chữ VCB lên mascot”; " +
                "Mô tả chi tiết yêu cầu design cột LOOK BACK mục 3 “không dùng Digibot”; phản hồi 28.08 về " +
                "cảm giác hoài cổ). · mã field: brand_forbid · →kit" }),
      TXT("Link brand guideline VCB",
        { desc: "Có guideline thì đỡ được vòng chỉnh màu và font. · mã field: brand_guideline · →adm" }),
      PARA("Ràng buộc pháp lý hoặc kiểm duyệt cần lưu ý",
        { desc: "Hỏi vì một nhóm ảnh tham khảo anh/chị gửi có quốc kỳ và khí tài quân sự. Dùng loại hình ảnh " +
                "này trong chương trình khuyến mại thường phải qua bước duyệt riêng, nên cần biết trước thay " +
                "vì phát hiện lúc sắp lên sóng. · mã field: legal_note · →adm" }),

      /* ==================== Trang 7 · Bàn giao ==================== */
      PAGE("sec_deliver", "Phần 7 · Chuyển động, âm thanh và định dạng bàn giao"),
      RADIO("Có yêu cầu chuyển động (motion) không?",
        ["Có", "Không", "Chưa rõ"],
        { req: true,
          desc: "Gợi ý từ note: “Có” (nguồn: Mô tả chi tiết yêu cầu design — cột LOOK BACK mục 6 “có motion " +
                "khi hiển thị từng frame”, cột GAME mục 14 “có motion khi hiển thị kết quả”). · mã field: need_motion · →est" }),
      CHECK("Chuyển động xuất hiện ở đâu?",
        ["Chuyển màn", "Hiện từng khung nội dung", "Hiện kết quả trúng thưởng",
         "Nhân vật đứng chờ", "Hiệu ứng nhận quà", "__OTHER__"],
        { req: true,
          desc: "Gợi ý từ note: “Hiện từng khung nội dung” (Look back) + “Hiện kết quả trúng thưởng” (Game). · mã field: motion_scope · →est" }),
      CHECK("Định dạng bàn giao phần chuyển động",
        ["Lottie JSON", "Chuỗi ảnh PNG", "MP4", "GIF", "File nguồn After Effects", "Để design đề xuất"],
        { req: true,
          desc: "Note KHÔNG nói định dạng, trong khi Timeline đang để “Animation: 3 man-day”. Lottie và chuỗi " +
                "ảnh PNG chênh nhau rất nhiều công, nên con số 3 ngày hiện chưa có căn cứ. · mã field: motion_format · →est, →adm" }),
      RADIO("Âm thanh (sound effect) do bên nào lo?",
        ["Design lo trọn gói", "Bên khác lo, design chỉ ghi chú điểm phát",
         "Chưa phân công", "Không cần âm thanh"],
        { req: true,
          desc: "Note có ghi “có sound effects” ở cả hai hạng mục nhưng chưa nói ai làm — phần này chưa nằm " +
                "trong bảng man-day nào. · mã field: need_sound · →est" }),
      CHECK("Định dạng bàn giao phần đồ hoạ",
        ["PNG tách nền", "Sprite sheet", "File Figma", "SVG", "Ảnh cắt sẵn theo 9 ô (9-slice)", "__OTHER__"],
        { desc: "Gợi ý: PNG tách nền + Sprite sheet — đây là đầu ra sẵn có của pipeline dựng kit hiện tại, " +
                "chọn đúng định dạng này thì bàn giao được ngay, không phải xuất tay. · mã field: asset_format · →kit" }),

      /* ==================== Trang 8 · Timeline ==================== */
      PAGE("sec_time", "Phần 8 · Thời hạn và đơn giá quy đổi",
        "Phần này để hai bên nhìn chung một công thức, thay vì mỗi bên tính một kiểu như " +
        "hồi 28.08.\n\n" +
        "Công thức đang dùng:\n" +
        "man-day = phác thảo + (số màn × đơn giá mỗi màn) + (số badge × đơn giá mỗi badge) " +
        "+ (số loại quà × đơn giá mỗi quà) + dự phòng"),
      TXT("Hạn bàn giao cuối (ngày/tháng/năm)", { req: true,
        desc: "Chiến dịch Tết có ngày lên sóng cố định nên lịch phải tính ngược từ đó. · mã field: deadline_final · →adm" }),
      PARA("Các mốc trung gian cần bàn giao trước",
        { desc: "Ví dụ trong note cũ: “23/9 bàn giao 5 màn hình”. Có mốc trung gian thì phần dự phòng chia " +
                "được theo đợt. · mã field: milestone_list · →adm" }),
      DROP("Man-day cho giai đoạn phác thảo ý tưởng", nums(0, 15),
        { desc: "Gợi ý: 3 (nguồn: sheet Timeline Game, mục “Phác thảo ý tưởng”). · mã field: est_sketch · →est" }),
      RADIO("Đơn giá mỗi màn hình",
        ["1.5 man-day (nét đơn giản, mảng phẳng)", "3 man-day (nét chi tiết, tả thực)", "Khác (ghi chú ở cuối form)"],
        { req: true,
          desc: "Hai mức này lấy nguyên từ ba bản estimate ngày 28.08. Chọn mức nào phải khớp với thang " +
                "“Nét phẳng ↔ Đổ khối dày” ở phần 4 — kéo thang về phía chi tiết thì không thể chọn 1.5. · mã field: rate_screen · →est" }),
      RADIO("Đơn giá mỗi badge / trophy",
        ["0.5 man-day", "1 man-day", "Không có hạng mục này"],
        { req: true,
          desc: "Gợi ý: 0.5 (hai trong ba bản estimate 28.08 dùng mức này). · mã field: rate_badge · →est" }),
      RADIO("Đơn giá mỗi loại quà",
        ["0.5 man-day", "1 man-day", "Khác (ghi chú ở cuối form)"],
        { req: true,
          desc: "Gợi ý: 1 (nguồn: sheet Timeline Game, mục “MH quà tặng: 3 man-day = 1 ngày/quà”). · mã field: rate_gift · →est" }),
      DROP("Số ngày dự phòng", nums(0, 10),
        { req: true,
          desc: "Gợi ý: 3 — cả bốn bảng estimate đã trao đổi đều để đúng 3 ngày dự phòng. · mã field: buffer_days · →est" }),
      DROP("Số vòng review dự kiến", nums(1, 5),
        { desc: "Gợi ý: 2. Riêng vòng trao đổi hồi 28.08 đã tốn ít nhất 2 vòng chỉ để làm rõ đầu bài. · mã field: review_rounds · →est" }),
      TXT("Trần man-day hoặc ngân sách (nếu có)",
        { desc: "Biết trần từ đầu thì design cân được phạm vi ngay, thay vì báo một con số rồi cắt ngược. · mã field: budget_cap · →adm" }),
      TXT("Đầu mối phía design", { req: true,
        desc: "· mã field: pic_design · →adm" }),

      NOTE("Sau khi anh/chị gửi form",
        "Team design sẽ gửi lại trong vòng một ngày làm việc: (1) bảng man-day tính theo đúng công " +
        "thức ở đầu phần 8, có ghi rõ con số nào lấy từ câu trả lời nào; (2) danh sách những câu " +
        "còn để trống và ảnh hưởng của từng câu lên con số đó."),
      PARA("Ghi chú thêm",
        { desc: "Chỗ để viết những gì các câu trên chưa hỏi tới. · mã field: extra_note · →adm" })
    ]
  };
}
