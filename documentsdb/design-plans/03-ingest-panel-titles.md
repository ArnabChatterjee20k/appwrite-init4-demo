# Make ingest sub-panel titles read as headings, not eyebrow captions

Written against: 578bcc9a048a32f864636c62416971ed45b76749

## Evidence chain

- Surface: DocumentsDB Log Explorer — ingest strip, three sub-panels ("paste raw json", "emit preset event", "bulk generate")
- Problem: The surface uses two different treatments for a "panel title." The main panels — Fields (`src/LogExplorer.jsx:1097`), Document (`:1628`), Count by (`:1444`) — title themselves with `fontSize: 20, fontWeight: 600` normal-case white text. The three ingest sub-panels instead title themselves with the *eyebrow-caption* recipe (`fontSize: 10, fontWeight: 600, letterSpacing: "0.25px", textTransform: "uppercase"`) at `color: "#ffffff"` (`:892`, `:960`, `:1008`). That same eyebrow recipe is used elsewhere for MUTED secondary captions ("documents", the stats labels, "discovered from data…", "aggregate by this field"), so the ingest titles collide visually with captions rather than reading as headings.
- Design evidence: Panel headings on this surface are `fontSize ≥ 14, fontWeight 600, normal-case`; the eyebrow recipe is otherwise reserved for MUTED captions. The ingest titles are the only place the caption recipe is repurposed as a heading.
- Owner: `src/LogExplorer.jsx:892`, `:960`, `:1008` (the three ingest title `<span>`s).
- Scope and affected surfaces: Three ingest sub-panel title spans only.
- Uncertainty: Source cannot prove the ingest strip must match the main panels' exact 20px title; the strip is a denser tier. Decision uses a scaled heading (14px, normal case) that reads as a heading while fitting the compact strip. If a future rendered review shows 14px crowds the strip, 13px is an acceptable fallback.

## Design decision

Give the three ingest sub-panel titles a proper (scaled) heading treatment distinct from the eyebrow-caption recipe: `fontSize: 14, fontWeight: 600, color: "#ffffff"`, with `textTransform` and the `letterSpacing: "0.25px"` removed. This resolves the "heading vs. caption" ambiguity by making the titles unambiguously headings, while keeping them compact enough for the collapsible ingest strip. The MUTED descriptor beside each title (e.g. "any shape · no validation · no mapping") is unchanged and continues to read as the caption.

## Reuse

- Reuse the panel-heading pattern established by Fields/Document/Count by (`fontWeight: 600`, normal case, white), scaled from 20px to 14px for the denser strip.
- Exemplar: `src/LogExplorer.jsx:1097` (`fontSize: 20, fontWeight: 600` — the Fields panel heading).

## Changes

1. `src/LogExplorer.jsx:892-901` (the "paste raw json" title span)
   - Change: Replace the eyebrow recipe (`fontSize: 10, fontWeight: 600, letterSpacing: "0.25px", textTransform: "uppercase", color: "#ffffff"`) with `fontSize: 14, fontWeight: 600, color: "#ffffff"`.
   - Preserve: The text "paste raw json", the flex row, and the adjacent MUTED descriptor span.
   - Verify: The title reads as a heading, visually distinct from the MUTED caption beside it.
2. `src/LogExplorer.jsx:960-968` (the "emit preset event" title span)
   - Change: Same recipe swap as above.
   - Preserve: Text and adjacent descriptor.
   - Verify: Matches sub-panel 1's new heading.
3. `src/LogExplorer.jsx:1008-1016` (the "bulk generate" title span)
   - Change: Same recipe swap as above.
   - Preserve: Text and adjacent descriptor.
   - Verify: Matches sub-panels 1 and 2.

## Scope

- Inherit: The three ingest sub-panel titles.
- Verify: The ingest strip's `1.2fr 1fr 1fr` grid still aligns the three titles on one baseline; the three descriptor spans still sit inline.
- Exclude: Do not change the eyebrow-caption recipe anywhere it is used for genuine MUTED captions ("documents" `:781`, stats labels `:1406`+, "discovered from data…" `:1108`, "aggregate by this field" `:1674`). Those are correct as captions.

## Validation

- Product: Open the app with the ingest strip expanded; the three sub-panel titles read as headings, not as the small uppercase captions used elsewhere.
- Interface: Ingest strip expanded and collapsed (via the "hide ingest"/"ingest" toggle). Titles only render when expanded.
- System: Confirm the three titles now share one heading recipe and that the eyebrow-caption recipe remains reserved for MUTED captions — no third title style introduced.
- Repository: `grep -n "paste raw json" src/LogExplorer.jsx` → the surrounding span no longer carries `textTransform: "uppercase"`.

## Stop conditions

- Stop and report if the three ingest title sites have been refactored into a shared sub-component since this plan was written; apply the recipe once at the shared owner instead of three times.

## Design documentation

- After acceptance and validation: None. No design doc exists to update. (If one is later created, record: "Panel titles use fontWeight 600 normal-case white; the 10px uppercase recipe is reserved for MUTED captions.")
