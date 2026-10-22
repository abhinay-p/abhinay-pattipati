"""Import a roll of film scans into the site, in two steps with a review between.

1. Plan: analyze a folder of scans.
     python3 scripts/import-scans.py plan <scan-folder> --stock portra400
   - Finds duplicate frames, both within the folder and against photos already
     on the site, using a perceptual "difference hash".
   - Proposes crops for white scanner borders using per-row/column brightness
     profiles.
   - Writes import-plan.json and a review sheet (import-review.jpg) with each
     proposed crop drawn as a red line and each duplicate labelled.

2. Review: open the sheet. In import-plan.json, set "apply_crop": false for any
   proposed crop that is really part of the photo (sky, a white wall, a light
   leak), and "skip": false for a flagged duplicate you want to keep anyway.

3. Apply: export the frames.
     python3 scripts/import-scans.py apply import-plan.json
   - Writes images/film/<stock>_<NN>.jpg, numbered after the stock's existing
     photos, in frame order: approved crops applied, 2000px on the long edge,
     EXIF removed.
   Then run `npm run photos` to make thumbnails and update photos.json.

Needs Pillow: pip install pillow
"""
import argparse
import json
import re
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageOps

Image.MAX_IMAGE_PIXELS = None  # film scans can be 10,000+ px wide
ROOT = Path(__file__).resolve().parent.parent
FILM = ROOT / "images" / "film"
EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
LONG = 2000          # exported long edge, px

# Duplicate detection
HASH_SIZE = 16       # 16x16 = 256-bit difference hash
DUPLICATE_BITS = 20  # hashes this close (of 256 bits) are treated as the same frame
NOISE = 3            # a bit only counts as different if the brightness steps differ by more than this

# White-border detection, all as shares of a row/column or of the image side
WHITE = 200          # a pixel counts as white if every channel is above this...
NEUTRAL = 45         # ...and its channels are within this of each other (not a colored light leak)
BAND = 0.45          # a line is part of the border band if this share of it is white
TAIL = 0.06          # keep trimming a ragged edge while the white share stays above this
MAX_REBATE = 0.08    # a dark film edge this wide may sit outside the white band
MAX_CUT = 0.18       # the band must end within this share of the side, or it's sky/wall
MARGIN = 0.003       # trim a hair past the band so no white sliver remains


# ---------------------------------------------------------------- helpers

