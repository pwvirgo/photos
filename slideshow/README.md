# slideshow/

Fullscreen viewer for the photo catalog. Deno backend, vanilla JS frontend.
Displays images, cycles through them automatically, and lets you annotate
them with notes (category/rank/comment). It only ever **inserts** into
`notes` — it never touches `fotos` or `actions` except reading them.

See the root `README.md`'s "The actors" table for the full write-rule
picture.

## Running

```bash
cd slideshow
deno run --allow-read --allow-net --allow-write slideshow.ts --params=params_slideshow.json
```

Opens at `http://localhost:8000`. Run from this directory — `slideshow.ts`
serves `./static/*` and `logger.ts` writes `slideshow.log` relative to the
current working directory, per the "run each module from its own directory"
decision.

## Files

- **`slideshow.ts`** — the HTTP server (`Deno.serve()`, port 8000). Imports
  shared code from `../lib/` (`params.ts`, `logger.ts`) and database access
  from `../dbase/db.ts`.
- **`static/`** — frontend: `slides.html`/`app.js` (the viewer), `params.html`/
  `params.js` (the settings page), `styles.css`.
- **`params_slideshow.json`** — this module's params file. `dataDir` and
  `imageFolderPath` point straight at `photos_old`.
