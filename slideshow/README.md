# slideshow/

Fullscreen viewer for the photo catalog. Deno backend, vanilla JS frontend.
Displays images, cycles through them automatically, and lets you annotate
them with notes (category/rank/comment) and provenance (place, when,
subjects, source, shooter, ranks, comment). It **inserts** into `notes`, and
**inserts, updates, and deletes** rows in `prov` — it never writes `fotos` or
`actions`, only reads them.

See the root `README.md`'s "The actors" table for the full write-rule
picture.

## Running

```bash
cd slideshow
deno run --allow-read --allow-net --allow-write slideshow.ts --params=params_slideshow.json
```

Opens at `http://localhost:8000`. Run from this directory — `slideshow.ts`
serves `./static/*` and `logger.ts` writes `slideshow.log` (named after this module) relative to the
current working directory, per the "run each module from its own directory"
decision.

## Keys

Press `Esc` in the viewer for the full list. The annotation keys:

- `N` — Notes form (insert-only; category required).
- `E` — Provenance form for the image on screen: create, edit, or delete its
  `prov` row. It overlays the photo, pre-fills from the saved row, and closes
  on Save (or Enter in a one-line field); `Esc` or Cancel closes without
  saving. Delete asks for confirmation. Saving with every field blank deletes
  the row. Drag the heading to move the form (as with Notes).

## Files

- **`slideshow.ts`** — the HTTP server (`Deno.serve()`, port 8000). Imports
  shared code from `../lib/` (`params.ts`, `logger.ts`) and database access
  from `../dbase/db.ts`. Besides the image and notes routes it serves
  `/api/prov/<img_id>` (GET the row, PUT to save, DELETE to remove).
- **`static/`** — frontend: `slides.html`/`app.js` (the viewer), `params.html`/
  `params.js` (the params page), `styles.css`.
- **`params_slideshow.json`** — this module's params file (query,
  timing, log level). The database location is shared by every module and
  lives in `../params_shared.json`; image locations come from `fotos.path`.
