// The light table: photos you can drag, throw, stack and turn. The arrangement
// lives in the page's link, so sharing the link shares the table. Everything a
// pointer can do here has a key.
import { loadPhotos, el } from "./common.js";
import { createSpring, createTracker, rubberBanded, reduceMotion } from "./motion.js";
import { createViewer, altText } from "./viewer.js";
import { shuffle } from "./order.js";
import { copyFor, SHARP, tone } from "./image.js";
import { fromHash, nameOf, write, FULL } from "./placing.js";
import { ambient } from "./ambient.js";

const table = document.getElementById("table");
const said = document.getElementById("said");
const EDGE = 36;     // px; the middle of a photo stays this far inside the table
const THROW = 0.22;  // a thrown photo carries on for about this many seconds of its speed
const CLICK = 5;     // px; less movement than this is a click

let all = [];        // every photo on the site
let prints = [];     // the photos on the table
let top = 0;         // the highest in the pile
let viewer = null;
const shown = [];    // the same photos in the same order, for the viewer

const room = () => ({ w: table.clientWidth, h: table.clientHeight });
const longSide = () => { const { w, h } = room(); return Math.max(116, Math.min(300, Math.sqrt(w * h) * 0.24)); };
const inside = (v, size) => Math.max(EDGE, Math.min(size - EDGE, v));

/* ---------- One photo on the table ---------- */

function paint(t) {
  t.node.style.transform = `translate(${t.x - t.w / 2}px, ${t.y - t.h / 2}px) rotate(${t.tilt}deg)`;
}

function size(t) {
  const long = longSide(), ar = t.photo.width / t.photo.height || 1.5;
  t.w = ar >= 1 ? long : long * ar;
  t.h = ar >= 1 ? long / ar : long;
  t.node.style.width = `${t.w}px`;
  t.node.style.height = `${t.h}px`;
}

function addPrint(photo) {
  const label = `${altText(photo)}, ${nameOf(photo)}`;
  const img = el("img", { alt: "", draggable: "false", decoding: "async" });
  const node = el("button", { type: "button", class: "print", "aria-label": label, "aria-describedby": "how" }, img);
  node.style.cssText = tone(photo);
  const t = { photo, label, node, x: 0, y: 0, tilt: 0, z: ++top };
  const spring = (key, response = 0.5) => createSpring(0, (v) => { t[key] = v; paint(t); }, { response });
  t.springs = { x: spring("x"), y: spring("y"), tilt: spring("tilt", 0.4) };
  size(t);
  // The contact sheet's thumbnail is enough for a small photo on a phone.
  const url = t.w * Math.min(devicePixelRatio, SHARP) <= (photo.width >= photo.height ? 480 : 320) ? photo.thumb : copyFor(photo, t.w, SHARP);
  img.src = url || photo.src;
  img.onerror = () => { if (!img.src.endsWith(photo.src)) img.src = photo.src; };
  node.style.zIndex = t.z;
  holdable(t);
  table.append(node);
  prints.push(t);
  shown.push(photo);
  return t;
}

// Head for a place, carrying any speed the hand let go with.
function go(t, to, speed = {}) {
  for (const key of ["x", "y", "tilt"]) {
    if (to[key] === undefined) continue;
    const s = t.springs[key];
    if (reduceMotion.matches) s.set(to[key]);
    else {
      if (!s.moving) s.set(t[key]);
      s.to(to[key], speed[key]);
    }
  }
  save();
}

// Where it's heading, which is where the link should say it is.
const heading = (t, key) => (t.springs[key].moving ? t.springs[key].target : t[key]);

// The page takes on the colors of the photo on top of the pile.
const tint = () => ambient(prints.reduce((a, b) => (b.z > a.z ? b : a), prints[0])?.photo);

function lift(t) {
  if (t.z === top) return;
  t.z = ++top;
  t.node.style.zIndex = t.z;
  tint();
  save();
}

function remove(t) {
  const i = prints.indexOf(t);
  for (const s of Object.values(t.springs)) s.stop();
  prints.splice(i, 1);
  shown.splice(i, 1);
  t.node.remove();
  tint();
  (prints[i] ?? prints[i - 1])?.node.focus();
  if (!prints.length) document.getElementById("deal").focus();
  say(`${t.label} taken off the table`);
  save();
}

