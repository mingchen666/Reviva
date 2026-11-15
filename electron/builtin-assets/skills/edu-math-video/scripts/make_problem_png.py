"""Render a typed problem statement as problem.png AND compute highlight boxes for chosen phrases.

Use this when the user gave the problem as TEXT (no screenshot), or the screenshot is too messy to use.
The boxes are in source-image pixels, ready to paste into anim.js (PROBLEM.boxes).

  /usr/bin/python3 make_problem_png.py --text "在Rt△ABC中，∠C=90°，AC=3，BC=4，D是AB的中点，求CD的长。" \
      --mark "∠C=90°" "AC=3" "BC=4" "D是AB的中点" "求CD的长" --out problem.png

Prints JSON: {"srcW":..,"srcH":..,"boxes":{"AC=3":[[x0,y0,x1,y1]], ...}}  (a phrase that wraps gets several boxes)
Also writes <out>.boxes.json and <out>.preview.png (boxes drawn) so you can LOOK at the result.
"""
import argparse, json, os, sys
from PIL import Image, ImageDraw, ImageFont

FONTS = ["/System/Library/Fonts/Hiragino Sans GB.ttc", "/System/Library/Fonts/STHeiti Medium.ttc",
         "/System/Library/Fonts/PingFang.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
         "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc", "C:/Windows/Fonts/msyh.ttc"]
# math symbols (² − √ ∠ ∥ ≤ …) are missing from many CJK fonts and would render as ☒ boxes: fall back per character
FALLBACK = ["/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "/System/Library/Fonts/Supplemental/STIXTwoMath.otf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/seguisym.ttf", "C:/Windows/Fonts/cambria.ttc"]


def cmap(path):
    try:
        from fontTools.ttLib import TTFont
        return set(TTFont(path, fontNumber=0, lazy=True).getBestCmap())
    except Exception:
        return None  # fontTools missing: cannot check coverage


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--text")
    g.add_argument("--file", help="UTF-8 text file; blank lines = paragraph breaks")
    ap.add_argument("--mark", nargs="*", default=[], help="phrases to box (exact substrings, first occurrence)")
    ap.add_argument("--out", default="problem.png")
    ap.add_argument("--width", type=int, default=1500)
    ap.add_argument("--size", type=int, default=46)
    a = ap.parse_args()
    text = a.text if a.text is not None else open(a.file, encoding="utf-8").read().strip()
    font_path = next((f for f in FONTS if os.path.exists(f)), None)
    if not font_path:
        sys.exit("No CJK font found; add one to FONTS in this script.")
    chain = [(ImageFont.truetype(f, a.size), cmap(f)) for f in [font_path] + [f for f in FALLBACK if os.path.exists(f)]]

    def font_for(ch):
        for f, cm in chain:
            if cm is None or ord(ch) in cm or ch.isspace():
                return f
        sys.exit(f"no installed font has a glyph for {ch!r} (U+{ord(ch):04X}); rewrite it or add a font to FALLBACK")
    font = chain[0][0]
    pad, lh = 40, int(a.size * 1.75)
    maxw = a.width - 2 * pad

    # layout: list of (char, x, line_index); wrap by measured width, never start a line with punctuation
    pos, x, row = [], 0, 0
    for ch in text:
        if ch == "\n":
            x, row = 0, row + 1
            pos.append((ch, None, None))
            continue
        w = font_for(ch).getlength(ch)
        if x + w > maxw and ch not in "，。；：、！？）」』”,.;:)":
            x, row = 0, row + 1
        pos.append((ch, x, row))
        x += w
    rows = row + 1
    H = 2 * pad + rows * lh
    img = Image.new("RGB", (a.width, H), "white")
    d = ImageDraw.Draw(img)
    for ch, cx, r in pos:
        if cx is not None:
            d.text((pad + cx, pad + r * lh + lh * 0.5 + a.size * 0.36), ch, font=font_for(ch), fill=(30, 30, 30), anchor="ls")  # shared baseline across fonts
    img.save(a.out)

    boxes = {}
    for ph in a.mark:
        i = text.find(ph)
        if i < 0:
            sys.exit(f"--mark phrase not found in text: {ph!r}")
        segs = {}
        for ch, cx, r in pos[i:i + len(ph)]:
            if cx is None:
                continue
            x0, x1 = pad + cx, pad + cx + font_for(ch).getlength(ch)
            s = segs.setdefault(r, [x0, x1])
            s[0], s[1] = min(s[0], x0), max(s[1], x1)
        boxes[ph] = [[round(s[0]) - 6, pad + r * lh + 4, round(s[1]) + 6, pad + (r + 1) * lh - 4] for r, s in sorted(segs.items())]
    out = {"srcW": a.width, "srcH": H, "boxes": boxes}
    base = os.path.splitext(a.out)[0]
    json.dump(out, open(base + ".boxes.json", "w"), ensure_ascii=False, indent=1)
    prev = img.copy()
    pd = ImageDraw.Draw(prev)
    for ph, bs in boxes.items():
        for b in bs:
            pd.rectangle(b, outline=(226, 85, 63), width=4)
    prev.save(base + ".preview.png")
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
