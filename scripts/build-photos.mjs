// Scans images/film/ and writes content/photos.json.
//
// Drop new scans into images/film/ and run `npm run photos`. Anything you've
// hand-edited in photos.json (titles, cameras, captions) is kept; only new
// files get metadata guessed from their filename, and deleted files are dropped.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const FILM_DIR = join(ROOT, "images/film");
const OUT = join(ROOT, "content/photos.json");
const EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".svg"]);

// Reads pixel dimensions from the file header so the gallery can reserve
// space before images load (no layout jump). Returns {} if unknown.
function dimensions(buf, ext) {
  if (ext === ".png") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (ext === ".svg") {
    const m = buf.toString("utf8", 0, 500).match(/viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/);
    return m ? { width: +m[1], height: +m[2] } : {};
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    let i = 2;
    while (i < buf.length) {
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return {};
}

const humanize = (s) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

// Stocks whose names don't split cleanly into "Word 123".
const STOCKS = {
  hp5: "HP5", tmax400: "T-Max 400", tmax100: "T-Max 100", trix400: "Tri-X 400", xp2: "XP2",
  phoenix200: "Harman Phoenix 200", gold200: "Kodak Gold 200",
};

// "portra400" -> "Portra 400", "cinestill800t" -> "Cinestill 800T"
function formatStock(s) {
  if (STOCKS[s]) return STOCKS[s];
  const m = s.match(/^([a-z]+?)(\d+)([a-z]*)$/);
  return m ? `${humanize(m[1])} ${m[2]}${m[3].toUpperCase()}` : humanize(s);
}

// Turns a filename (without extension) into photo metadata. The date is optional.
// "2025-06_portra400_big-sur_01" -> { date: "2025-06", stock: "Portra 400", location: "Big Sur" }
// "portra400_01"                 -> { stock: "Portra 400" }
// Parts that are missing or don't fit the pattern are skipped.
function parseFilename(name) {
  const parts = name.split("_");
  const out = {};
  if (/^\d{4}(-\d{2})?$/.test(parts[0])) out.date = parts.shift();
  const [stock, location] = parts;
  if (stock && !/^\d+$/.test(stock)) out.stock = formatStock(stock);
  if (location && !/^\d+$/.test(location)) out.location = humanize(location);
  return out;
}

const existing = await readFile(OUT, "utf8").then(JSON.parse).catch(() => []);
const byFile = new Map(existing.map((p) => [p.src, p]));

const files = (await readdir(FILM_DIR)).filter((f) => EXTS.has(extname(f).toLowerCase()));
// Small copies for the gallery's contact sheets, made by scripts/prepare-photos.py.
const thumbs = new Set(await readdir(join(FILM_DIR, "thumbs")).catch(() => []));
const photos = await Promise.all(files.map(async (file) => {
  const src = `images/film/${file}`;
  const ext = extname(file).toLowerCase();
  const name = basename(file, extname(file));
  const guessed = parseFilename(name);
  const thumb = thumbs.has(`${name}.jpg`) ? `images/film/thumbs/${name}.jpg` : undefined;
  // Hand edits in photos.json win over anything guessed from the filename.
  return { src, ...guessed, ...byFile.get(src), thumb, ...dimensions(await readFile(join(FILM_DIR, file)), ext) };
}));

photos.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.src.localeCompare(b.src));
await writeFile(OUT, JSON.stringify(photos, null, 2) + "\n");

const added = photos.filter((p) => !byFile.has(p.src)).length;
console.log(`photos.json: ${photos.length} photos (${added} new, ${existing.length + added - photos.length} removed)`);
