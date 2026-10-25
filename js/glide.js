// Gliding scroll for a scroll container. With axis "x" (the strip), up/down
// wheel input moves the page sideways; with axis "y" (the gallery), the wheel
// scrolls down the page as usual, just smoothly. Sideways trackpad swipes and
// touch drags are left to the browser, which already scrolls those smoothly.
// Returns { to(pos), target } for keyboard steps.
//
// The page rides a spring (motion.js) towards a target that the wheel and keys
// move. Each wheel turn retargets the spring mid-flight, so the page keeps its
// speed and coasts a little after the wheel stops, and a reversed key press
// turns it round instead of snapping back. The ends stay hard stops: faking a
// bounce on page scroll would fight the browser's own.
import { createSpring } from "./motion.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

// A 0.5s response trails a steady wheel by the same ~160ms the earlier eased
// glide did, so ordinary scrolling feels the same; starting, stopping and
// turning round are what change.
export function glide(scroller, { axis = "x", response = 0.5 } = {}) {
  const X = axis === "x";
  const get = () => (X ? scroller.scrollLeft : scroller.scrollTop);
  const set = (v) => { if (X) scroller.scrollLeft = v; else scroller.scrollTop = v; };
  const max = () => (X ? scroller.scrollWidth - scroller.clientWidth : scroller.scrollHeight - scroller.clientHeight);
  const page = () => (X ? scroller.clientWidth : scroller.clientHeight);
  const clamp = (v) => Math.max(0, Math.min(max(), v));

  let target = get();
  // The spring keeps the exact position, because the browser rounds scroll
  // positions to whole pixels: reading it back each frame would stall the glide
  // just short of target.
  const spring = createSpring(target, set, { response });

  function to(v) {
    target = clamp(v);
    if (reduceMotion.matches) { spring.set(target); return; }
    // From rest, start from wherever the page is now; it may have been scrolled natively.
    if (!spring.moving) spring.set(get());
    spring.to(target);
  }

  scroller.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return; // pinch-to-zoom
    // Mostly-sideways input (trackpad swipe, shift+wheel) scrolls natively.
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) {
      spring.stop();
      return;
    }
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? page() : 1;
    // Start from wherever the page is now if no glide is running.
    if (!spring.moving) target = get();
    to(target + e.deltaY * unit);
  }, { passive: false });

  // Native scrolling (swipes, the scrollbar, keyboard) moves the page without us; keep up.
  scroller.addEventListener("scroll", () => { if (!spring.moving) target = get(); }, { passive: true });
  addEventListener("resize", () => {
    target = clamp(target);
    if (spring.moving) spring.to(target);
  });

  return { to, get target() { return target; } };
}
