// A camera-style dial for a long strip of photos: a ring with one tick per
// frame, in that photo's own colors, turning under a fixed needle. Drag or
// swipe it, flick it, tap a tick, or focus it and use the arrow keys.
//
// The page owns the strip. It tells the dial where the strip is (sync), and the
// dial tells the page where to go: onTurn(index) many times while the ring is
// turned by hand, onStep(by) once for a key press. Indexes are fractional while
// turning: 4.5 is halfway between the fifth frame and the sixth.
import { createSpring, rubberBanded, createTracker, reduceMotion } from "./motion.js";
import { el } from "./common.js";

const SPACING = 9;   // px between ticks at the needle
const GLIDE = 0.4;   // a flick carries on for about this many seconds of its speed
const TAP = 5;       // px; less movement than this is a tap

export function createDial(root, { count, colorsOf, labelOf, onTurn, onStep }) {
  const canvas = el("canvas", { class: "dial-ring", "aria-hidden": "true" });
  const readout = el("div", { class: "dial-readout", "aria-hidden": "true" });
  root.replaceChildren(readout, canvas, el("div", { class: "dial-needle", "aria-hidden": "true" }));
  root.setAttribute("aria-valuemin", "1");
  root.setAttribute("aria-valuemax", String(count));

  const last = count - 1;
  const clamp = (v) => Math.max(0, Math.min(last, v));
  const ctx = canvas.getContext("2d");
  let at = 0;          // where the ring is; past either end only while it's being pulled there
  let shown = -1;      // frame in the readout
  let width = 0, height = 0, faint = "";

  /* ---------- Drawing ---------- */

  function resize() {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio, 2);
    width = box.width; height = box.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    faint = getComputedStyle(root).getPropertyValue("--ink-2");
    draw();
  }

  // The ring is seen edge-on, like a lens barrel: ticks crowd together and fade
  // as they turn away from you.
  function draw() {
    tell();
    if (!width) return;
    const radius = width / 2, step = SPACING / radius;
    const reach = Math.PI / 2 / step;
    ctx.clearRect(0, 0, width, height);
    ctx.font = "10px Karla, system-ui, sans-serif";
    ctx.textAlign = "center";
    const from = Math.max(0, Math.ceil(at - reach)), to = Math.min(last, Math.floor(at + reach));
    for (let i = from; i <= to; i++) {
      const angle = (i - at) * step;
      const facing = Math.cos(angle);
      const x = radius + radius * Math.sin(angle), n = i + 1;
      const tall = n % 10 === 0 ? 20 : n % 5 === 0 ? 16 : 12;
      const wide = 0.8 + 2.2 * facing;
      const [top, bottom] = colorsOf(i);
      ctx.globalAlpha = 0.2 + 0.8 * facing;
      ctx.fillStyle = top;
      ctx.fillRect(x - wide / 2, 0, wide, tall / 2);
      ctx.fillStyle = bottom;
      ctx.fillRect(x - wide / 2, tall / 2, wide, tall / 2);
      if (n % 10 === 0 && facing > 0.35) {
        ctx.fillStyle = faint;
        ctx.fillText(String(n), x, height - 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // The readout and the screen-reader value change only when the frame does.
  function tell() {
    const i = Math.round(clamp(at));
    if (i === shown) return;
    shown = i;
    const label = labelOf(i);
    readout.replaceChildren(el("span", { class: "dial-frame" }, `Frame ${i + 1}`), label ? ` · ${label}` : "");
    root.setAttribute("aria-valuenow", String(i + 1));
    root.setAttribute("aria-valuetext", [`Frame ${i + 1}`, label].filter(Boolean).join(", "));
  }

  /* ---------- Turning by hand ---------- */

  function turn(v) {
    at = v;
    draw();
    onTurn(clamp(v));
  }
  const spring = createSpring(0, turn, { response: 0.6, precision: 0.002 });

  // Head for a frame at the speed the hand let go.
  function settle(index, speed = 0) {
    const goal = clamp(Math.round(index));
    if (reduceMotion.matches) return spring.set(goal);
    spring.set(at);
    spring.to(goal, speed);
  }

  let drag = null;

  root.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    spring.stop();
    root.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, from: at, moved: 0, tracker: createTracker(e.clientX, e.timeStamp) };
    root.classList.add("turning");
  });

  root.addEventListener("pointermove", (e) => {
    if (e.pointerId !== drag?.id) return;
    drag.moved = Math.max(drag.moved, Math.abs(e.clientX - drag.x));
    drag.tracker.add(e.clientX, e.timeStamp);
    if (drag.moved < TAP) return;
    // Past the first or last frame the ring gives like a rubber band.
    turn(rubberBanded(drag.from - (e.clientX - drag.x) / SPACING, 0, last, width / 2 / SPACING));
  });

  function release(e) {
    if (e.pointerId !== drag?.id) return;
    const { moved, tracker } = drag;
    drag = null;
    root.classList.remove("turning");
    if (e.type === "pointercancel") return settle(at);
    if (moved < TAP) {
      // A tap goes to the tick under the finger.
      const radius = width / 2, off = (e.clientX - canvas.getBoundingClientRect().left - radius) / radius;
      return settle(at + (Math.asin(Math.max(-1, Math.min(1, off))) * radius) / SPACING);
    }
    const speed = -tracker.velocity(e.timeStamp) / SPACING; // frames per second
    settle(at + speed * GLIDE, speed);
  }
  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);

  /* ---------- Keys ---------- */

  const STEPS = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10, Home: -Infinity, End: Infinity };

  root.addEventListener("keydown", (e) => {
    const by = STEPS[e.key];
    if (by === undefined || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault(); // also tells the page's own arrow keys to leave this one alone
    spring.stop();
    onStep(by);
  });

  addEventListener("resize", resize);
  resize();

  return {
    // The strip moved some other way; follow it, unless the dial is what moved it.
    sync(index) {
      if (drag || spring.moving || Math.abs(index - at) < 0.001) return;
      at = index;
      draw();
    },
    // Someone took hold of the strip itself.
    stop() { if (!drag) spring.stop(); },
  };
}