/* ---------- By hand ---------- */

function holdable(t) {
  const { node } = t;
  let hold = null;

  node.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    node.setPointerCapture(e.pointerId);
    for (const s of [t.springs.x, t.springs.y]) s.stop();
    const onTop = prints.every((p) => p.z <= t.z);
    lift(t);
    node.classList.add("held");
    hold = { id: e.pointerId, dx: t.x - e.clientX, dy: t.y - e.clientY, fromX: e.clientX, fromY: e.clientY, moved: 0, onTop,
      tx: createTracker(e.clientX, e.timeStamp), ty: createTracker(e.clientY, e.timeStamp) };
  });

  node.addEventListener("pointermove", (e) => {
    if (e.pointerId !== hold?.id) return;
    hold.moved = Math.max(hold.moved, Math.hypot(e.clientX - hold.fromX, e.clientY - hold.fromY));
    hold.tx.add(e.clientX, e.timeStamp); hold.ty.add(e.clientY, e.timeStamp);
    if (hold.moved < CLICK) return;
    // Pulled off the table, it gives like a rubber band.
    const { w, h } = room();
    t.x = rubberBanded(e.clientX + hold.dx, EDGE, w - EDGE, t.w);
    t.y = rubberBanded(e.clientY + hold.dy, EDGE, h - EDGE, t.h);
    paint(t);
  });

  const release = (e) => {
    if (e.pointerId !== hold?.id) return;
    const { moved, onTop, tx, ty } = hold;
    hold = null;
    node.classList.remove("held");
    if (moved < CLICK) {
      // A finger has no double-click: tapping the photo on top opens it.
      if (onTop && e.type === "pointerup" && e.pointerType !== "mouse") open(t);
      return save();
    }
    const { w, h } = room();
    const vx = reduceMotion.matches ? 0 : tx.velocity(e.timeStamp), vy = reduceMotion.matches ? 0 : ty.velocity(e.timeStamp);
    go(t, { x: inside(t.x + vx * THROW, w), y: inside(t.y + vy * THROW, h) }, { x: vx, y: vy });
  };
  node.addEventListener("pointerup", release);
  node.addEventListener("pointercancel", release);

  // Double-click, or Enter or Space (a click without a pointer), opens it too.
  node.addEventListener("dblclick", () => open(t));
  node.addEventListener("click", (e) => { if (e.detail === 0) open(t); });
  node.addEventListener("keydown", (e) => key(e, t));
}

const open = (t) => viewer.show(prints.indexOf(t));

/* ---------- By keyboard ---------- */

const MOVES = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function key(e, t) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const { w, h } = room();
  if (MOVES[e.key]) {
    const step = e.shiftKey ? 80 : 16, [dx, dy] = MOVES[e.key];
    const x = inside(heading(t, "x") + dx * step, w), y = inside(heading(t, "y") + dy * step, h);
    go(t, { x, y });
    say(`${Math.round((x / w) * 100)}% across, ${Math.round((y / h) * 100)}% down`);
  } else if (e.key === "[" || e.key === "]") {
    const tilt = heading(t, "tilt") + (e.key === "]" ? 5 : -5);
    go(t, { tilt });
    say(`Turned to ${Math.round(tilt)} degrees`);
  } else if (e.key === "PageUp") {
    lift(t);
    say("On top of the pile");
  } else if (e.key === "PageDown") {
    t.z = Math.min(...prints.map((p) => p.z)) - 1;
    t.node.style.zIndex = t.z;
    say("Under the pile");
    tint();
    save();
  } else if (e.key === "Delete" || e.key === "Backspace") {
    remove(t);
  } else return;
  e.preventDefault();
}

/* ---------- Placing ---------- */

