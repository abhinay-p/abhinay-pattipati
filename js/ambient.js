// The page takes on the colors of the photo you're looking at: its two main
// colors (from photos.json) behind it as a soft wash, over the grain in
// photo.css, which fades from one photo's colors to the next.
//
// The colors are lifted into light tints first, so the gray text on top keeps
// at least 4.5:1 contrast however dark or bright the photo is: across every
// photo's colors the lowest is 4.6:1 for --ink-2. Lighter tints would show less
// color; darker ones would fail that.
const LIGHTEST = 0.87;   // OKLab lightness a tint never drops below
const MOST_COLOR = 0.15; // OKLab chroma a tint never goes above
const BOOST = 3.6;       // film colors are muted; this much more chroma reads as color

let showing = "";

export function ambient(photo) {
  const colors = photo?.colors;
  if (!colors || colors.join() === showing) return;
  showing = colors.join();
  document.body.style.setProperty("--wash-a", tint(colors[0]));
  document.body.style.setProperty("--wash-b", tint(colors[1]));
}

// A photo color as a light tint of the same hue.
export function tint(hex) {
  const [L, a, b] = toOklab(hex);
  const chroma = Math.min(Math.hypot(a, b) * BOOST, MOST_COLOR);
  const hue = Math.atan2(b, a);
  const lightness = Math.max(L, LIGHTEST);
  // Fewer colors are possible near white, so give up chroma until it fits.
  for (let c = chroma; c >= 0; c -= 0.005) {
    const rgb = fromOklab(lightness, c * Math.cos(hue), c * Math.sin(hue));
    if (rgb.every((v) => v >= 0 && v <= 1)) return `rgb(${rgb.map((v) => Math.round(v * 255)).join(" ")})`;
  }
  return "rgb(255 255 255)";
}

// sRGB <-> OKLab, after Björn Ottosson's reference (bottosson.github.io/posts/oklab).
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function toOklab(hex) {
  const [r, g, b] = [1, 3, 5].map((k) => toLinear(parseInt(hex.slice(k, k + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

// Returns gamma-encoded sRGB in 0–1; a channel outside that range is out of gamut.
function fromOklab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => (v < -1e-4 || v > 1 + 1e-4 ? v : toGamma(Math.min(1, Math.max(0, v)))));
}
