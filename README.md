# Portfolio

A film photography portfolio, live at https://abhinay-p.github.io/abhinay-pattipati/.

- **Home** (`index.html`): a sideways-scrolling strip of photos, with film stocks freshly mixed on every visit.
- **Gallery** (`gallery.html`): every photo on one contact sheet, cut into strips that sit slightly askew as if laid by hand (the order and placement change on every visit). Hovering a frame shows a bigger preview, and clicking opens the photo on its own. A small toolbar at the bottom grows on hover (or tap). It lets visitors order the sheet by stock or show only one film stock; nothing is grouped unless they choose it.

Photos are labelled by film stock. It has no framework and no build step, so it runs on any static host.

## Run locally

```bash
npm run dev
```

Then open http://localhost:4321. The pages load `content/photos.json` with `fetch`, so opening the HTML files directly (`file://`) won't work.

## Add film photos

1. Drop JPGs into `images/film/`, named `<stock>_<NN>.jpg` in frame order, for example `portra400_37.jpg`. The stock part becomes the label: `portra400` → "Portra 400", `gold200` → "Kodak Gold 200", `phoenix200` → "Harman Phoenix 200". A date and location are optional: `2025-06_portra400_big-sur_01.jpg`.
2. Run `npm run photos`. It needs Python with Pillow (`pip install pillow`).

That shrinks anything larger than 2000px, strips EXIF data (scanner, camera, dates, any location), makes the gallery thumbnails in `images/film/thumbs/`, and regenerates `content/photos.json`. You can hand-edit any entry to change the `location`, `date`, `camera` or `stock`, or to add `alt` text, and those edits are kept the next time you run it.

Once the site is on GitHub, you can skip both steps and use the browser instead (see below).

## Edit photos on the live site

Go to **https://abhinay-p.github.io/abhinay-pattipati/admin/**. That page isn't linked anywhere on the site and is hidden from search engines. It sends you to [Pages CMS](https://pagescms.org), which signs you in with GitHub. The real lock is that GitHub sign-in: only accounts with write access to this repo can change anything. Every save is a commit, and GitHub Pages redeploys within a minute or two.

**Add photos**

1. Open the admin link and go to **Media**.
2. Upload your scans. They are saved in `images/film/`. Use the `<stock>_<NN>.jpg` names from above so the label fills itself in.
3. Each upload starts the **Regenerate photos.json** Action (`.github/workflows/photos.yml`). It runs `npm run photos` and commits the shrunk photo, its thumbnail and `content/photos.json`. You can watch it in the repo's **Actions** tab. It takes about a minute.

**Edit labels**

Open **Film photos** in Pages CMS. Each photo has these fields:

| Field | Notes |
| --- | --- |
| Location, Camera, Film stock | Free text. |
| Date | `YYYY-MM`, for example `2025-06`. |
| Alt text | Optional. Describes the photo for screen readers. |
| Photo, Thumbnail, Width, Height | Read-only. They come from the file itself. |

Your edits are kept the next time the Action runs, the same way hand edits are.

**Things to know**

- A new photo appears in **Film photos** only after the Action has run. Reload the page if you don't see it.
- To remove a photo, delete the file in **Media**. The Action then removes its entry and thumbnail. Deleting the entry alone doesn't work, because the next run adds it back while the file is still there.
- To replace a photo, upload a file with the same name. The labels stay, and the size and thumbnail are updated.
- The Action can't trigger itself: GitHub doesn't start new workflow runs from pushes made with the Action's own token.

## Hosting

The repo is [abhinay-p/abhinay-pattipati](https://github.com/abhinay-p/abhinay-pattipati). GitHub Pages deploys from `main` / root on every push. All paths are relative, because the site is served from the `/abhinay-pattipati/` subpath.

### One-time setup for editing on the live site

1. **Repo and Pages.** Done: the repo exists and Pages deploys from `main` / root.
2. **Authorize Pages CMS.** Open the admin link, sign in with GitHub, and install the Pages CMS GitHub App on this repo. You can grant it access to just this one repo. You have to do this step yourself in the browser.
3. **Check it works.** Upload one photo in **Media**, wait for the Action to go green, and confirm the photo shows up in **Film photos** and on the site.
