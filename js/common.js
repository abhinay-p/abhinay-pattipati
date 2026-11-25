export async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

// Every photo's details. The pages start this request themselves, in their
// <head>, so it runs while the scripts are still on their way.
export async function loadPhotos() {
  if (!window.photosRequest) return loadJSON("content/photos.json");
  const res = await window.photosRequest;
  if (!res.ok) throw new Error(`Could not load content/photos.json (${res.status})`);
  return res.json();
}

// A browser may start downloading a photo the moment it has a src, so these go
// on last. With src first, loading="lazy" came too late whenever the browser
// remembered a photo from an earlier page, and every photo downloaded at once.
const LAST = ["srcset", "src"];

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  const inOrder = Object.entries(attrs).sort(([a], [b]) => LAST.indexOf(a) - LAST.indexOf(b));
  for (const [k, v] of inOrder) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

// Dialogs close when you tap the dimmed backdrop, like an iOS sheet.
export function closeOnBackdrop(dialog) {
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
}

// Ties a <dialog> to browser history, so Back (or a phone's back swipe)
// closes it instead of leaving the page, and each open dialog has a URL.
// Returns open(hash, { fromLink }); calling it while open just updates the URL.
//
// A dialog opened from a shared link reuses the current history entry instead
// of pushing one: Chrome skips entries pushed without a user gesture, so
// history.back() would leave the site rather than close the dialog.
export function modalHistory(dialog) {
  const cleanUrl = () => location.pathname + location.search;
  dialog.addEventListener("close", () => {
    if (!history.state?.modal) return;
    if (history.state.fromLink) history.replaceState(null, "", cleanUrl());
    else history.back();
  });
  addEventListener("popstate", () => { if (dialog.open && !history.state?.modal) dialog.close(); });
  return (hash, { fromLink = false } = {}) => {
    if (dialog.open) return history.replaceState({ ...history.state, modal: true }, "", hash);
    if (fromLink) history.replaceState({ modal: true, fromLink: true }, "", hash);
    else history.pushState({ modal: true }, "", hash);
    dialog.showModal();
  };
}

// Matches a shared link like #3 against the current URL.
export const deepLink = (pattern) => location.hash.match(pattern);
