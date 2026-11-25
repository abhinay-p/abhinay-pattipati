"""Gets photos in images/film/ ready for the web.

- Shrinks any photo larger than 2000px on its long edge, and drops its EXIF
  data (scanner/camera details, dates, any location).
- Makes a small thumbnail in images/film/thumbs/ for the gallery's contact
  sheets.
- Makes smaller WebP copies in images/film/web/960/ and images/film/web/1600/,
  so each screen downloads only as much of a photo as it can show.
- Works out each photo's two main colors (the average of its top half and of
  its bottom half), which hold its place on the page while it loads.

images/film/web/manifest.json remembers which version of each photo all this
was made from, so only new or replaced photos are redone. (File times can't
tell: every fresh git checkout resets them.) Anything whose photo is gone is
removed.

Run it before `npm run photos`. The GitHub Action does both after every upload.
Needs Pillow: pip install pillow
"""
import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageCms, ImageOps

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parent.parent
FILM = ROOT / "images" / "film"
THUMBS = FILM / "thumbs"
WEB = FILM / "web"
MANIFEST = WEB / "manifest.json"
EXTS = {".jpg", ".jpeg", ".png", ".webp"}
LONG, THUMB = 2000, 480  # px on the long edge
# WebP copies, px on the long edge: quality. The larger one is what desktop
# screens show, and lower settings there visibly smooth away the film grain.
COPIES = {960: 76, 1600: 80}
SRGB = ImageCms.createProfile("sRGB")
LINEAR = [(v / 255 / 12.92 if v <= 10 else ((v / 255 + 0.055) / 1.055) ** 2.4) for v in range(256)]


def save(im, dest, quality, icc):
    if dest.suffix.lower() in {".jpg", ".jpeg"}:
        im.save(dest, "JPEG", quality=quality, optimize=True, progressive=True, icc_profile=icc)
    else:
        im.save(dest, icc_profile=icc)


def to_srgb(im, icc):
    """The copies carry no color profile, so anything that isn't sRGB (a few
    scans are Display P3) is converted first."""
    if not icc:
        return im
    try:
        profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        if "srgb" in ImageCms.getProfileDescription(profile).lower():
            return im
        return ImageCms.profileToProfile(im, profile, SRGB, outputMode="RGB")
    except ImageCms.PyCMSError:
        return im


def main_colors(im):
    """Average color of the top and bottom halves, as ["#rrggbb", "#rrggbb"].
    Averaged as light rather than as pixel values, which would come out darker
    than the photo looks."""
    raw = im.resize((32, 32), Image.BOX).tobytes()

    def mean(part):
        out = "#"
        for c in range(3):
            light = sum(LINEAR[v] for v in part[c::3]) / (len(part) // 3)
            v = light * 12.92 if light <= 0.0031308 else 1.055 * light ** (1 / 2.4) - 0.055
            out += f"{round(v * 255):02x}"
        return out

    return [mean(raw[: len(raw) // 2]), mean(raw[len(raw) // 2 :])]


def prepare(p):
    """Brings one photo up to date. Returns (stem, manifest entry, shrunk, thumbs made, copies made)."""
    shrunk = thumbs = copies = 0
    im = Image.open(p)
    icc = im.info.get("icc_profile")
    if max(im.size) > LONG or im.getexif():
        im.draft("RGB", (LONG * 3 // 2, LONG * 3 // 2))
        im = ImageOps.exif_transpose(im.convert("RGB"))
        im.thumbnail((LONG, LONG), Image.LANCZOS)
        save(im, p, 82, icc)
        shrunk = 1

    digest = hashlib.sha1(p.read_bytes()).hexdigest()[:12]
    before = manifest.get(p.stem, {})
    replaced = before.get("from", digest) != digest
    thumb = THUMBS / f"{p.stem}.jpg"
    wanted = {size: WEB / str(size) / f"{p.stem}.webp" for size in COPIES if size < max(im.size)}
    new_thumb = replaced or not thumb.exists()
    new_copies = [size for size, dest in wanted.items() if replaced or not dest.exists()]
    entry = before
    if new_thumb or new_copies or not before:
        full = ImageOps.exif_transpose(Image.open(p).convert("RGB"))
        if new_thumb:
            t = full.copy()
            t.thumbnail((THUMB, THUMB), Image.LANCZOS)
            save(t, thumb, 78, icc)
            thumbs = 1
        web = to_srgb(full, icc)
        for size in new_copies:
            c = web.copy()
            c.thumbnail((size, size), Image.LANCZOS)
            c.save(wanted[size], "WEBP", quality=COPIES[size], method=6)
            copies += 1
        entry = {"from": digest, "colors": main_colors(web)}
    for size in COPIES.keys() - wanted.keys():  # replaced by a photo too small to need this copy
        (WEB / str(size) / f"{p.stem}.webp").unlink(missing_ok=True)
    return p.stem, entry, shrunk, thumbs, copies


THUMBS.mkdir(exist_ok=True)
for size in COPIES:
    (WEB / str(size)).mkdir(parents=True, exist_ok=True)
manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}

photos = sorted(p for p in FILM.iterdir() if p.suffix.lower() in EXTS)
with ThreadPoolExecutor() as pool:
    done = list(pool.map(prepare, photos))

entries = {stem: entry for stem, entry, *_ in done}
lines = ",\n".join(f"{json.dumps(stem)}: {json.dumps(entries[stem])}" for stem in sorted(entries))
MANIFEST.write_text(f"{{\n{lines}\n}}\n")

stale = [f for f in [*THUMBS.glob("*.jpg"), *WEB.glob("*/*.webp")] if f.stem not in entries]
for f in stale:
    f.unlink()
shrunk, thumbs, copies = (sum(d[i] for d in done) for i in (2, 3, 4))
print(f"prepare-photos: {len(photos)} photos, {shrunk} resized, {thumbs} thumbnails and {copies} copies made, {len(stale)} removed")
