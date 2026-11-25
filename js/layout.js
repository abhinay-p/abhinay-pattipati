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

export function placeFrame(photo, i, n) {
  const portrait = photo.height > photo.width;
  const size = (portrait ? PORTRAIT_SIZES : LANDSCAPE_SIZES)[i % 3];
  const offset = (1 - size) * ANCHORS[i % 5]; // keeps size + offset <= 1
  const gap = i === 0 ? 0 : GAPS[i % 4];
  return { size, offset, gap };
}
