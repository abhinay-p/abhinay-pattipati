import { loadJSON, el } from "./common.js";
import { glide } from "./glide.js";
import { createViewer, altText } from "./viewer.js";
import { mixRolls, byStock } from "./order.js";

const gallery = document.getElementById("gallery");
const loupe = document.getElementById("loupe");
const loupeImg = loupe.querySelector("img");
const loupeLabel = loupe.querySelector(".loupe-label");
const canHover = matchMedia("(hover: hover) and (pointer: fine)");
glide(gallery, { axis: "y" });

let all = [];        // every photo, as loaded
let mixed = [];      // one fresh mix of film stocks per visit (the default view)
const photos = [];   // what the sheet shows now; the viewer keeps this same array
let viewer = null;

/* ---------- Contact sheet: every photo on one roll, cut into strips ---------- */

// Frames per strip at each window width.
const wide = matchMedia("(min-width: 1001px)");
const medium = matchMedia("(min-width: 641px)");
const columns = () => (wide.matches ? 6 : medium.matches ? 4 : 3);

// Strips sit slightly askew, as if laid on the paper by hand: a small random
// tilt and sideways shift, new on every visit (and every re-sort).
const between = (lo, hi) => lo + Math.random() * (hi - lo);

function draw() {
  const cols = columns();
  const strips = [];
  for (let s = 0; s < photos.length; s += cols) strips.push(photos.slice(s, s + cols).map((p, k) => [p, s + k]));
  gallery.replaceChildren(
    el("section", { class: "roll", "aria-label": `${photos.length} frames` },
      el("div", { class: "sheet" }, strips.map((strip) => {
        const ol = el("ol", { class: "filmstrip", start: strip[0][1] + 1 }, strip.map(([p, i]) => {
          p.frame = i + 1;
          return el("li", { class: "cell" },
            // Vertical shots lie sideways on the strip, like on a real contact sheet.
            el("button", { type: "button", class: p.height > p.width ? "neg portrait" : "neg", "data-i": i, onclick: () => open(i), "aria-label": `View ${altText(p)}, frame ${i + 1}` },
              el("img", { src: p.thumb || p.src, alt: "", loading: i < 12 ? "eager" : "lazy", decoding: "async" })),
            el("span", { class: "num", "aria-hidden": "true" }, String(i + 1)));
        }));
        const shift = Math.min(10, innerWidth * 0.012);
        ol.style.cssText = `--cols:${cols};--tilt:${between(-0.45, 0.45).toFixed(2)}deg;--shift:${between(-shift, shift).toFixed(1)}px`;
        return ol;
      }))));
}
// Re-cut the strips when the window crosses a column breakpoint.
wide.addEventListener("change", () => draw());
medium.addEventListener("change", () => draw());

function open(i) {
  hideLoupe();
  viewer.show(i);
}

/* ---------- Loupe: a bigger preview that follows the pointer ---------- */

let shown = -1;

function showLoupe(i) {
  const p = photos[i];
  shown = i;
  // Fit the photo's own shape inside about half the window.
  const ar = p.width / p.height || 1.5;
  const maxW = Math.min(innerWidth * 0.52, 820), maxH = innerHeight * 0.7;
  const w = Math.min(maxW, maxH * ar);
  loupeImg.style.width = `${w}px`;
  loupeImg.style.height = `${w / ar}px`;
  loupeImg.src = p.thumb || p.src; // instant, then sharpen with the full photo
  const full = new Image();
  full.onload = () => { if (shown === i) loupeImg.src = p.src; };
  full.src = p.src;
  loupeLabel.textContent = [p.stock, `Frame ${p.frame}`].filter(Boolean).join(" · ");
  loupe.classList.add("on");
}

function placeLoupe(x, y) {
  const r = loupe.getBoundingClientRect();
  const gap = 28, edge = 16;
  let left = x + gap;
  if (left + r.width > innerWidth - edge) left = x - gap - r.width; // flip to the other side
  const top = Math.max(edge, Math.min(innerHeight - r.height - edge, y - r.height / 2));
  loupe.style.transform = `translate(${Math.max(edge, left)}px, ${top}px)`;
}

