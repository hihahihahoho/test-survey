#!/usr/bin/env python3
"""Chuẩn hoá một UI asset có decoration tràn ngoài safe zone.

Button được sinh ở độ phân giải lớn. Script dò mặt button chứa tâm ảnh, kiểm
tra nó có đúng tỷ lệ skeleton, rồi scale ĐỒNG ĐỀU để giữ nguyên hình dáng:

- PNG RGBA @Nx, giữ nguyên decoration bên ngoài;
- manifest chứa padding/offset để dựng một Figma frame đúng kích thước;
- preview có khung đỏ để kiểm bằng mắt.

Ví dụ:
  python3 kit-gen/tools/safe_zone_asset.py source.png \
    --out button@4x.png --manifest button.json --preview preview.png \
    --safe-width 120 --safe-height 52 --density 4
"""

from __future__ import annotations

import argparse
import colorsys
import json
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw


@dataclass(frozen=True)
class Box:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top

    def as_tuple(self) -> tuple[int, int, int, int]:
        return self.left, self.top, self.right, self.bottom


def _hue_distance(a: float, b: float) -> float:
    d = abs(a - b)
    return min(d, 1.0 - d)


def _seed_near_center(image: Image.Image) -> tuple[int, int]:
    """Lấy pixel đục gần tâm nhất; tâm là mặt button theo contract thử nghiệm."""
    alpha = image.getchannel("A")
    width, height = image.size
    cx, cy = width // 2, height // 2
    if alpha.getpixel((cx, cy)) >= 128:
        return cx, cy
    limit = max(width, height) // 4
    for radius in range(1, limit + 1):
        x0, x1 = max(0, cx - radius), min(width - 1, cx + radius)
        y0, y1 = max(0, cy - radius), min(height - 1, cy + radius)
        for x in range(x0, x1 + 1):
            for y in (y0, y1):
                if alpha.getpixel((x, y)) >= 128:
                    return x, y
        for y in range(y0 + 1, y1):
            for x in (x0, x1):
                if alpha.getpixel((x, y)) >= 128:
                    return x, y
    raise ValueError("Không tìm thấy mặt button đục gần trung tâm ảnh")


