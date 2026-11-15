"""Find and verify highlight-box coordinates on a real problem SCREENSHOT.

Step 1 - grid:  /usr/bin/python3 problem_boxes.py grid problem.png
   -> problem.grid.png: the image with a labelled pixel grid every 50 px. Open it (Read tool) and read off
      the source-pixel coordinates [x0, y0, x1, y1] of each condition you want to highlight.
Step 2 - check: /usr/bin/python3 problem_boxes.py check problem.png '{"AC=3": [[120,40,260,90]], "求CD": [[...]]}'
   -> problem.check.png: boxes drawn in red with their names. Open it and confirm every box tightly covers
      its text. Adjust and repeat until all are right. Then paste the same JSON into PROBLEM.boxes in anim.js.
Also prints the image size (PROBLEM.srcW / srcH).

Crop first if the screenshot has lots of margin or other problems on it:
   /usr/bin/python3 problem_boxes.py crop raw.png x0 y0 x1 y1 problem.png
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont


def font(size):
    for f in ["/System/Library/Fonts/Hiragino Sans GB.ttc", "/System/Library/Fonts/STHeiti Medium.ttc",
              "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    mode, path = sys.argv[1], sys.argv[2]
    img = Image.open(path).convert("RGB")
    W, H = img.size
    base = os.path.splitext(path)[0]
    print(f"size: srcW={W} srcH={H}")
    if mode == "grid":
        d = ImageDraw.Draw(img, "RGBA")
        f = font(max(12, W // 90))
        for x in range(0, W, 50):
            d.line([(x, 0), (x, H)], fill=(0, 120, 255, 110 if x % 100 == 0 else 50), width=1)
            if x % 100 == 0:
                d.text((x + 2, 2), str(x), fill=(0, 90, 220), font=f)
        for y in range(0, H, 50):
            d.line([(0, y), (W, y)], fill=(0, 120, 255, 110 if y % 100 == 0 else 50), width=1)
            if y % 100 == 0:
                d.text((2, y + 2), str(y), fill=(0, 90, 220), font=f)
        img.save(base + ".grid.png")
        print("wrote", base + ".grid.png")
    elif mode == "check":
        boxes = json.loads(sys.argv[3])
        d = ImageDraw.Draw(img)
        f = font(max(14, W // 70))
        for name, bs in boxes.items():
            for b in (bs if isinstance(bs[0], list) else [bs]):
                if not (0 <= b[0] < b[2] <= W and 0 <= b[1] < b[3] <= H):
                    print(f"WARNING {name}: box {b} is outside the image or inverted")
                d.rectangle(b, outline=(226, 85, 63), width=3)
                d.text((b[0], max(0, b[1] - f.size - 2)), name, fill=(226, 85, 63), font=f)
        img.save(base + ".check.png")
        print("wrote", base + ".check.png")
    elif mode == "crop":
        x0, y0, x1, y1, out = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]), sys.argv[7]
        img.crop((x0, y0, x1, y1)).save(out)
        print("wrote", out, "size", (x1 - x0, y1 - y0))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