// Even places for n photos, loosely scattered or squared up.
function places(n, loose) {
  const { w, h } = room();
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * w) / h)))), rows = Math.ceil(n / cols);
  const between = (lo, hi) => lo + Math.random() * (hi - lo);
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / cols), inRow = row === rows - 1 ? n - row * cols : cols;
    const x = ((i % cols) + 0.5 + (loose ? between(-0.24, 0.24) : 0)) / inRow;
    const y = (row + 0.5 + (loose ? between(-0.2, 0.2) : 0)) / rows;
    return { x: inside(x * w, w), y: inside(y * h, h), tilt: loose ? between(-7, 7) : 0 };
  });
}

function lay(wanted) {
  for (const t of [...prints]) { for (const s of Object.values(t.springs)) s.stop(); t.node.remove(); }
  prints = []; shown.length = 0; top = 0;
  const byName = new Map(all.map((p) => [nameOf(p), p]));
  const { w, h } = room();
  const list = wanted.filter((o) => byName.has(o.name));
  const free = places(list.filter((o) => o.x === undefined).length, true);
  for (const o of list) {
    const t = addPrint(byName.get(o.name));
    const place = o.x === undefined ? free.shift() : { x: inside((o.x / 1000) * w, w), y: inside((o.y / 1000) * h, h), tilt: o.tilt };
    // Newly dealt photos slide in from the near edge; a shared table is just there.
    if (o.x === undefined) Object.assign(t, { x: w / 2, y: h + t.h, tilt: 0 });
    else Object.assign(t, place);
    for (const k of ["x", "y", "tilt"]) t.springs[k].set(t[k]);
    paint(t);
    if (o.x === undefined) go(t, place);
  }
  tint();
  save();
}

function deal() {
  const hand = matchMedia("(max-width: 640px)").matches ? 5 : 8;
  lay(shuffle([...all]).slice(0, hand).map((p) => ({ name: nameOf(p) })));
  say("New photos on the table");
}

function tidy() {
  const order = [...prints].sort((a, b) => a.z - b.z), to = places(order.length, false);
  order.forEach((t, i) => go(t, to[i]));
  say("Squared up");
}

/* ---------- The link ---------- */

const arrangement = () => {
  const { w, h } = room();
  return write([...prints].sort((a, b) => a.z - b.z).map((t) => ({
    name: nameOf(t.photo), x: (heading(t, "x") / w) * 1000, y: (heading(t, "y") / h) * 1000, tilt: heading(t, "tilt") })));
};

let saving = 0;
function save() {
  clearTimeout(saving);
  saving = setTimeout(saveNow, 250);
}
function saveNow() {
  clearTimeout(saving);
  if (viewer?.open) return; // the link is the open photo's for now
  history.replaceState(history.state, "", `#t=${arrangement()}`);
  document.getElementById("add").href = `gallery.html#pick=${arrangement()}`;
}

let quiet = 0;
function say(text) {
  said.textContent = text;
  clearTimeout(quiet);
  quiet = setTimeout(() => { said.textContent = ""; }, 4000);
}

document.getElementById("deal").onclick = deal;
document.getElementById("tidy").onclick = tidy;
document.getElementById("copy").onclick = async () => {
  saveNow();
  const ok = await navigator.clipboard?.writeText(location.href).then(() => true, () => false);
  say(ok ? "Link copied" : "Copy the link from the address bar");
};

// A resized table keeps every photo in the same part of it.
let was = null;
addEventListener("resize", () => {
  if (!was) return;
  const { w, h } = room();
  for (const t of prints) {
    const x = inside((heading(t, "x") / was.w) * w, w), y = inside((heading(t, "y") / was.h) * h, h);
    size(t);
    t.springs.x.set(x); t.springs.y.set(y);
  }
  was = { w, h };
});

/* ---------- Start ---------- */

try {
  all = await loadPhotos();
  was = room();
  viewer = createViewer(shown, { onClose: (i) => { prints[i]?.node.focus({ preventScroll: true }); save(); } });
  const asked = fromHash("t")?.filter((o) => all.some((p) => nameOf(p) === o.name));
  if (asked?.length) lay(asked); else deal();
  // The same tab can be given another table's link.
  addEventListener("hashchange", () => { const next = fromHash("t"); if (next && write(next) !== arrangement()) lay(next); });
} catch (err) {
  table.replaceChildren(el("p", { class: "empty" }, `${err.message}. Run npm run photos to generate it.`));
}
