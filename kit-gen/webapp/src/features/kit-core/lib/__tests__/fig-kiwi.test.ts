/**
 * fig-kiwi.test.ts — CANH BÀN MỔ LƯỢT DÁN TỪ FIGMA.
 *
 * ┌── VÌ SAO DỰNG PAYLOAD GIẢ THAY VÌ COMMIT MỘT PAYLOAD THẬT ───────────────┐
 * │ Một lượt copy thật từ Figma nặng hàng trăm KB, mang ảnh của người khác,   │
 * │ và không ai ở đây dựng lại được nó bằng tay khi cần sửa một trường. Nên ca│
 * │ test dựng lấy: cùng vỏ `fig-kiwi`, cùng `deflate-raw`, cùng hình dạng     │
 * │ lược đồ (`fig-fixture.ts`). Thứ KHÔNG canh được bằng cách này — và nói    │
 * │ thẳng ra ở đây — là Figma thật đặt tên trường có đúng như lược đồ giả hay │
 * │ không. Chính câu đó là việc của chủ sản phẩm: dán một lượt thật vào bàn   │
 * │ mổ rồi gửi JSON về. Xem `docs/FIGMA-CLIPBOARD-LAB.md`.                    │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it } from "vitest";
import {
  FIGMA_CLOSE, FIGMA_OPEN, FIGMETA_CLOSE, FIGMETA_OPEN, HTML_HEAD_CHARS,
  analysisToJson, analyzeFigmaClipboardHtml, base64ToBytes, countComments, countTags,
  describeBytes, diagnoseHtml, escapeForPre, extractFigmaClipboardBase64, findMarkerForms,
  findWordAround, imgSrcKinds, inflateChunk, listDataAttrs, parseFigKiwiContainer,
  type ClipboardEntry,
} from "../fig-kiwi";
import { labFlagOn, LAB_QUERY_KEY, LAB_QUERY_VALUE } from "../figma-lab";
import { PNG_HEAD, buildFixtureClipboard, bytesToBase64, packFigKiwi } from "./fig-fixture";

describe("tách base64 ra khỏi HTML bộ nhớ tạm", () => {
  it("lấy đúng hai khối, bỏ mọi khoảng trắng chen vào giữa", () => {
    const html = `<meta charset="utf-8">${FIGMETA_OPEN}AAA\nBBB${FIGMETA_CLOSE}${FIGMA_OPEN}CC C\n DD${FIGMA_CLOSE}`;
    expect(extractFigmaClipboardBase64(html)).toEqual({ figmeta: "AAABBB", figma: "CCCDD" });
  });

  it("mốc «figma» KHÔNG cắn nhầm vào mốc «figmeta»", () => {
    /* Hai mốc chỉ khác nhau đúng một chữ, và mốc ngắn hơn lại là tiền tố của
       chữ dài hơn. Nếu tìm bằng `"<!--(figma"` (thiếu dấu đóng ngoặc) thì khối
       đầu tiên tìm thấy sẽ là JSON, và mọi thứ sau đó hỏng một cách khó hiểu. */
    const html = `${FIGMETA_OPEN}META${FIGMETA_CLOSE}${FIGMA_OPEN}BIN${FIGMA_CLOSE}`;
    expect(extractFigmaClipboardBase64(html).figma).toBe("BIN");
  });

  it("HTML thường ⇒ cả hai đều vắng, không ném", () => {
    expect(extractFigmaClipboardBase64("<p>xin chào</p>")).toEqual({ figmeta: null, figma: null });
  });

  it("base64 về lại đúng byte ban đầu", () => {
    const bytes = new Uint8Array([0, 1, 254, 255, 128]);
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
  });
});

