import { loadJSON, el } from "./common.js";
import { glide } from "./glide.js";
import { createViewer, where, gear, altText } from "./viewer.js";
import { mixRolls } from "./order.js";

const strip = document.getElementById("strip");
const scroller = glide(strip);
let viewer = null;

/* ---------- Layout ---------- */

// Decides how one photo sits in the strip, Clint Colbert style: photos at
// different sizes and heights rather than one even line.
//
// Gets the photo ({ width, height, ... } from photos.json), its index i and
// the total count n. Returns fractions of the available height:
//   size   - how tall the photo is (1 = full height)
//   offset - how far down it starts (size + offset should stay <= 1)
//   gap    - space before it, in multiples of the page padding
//
// Three short patterns of different lengths (3, 5, 4) cycle together, so the
// combination only repeats every 60 photos, yet the layout is the same on every
// visit and the arrow keys always land in the same places.
const PORTRAIT_SIZES = [0.92, 0.66, 0.8];   // tall photos can use most of the height
const LANDSCAPE_SIZES = [0.62, 0.8, 0.5];   // wide ones stay smaller so they don't fill the screen
const ANCHORS = [0.5, 0.05, 0.9, 0.35, 1]; // 0 = pinned to the top, 1 = to the bottom
const GAPS = [1, 2.5, 1.25, 1.75];          // the occasional wide gap groups photos into clusters

function placeFrame(photo, i, n) {
  const portrait = photo.height > photo.width;
  const size = (portrait ? PORTRAIT_SIZES : LANDSCAPE_SIZES)[i % 3];
  const offset = (1 - size) * ANCHORS[i % 5]; // keeps size + offset <= 1
  const gap = i === 0 ? 0 : GAPS[i % 4];
  return { size, offset, gap };
}

function draw(photos) {
  strip.replaceChildren(...photos.map((p, i) => {
    const { size, offset, gap } = placeFrame(p, i, photos.length);
    const img = el("img", { src: p.src, alt: altText(p), loading: i < 4 ? "eager" : "lazy", decoding: "async", width: p.width, height: p.height });
    img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
    if (img.complete) img.classList.add("loaded");
    const frame = el("figure", { class: "frame" },
      el("button", { type: "button", onclick: () => viewer.show(i), "aria-label": `View ${altText(p)}` }, img),
      (where(p) || gear(p)) && el("figcaption", { "aria-hidden": "true" },
        where(p) && el("span", {}, where(p)),
        gear(p) && el("span", {}, gear(p))));
    frame.style.cssText = `--size:${size};--offset:${offset};--gap:${gap};--ar:${p.width / p.height || 1.5}`;
    return frame;
  }));
}

/* ---------- Keyboard: step one photo at a time ---------- */

function stepFrame(dir) {
  const pad = parseFloat(getComputedStyle(strip).paddingLeft);
  const starts = [...strip.children].map((f) => f.offsetLeft - pad);
  const at = scroller.target;
  const next = dir > 0 ? starts.find((x) => x > at + 2) : starts.findLast((x) => x < at - 2);
  scroller.to(next ?? (dir > 0 ? Infinity : 0));
}

document.addEventListener("keydown", (e) => {
  if (viewer?.open) return; // the viewer handles its own keys
  if (e.target.closest?.("a, button") && e.key === " ") return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); stepFrame(1); }
  if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); stepFrame(-1); }
  if (e.key === "Home") scroller.to(0);
  if (e.key === "End") scroller.to(Infinity);
});

/* ---------- Start ---------- */

try {
  // A fresh mix of film stocks on every visit.
  const photos = mixRolls(await loadJSON("content/photos.json"));
  draw(photos);
  strip.focus({ preventScroll: true });
  // On closing the viewer, bring the strip to the photo you were last looking at.
  viewer = createViewer(photos, {
    onClose(i) {
      const f = strip.children[i];
      if (f) scroller.to(f.offsetLeft - (strip.clientWidth - f.offsetWidth) / 2);
    },
  });
} catch (err) {
  strip.replaceChildren(el("p", { class: "empty" }, `${err.message}. Run npm run photos to generate it.`));
}
