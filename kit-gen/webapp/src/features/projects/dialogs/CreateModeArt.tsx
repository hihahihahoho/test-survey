/**
 * Minh hoạ hai mode — SVG dựng bằng TOKEN, không thêm asset, không màu literal.
 *
 * §1.2 ghi chú thi công: *"KHÔNG dùng ảnh thật, dùng minh hoạ SVG dựng bằng token"*.
 * Hai hình cố tình đối lập nhau về NHỊP để nhận ra bằng liếc mắt, không cần đọc chữ:
 *   · canvas   = các khối lệch nhau, có nét ghi chú tự do → cảm giác bày biện tự do.
 *   · workflow = bốn bước thẳng hàng + lưới đều → cảm giác dây chuyền.
 * Cả hai đều `aria-hidden`: nghĩa đã nằm trong tiêu đề + mô tả của thẻ radio.
 */

const R = 3; // bo góc khối nhỏ trong hình, đơn vị viewBox

export function CanvasArt() {
  return (
    <svg viewBox="0 0 160 72" className="h-full w-full" role="presentation" aria-hidden focusable="false">
      {/* các khối lệch nhau: ảnh tham khảo rải trên bàn */}
      <rect x="10" y="12" width="34" height="26" rx={R} className="fill-raised stroke-line-strong" strokeWidth="1" />
      <rect x="50" y="20" width="26" height="20" rx={R} className="fill-raised stroke-line" strokeWidth="1" />
      <rect x="18" y="44" width="22" height="16" rx={R} className="fill-raised stroke-line" strokeWidth="1" />
      {/* ghi chú tự do: ba nét chữ giả + góc gập */}
      <rect x="86" y="30" width="52" height="30" rx={R} className="fill-surface stroke-line-strong" strokeWidth="1" />
      <rect x="92" y="38" width="34" height="2" rx="1" className="fill-line-strong" />
      <rect x="92" y="44" width="40" height="2" rx="1" className="fill-line" />
      <rect x="92" y="50" width="22" height="2" rx="1" className="fill-line" />
      {/* dấu nhấn duy nhất: một chấm accent = "đang bày, chưa sinh ảnh" */}
      <circle cx="98" cy="18" r="4" className="fill-accent" />
      <path d="M104 18 H132" className="stroke-line" strokeWidth="1" strokeDasharray="3 3" />
    </svg>
  );
}

export function WorkflowArt() {
  return (
    <svg viewBox="0 0 160 72" className="h-full w-full" role="presentation" aria-hidden focusable="false">
      {/* ①→②→③→④ : bốn bước thẳng hàng, mũi tên nối */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <circle cx={22 + i * 32} cy="20" r="8" className="fill-surface stroke-line-strong" strokeWidth="1" />
          {i < 3 && <path d={`M${32 + i * 32} 20 H${44 + i * 32}`} className="stroke-line" strokeWidth="1" />}
        </g>
      ))}
      {/* lưới sheet đều tăm tắp phía dưới */}
      {[0, 1, 2, 3].map((col) =>
        [0, 1].map((row) => (
          <rect
            key={`${col}-${row}`}
            x={14 + col * 34}
            y={38 + row * 16}
            width={28}
            height={12}
            rx="2"
            className="fill-raised stroke-line"
            strokeWidth="1"
          />
        )),
      )}
      {/* bước đầu là bước đang đứng: chấm accent duy nhất */}
      <circle cx="22" cy="20" r="3" className="fill-accent" />
    </svg>
  );
}
