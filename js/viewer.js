// Full-screen photo viewer shared by the strip (photos.html) and the gallery.
// Expects the #viewer dialog markup on the page. Each open photo gets a URL
// named after its file (#portra400_12), so Back closes it and links can be
// shared; names stay valid even though the strip's order changes every visit.
import { closeOnBackdrop, modalHistory, deepLink } from "./common.js";
import { copyFor, tone } from "./image.js";

/* ---------- Labels ---------- */

// "2025-06" -> "June 2025"
function formatDate(date) {
  const [y, m] = (date || "").split("-").map(Number);
  if (!y) return "";
  return m ? new Date(y, m - 1).toLocaleString("en", { month: "long", year: "numeric" }) : String(y);
}
export const where = (p) => [p.location, formatDate(p.date)].filter(Boolean).join(" · ");
export const gear = (p) => [p.camera, p.stock].filter(Boolean).join(" · ");
export const altText = (p) => p.alt || [where(p), gear(p)].filter(Boolean).join(", ") || "Photograph";
// "images/film/portra400_12.jpg" -> "portra400_12"
const photoId = (p) => p.src.split("/").pop().replace(/\.[^.]+$/, "");

/* ---------- Viewer ---------- */

// Returns { show(i), get current, get open }. onClose(i) runs with the index
// of the last photo shown, so the page can bring that photo into view.
// preview(i), if given, is the URL of a copy that's already on screen.
export function createViewer(photos, { onClose, preview } = {}) {
  const viewer = document.getElementById("viewer");
  const img = document.getElementById("v-img");
  const $ = (id) => document.getElementById(id);
  const openViewer = modalHistory(viewer);
  const stage = viewer.querySelector(".stage");
  let current = 0;

  // How wide a photo is drawn (see .stage img in photo.css).
  function drawnWidth(p) {
    const pad = parseFloat(getComputedStyle(stage).paddingLeft) || 0;
    return Math.min(innerWidth - pad * 2, (innerHeight - 170) * (p.width / p.height), p.width);
  }

  function show(i, opts) {
    current = (i + photos.length) % photos.length;
    const p = photos[current];
    // The sharp copy, if it's here already. If not, one that's on screen or small
    // until the sharp one replaces it.
    const sharp = copyFor(p, drawnWidth(p));
    const next = new Image();
    next.src = sharp;
    const quick = next.complete ? sharp : preview?.(current) || p.thumb || sharp;
    next.onload = () => { if (photos[current] === p && quick !== sharp) img.src = sharp; };
    next.onerror = () => { if (photos[current] === p) img.src = p.src; };
    // Until something arrives, its colors: without this the last photo stays up,
    // stretched into this one's shape.
    img.removeAttribute("src");
    img.style.cssText = p.width ? `--ar:${p.width / p.height};--natural:${p.width}px;${tone(p)}` : "";
    img.src = quick;
    img.alt = altText(p);
    $("v-line1").textContent = where(p);
    $("v-line2").textContent = gear(p);
    openViewer(`#${photoId(p)}`, opts);
    if (photos.length > 1) {
      const after = photos[(current + 1) % photos.length];
      new Image().src = copyFor(after, drawnWidth(after));
    }
  }

  $("v-prev").onclick = () => show(current - 1);
  $("v-next").onclick = () => show(current + 1);
  $("v-close").onclick = () => viewer.close();
  closeOnBackdrop(viewer);
  stage.addEventListener("click", (e) => { if (e.target !== img) viewer.close(); });
  viewer.addEventListener("close", () => onClose?.(current));

  document.addEventListener("keydown", (e) => {
    if (!viewer.open) return;
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });

  // Swipe left/right to change photo, swipe down to dismiss.
  let touch = null;
  viewer.addEventListener("touchstart", (e) => { touch = e.touches[0]; }, { passive: true });
  viewer.addEventListener("touchend", (e) => {
    if (!touch) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.clientX, dy = t.clientY - touch.clientY;
    touch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(current + (dx < 0 ? 1 : -1));
    else if (dy > 90) viewer.close();
  });

  // A shared link like page.html#portra400_12 opens that photo straight away.
  const link = deepLink(/^#([\w.-]+)$/);
  const linked = link ? photos.findIndex((p) => photoId(p) === link[1]) : -1;
  if (linked >= 0) show(linked, { fromLink: true });

  return { show, get current() { return current; }, get open() { return viewer.open; } };
}
