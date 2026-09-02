# Use the single border token for result-row dividers

Written against: 578bcc9a048a32f864636c62416971ed45b76749

## Evidence chain

- Surface: DocumentsDB Log Explorer — center results list, per-row dividers
- Problem: Result rows draw their bottom divider with `borderBottom: "1px solid rgba(54,45,89,0.6)"` (`src/LogExplorer.jsx:1508`) — the border color `#362d59` (= rgb(54,45,89)) at 60% alpha. Every other border on the surface uses the solid token `#362d59`: top bar (`:754`), ingest panels (`:876`), query bar (`:1237`), stats strip (`:1401`), field/inspector headers (`:1095`, `:1621`), and all card borders. The result rows are the lone site that softens the token inline.
- Design evidence: `#362d59` is the surface's single border color, applied solidly in ~15 sites. The 0.6-alpha variant is a one-off inline tweak of that same token.
- Owner: `src/LogExplorer.jsx:1508` (result-row divider).
- Scope and affected surfaces: The result-row divider only.
- Uncertainty: The reduced alpha may be a deliberate softening for the dense row list. If a rendered review shows solid `#362d59` dividers make the list feel heavy, the correct fix is to promote a named `BORDER_SOFT` token and use it consistently — not to keep a single inline exception. Absent that evidence, unify to the existing token.

## Design decision

Change the result-row divider from `rgba(54,45,89,0.6)` to the solid border token `#362d59`, so every border on the surface resolves to one value. This removes the lone inline color variant rather than blessing an undocumented one-off.

## Reuse

- Reuse the `#362d59` border color used by every other bordered element.
- Exemplar: `src/LogExplorer.jsx:1508` context — compare to `:754` (`borderBottom: "1px solid #362d59"`).

## Changes

1. `src/LogExplorer.jsx:1508`
   - Change: In the result-row `Hover` style, change `borderBottom: "1px solid rgba(54,45,89,0.6)"` to `borderBottom: "1px solid #362d59"`.
   - Preserve: Row grid, padding, hover background, selected-row background, and row-in animation.
   - Verify: Row dividers render in the same color as the stats-strip and header borders.

## Scope

- Inherit: All result rows.
- Verify: The selected-row background (`rgba(66,32,130,0.55)`) and hover background still read correctly over the solid divider.
- Exclude: Do not touch the field-panel rows (which intentionally have no bottom border) or the aggregation rows.

## Validation

- Product: Load with many rows; dividers match the color of the panel/section borders.
- Interface: Results list with a selected row and while hovering a row — divider color unchanged by state.
- System: Confirm no inline `rgba(54,45,89,...)` border variant remains; `#362d59` is the sole border color.
- Repository: `grep -n "rgba(54,45,89" src/LogExplorer.jsx` → returns no matches.

## Stop conditions

- Stop if a rendered review is requested first and shows the solid divider visibly overweights the dense list; in that case switch to introducing a shared soft-border token rather than reverting to an inline exception.

## Design documentation

- After acceptance and validation: None. No design doc exists to update.
