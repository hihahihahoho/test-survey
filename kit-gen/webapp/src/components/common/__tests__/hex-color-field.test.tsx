/* @vitest-environment jsdom */
/**
 * Ô MÀU PHẢI COPY/PASTE ĐƯỢC (feedback team 24/08 §2b).
 *
 * Hai thứ được khoá ở đây, vì cả hai đều là cách ô màu hỏng theo kiểu khó thấy:
 *  ① CHUẨN HOÁ — mọi dạng người ta copy được đều phải vào, và chỉ MỘT dạng đi ra
 *    (`#rrggbb` thường). Nếu `#F53` và `#ff5533` cùng tồn tại trong state thì phép so
 *    "chip preset có đang khớp không" / "brand đã đổi màu chưa" sẽ sai vì hoa-thường.
 *  ② GÕ DỞ KHÔNG ĐƯỢC LÀM NHẢY Ô — xoá một ký tự trong `#ff5533` là đi qua `#ff553`,
 *    một chuỗi KHÔNG hợp lệ. Ô phải để yên cho người ta gõ tiếp, và chỉ rơi về giá trị
 *    hợp lệ gần nhất khi rời ô.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HexColorField, normalizeHex } from "../HexColorField";

afterEach(cleanup);

describe("normalizeHex · bảng ca", () => {
  it("bốn dạng copy được → cùng một `#rrggbb` THƯỜNG", () => {
    // `#F53` nở thành `#ff5533` (mỗi ký tự nhân đôi — đúng luật hex 3 ký tự của CSS).
    expect(normalizeHex("#F53")).toBe("#ff5533");
    expect(normalizeHex("F53")).toBe("#ff5533");
    expect(normalizeHex("#FF5533")).toBe("#ff5533");
    expect(normalizeHex("ff5533")).toBe("#ff5533");
    expect(normalizeHex("  #Ff5533  ")).toBe("#ff5533");
    // Dạng chuẩn đi qua hàm này vẫn ra chính nó ⇒ gọi lại nhiều lần không đổi kết quả.
    expect(normalizeHex(normalizeHex("#F53")!)).toBe("#ff5533");
  });

  it("chưa phải màu thì trả `null`, không đoán bừa", () => {
    for (const bad of ["", "#", "#f", "#ff", "#ff55", "#ff553", "#ff55333", "ff55gg", "rgb(1,2,3)", "#f5 3"]) {
      expect(normalizeHex(bad), bad).toBeNull();
    }
  });
});

describe("HexColorField · ô hex gõ/dán được", () => {
  const hexBox = () => screen.getByLabelText("Màu chính dạng mã hex") as HTMLInputElement;
  const swatch = () => screen.getByLabelText("Màu chính") as HTMLInputElement;

  it("dán `#F53` là state nhận `#ff5533` ngay, không phải chờ blur", () => {
    const onChange = vi.fn();
    render(<HexColorField label="Màu chính" value="#000000" onChange={onChange} />);
    fireEvent.change(hexBox(), { target: { value: "#F53" } });
    expect(onChange).toHaveBeenCalledWith("#ff5533");
  });

  it("dán KHÔNG có dấu # vẫn vào", () => {
    const onChange = vi.fn();
    render(<HexColorField label="Màu chính" value="#000000" onChange={onChange} />);
    fireEvent.change(hexBox(), { target: { value: "FF5533" } });
    expect(onChange).toHaveBeenCalledWith("#ff5533");
  });

  it("gõ dở KHÔNG ghi ra ngoài, và ô để yên cho gõ tiếp", () => {
    const onChange = vi.fn();
    render(<HexColorField label="Màu chính" value="#ff5533" onChange={onChange} />);
    fireEvent.change(hexBox(), { target: { value: "#ff55" } });
    // Ô hiện ĐÚNG chữ vừa gõ — nếu nó bật lại `#ff5533` thì không xoá nổi ký tự nào.
    expect(hexBox().value).toBe("#ff55");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rời ô khi đang gõ dở ⇒ về giá trị hợp lệ gần nhất, không về đen", () => {
    render(<HexColorField label="Màu chính" value="#ff5533" onChange={vi.fn()} />);
    fireEvent.change(hexBox(), { target: { value: "#ff55" } });
    fireEvent.blur(hexBox());
    expect(hexBox().value).toBe("#ff5533");
  });

  it("swatch luôn nhận được màu, kể cả khi value là rác của bản nháp cũ", () => {
    render(<HexColorField label="Màu chính" value="chưa-đặt" onChange={vi.fn()} />);
    expect(swatch().value).toBe("#000000");
    // Ô hex vẫn hiện nguyên chuỗi cũ để người dùng thấy thứ cần sửa, không giấu đi.
    expect(hexBox().value).toBe("chưa-đặt");
  });

  it("`disabled` khoá cả hai nửa — không có đường vòng qua ô hex", () => {
    render(<HexColorField label="Màu chính" value="#ff5533" onChange={vi.fn()} disabled />);
    expect(swatch().disabled).toBe(true);
    expect(hexBox().disabled).toBe(true);
  });
});
