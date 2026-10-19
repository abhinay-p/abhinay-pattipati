// Photo orderings shared by the strip and the gallery.

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// A fresh mix of film stocks: shuffles each roll, then deals photos out one at
// a time, picking the next roll at random in proportion to how many photos it
// has left, and never the same roll twice in a row while another is available.
// Every stock stays spread across the whole set instead of bunching up.
export function mixRolls(photos) {
  const rolls = new Map();
  for (const p of photos) {
    const key = p.stock || "";
    if (!rolls.has(key)) rolls.set(key, []);
    rolls.get(key).push(p);
  }
  const piles = [...rolls.values()].map((pile) => shuffle([...pile]));
  const out = [];
  let last = null;
  while (out.length < photos.length) {
    const open = piles.filter((pile) => pile.length && pile !== last);
    const choices = open.length ? open : piles.filter((pile) => pile.length);
    // If one roll has more photos left than all the others combined, it must
    // go now, or it would end up with back-to-back frames at the end.
    const left = photos.length - out.length;
    const biggest = choices.reduce((a, b) => (b.length > a.length ? b : a));
    let pile;
    if (biggest.length > left - biggest.length) {
      pile = biggest;
    } else {
      let r = Math.random() * choices.reduce((n, p) => n + p.length, 0);
      pile = choices.find((p) => (r -= p.length) < 0) ?? choices[choices.length - 1];
    }
    out.push(pile.pop());
    last = pile;
  }
  return out;
}

// Grouped by film stock (A–Z), each roll in frame order (its file names).
export const byStock = (photos) =>
  [...photos].sort((a, b) => (a.stock || "").localeCompare(b.stock || "") || a.src.localeCompare(b.src));
