# Give the plain query/ingest buttons the hover feedback their siblings have

Written against: 578bcc9a048a32f864636c62416971ed45b76749

## Evidence chain

- Surface: DocumentsDB Log Explorer — query bar (simple/advanced/run) and bulk-generate (stop) controls
- Problem: The surface has an established hover convention via the `Hover` component (`src/Hover.jsx`): the tail, ingest, store-document, emit, preset, bulk-size, index, and copy controls all define a `hover` style. Four action buttons are plain `<button>` elements with no hover feedback: `simple` (`src/LogExplorer.jsx:1244`), `advanced` (`:1262`), `run` (`:1347`), and `stop` (`:1042`). They sit directly beside `Hover`-wrapped controls, so their lack of hover response is an internal inconsistency in interactive feedback.
- Design evidence: `Hover` is the surface's owner for hover presentation; the majority of buttons use it. White primary buttons hover to `#f0f0f0` (`:862`, `:941`); dark/bordered buttons hover with a subtle background or LIME border.
- Owner: `src/LogExplorer.jsx:1042` (stop), `:1244` (simple), `:1262` (advanced), `:1347` (run); hover behavior owned by `src/Hover.jsx`.
- Scope and affected surfaces: Four buttons in the query bar and bulk row.
- Uncertainty: None on the pattern. The exact hover value for `stop` (no existing pink-button exemplar) reuses the error-badge alpha; see Reuse.

## Design decision

Convert the four plain `<button>`s to `Hover` (`as="button"`) with hover styles that reuse existing exemplars, so every button on the surface responds to hover consistently. The segmented `simple`/`advanced` toggle must only show hover on the *inactive* tab (the active tab keeps its opaque white background), so its hover is state-derived.

## Reuse

- White primary hover: `hover={{ background: "#f0f0f0" }}` — exemplar `src/LogExplorer.jsx:862` (store-document / ingest buttons). Apply to `run`.
- Inactive-tab hover background: `rgba(255,255,255,0.06)` — exemplar the field-row hover `src/LogExplorer.jsx:1130`. Apply to inactive `simple`/`advanced`.
- Pink-outline hover background: `rgba(250,127,170,0.18)` — exemplar the error-badge background `src/LogExplorer.jsx:411`. Apply to `stop`.
- Component: `Hover` (`src/Hover.jsx`), already imported.

## Changes

1. `src/LogExplorer.jsx:1042-1059` (`stop` button)
   - Change: Replace `<button …>` with `<Hover as="button" … hover={{ background: "rgba(250,127,170,0.18)" }}>`.
   - Preserve: `onClick={v.onStop}`, all existing style props, label "stop".
   - Verify: Hovering "stop" tints its background pink; click still stops generation.
2. `src/LogExplorer.jsx:1244-1261` (`simple` button)
   - Change: Replace `<button>` with `<Hover as="button" … hover={v.simpleHover}>`. Add to `renderVals()`: `simpleHover: st.mode === "simple" ? undefined : { background: "rgba(255,255,255,0.06)" }`.
   - Preserve: `onClick={v.setSimple}`, the active/inactive `simpleBg`/`simpleFg` styling, label "simple".
   - Verify: Hovering the inactive "simple" tab shows a faint background; the active tab (white) is unchanged on hover.
3. `src/LogExplorer.jsx:1262-1279` (`advanced` button)
   - Change: Replace `<button>` with `<Hover as="button" … hover={v.advHover}>`. Add to `renderVals()`: `advHover: st.mode === "advanced" ? undefined : { background: "rgba(255,255,255,0.06)" }`.
   - Preserve: `onClick={v.setAdvanced}`, active/inactive styling, label "advanced".
   - Verify: Symmetric with "simple".
4. `src/LogExplorer.jsx:1347-1365` (`run` button)
   - Change: Replace `<button>` with `<Hover as="button" … hover={{ background: "#f0f0f0" }}>`.
   - Preserve: `onClick={v.onAdvRun}`, `alignSelf: "flex-start"`, label "run".
   - Verify: Hovering "run" lightens it to `#f0f0f0`, matching the store-document button.

## Scope

- Inherit: The four listed buttons.
- Verify: `Hover` passes through `onClick` and arbitrary props (it does — `...rest`), so behavior is unchanged.
- Exclude: The inline text-links `reset collection` (`:1074`), `clear query` (`:1282`), `back to documents` (`:1446`), and `collapse →` (`:1646`) are plain `<span>` text-links with an intentional no-hover pattern — do not convert them to buttons.

## Validation

- Product: Hover each of the four buttons; each gives visible feedback and its click action still works.
- Interface: `simple`/`advanced` in both active and inactive states (hover must not wash out the active white tab); `stop` during and outside a bulk run; `run` in advanced mode.
- System: Confirm all four now use `Hover` and reuse existing hover values — no new hover color invented beyond the three cited exemplars.
- Repository: `grep -n "<button" src/LogExplorer.jsx` → returns no matches (all buttons routed through `Hover as="button"`).

## Stop conditions

- Stop if the `Hover` component's prop contract has changed such that `as="button"` no longer forwards `onClick`/`type`; verify `src/Hover.jsx` still spreads `...rest` before converting.

## Design documentation

- After acceptance and validation: None. No design doc exists to update. (If one is later created, record: "All buttons use the `Hover` component; text-links intentionally have no hover.")
