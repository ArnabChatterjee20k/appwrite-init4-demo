# Unify the large-count metric type scale to 34px

Written against: 578bcc9a048a32f864636c62416971ed45b76749

## Evidence chain

- Surface: DocumentsDB Log Explorer — top-bar total count and the stats strip
- Problem: Two visually-identical "large monospace count" metrics render at different sizes. The top-bar document total is `fontSize: 30` (`src/LogExplorer.jsx:772`); the stats-strip counts (matches, documents scanned, query time) are `fontSize: 34` (`:1409`, `:1417`, `:1425`). Same semantic element (a headline MONO count), inconsistent scale.
- Design evidence: Three of the four large-count numbers on the surface render at 34px; the top-bar total is the lone 30px outlier. The majority value (34px, three consumers) is the de-facto metric scale.
- Owner: `src/LogExplorer.jsx:772` (top-bar total).
- Scope and affected surfaces: The top-bar total number only. The stats strip already uses 34px and is unchanged.
- Uncertainty: Source cannot prove which size is "canonical"; the decision follows the majority-consumer rule (34px has three consumers vs. one). If the top-bar total is intentionally de-emphasized relative to query metrics, keep 30px — but no evidence indicates that intent.

## Design decision

Promote the top-bar total from `fontSize: 30` to `fontSize: 34` so all four large-count metrics on the surface share one type scale. This resolves the drift by aligning the single outlier to the established 34px metric size rather than inventing a new value.

## Reuse

- Reuse the existing 34px metric size already applied at `src/LogExplorer.jsx:1409`/`:1417`/`:1425`.
- Exemplar: `src/LogExplorer.jsx:1417` (documents-scanned metric: `fontFamily: MONO, fontSize: 34, fontWeight: 700`).

## Changes

1. `src/LogExplorer.jsx:772`
   - Change: In the top-bar total `<span>` style, change `fontSize: 30` to `fontSize: 34`.
   - Preserve: `fontFamily: MONO`, `fontWeight: 700`, `color: "#ffffff"`, and the adjacent "documents" eyebrow label and its baseline alignment (`alignItems: "baseline"`).
   - Verify: The top-bar total renders at the same size as the stats-strip counts.

## Scope

- Inherit: Top bar total.
- Verify: Top-bar layout at its `minWidth: 1260` — confirm the larger number does not wrap or push the right-aligned tail/ingest buttons; the row uses `alignItems: "center"` with a flex spacer so growth is absorbed.
- Exclude: The Fields count (`fontSize: 20`, `:1098`) and the index cell text (`fontSize: 20`, `:1433`) are different roles (a panel count and a status string, not a hero metric) — do not change them.

## Validation

- Product: Load with documents present; the header total and the "matches" number read at identical height.
- Interface: Top bar with a small total (e.g. "0") and a large total (e.g. "100,000") — confirm no wrap or overlap at 1260px width.
- System: No new size token; the change reuses the existing 34px value. Confirm no third large-count size remains.
- Repository: `grep -n "fontSize: 30" src/LogExplorer.jsx` → returns no matches.

## Stop conditions

- Stop if raising to 34px causes the top-bar total to wrap or collide with the right-side buttons at the 1260px minimum width; if so, report before proceeding rather than shrinking other elements.

## Design documentation

- After acceptance and validation: None. No design doc exists to update.