describe("vỏ fig-kiwi — hàm THUẦN, canh được bằng byte dựng tay", () => {
  it("đọc ra chữ ký, số hiệu bản và từng khối", () => {
    /* Cố ý KHÔNG nén ở ca này: phần bóc vỏ tách hẳn khỏi phần giải nén, nên nó
       canh được mà không cần trình duyệt và không cần `CompressionStream`. */
    const packed = packFigKiwi(21, [new Uint8Array([1, 2, 3]), new Uint8Array([9])]);
    const out = parseFigKiwiContainer(packed);
    expect(out.magic).toBe("fig-kiwi");
    expect(out.version).toBe(21);
    expect(out.chunks.map((c) => [...c])).toEqual([[1, 2, 3], [9]]);
  });

  it("chữ ký sai ⇒ NÉM, và câu lỗi nói ra nó thấy cái gì", () => {
    const bad = new Uint8Array(20);
    for (let i = 0; i < 8; i += 1) bad[i] = "not-kiwi".charCodeAt(i);
    expect(() => parseFigKiwiContainer(bad)).toThrow(/not-kiwi/);
  });

  it("khối khai dài hơn phần còn lại ⇒ NÉM chứ không cắt bừa", () => {
    const packed = packFigKiwi(21, [new Uint8Array([1, 2, 3])]);
    new DataView(packed.buffer).setUint32(12, 999, true);
    expect(() => parseFigKiwiContainer(packed)).toThrow(/999/);
  });

  it("ngắn hơn cả phần đầu ⇒ NÉM", () => {
    expect(() => parseFigKiwiContainer(new Uint8Array(4))).toThrow(/ngắn hơn/);
  });
});

describe("giải nén", () => {
  it("khối nén bằng deflate-raw được nhận ra ĐÚNG TÊN cách nén", async () => {
    const { packed } = await buildFixtureClipboard();
    const chunk = parseFigKiwiContainer(packed).chunks[0];
    const out = await inflateChunk(chunk as Uint8Array);
    expect(out.method).toBe("deflate-raw");
    expect(out.bytes.length).toBeGreaterThan(0);
  });

  it("khối KHÔNG nén ⇒ trả nguyên si và nói là «none»", async () => {
    /* Byte rác không mở được bằng cách nào — bàn mổ phải nói ra điều đó thay vì
       ném cả lượt dán đi. */
    const out = await inflateChunk(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
    expect(out.method).toBe("none");
  });
});

describe("nhận mặt phần đính kèm", () => {
  it("bốn byte đầu của PNG được gọi đúng tên", () => {
    expect(describeBytes(new Uint8Array(PNG_HEAD)).kind).toBe("PNG");
    expect(describeBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])).kind).toBe("JPEG");
    expect(describeBytes(new Uint8Array([1, 2, 3])).kind).toBe("?");
    expect(describeBytes(new Uint8Array(PNG_HEAD)).head).toBe("89 50 4e 47 0d 0a 1a 0a");
  });
});

describe("mổ trọn một lượt dán", () => {
  it("đi hết đường: HTML → vỏ → lược đồ → dữ liệu → node và phần đính kèm", async () => {
    const { html } = await buildFixtureClipboard();
    const a = await analyzeFigmaClipboardHtml(html, ["text/html", "text/plain"]);

    expect(a.errors).toEqual([]);
    expect(a.clipboardTypes).toEqual(["text/html", "text/plain"]);
    expect(a.figmeta).toMatchObject({ fileKey: "kitgen-test", pasteID: 42 });
    expect(a.container).toMatchObject({ magic: "fig-kiwi", version: 21, chunkCount: 2 });
    expect(a.chunks.map((c) => c.method)).toEqual(["deflate-raw", "deflate-raw"]);
    expect(a.schema?.rootMessage).toBe("Message");
    expect(a.schema?.allNames).toContain("NodeChange");
    expect(a.schema?.wanted.map((d) => d.name)).toEqual(
      expect.arrayContaining(["ConstraintType", "ImageScaleMode", "Paint", "Image", "NodeChange", "Blob", "Message"]),
    );
    expect(a.message?.bytesLeft).toBe(0);
    expect(a.message?.nodeChangesKey).toBe("nodeChanges");
    expect(a.message?.nodeCount).toBe(2);
  });

  it("bản tóm tắt giữ ĐÚNG những trường bước này đi tìm, và BỎ phần còn lại", async () => {
    const { html } = await buildFixtureClipboard();
    const a = await analyzeFigmaClipboardHtml(html);
    const inner = a.message?.nodes[1];
    expect(inner?.fields["horizontalConstraint"]).toBe("SCALE");
    expect(inner?.fields["verticalConstraint"]).toBe("SCALE");
    expect(inner?.fields["proportionsConstrained"]).toBe(true);
    expect(inner?.fields["size"]).toEqual({ x: expect.closeTo(246.71, 2), y: expect.closeTo(85.66, 2) });
    expect(inner?.fields["fillPaints"]).toMatchObject([{ imageScaleMode: "CROP", image: { hash: "abc123" } }]);
    /* `cornerRadius` KHÔNG nằm trong danh sách quan tâm: nếu nó lọt vào thì bộ
       lọc đang không lọc gì cả, chỉ là chép nguyên node rồi đổi tên. */
    expect(inner?.fields["cornerRadius"]).toBeUndefined();
    /* …nhưng TÊN của nó vẫn phải có mặt: `keys` là chỗ duy nhất nói ra tên thật
       bên kia đang dùng, và đó là nửa quan trọng của phép đo này. */
    expect(inner?.keys).toContain("cornerRadius");
    expect(inner?.keys).toContain("frameMaskDisabled");
  });

  it("ẢNH nằm trong payload và nhận ra được là PNG — câu hỏi ③ của bước này", async () => {
    const { html } = await buildFixtureClipboard();
    const a = await analyzeFigmaClipboardHtml(html);
    expect(a.message?.blobsKey).toBe("blobs");
    expect(a.message?.blobs).toEqual([{ index: 0, bytes: 11, head: "89 50 4e 47 0d 0a 1a 0a", kind: "PNG" }]);
  });

  it("HTML không phải của Figma ⇒ KHÔNG ném, chỉ ghi ra là thiếu mốc", async () => {
    const a = await analyzeFigmaClipboardHtml("<p>xin chào</p>", ["text/plain"]);
    expect(a.container).toBeNull();
    expect(a.errors.join(" ")).toMatch(/figmeta/);
    expect(a.errors.join(" ")).toMatch(/figma/);
  });

  it("khối nhị phân hỏng ⇒ phần (figmeta) ĐÃ đọc được vẫn giữ lại", async () => {
    const meta = bytesToBase64(new TextEncoder().encode(JSON.stringify({ fileKey: "x" })));
    const html = `${FIGMETA_OPEN}${meta}${FIGMETA_CLOSE}${FIGMA_OPEN}${bytesToBase64(new Uint8Array(20))}${FIGMA_CLOSE}`;
    const a = await analyzeFigmaClipboardHtml(html);
    expect(a.figmeta).toEqual({ fileKey: "x" });
    expect(a.errors.join(" ")).toMatch(/vỏ nhị phân/);
  });
});

