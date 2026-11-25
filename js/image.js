// Which copy of a photo to load. scripts/prepare-photos.py makes WebP copies of
// every photo, 960px and 1600px on the long edge, beside the 2000px original,
// and the browser picks the smallest that still looks sharp where it's shown.
import { el } from "./common.js";

const LONG_EDGES = [960, 1600];

// Past about 1.6 screen pixels per CSS pixel, extra detail in a grainy scan is
// hard to see while browsing, so a dense phone screen doesn't ask for more.
export const SHARP = 1.6;

const nameOf = (p) => p.src.split("/").pop().replace(/\.[^.]+$/, "");

// Every copy of a photo, smallest first. A photo that has no colors yet was
// just uploaded and hasn't been through prepare-photos.py, so it has no copies.
export function copiesOf(p) {
  const long = Math.max(p.width, p.height);
  const smaller = p.colors ? LONG_EDGES.filter((px) => px < long) : [];
  return [
    ...smaller.map((px) => ({ url: `images/film/web/${px}/${nameOf(p)}.webp`, width: Math.round((p.width * px) / long) })),
    { url: p.src, width: p.width },
  ];
}

// The smallest copy that looks sharp at this width, for code that sets one URL.
export function copyFor(p, cssWidth, maxDensity = Infinity) {
  const need = cssWidth * Math.min(devicePixelRatio, maxDensity);
  return copiesOf(p).find((c) => c.width >= need)?.url ?? p.src;
}

// The same choice for srcset, where the browser multiplies by its own density.
export const sizesFor = (cssWidth) => `${Math.ceil(cssWidth * Math.min(1, SHARP / devicePixelRatio))}px`;

// The photo's own two colors, for CSS to show while it loads.
export const tone = (p) => (p.colors ? `--tone-a:${p.colors[0]};--tone-b:${p.colors[1]};` : "");

// The same two colors for a thin mark on the cream page: mixed with a little of
// its ink (#2b2a27), so a pale photo's tick doesn't vanish.
const INK = [43, 42, 39];
const onCream = (hex) => `rgb(${INK.map((v, k) => Math.round(parseInt(hex.slice(1 + k * 2, 3 + k * 2), 16) * 0.82 + v * 0.18))})`;
export const tickColors = (p) => (p.colors ?? ["#8a8378", "#8a8378"]).map(onCream);

// An <img> for a photo shown cssWidth wide while browsing.
export function photoImg(p, cssWidth, attrs = {}) {
  const copies = copiesOf(p);
  const many = copies.length > 1;
  return el("img", {
    decoding: "async", width: p.width, height: p.height, ...attrs,
    sizes: many && sizesFor(cssWidth),
    srcset: many && copies.map((c) => `${encodeURI(c.url)} ${c.width}w`).join(", "), // a space would end the URL early
    src: p.src,
    // A copy that's missing, or a browser without WebP: use the original.
    onerror: ({ currentTarget: img }) => {
      if (!img.srcset) return;
      img.removeAttribute("sizes");
      img.removeAttribute("srcset");
    },
  });
}

// Runs `done` once a photo has loaded (at once, if it already has).
export function whenLoaded(img, done) {
  if (img.complete && img.naturalWidth) done();
  else img.addEventListener("load", done, { once: true });
}
