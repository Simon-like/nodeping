"""生成 NodePing 扩展图标：薄雾蓝渐变圆角方块 + 白色菱形节点标记"""
from PIL import Image, ImageDraw

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

TOP = (96, 165, 250)    # #60a5fa
BOTTOM = (37, 99, 235)  # #2563eb

def make(size):
    scale = 4  # 超采样抗锯齿
    S = size * scale
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    grad = Image.new("RGB", (1, S))
    for y in range(S):
        grad.putpixel((0, y), lerp(TOP, BOTTOM, y / (S - 1)))
    grad = grad.resize((S, S)).convert("RGBA")

    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    img = Image.composite(grad, img, mask)

    d = ImageDraw.Draw(img)
    # 白色菱形 ◈
    cx, cy, r = S / 2, S / 2, S * 0.30
    d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=(255, 255, 255, 255))
    # 中心镂空小圆点（"节点"意象）
    hole = S * 0.09
    d.ellipse([cx - hole, cy - hole, cx + hole, cy + hole], fill=lerp(TOP, BOTTOM, 0.5) + (255,))

    img = img.resize((size, size), Image.LANCZOS)
    img.save(f"icons/icon-{size}.png")

for s in (16, 48, 128):
    make(s)
    print(f"icon-{s}.png done")
