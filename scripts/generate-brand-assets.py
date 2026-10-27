"""Generate HALOStack PNG/ICO brand assets from the geometric mark."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 512
CYAN = (34, 211, 238)
BLUE = (37, 99, 235)
DEEP = (29, 78, 216)


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def render_mark(size: int = SIZE) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = cy = size / 2
    r = size * 0.34
    sw = max(2, int(size * 0.08))
    bbox = [cx - r, cy - r, cx + r, cy + r]

    start, span = 200.0, 300.0
    steps = 72
    for i in range(steps):
        t0 = i / steps
        a0 = start + span * t0
        a1 = start + span * ((i + 1) / steps)
        if t0 < 0.35:
            color = lerp(CYAN, BLUE, t0 / 0.35)
        else:
            color = lerp(BLUE, DEEP, (t0 - 0.35) / 0.65)
        draw.arc(bbox, start=a0, end=a1 + 0.9, fill=color + (255,), width=sw)

    bar_w = size * 0.38
    bar_h = size * 0.10
    gap = size * 0.045
    total_h = 3 * bar_h + 2 * gap
    y0 = cy - total_h / 2
    x0 = cx - bar_w / 2
    for i, col in enumerate([CYAN, BLUE, BLUE]):
        y = y0 + i * (bar_h + gap)
        draw.rounded_rectangle(
            [x0, y, x0 + bar_w, y + bar_h],
            radius=bar_h / 2,
            fill=col + (255,),
        )
    return img


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    brand = root / "brand"
    pub = root / "web" / "public" / "brand"
    app = root / "web" / "src" / "app"
    brand.mkdir(exist_ok=True)
    pub.mkdir(parents=True, exist_ok=True)

    mark = render_mark()
    mark.save(brand / "logo-mark.png")
    mark.save(pub / "logo-mark.png")

    white = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 255))
    white = Image.alpha_composite(white, mark).convert("RGB")
    white.save(brand / "logo.png", quality=95)
    white.save(pub / "logo.png", quality=95)

    sizes = [16, 32, 48]
    icons = [mark.resize((s, s), Image.Resampling.LANCZOS) for s in sizes]
    icons[0].save(
        app / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=icons[1:],
    )

    # Apple touch icon (opaque)
    s, pad = 180, int(180 * 0.08)
    bg = Image.new("RGBA", (s, s), (255, 255, 255, 255))
    inner = mark.resize((s - 2 * pad, s - 2 * pad), Image.Resampling.LANCZOS)
    bg.paste(inner, (pad, pad), inner)
    bg.convert("RGB").save(app / "apple-icon.png")
    bg.convert("RGB").save(pub / "apple-icon.png")

    for s, name in [(192, "icon-192.png"), (512, "icon-512.png")]:
        mark.resize((s, s), Image.Resampling.LANCZOS).save(pub / name)

    for name in ("logo-mark.svg", "logo.svg"):
        src = pub / name
        if src.exists():
            (brand / name).write_text(src.read_text(encoding="utf-8"), encoding="utf-8")

    print("Generated brand assets in", brand)
    print("Favicon:", (app / "favicon.ico").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