def frame_order(path):
    """Sort key for scanner file names: "roll 37.jpg" is frame 1, then
    "roll 37 (2).jpg", "(3)", ...; other names sort naturally (2 before 10)."""
    name = path.name
    m = re.search(r" \((\d+)\)", name)
    base = name.replace(m.group(0), "") if m else name
    natural = [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", base)]
    return natural, int(m.group(1)) if m else 1


def pixels(im):
    """All pixel values, row by row (get_flattened_data is Pillow 11.3+)."""
    return list(im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata())


def open_scan(path, size):
    """Open a scan decoded at roughly `size` px (fast for huge JPEGs), upright."""
    im = Image.open(path)
    im.draft("RGB", (size, size))
    return ImageOps.exif_transpose(im.convert("RGB"))


def dhash(im):
    """Difference hash: shrink to (HASH_SIZE+1) x HASH_SIZE grayscale and record,
    for each pixel, how much brighter it is than its left neighbour. The bit is
    whether that step is positive. Similar pictures give similar bits even after
    resizing or recompression. The steps are kept so distance() can tell a real
    difference from noise."""
    g = im.convert("L").resize((HASH_SIZE + 1, HASH_SIZE), Image.LANCZOS)
    px = pixels(g)
    w = HASH_SIZE + 1
    return [px[r * w + c + 1] - px[r * w + c] for r in range(HASH_SIZE) for c in range(HASH_SIZE)]


def distance(a, b):
    """How many of the 256 bits differ, ignoring flips between near-equal pixels.
    In flat areas (a dark wall, clear sky) neighbours are almost the same, so the
    bit flips at random between two copies of one photo."""
    return sum((x > 0) != (y > 0) and abs(x - y) > NOISE for x, y in zip(a, b))


def white_mask(im):
    """255 where a pixel is bright AND neutral (white or near-white), else 0."""
    r, g, b = im.split()
    bright = ImageChops.darker(ImageChops.darker(r, g), b).point(lambda v: 255 if v > WHITE else 0)
    spread = ImageChops.subtract(ImageChops.lighter(ImageChops.lighter(r, g), b),
                                 ImageChops.darker(ImageChops.darker(r, g), b))
    neutral = spread.point(lambda v: 255 if v < NEUTRAL else 0)
    return ImageChops.darker(bright, neutral)


def profile(mask, side):
    """Share of white pixels in each column (left/right) or row (top/bottom),
    ordered from that edge inward."""
    w, h = mask.size
    size = (w, 1) if side in ("left", "right") else (1, h)
    line = [v / 255 for v in pixels(mask.resize(size, Image.BOX))]
    return line[::-1] if side in ("right", "bottom") else line


def border_cut(p):
    """How much of a side to trim (0..MAX_CUT as a share), or 0 if there's no border.

    A border is a band of white lines that starts at the edge (optionally past a
    thin dark film edge) and then ends sharply. A bright area that runs on past
    MAX_CUT (sky, a white wall) is part of the photo and is left alone."""
    n = len(p)
    i = 0
    while i < n * MAX_REBATE and p[i] < BAND:
        i += 1
    if i >= n * MAX_REBATE or p[i] < BAND:
        return 0.0                     # no white band near this edge
    if i and sum(p[:i]) / i > 0.1:
        return 0.0                     # what's outside the band must be a dark film edge
    j = i
    while j < n * MAX_CUT and p[j] >= BAND:
        j += 1
    if j >= n * MAX_CUT:
        return 0.0                     # runs on too far: sky or a wall, not a border
    while j < n * MAX_CUT and p[j] > TAIL:
        j += 1                         # ragged edge
    if j >= n * MAX_CUT:
        return 0.0
    return round((j + n * MARGIN) / n, 4)


def find_borders(im):
    mask = white_mask(im)
    return {side: border_cut(profile(mask, side)) for side in ("left", "top", "right", "bottom")}


def cropped(im, c):
    """The image with a crop (shares of each side, as in find_borders) applied."""
    w, h = im.size
    return im.crop((round(c["left"] * w), round(c["top"] * h),
                    w - round(c["right"] * w), h - round(c["bottom"] * h)))


def next_number(stock):
    nums = [int(m.group(1)) for f in FILM.glob(f"{stock}_*.jpg") if (m := re.fullmatch(rf"{stock}_(\d+)", f.stem))]
    return max(nums, default=0) + 1


# ---------------------------------------------------------------- plan

def plan(args):
    folder = Path(args.folder).expanduser()
    stock = args.stock.lower()
    if not re.fullmatch(r"[a-z]+\d*[a-z]*", stock):
        sys.exit(f"--stock should look like portra400 or hp5, not {args.stock!r}")
    scans = sorted((p for p in folder.iterdir() if p.suffix.lower() in EXTS and p.is_file()), key=frame_order)
    if not scans:
        sys.exit(f"No scans found in {folder}")

    # Hashes of what's already on the site (thumbnails are enough for a hash).
    site = {}
    for f in sorted((FILM / "thumbs").glob("*.jpg")):
        site[f.stem] = dhash(Image.open(f).convert("RGB"))

    frames, hashes = [], []
    first = next_number(stock)
    for k, path in enumerate(scans):
        im = open_scan(path, 1400)
        crop = find_borders(im)
        # A white border shifts the picture enough to change the hash, and site
        # copies were saved already cropped. So hash the scan both as-is and as
        # it would be cropped, and keep whichever is closer.
        hs = [dhash(im)] + ([dhash(cropped(im, crop))] if any(crop.values()) else [])
        dup = None
        for name, sh in site.items():
            d = min(distance(h, sh) for h in hs)
            if d <= DUPLICATE_BITS and (dup is None or d < dup[1]):
                dup = (f"site photo {name}", d)
        for prev_path, ph in hashes:
            d = min(distance(a, b) for a in hs for b in ph)
            if d <= DUPLICATE_BITS and (dup is None or d < dup[1]):
                dup = (f"scan {prev_path.name}", d)
        hashes.append((path, hs))
        frames.append({
            "src": str(path),
            "duplicate_of": f"{dup[0]} ({dup[1]} of 256 bits differ)" if dup else None,
            "skip": bool(dup),
            "crop": crop,
            "apply_crop": any(crop.values()),
        })
        print(f"{k + 1:3}/{len(scans)} {path.name[:48]:48}"
              f"{'  DUPLICATE of ' + dup[0] if dup else ''}"
              f"{'  border ' + str({s: v for s, v in crop.items() if v}) if any(crop.values()) else ''}")

    out = Path(args.out).expanduser()
    plan_data = {"stock": stock, "output": str(FILM), "first_number": first, "frames": frames}
    out.write_text(json.dumps(plan_data, indent=1) + "\n")
    review_sheet(frames, Path(args.sheet).expanduser())
    keep = sum(not f["skip"] for f in frames)
    crops = sum(f["apply_crop"] and not f["skip"] for f in frames)
    print(f"\n{len(frames)} scans: {len(frames) - keep} duplicate(s) skipped, {crops} with a proposed border crop.")
    print(f"Plan: {out}\nReview sheet: {args.sheet}  (red lines = proposed crops)")
    print(f"They'll be numbered {stock}_{first:02d} onward. Check the sheet, edit the plan, then run:")
    print(f"  python3 scripts/import-scans.py apply {out}")


def review_sheet(frames, path, size=420, cols=3, pad=10):
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (size + pad) + pad, rows * (size * 2 // 3 + pad + 22) + pad), (246, 242, 234))
    d = ImageDraw.Draw(sheet)
    for n, f in enumerate(frames):
        im = open_scan(f["src"], size * 2)
        im.thumbnail((size, size * 2 // 3))
        w, h = im.size
        x0 = pad + (n % cols) * (size + pad)
        y0 = pad + (n // cols) * (size * 2 // 3 + pad + 22)
        ox, oy = x0 + (size - w) // 2, y0 + (size * 2 // 3 - h) // 2
        sheet.paste(im, (ox, oy))
        c = f["crop"]
        if c["left"]: d.line([(ox + c["left"] * w, oy), (ox + c["left"] * w, oy + h)], fill="red", width=2)
        if c["right"]: d.line([(ox + w - c["right"] * w, oy), (ox + w - c["right"] * w, oy + h)], fill="red", width=2)
        if c["top"]: d.line([(ox, oy + c["top"] * h), (ox + w, oy + c["top"] * h)], fill="red", width=2)
        if c["bottom"]: d.line([(ox, oy + h - c["bottom"] * h), (ox + w, oy + h - c["bottom"] * h)], fill="red", width=2)
        label = f"{n + 1}. {Path(f['src']).name[:40]}"
        if f["duplicate_of"]:
            label += "  DUPLICATE"
            d.rectangle([ox, oy, ox + w, oy + h], outline="red", width=3)
        d.text((x0, y0 + size * 2 // 3 + 5), label, fill=(43, 42, 39))
    sheet.save(path, quality=85)


# ---------------------------------------------------------------- apply

def apply(args):
    data = json.loads(Path(args.plan).expanduser().read_text())
    stock = data["stock"]
    out = Path(args.output or data["output"]).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    n = data["first_number"]
    written = 0
    for f in data["frames"]:
        if f["skip"]:
            continue
        dest = out / f"{stock}_{n:02d}.jpg"
        if dest.exists():
            sys.exit(f"Refusing to overwrite {dest}. Re-run plan to renumber.")
        src = Image.open(f["src"])
        icc = src.info.get("icc_profile")
        im = open_scan(f["src"], LONG * 3 // 2)
        if f["apply_crop"]:
            im = cropped(im, f["crop"])
        im.thumbnail((LONG, LONG), Image.LANCZOS)
        im.save(dest, "JPEG", quality=82, optimize=True, progressive=True, icc_profile=icc)  # no EXIF passed
        print(f"{Path(f['src']).name[:48]:48} -> {dest.name}{'  (cropped)' if f['apply_crop'] else ''}")
        n += 1
        written += 1
    print(f"\nWrote {written} photo(s) to {out}. Now run: npm run photos")


def main():
    ap = argparse.ArgumentParser(description="Import a roll of film scans: find duplicates, crop white borders, export.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan", help="analyze scans and write a plan + review sheet")
    p.add_argument("folder", help="folder of scans from one roll")
    p.add_argument("--stock", required=True, help="film stock key used in file names, e.g. portra400")
    p.add_argument("--out", default="import-plan.json", help="where to write the plan (default: import-plan.json)")
    p.add_argument("--sheet", default="import-review.jpg", help="where to write the review sheet")
    p.set_defaults(func=plan)
    a = sub.add_parser("apply", help="export the frames in a reviewed plan")
    a.add_argument("plan", help="plan file from the plan step")
    a.add_argument("--output", help="export somewhere other than images/film (for testing)")
    a.set_defaults(func=apply)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