function hideLoupe() {
  shown = -1;
  loupe.classList.remove("on");
}

gallery.addEventListener("pointermove", (e) => {
  if (!canHover.matches || e.pointerType !== "mouse") return;
  const neg = e.target.closest(".neg");
  if (!neg) return hideLoupe();
  const i = +neg.dataset.i;
  if (i !== shown) showLoupe(i);
  placeLoupe(e.clientX, e.clientY);
});
gallery.addEventListener("pointerleave", hideLoupe);
gallery.addEventListener("scroll", hideLoupe, { passive: true }); // reappears on the next move

// Keyboard users get the same preview next to the focused frame.
gallery.addEventListener("focusin", (e) => {
  const neg = e.target.closest(".neg");
  if (!neg || !canHover.matches || viewer?.open) return;
  showLoupe(+neg.dataset.i);
  const r = neg.getBoundingClientRect();
  placeLoupe(r.right, r.top + r.height / 2);
});
gallery.addEventListener("focusout", hideLoupe);

/* ---------- Toolbar: order and filter by film stock, only when asked ---------- */

const filter = document.getElementById("filter");
const current = document.getElementById("filter-current");
const inner = document.getElementById("filter-inner");
const keyOf = (v) => (v.stock ? `stock:${v.stock}` : v.order);
let view = { order: "mixed", stock: null };

function apply(next) {
  view = next;
  const list = view.stock ? byStock(all).filter((p) => p.stock === view.stock)
    : view.order === "stock" ? byStock(all) : mixed;
  photos.splice(0, photos.length, ...list); // in place, so the viewer follows along
  hideLoupe();
  draw();
  gallery.scrollTop = 0;
  current.textContent = view.stock ? `${view.stock} · ${list.length}` : `All · ${view.order === "stock" ? "by stock" : "mixed"}`;
  for (const b of inner.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.key === keyOf(view)));
}

function setOpen(open) {
  filter.classList.toggle("open", open);
  current.setAttribute("aria-expanded", String(open));
}

function buildFilter() {
  const option = (label, v) => el("button", {
    type: "button", "data-key": keyOf(v), "aria-pressed": String(keyOf(v) === keyOf(view)),
    onclick: (e) => {
      apply(v);
      setOpen(false);
      if (e.detail) e.currentTarget.blur(); // mouse/tap: let the toolbar shrink back
    },
  }, label);
  const stocks = [...new Set(all.map((p) => p.stock).filter(Boolean))].sort();
  inner.replaceChildren(
    el("div", { class: "filter-group", role: "group", "aria-label": "Order" },
      option("Mixed", { order: "mixed", stock: null }), option("By stock", { order: "stock", stock: null })),
    el("div", { class: "filter-group", role: "group", "aria-label": "Only one film stock" },
      stocks.map((s) => option(s, { order: "stock", stock: s }))));
}

// Hover opens it with CSS; a tap (touch screens) or Enter toggles it here.
current.addEventListener("click", () => setOpen(!filter.classList.contains("open")));
document.addEventListener("click", (e) => { if (!filter.contains(e.target)) setOpen(false); });
filter.addEventListener("keydown", (e) => { if (e.key === "Escape") { setOpen(false); current.focus(); } });

/* ---------- Start ---------- */

try {
  all = await loadJSON("content/photos.json");
  mixed = mixRolls(all);
  photos.push(...mixed);
  draw();
  buildFilter();
  // After closing the viewer, return focus to the frame you were last on.
  viewer = createViewer(photos, {
    onClose(i) {
      const neg = gallery.querySelector(`.neg[data-i="${i}"]`);
      neg?.scrollIntoView({ block: "nearest" });
      neg?.focus({ preventScroll: true });
      hideLoupe();
    },
  });
} catch (err) {
  gallery.replaceChildren(el("p", { class: "empty" }, `${err.message}. Run npm run photos to generate it.`));
}
