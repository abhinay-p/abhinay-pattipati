// Eased "glide" scrolling for a scroll container. With axis "x" (the strip),
// up/down wheel input moves the page sideways; with axis "y" (the gallery),
// the wheel scrolls down the page as usual, just smoothly. Sideways trackpad
// swipes and touch drags are left to the browser, which already scrolls those
// smoothly. Returns { to(pos), target } for keyboard steps.
//
// The page chases a target position: each frame it closes a fixed share of the
// remaining distance, so it starts fast and settles gently, like momentum.
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

export function glide(scroller, { axis = "x", ease = 0.1 } = {}) {
  const X = axis === "x";
  const get = () => (X ? scroller.scrollLeft : scroller.scrollTop);
  const set = (v) => { if (X) scroller.scrollLeft = v; else scroller.scrollTop = v; };
  const max = () => (X ? scroller.scrollWidth - scroller.clientWidth : scroller.scrollHeight - scroller.clientHeight);
  const page = () => (X ? scroller.clientWidth : scroller.clientHeight);
  const clamp = (v) => Math.max(0, Math.min(max(), v));

  let target = get();
  // Exact position, kept here because the browser rounds scroll positions to
  // whole pixels: reading it back each frame would stall the glide just short of target.
  let pos = target;
  let frame = 0;
  let last = 0;

  function step(now) {
    // Scale the easing by the real time between frames, so a 120Hz screen
    // glides at the same speed as a 60Hz one.
    const dt = last ? Math.min(now - last, 64) : 16.7;
    last = now;
    const k = 1 - Math.pow(1 - ease, dt / 16.7);
    pos += (target - pos) * k;
    set(pos);
    if (Math.abs(target - pos) < 0.5) {
      set(target);
      frame = 0;
      last = 0;
    } else {
      frame = requestAnimationFrame(step);
    }
  }

  function to(v) {
    target = clamp(v);
    if (reduceMotion.matches) { set(pos = target); return; }
    if (!frame) { pos = get(); frame = requestAnimationFrame(step); }
  }

  scroller.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return; // pinch-to-zoom
    // Mostly-sideways input (trackpad swipe, shift+wheel) scrolls natively.
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      return;
    }
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? page() : 1;
    // Start from wherever the page is now if no glide is running.
    if (!frame) target = get();
    to(target + e.deltaY * unit);
  }, { passive: false });

  // Native scrolling (swipes, the scrollbar, keyboard) moves the page without us; keep up.
  scroller.addEventListener("scroll", () => { if (!frame) target = get(); }, { passive: true });
  addEventListener("resize", () => { target = clamp(target); });

  return { to, get target() { return target; } };
}