/**
 * ┌── VÌ SAO CÓ CẢ MỘT CHÙM CA CHO PHẦN «KHÔNG THẤY MỐC» ────────────────────┐
 * │ Lượt dán thật đầu tiên về: 46 203 ký tự HTML, không mốc nào. Phần chẩn    │
 * │ đoán sinh ra để nói CÁI GÌ Ở TRONG 46 KB ấy, mà nó chỉ có một cơ hội duy  │
 * │ nhất: chủ sản phẩm dán một lần rồi gửi JSON đi. Một phép đếm sai ở đây    │
 * │ không đỏ ở đâu cả — nó chỉ làm cả vòng hỏi-đáp mất thêm một ngày. Nên mọi │
 * │ hàm chẩn đoán đều THUẦN và đều bị canh bằng chuỗi dựng tay.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("escape cho <pre>", () => {
  it("ba ký tự, và `&` phải đi TRƯỚC", () => {
    /* Escape `<` trước rồi mới escape `&` thì chính dấu `&` của `&lt;` vừa sinh
       ra lại bị escape lần nữa: `<b>` hoá `&amp;lt;b&amp;gt;`, tức người đọc
       nhận về rác thay vì HTML. Ca này canh đúng cái thứ tự đó. */
    expect(escapeForPre("<b>a & b</b>")).toBe("&lt;b&gt;a &amp; b&lt;/b&gt;");
  });

  it("chuỗi đã escape sẵn KHÔNG bị escape thành rác hai lần… mà thành đúng một lần nữa", () => {
    /* Hàm này không đoán xem chuỗi đã escape hay chưa — nó escape, thế thôi.
       Ghi ra đây để người sau khỏi coi đó là lỗi. */
    expect(escapeForPre("&lt;b&gt;")).toBe("&amp;lt;b&amp;gt;");
  });
});

describe("đếm thẻ", () => {
  it("chỉ đếm thẻ MỞ, và xếp từ nhiều xuống ít", () => {
    const out = countTags("<div><span>a</span><span>b</span></div><div></div>");
    expect(out).toEqual({ div: 2, span: 2 });
    expect(Object.keys(out)).toEqual(["div", "span"]);
  });

  it("thẻ đóng KHÔNG bị đếm — nếu không mọi con số nhân đôi vô nghĩa", () => {
    expect(countTags("<p>x</p>")).toEqual({ p: 1 });
  });

  it("chú thích và nội dung chữ không thành thẻ", () => {
    expect(countTags("<!--(figma)AAA(/figma)--> 3 < 4")).toEqual({});
  });

  it("tên thẻ gộp về chữ thường, giữ cả dấu gạch nối của web component", () => {
    expect(countTags("<DIV><my-card>")).toEqual({ div: 1, "my-card": 1 });
  });
});

