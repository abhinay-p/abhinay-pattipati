// A light table's arrangement, as it's written in a link:
//   table.html#t=portra400_12~512~300~-4,gold200_03~100~220~3
// Each photo's name, then where its middle is (0 to 1000 across and down the
// table) and its tilt in degrees, lowest in the pile first. A photo that has
// just been picked is only a name until the table finds it a place.
export const nameOf = (p) => p.src.split("/").pop().replace(/\.[^.]+$/, "");
export const FULL = 24; // photos on the table at once

export function write(items) {
  return items.map(({ name, x, y, tilt }) => (x === undefined ? name : [name, x, y, tilt].map((v) => (typeof v === "number" ? Math.round(v) : v)).join("~"))).join(",");
}

export function read(text) {
  const seen = new Set();
  return text.split(",").flatMap((part) => {
    const [name, ...rest] = part.split("~");
    if (!/^[\w.-]+$/.test(name) || seen.has(name)) return [];
    seen.add(name);
    const [x, y, tilt] = rest.map(Number);
    return [rest.length === 3 && [x, y, tilt].every(Number.isFinite) ? { name, x, y, tilt } : { name }];
  }).slice(0, FULL);
}

// The arrangement in this page's own link, if it has one that can be read.
export function fromHash(key) {
  if (!location.hash.startsWith(`#${key}=`)) return null;
  try {
    return read(decodeURIComponent(location.hash.slice(key.length + 2)));
  } catch {
    return null; // a link cut short or mistyped, such as one ending in %
  }
}
