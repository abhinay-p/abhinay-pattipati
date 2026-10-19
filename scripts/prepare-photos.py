"""Gets photos in images/film/ ready for the web.

- Shrinks any photo larger than 2000px on its long edge, and drops its EXIF
  data (scanner/camera details, dates, any location).
- Makes a small thumbnail in images/film/thumbs/ for the gallery's contact
  sheets, and removes thumbnails whose photo is gone.

Run it before `npm run photos`. The GitHub Action does both after every upload.
Needs Pillow: pip install pillow
"""
from pathlib import Path
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parent.parent
FILM = ROOT / "images" / "film"
THUMBS = FILM / "thumbs"
EXTS = {".jpg", ".jpeg", ".png", ".webp"}
LONG, THUMB = 2000, 480


def save(im, dest, quality, icc):
    if dest.suffix.lower() in {".jpg", ".jpeg"}:
        im.save(dest, "JPEG", quality=quality, optimize=True, progressive=True, icc_profile=icc)
    else:
        im.save(dest, icc_profile=icc)


THUMBS.mkdir(exist_ok=True)
photos = sorted(p for p in FILM.iterdir() if p.suffix.lower() in EXTS)
shrunk = made = 0
for p in photos:
    im = Image.open(p)
    icc = im.info.get("icc_profile")
    if max(im.size) > LONG or im.getexif():
        im.draft("RGB", (LONG * 3 // 2, LONG * 3 // 2))
        im = ImageOps.exif_transpose(im.convert("RGB"))
        im.thumbnail((LONG, LONG), Image.LANCZOS)
        save(im, p, 82, icc)
        shrunk += 1
    thumb = THUMBS / (p.stem + ".jpg")
    if not thumb.exists() or thumb.stat().st_mtime < p.stat().st_mtime:
        t = ImageOps.exif_transpose(Image.open(p).convert("RGB"))
        t.thumbnail((THUMB, THUMB), Image.LANCZOS)
        save(t, thumb, 78, icc)
        made += 1

names = {p.stem for p in photos}
stale = [t for t in THUMBS.glob("*.jpg") if t.stem not in names]
for t in stale:
    t.unlink()
print(f"prepare-photos: {len(photos)} photos, {shrunk} resized, {made} thumbnails made, {len(stale)} removed")