describe("tên thuộc tính data-*", () => {
  it("không trùng lặp, xếp theo chữ cái", () => {
    const html = `<div data-Slate-Node="x" data-pm-slice="1"><b data-slate-node="y"></b></div>`;
    expect(listDataAttrs(html)).toEqual(["data-pm-slice", "data-slate-node"]);
  });

  it("vượt trần ⇒ cắt và ĐẾM phần dư, không lặng lẽ bỏ", () => {
    const html = ["a", "b", "c", "d"].map((n) => `<i data-${n}="1"></i>`).join("");
    expect(listDataAttrs(html, 2)).toEqual(["data-a", "data-b", "+2 ten nua"]);
  });
});

describe("tìm chữ «figma» trong HTML", () => {
  it("không phân biệt hoa thường, trả về vị trí và lát cắt ĐÃ escape", () => {
    const hit = findWordAround("<p>FiGmA</p>", "figma", 20);
    expect(hit?.index).toBe(3);
    expect(hit?.around).toContain("&lt;p&gt;FiGmA");
  });

  it("không có ⇒ null chứ không phải chuỗi rỗng", () => {
    expect(findWordAround("<p>xin chào</p>", "figma")).toBeNull();
  });
});

describe("nguồn ảnh trong HTML", () => {
  it("tách ba dạng khác hẳn nhau: nhúng thẳng, blob của trang, tải từ máy chủ", () => {
    const html = [
      `<img src="data:image/png;base64,AAAA">`,
      `<img src='data:image/jpeg,AAAA'>`,
      `<img src="blob:https://figma.com/abc">`,
      `<img src=https://x.test/a.png>`,
      `<img alt="không có src">`,
    ].join("");
    expect(imgSrcKinds(html)).toEqual({ "data:image/png": 1, "data:image/jpeg": 1, "blob:": 1, http: 1 });
  });

  it("đường dẫn thường được gọi là «khac», không bị nhét bừa vào http", () => {
    expect(imgSrcKinds(`<img src="./a.png">`)).toEqual({ khac: 1 });
  });
});

describe("đếm chú thích", () => {
  it("số lần mở `<!--` — số 0 là bằng chứng khối chú thích đã bị lọc mất", () => {
    expect(countComments("<!--a--><!--b--><p>c</p>")).toBe(2);
    expect(countComments("<p>c</p>")).toBe(0);
  });
});

describe("tìm mốc theo NHIỀU dạng", () => {
  it("mốc bị escape vẫn tìm ra, và nói rõ nó ở dạng nào", () => {
    /* Đây là giả thuyết số một cho 46 KB không mốc: HTML đi qua một chỗ nào đó
       biến `<` thành `&lt;`, mốc còn nguyên chữ nhưng không còn là chú thích. */
    const forms = findMarkerForms(`<div>&lt;!--(figmeta)eyJhIjoxfQ==(/figmeta)--&gt;</div>`);
    expect(forms.map((f) => f.form)).toEqual(["figmeta-escaped", "figmeta-tran"]);
    expect(forms[0]?.sample).toContain("&amp;lt;!--(figmeta)");
  });

  it("mốc có khoảng trắng chen vào ⇒ dạng «noi-long» bắt được, dạng «chuan» thì không", () => {
    const forms = findMarkerForms("<!-- (figmeta) -->");
    expect(forms.map((f) => f.form)).toEqual(["figmeta-noi-long", "figmeta-tran"]);
  });

  it("mốc chuẩn hiện ở CẢ hai dòng — đó là đúng, vì «noi-long» là câu hỏi chứ không phải mốc khác", () => {
    const forms = findMarkerForms(`${FIGMETA_OPEN}AA${FIGMETA_CLOSE}${FIGMA_OPEN}BB${FIGMA_CLOSE}`);
    expect(forms.map((f) => f.form)).toEqual([
      "figmeta-chuan", "figma-chuan", "figmeta-noi-long", "figma-noi-long", "figmeta-tran",
    ]);
  });

  it("tên `figma-clipboard` không ngoặc vẫn được gọi ra", () => {
    const forms = findMarkerForms(`<div class="figma-clipboard"></div>`);
    expect(forms.map((f) => f.form)).toEqual(["figma-clipboard"]);
  });

  it("HTML thường ⇒ KHÔNG dạng nào, chứ không phải một dạng rỗng", () => {
    expect(findMarkerForms("<p>xin chào</p>")).toEqual([]);
  });
});

