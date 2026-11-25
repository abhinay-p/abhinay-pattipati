// The Design page's demos. Each runs the code the rest of the site runs.
import { loadPhotos, el } from "./common.js";
import { glide } from "./glide.js";
import { createSpring, reduceMotion } from "./motion.js";
import { createDial } from "./dial.js";
import { mixRolls, shuffle } from "./order.js";
import { copyFor, tickColors, tone, SHARP } from "./image.js";

const $ = (id) => document.getElementById(id);
glide($("design"), { axis: "y" });
// So the arrow keys, Page Down and the space bar scroll it from the start. A
// link to one section keeps its own place.
if (!location.hash) $("design").focus({ preventScroll: true });

/* ---------- Photos arrive as their own colors ---------- */

function loadingDemo(photos) {
  // A sunset or a street says more than a dark room: the most colorful of the wide ones.
  const spread = (hex) => {
    const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
    return Math.max(...c) - Math.min(...c);
  };
  const wide = photos.filter((p) => p.colors && p.width > p.height);
  const best = wide.reduce((a, b) => (spread(b.colors[0]) + spread(b.colors[1]) > spread(a.colors[0]) + spread(a.colors[1]) ? b : a));
  const boxes = [...document.querySelectorAll(".arrival")];
  const src = copyFor(best, 210, SHARP);
  for (const box of boxes) {
    box.style.cssText = tone(best);
    box.replaceChildren(el("img", { alt: "", src }));
  }
  let timer = 0;
  const again = () => {
    clearTimeout(timer);
    for (const box of boxes) box.firstChild.classList.remove("loaded");
    timer = setTimeout(() => boxes.forEach((box) => box.firstChild.classList.add("loaded")), 1500);
  };
  $("loading-again").onclick = again;
  // Once on its own, when it first comes into view.
  new IntersectionObserver((seen, watcher) => {
    if (seen.some((s) => s.isIntersecting)) { watcher.disconnect(); again(); }
  }, { threshold: 0.5 }).observe($("loading-demo"));
}

/* ---------- A dial for the whole strip ---------- */

function dialDemo(photos) {
  const img = $("dial-photo").firstElementChild;
  const colors = photos.map(tickColors);
  let at = 0, settled = 0;
  const show = (frame) => {
    at = frame;
    const p = photos[Math.round(frame)];
    // Its colors at once; the photo itself when the dial pauses on it.
    img.style.cssText = `${tone(p)}aspect-ratio:${p.width / p.height};${p.width > p.height ? "width:390px" : "height:260px"}`;
    if (img.dataset.src !== p.thumb) img.removeAttribute("src");
    clearTimeout(settled);
    settled = setTimeout(() => { img.dataset.src = img.src = p.thumb || p.src; }, 120);
  };
  const dial = createDial($("dial-live"), {
    count: photos.length,
    colorsOf: (i) => colors[i],
    labelOf: (i) => photos[i].stock,
    onTurn: show,
    onStep: (by) => {
      show(Math.max(0, Math.min(photos.length - 1, Math.round(at) + by)));
      dial.sync(at);
    },
  });
  show(0);
}

/* ---------- Shuffled, but never the same film twice in a row ---------- */

// "Kodak Gold 200" -> "Go2", "Fuji 400" -> "Fu4", "Foma 400" -> "Fo4"
const short = (stock) => stock.replace(/^(Kodak|Harman) /, "").replace(/^(\w\w)\D*(\d?).*$/, "$1$2");
const again = (list, i) => i > 0 && list[i].stock === list[i - 1].stock;

function shuffleDemo(photos) {
  const draw = (list, cards, count) => {
    $(cards).replaceChildren(...list.slice(0, 40).map((p, i) =>
      el("span", { class: again(list, i) ? "card again" : "card", title: p.stock }, short(p.stock))));
    const repeats = list.filter((p, i) => again(list, i)).length;
    $(count).textContent = `${repeats} back-to-back repeats`;
  };
  const deal = () => {
    draw(shuffle([...photos]), "deal-plain", "count-plain");
    draw(mixRolls(photos), "deal-site", "count-site");
  };
  $("shuffle-again").onclick = deal;
  deal();
}

/* ---------- Springs, not timers ---------- */

function motionDemo() {
  const timed = $("runner-timed"), sprung = $("runner-spring");
  const room = () => timed.parentElement.clientWidth - 64 - timed.offsetWidth;
  const spring = createSpring(0, (v) => { sprung.style.transform = `translateX(${v * room()}px)`; }, { response: 0.5, precision: 0.001 });
  let side = 0;
  if (reduceMotion.matches) $("motion-note").textContent = "Your system asks for less motion, so both jump straight to the end.";
  $("motion-go").onclick = () => {
    side = 1 - side;
    timed.style.transform = `translateX(${side * room()}px)`;
    if (reduceMotion.matches) spring.set(side); else spring.to(side);
  };
}

/* ---------- Contact ---------- */

$("copy-email").onclick = async () => {
  const email = document.querySelector('a[href^="mailto:"]').textContent;
  const copied = await navigator.clipboard?.writeText(email).then(() => true, () => false);
  $("copied").textContent = copied ? "Copied" : "Couldn't copy; select it instead";
  setTimeout(() => { $("copied").textContent = ""; }, 4000);
};

/* ---------- Start ---------- */

motionDemo();
try {
  const photos = await loadPhotos();
  const mixed = mixRolls(photos);
  loadingDemo(photos);
  dialDemo(mixed);
  shuffleDemo(photos);
} catch {
  // Without the photos the writing still stands; take away the demos that need them.
  for (const id of ["loading-demo", "dial-demo", "shuffle-demo"]) $(id).remove();
}
