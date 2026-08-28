# DocumentsDB · Log Explorer

A schemaless document/log query UI, built with **Bun + React (JS)**. Ported from the
Claude Design `Log Explorer.dc.html` component.

Store JSON documents of any shape — fields are **discovered from the data**, not declared.
Query them with clickable filters or a raw JSON query, aggregate any field, live-tail a
synthetic stream, and inspect raw documents.

## Features

- **Ingest** — paste raw JSON (single doc or array), emit realistic preset events, or bulk
  generate up to 100k mixed documents.
- **Field discovery** — the left panel lists every field found across stored documents with
  fill rate, dominant type, and nested expansion. No schema is configured anywhere.
- **Query** — *simple* mode builds filter chips by clicking fields/values; *advanced* mode
  accepts a raw JSON query (`{ "path": { "$gt": 200 } }`). Preset queries included.
- **Live stats** — matches, documents scanned, query time, and index status update per query.
- **Aggregation** — count-by any field (numeric fields are auto-bucketed), with an
  "(field absent)" bar for missing values.
- **Inspector** — click a row to see its raw JSON; click any key to filter on presence, any
  value to filter on equality.
- **Live tail** — streams synthetic events; auto-pauses when you scroll the results.
- **Persistence** — documents are stored in **Appwrite DocumentsDB** via the `appwrite`
  browser SDK. Ingest/bulk create rows, load reads them back newest-first, reset deletes them.

## Appwrite DocumentsDB

The store lives in `src/appwrite.js` (client SDK `appwrite` → `DocumentsDB` service). Connection
comes from `.env`:

```
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=...
APPWRITE_DATABASE_ID=...
APPWRITE_TABLE_ID=...        # collection id
```

`scripts/gen-env.js` runs before `dev`/`start`/`build` and writes `src/env.generated.js` from
`.env` (Bun doesn't inline env into the browser bundle on its own).

Notes:
- The collection must allow the browser's role to **create / read / delete** documents
  (set Create/Read/Delete permissions to `any`, or add a session).
- Filtering, field discovery, and aggregation run client-side over the loaded documents, so
  arbitrary nested JSON works without declaring a schema.
- The server SDK `node-appwrite` is installed for server-side/admin use but is not wired into
  the browser app.

## Run

```bash
bun install
bun dev        # dev server with hot reload  ->  http://localhost:3000
```

Other scripts:

```bash
bun start      # serve without hot reload
bun run build  # bundle to ./dist
```

## Project structure

```
index.html            entry HTML (fonts, mount point)
src/main.jsx          React root; sets tailRate / rowLimit props
src/LogExplorer.jsx   main component (state, query engine wiring, full UI)
src/engine.js         pure logic: generators, flatten, path lookup, filter matching
src/appwrite.js       Appwrite DocumentsDB store (create / list / clear)
src/env.generated.js  generated from .env (git-ignored)
src/Hover.jsx         helper for the design's `style-hover` behavior
src/styles.css        global styles, keyframes, scrollbar
scripts/gen-env.js    writes src/env.generated.js from .env before dev/build
```

## Configuration

`src/main.jsx` passes two props to `<LogExplorer>`:

- `tailRate` (ms, default `420`) — interval between live-tail events.
- `rowLimit` (default `120`) — page size for the results list.