describe("bản mô tả HTML thô", () => {
  it("cắt đúng trần và escape phần đầu", () => {
    const d = diagnoseHtml(`<b>${"x".repeat(HTML_HEAD_CHARS)}</b>`);
    expect(d.htmlHead.startsWith("&lt;b&gt;")).toBe(true);
    /* Cắt TRƯỚC rồi escape, nên chuỗi ra dài hơn trần — escape làm một ký tự nở
       ra bốn. Trần đếm ký tự HTML GỐC, và đó là ý muốn: nó là trần của lượng
       thông tin chở theo, không phải trần của chuỗi in ra. */
    expect(d.htmlHead.length).toBeGreaterThanOrEqual(HTML_HEAD_CHARS);
    expect(d.htmlHead).not.toContain("<b>");
  });

  it("gộp đủ sáu phép đo", () => {
    const d = diagnoseHtml(`<!--x--><div data-q="1"><img src="blob:a">figma</div>`);
    expect(d.tagCounts).toEqual({ div: 1, img: 1 });
    expect(d.dataAttrs).toEqual(["data-q"]);
    expect(d.imgSrcKinds).toEqual({ "blob:": 1 });
    expect(d.commentCount).toBe(1);
    expect(d.hasFigmaWord?.index).toBe(42);
    expect(d.markerForms).toEqual([]);
  });
});

describe("bản phân tích khi THIẾU mốc", () => {
  it("thiếu mốc ⇒ có bản mô tả HTML; đủ mốc ⇒ KHÔNG có, vì lúc đó nó là tiếng ồn", async () => {
    const thieu = await analyzeFigmaClipboardHtml(`<div data-slate-node="x">46 KB gì đó</div>`, ["text/html"]);
    expect(thieu.htmlDiag?.dataAttrs).toEqual(["data-slate-node"]);
    expect(thieu.htmlDiag?.markerForms).toEqual([]);

    const { html } = await buildFixtureClipboard();
    expect((await analyzeFigmaClipboardHtml(html)).htmlDiag).toBeNull();
  });

  it("bảng kê bộ nhớ tạm được chở nguyên vào bản phân tích", async () => {
    const detail: ClipboardEntry[] = [
      { type: "text/html", kind: "chuoi", chars: 46203 },
      { type: "image/png", kind: "file", chars: null, fileName: "image.png", bytes: 1234 },
    ];
    const a = await analyzeFigmaClipboardHtml("<p>x</p>", ["text/html", "Files"], detail);
    expect(a.clipboardDetail).toEqual(detail);
  });
});

describe("xuất JSON — có trần, và NÓI khi đã cắt", () => {
  it("bản đủ nhỏ ⇒ không cắt, và đọc lại được thành JSON", async () => {
    const { html } = await buildFixtureClipboard();
    const out = analysisToJson(await analyzeFigmaClipboardHtml(html));
    expect(out.truncated).toBe(false);
    expect(JSON.parse(out.text)).toMatchObject({ container: { version: 21 } });
  });

  it("trần bé ⇒ cắt dần và cắm cờ, chứ không trả một chuỗi JSON hỏng", async () => {
    const { html } = await buildFixtureClipboard();
    const out = analysisToJson(await analyzeFigmaClipboardHtml(html), 1500);
    expect(out.truncated).toBe(true);
    /* Cắt theo BẬC nghĩa là cắt ở mức dữ liệu rồi mới in ra — chuỗi vẫn phải
       đọc lại được. Cắt bằng `slice` trên chuỗi thì ca này đỏ. */
    expect(() => JSON.parse(out.text) as unknown).not.toThrow();
    expect(JSON.parse(out.text)).toMatchObject({ daCat: true });
  });
});

describe("cổng dev — bàn mổ dùng CHUNG cổng với nút thí nghiệm", () => {
  it("bản đã build, không query ⇒ TẮT", () => {
    expect(labFlagOn(false, "")).toBe(false);
  });

  it("bản đã build + `?lab=figma` ⇒ BẬT — đường mở tay cho chủ sản phẩm", () => {
    expect(labFlagOn(false, `?${LAB_QUERY_KEY}=${LAB_QUERY_VALUE}`)).toBe(true);
  });
});
