// Full-screen photo viewer shared by the strip (index.html) and the gallery.
// Expects the #viewer dialog markup on the page. Each open photo gets a URL
// named after its file (#portra400_12), so Back closes it and links can be
// shared; names stay valid even though the strip's order changes every visit.
import { closeOnBackdrop, modalHistory, deepLink } from "./common.js";

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
export function createViewer(photos, { onClose } = {}) {
  const viewer = document.getElementById("viewer");
  const img = document.getElementById("v-img");
  const $ = (id) => document.getElementById(id);
  const openViewer = modalHistory(viewer);
  let current = 0;

  function show(i, opts) {
    current = (i + photos.length) % photos.length;
    const p = photos[current];
    img.classList.add("loading");
    img.onload = () => img.classList.remove("loading");
    img.src = p.src;
    img.alt = altText(p);
    $("v-line1").textContent = where(p);
    $("v-line2").textContent = gear(p);
    openViewer(`#${photoId(p)}`, opts);
    if (photos.length > 1) new Image().src = photos[(current + 1) % photos.length].src;
  }

  $("v-prev").onclick = () => show(current - 1);
  $("v-next").onclick = () => show(current + 1);
  $("v-close").onclick = () => viewer.close();
  closeOnBackdrop(viewer);
  viewer.querySelector(".stage").addEventListener("click", (e) => { if (e.target !== img) viewer.close(); });
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
