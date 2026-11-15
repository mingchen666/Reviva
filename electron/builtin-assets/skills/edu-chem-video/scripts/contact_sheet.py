"""Tile build/stills/*.png into one image so all frames can be reviewed with a single image read.
  PY contact_sheet.py <project_dir> [cols=3]   -> <project_dir>/build/sheet.png  (640x360 per tile, filename on each)
If there are more than 12 stills it writes sheet_1.png, sheet_2.png, ... (12 per sheet, stays legible)."""
import glob, os, sys
from PIL import Image, ImageDraw

proj = sys.argv[1] if len(sys.argv) > 1 else "."
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 3
files = sorted(glob.glob(os.path.join(proj, "build/stills/*.png")))
if not files:
    sys.exit("no stills: run `node render.mjs stills auto` first")
per = 12
for n in range(0, len(files), per):
    chunk = files[n:n + per]
    rows = (len(chunk) + cols - 1) // cols
    sheet = Image.new("RGB", (640 * cols, 360 * rows), "white")
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(chunk):
        x, y = (i % cols) * 640, (i // cols) * 360
        sheet.paste(Image.open(f).convert("RGB").resize((640, 360)), (x, y))
        d.rectangle([x, y, x + 639, y + 359], outline=(120, 120, 120))
        d.rectangle([x, y + 340, x + 7 * len(os.path.basename(f)) + 8, y + 359], fill=(0, 0, 0))
        d.text((x + 4, y + 343), os.path.basename(f), fill=(255, 255, 0))
    name = "sheet.png" if len(files) <= per else f"sheet_{n // per + 1}.png"
    out = os.path.join(proj, "build", name)
    sheet.save(out)
    print(out)
