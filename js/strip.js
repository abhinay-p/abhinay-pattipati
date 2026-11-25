import { loadPhotos, el } from "./common.js";
import { glide } from "./glide.js";
import { createViewer, where, gear, altText } from "./viewer.js";
import { mixRolls } from "./order.js";
import { placeFrame } from "./layout.js";
import { photoImg, sizesFor, tickColors, tone, whenLoaded } from "./image.js";
import { createDial } from "./dial.js";

const strip = document.getElementById("strip");
const dialRoot = document.getElementById("dial");
const scroller = glide(strip);
let viewer = null;
let dial = null;

/* ---------- Layout ---------- */

function draw(photos) {
  const frames = photos.map((p, i) => {
    const { size, offset, gap } = placeFrame(p, i, photos.length);
    const frame = el("figure", { class: "frame" },
      el("button", { type: "button", onclick: () => viewer.show(i), "aria-label": `View ${altText(p)}` }),
      (where(p) || gear(p)) && el("figcaption", { "aria-hidden": "true" },
        where(p) && el("span", {}, where(p)),
        gear(p) && el("span", {}, gear(p))));
    frame.style.cssText = `--size:${size};--offset:${offset};--gap:${gap};--ar:${p.width / p.height || 1.5};${tone(p)}`;
    return frame;
  });
  strip.replaceChildren(...frames);
  // The photos go in once their frames have a size, so each can ask for the
  // right copy of itself. Until then its colors hold the place.
  const widths = frames.map((f) => f.offsetWidth);
  frames.forEach((frame, i) => {
    const img = photoImg(photos[i], widths[i], { alt: altText(photos[i]), loading: i < 4 ? "eager" : "lazy" });
    whenLoaded(img, () => img.classList.add("loaded"));
    frame.firstElementChild.append(img);
  });
}

// A bigger window may need bigger copies.
let resized = 0;
addEventListener("resize", () => {
  clearTimeout(resized);
  resized = setTimeout(() => {
    const imgs = [...strip.querySelectorAll("img[sizes]")];
    const sizes = imgs.map((img) => sizesFor(img.parentElement.offsetWidth));
    imgs.forEach((img, i) => { if (img.sizes !== sizes[i]) img.sizes = sizes[i]; });
  }, 200);
});

/* ---------- Where each frame stops ---------- */

// The scroll position for each frame. The first frame stops at the left margin,
// the last at the right, and the ones between move evenly from one side to the
// other, so every frame has a stop of its own, the ends included.
let stops = [];
let here = 0; // the frame the strip is at; fractional between two

function measure() {
  const pad = parseFloat(getComputedStyle(strip).paddingLeft);
  const room = strip.clientWidth - pad * 2;
  const start = strip.getBoundingClientRect().left - strip.scrollLeft;
  const frames = [...strip.querySelectorAll(".frame")];
  stops = frames.map((f, i) => {
    const box = f.getBoundingClientRect();
    const along = frames.length > 1 ? i / (frames.length - 1) : 0;
    return Math.max(0, box.left - start - pad - along * (room - box.width));
  });
}

function frameAt(x) {
  let lo = 0, hi = stops.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (stops[mid] <= x) lo = mid; else hi = mid;
  }
  if (hi <= 0) return 0;
  const between = (x - stops[lo]) / (stops[hi] - stops[lo] || 1);
  return lo + Math.max(0, Math.min(1, between));
}

function stopAt(frame) {
  const lo = Math.max(0, Math.min(stops.length - 1, Math.floor(frame)));
  const next = stops[lo + 1] ?? stops[lo];
  return stops[lo] + (next - stops[lo]) * (frame - lo);
}

// Go to a scroll position, taking over from a dial that's still turning, and
// note at once where that leaves the strip: a resize can arrive before the
// browser's own scroll event does.
function moveTo(x) {
  dial?.stop();
  scroller.to(x);
  here = frameAt(strip.scrollLeft);
}

// One frame (or ten) on from wherever the strip is heading.
function stepFrame(by) {
  const goal = Math.max(0, Math.min(stops.length - 1, Math.round(frameAt(scroller.target)) + by));
  moveTo(stops[goal]);
}

document.addEventListener("keydown", (e) => {
  if (viewer?.open || e.defaultPrevented) return; // the viewer and the dial handle their own keys
  if (e.target.closest?.("a, button") && e.key === " ") return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); stepFrame(1); }
  if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); stepFrame(-1); }
  if (e.key === "Home") moveTo(0);
  if (e.key === "End") moveTo(Infinity);
});

/* ---------- Moving fast ---------- */

// Flying past (a spun dial, End) shows each photo's colors and loads nothing
// until it slows down, or one spin would download the whole strip.
const FAST = 9; // px per ms: roughly a dozen photos a second
let lastX = 0, lastT = 0, slowed = 0;

strip.addEventListener("scroll", () => {
  const x = strip.scrollLeft, t = performance.now();
  if (t - lastT < 200 && Math.abs(x - lastX) / Math.max(1, t - lastT) > FAST) {
    strip.classList.add("flying");
    clearTimeout(slowed);
    slowed = setTimeout(() => strip.classList.remove("flying"), 120);
  }
  lastX = x; lastT = t;
  here = frameAt(x);
  dial?.sync(here);
}, { passive: true });

/* ---------- Dial ---------- */

// Wheel and touch on the strip itself take over from a dial that's still turning.
strip.addEventListener("wheel", () => dial?.stop(), { passive: true });
strip.addEventListener("pointerdown", () => dial?.stop());

function addDial(photos) {
  const colors = photos.map(tickColors);
  dial = createDial(dialRoot, {
    count: photos.length,
    colorsOf: (i) => colors[i],
    labelOf: (i) => gear(photos[i]),
    onTurn: (frame) => {
      scroller.jump(stopAt(frame));
      here = frame;
    },
    onStep: (by) => stepFrame(by),
  });
  dialRoot.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return; // pinch-to-zoom
    e.preventDefault();
    moveTo(scroller.target + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY));
  }, { passive: false });
}

// Turning a phone keeps the frame you were on.
addEventListener("resize", () => {
  if (!stops.length) return;
  const frame = here;
  measure();
  scroller.jump(stopAt(frame));
  dial?.sync(frame);
});

/* ---------- Start ---------- */

try {
  // A fresh mix of film stocks on every visit.
  const photos = mixRolls(await loadPhotos());
  draw(photos);
  measure();
  addDial(photos);
  strip.focus({ preventScroll: true });
  // On closing the viewer, bring the strip to the photo you were last looking at.
  viewer = createViewer(photos, {
    // Opens with the copy already on screen, then sharpens.
    preview(i) {
      const img = strip.children[i]?.querySelector("img.loaded");
      return img?.currentSrc;
    },
    onClose(i) {
      if (stops[i] !== undefined) moveTo(stops[i]);
    },
  });
} catch (err) {
  strip.replaceChildren(el("p", { class: "empty" }, `${err.message}. Run npm run photos to generate it.`));
}
