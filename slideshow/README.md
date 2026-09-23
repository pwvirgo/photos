# slideshow/

Fullscreen viewer for the photo catalog. Deno backend, vanilla JS frontend.
Displays images, cycles through them automatically, and lets you annotate
them with notes (category/rank/comment). It only ever **inserts** into
`notes` — it never touches `fotos` or `actions` except reading them.

Moved here from the old standalone `slideshow` project; see the root
`README.md`'s "The actors" table for the full write-rule picture.

## Running

```bash
cd slideshow
deno run --allow-read --allow-net --allow-write slideshow.ts --params=params_slideshow.json
```

Opens at `http://localhost:8000`. Run from this directory — `slideshow.ts`
serves `./static/*` and `logger.ts` writes `slideshow.log` relative to the
current working directory, per the "run each module from its own directory"
decision in `design/nextSession_260921.md`.

## Files

- **`slideshow.ts`** — the HTTP server (`Deno.serve()`, port 8000). Imports
  shared code from `../lib/` (`params.ts`, `logger.ts`, `scanner.ts`) and
  database access from `../dbase/db.ts`.
- **`static/`** — frontend: `slides.html`/`app.js` (the viewer), `params.html`/
  `params.js` (the settings page), `styles.css`.
- **`params_slideshow.json`** — this module's params file (`source: "db"`).
  `dataDir` points at `../dbase` where `photos3.db` currently lives;
  `imageFolderPath` currently still points at `photos_old/images3` as a
  temporary bridge until the image folder itself moves — see the open
  question below.

## Open questions

- **Where the data ends up.** There's a live proposal to move images, the
  database, and backups of both into one external folder outside every
  project, then delete `photos_old` entirely. If that happens, `dataDir` and
  `imageFolderPath` here need to point at that folder instead, and the
  `photos3.db` copy in `../dbase/` would go away — it was only ever a
  stopgap copy, not a second source of truth.
- **Folder mode.** `source: "folder"` and `scanner.ts` still exist but are
  slated to be removed (decided, not done) — see `design/nextSession.md`.