def detect_button_safe(image: Image.Image) -> Box:
    """Dò mặt button bằng flood-fill màu bắt đầu từ tâm.

    Decoration có thể cùng palette nhưng thường bị ngăn khỏi mặt button bởi viền.
    Flood-fill vì thế ổn định hơn bbox alpha hoặc phép chiếu hàng/cột: hai phép đó
    luôn nuốt cả cánh, hoa và tia sáng vào safe zone.
    """
    rgba = image.convert("RGBA")
    width, height = rgba.size
    sx, sy = _seed_near_center(rgba)
    sr, sg, sb, _ = rgba.getpixel((sx, sy))
    seed_h, seed_s, seed_v = colorsys.rgb_to_hsv(sr / 255, sg / 255, sb / 255)
    pixels = rgba.load()

    def belongs(x: int, y: int) -> bool:
        r, g, b, a = pixels[x, y]
        if a < 96:
            return False
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        # Mặt button có thể có gradient sáng/tối mạnh, nhưng hue vẫn ổn định.
        # Vàng kim/viền có hue khác rõ; vùng xám/trắng bị loại bởi saturation.
        return (
            _hue_distance(h, seed_h) <= 0.15
            and s >= max(0.20, seed_s * 0.35)
            and v >= max(0.05, seed_v * 0.12)
        )

    if not belongs(sx, sy):
        raise ValueError("Pixel trung tâm không đủ ổn định để dò safe zone")

    queue: deque[tuple[int, int]] = deque([(sx, sy)])
    seen = bytearray(width * height)
    seen[sy * width + sx] = 1
    left = right = sx
    top = bottom = sy
    count = 0
    while queue:
        x, y = queue.popleft()
        if not belongs(x, y):
            continue
        count += 1
        left, right = min(left, x), max(right, x)
        top, bottom = min(top, y), max(bottom, y)
        for nx, ny in (
            (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1),
            (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1), (x + 1, y + 1),
        ):
            if not (0 <= nx < width and 0 <= ny < height):
                continue
            index = ny * width + nx
            if not seen[index]:
                seen[index] = 1
                if belongs(nx, ny):
                    queue.append((nx, ny))

    if count < max(32, width * height // 1000):
        raise ValueError("Không dò được một mặt button đủ lớn ở trung tâm")
    return Box(left, top, right + 1, bottom + 1)


def _round_float(value: float) -> float:
    return round(value, 4)


def normalize_button(
    input_path: Path | str,
    output_path: Path | str,
    manifest_path: Path | str,
    *,
    safe_width: int = 120,
    safe_height: int = 52,
    density: int = 4,
    margin: int = 2,
    max_aspect_error: float = 0.02,
    preview_path: Path | str | None = None,
) -> dict:
    """Scale đồng đều artwork và trả manifest để place trong Figma.

    Safe zone là contract hình học, không phải lý do để kéo méo ảnh. Nếu mặt
    button AI sinh ra lệch tỷ lệ skeleton quá ``max_aspect_error``, ảnh bị từ
    chối để pipeline gen lại từ skeleton/reference đúng.
    """
    if safe_width <= 0 or safe_height <= 0 or density <= 0 or margin < 0:
        raise ValueError("safe size/density phải dương và margin không được âm")
    if not 0 <= max_aspect_error <= 1:
        raise ValueError("max_aspect_error phải nằm trong khoảng 0..1")

    input_path = Path(input_path)
    output_path = Path(output_path)
    manifest_path = Path(manifest_path)
    image = Image.open(input_path).convert("RGBA")
    source_safe = detect_button_safe(image)

    target_width = safe_width * density
    target_height = safe_height * density
    source_aspect = source_safe.width / source_safe.height
    target_aspect = target_width / target_height
    aspect_error = abs(source_aspect / target_aspect - 1)
    if aspect_error > max_aspect_error:
        raise ValueError(
            "Sai tỷ lệ skeleton: mặt button "
            f"{source_safe.width}×{source_safe.height} ({source_aspect:.4f}:1), "
            f"cần {safe_width}×{safe_height} ({target_aspect:.4f}:1), "
            f"lệch {aspect_error * 100:.2f}%. "
            "Không scale méo; hãy gen lại từ skeleton/reference."
        )

    # Chiều cao là contract chính của control. Chỉ dùng MỘT hệ số scale cho cả
    # hai trục; chênh lệch rất nhỏ còn lại được căn giữa trong frame, không kéo.
    scale = target_height / source_safe.height
    resized = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )

    mapped_surface_width = round(source_safe.width * scale)
    mapped_surface_height = round(source_safe.height * scale)
    mapped_surface_left = round(source_safe.left * scale)
    mapped_surface_top = round(source_safe.top * scale)
    # Safe frame luôn đúng requested size; surface đã đúng tỷ lệ được căn giữa.
    mapped_left = round(mapped_surface_left + (mapped_surface_width - target_width) / 2)
    mapped_top = round(mapped_surface_top + (mapped_surface_height - target_height) / 2)
    mapped_right = mapped_left + target_width
    mapped_bottom = mapped_top + target_height
    alpha_box = resized.getchannel("A").getbbox()
    if alpha_box is None:
        raise ValueError("Ảnh sau khi nắn không còn pixel đục")

    margin_px = margin * density
    crop_left = max(0, min(alpha_box[0], mapped_left) - margin_px)
    crop_top = max(0, min(alpha_box[1], mapped_top) - margin_px)
    crop_right = min(resized.width, max(alpha_box[2], mapped_right) + margin_px)
    crop_bottom = min(resized.height, max(alpha_box[3], mapped_bottom) + margin_px)
    normalized = resized.crop((crop_left, crop_top, crop_right, crop_bottom))

    safe = {
        "x": mapped_left - crop_left,
        "y": mapped_top - crop_top,
        "width": target_width,
        "height": target_height,
    }
    logical_image = {
        "x": _round_float(-safe["x"] / density),
        "y": _round_float(-safe["y"] / density),
        "width": _round_float(normalized.width / density),
        "height": _round_float(normalized.height / density),
    }
    manifest = {
        "schemaVersion": 2,
        "kind": "button",
        "asset": output_path.name,
        "density": density,
        "bitmap": {"width": normalized.width, "height": normalized.height},
        "sourceSafeZone": {
            "x": source_safe.left,
            "y": source_safe.top,
            "width": source_safe.width,
            "height": source_safe.height,
        },
        "fit": {
            "mode": "uniform-height",
            "scale": _round_float(scale),
            "sourceAspectRatio": _round_float(source_aspect),
            "targetAspectRatio": _round_float(target_aspect),
            "aspectError": _round_float(aspect_error),
            "maxAspectError": max_aspect_error,
            "mappedSurface": {
                "x": mapped_surface_left - crop_left,
                "y": mapped_surface_top - crop_top,
                "width": mapped_surface_width,
                "height": mapped_surface_height,
            },
        },
        "safeZone": safe,
        "frame": {"width": safe_width, "height": safe_height, "clipContent": False},
        "figma": {
            "image": logical_image,
            "padding": {
                "left": _round_float(safe["x"] / density),
                "top": _round_float(safe["y"] / density),
                "right": _round_float((normalized.width - safe["x"] - target_width) / density),
                "bottom": _round_float((normalized.height - safe["y"] - target_height) / density),
            },
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    normalized.save(output_path, optimize=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    if preview_path is not None:
        write_preview(normalized, safe, Path(preview_path), density)
    return manifest


def write_preview(image: Image.Image, safe: dict, path: Path, density: int) -> None:
    """Preview checkerboard + khung đỏ; không dùng làm asset production."""
    tile = max(4, 4 * density)
    preview = Image.new("RGBA", image.size, (35, 35, 38, 255))
    draw = ImageDraw.Draw(preview)
    for y in range(0, image.height, tile):
        for x in range(0, image.width, tile):
            color = (56, 56, 60, 255) if (x // tile + y // tile) % 2 else (42, 42, 46, 255)
            draw.rectangle((x, y, min(x + tile, image.width), min(y + tile, image.height)), fill=color)
    preview.alpha_composite(image)
    draw = ImageDraw.Draw(preview)
    x, y, width, height = safe["x"], safe["y"], safe["width"], safe["height"]
    draw.rectangle((x, y, x + width - 1, y + height - 1), outline=(255, 35, 45, 255), width=max(2, density))
    path.parent.mkdir(parents=True, exist_ok=True)
    preview.convert("RGB").save(path, quality=95)


def main() -> None:
    parser = argparse.ArgumentParser(description="Chuẩn hoá UI asset theo safe zone và xuất offset Figma")
    parser.add_argument("input", type=Path, help="PNG RGBA đã tách nền")
    parser.add_argument("--out", type=Path, required=True, help="PNG RGBA @Nx đầu ra")
    parser.add_argument("--manifest", type=Path, required=True, help="JSON geometry đầu ra")
    parser.add_argument("--preview", type=Path, help="JPG/PNG preview có khung safe zone")
    parser.add_argument("--safe-width", type=int, default=120)
    parser.add_argument("--safe-height", type=int, default=52)
    parser.add_argument("--density", type=int, default=4)
    parser.add_argument("--margin", type=int, default=2, help="lề trong suốt ngoài decoration, theo logical px")
    parser.add_argument(
        "--max-aspect-error",
        type=float,
        default=0.02,
        help="sai số tỷ lệ tối đa; vượt ngưỡng thì từ chối thay vì scale méo (mặc định 0.02)",
    )
    args = parser.parse_args()

    manifest = normalize_button(
        args.input,
        args.out,
        args.manifest,
        safe_width=args.safe_width,
        safe_height=args.safe_height,
        density=args.density,
        margin=args.margin,
        max_aspect_error=args.max_aspect_error,
        preview_path=args.preview,
    )
    print(f"✓ {args.out} — bitmap {manifest['bitmap']['width']}×{manifest['bitmap']['height']} @ {args.density}x")
    print(f"✓ safe zone {args.safe_width}×{args.safe_height} — clip content OFF")
    padding = manifest["figma"]["padding"]
    print(f"✓ Figma padding L{padding['left']} T{padding['top']} R{padding['right']} B{padding['bottom']}")
    print(f"✓ {args.manifest}")


if __name__ == "__main__":
    main()
