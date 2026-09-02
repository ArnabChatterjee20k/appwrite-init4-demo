# Correct the top-bar wordmark casing to "DocumentsDB"

Written against: 578bcc9a048a32f864636c62416971ed45b76749

## Evidence chain

- Surface: DocumentsDB Log Explorer, top bar wordmark — `src/LogExplorer.jsx:760`
- Problem: The wordmark renders `DocumentsDb` (lowercase final *b*), contradicting the product name "DocumentsDB" used everywhere else the same UI renders.
- Design evidence: The identical surface prints "loading from DocumentsDB…" (`src/LogExplorer.jsx:66`), "loaded from DocumentsDB" (`:77`), and "clearing DocumentsDB…" (`:629`) in the status strip; the page `<title>` is "DocumentsDB · Log Explorer" (`index.html:6`); README uses "DocumentsDB" throughout. The correct casing is unambiguous.
- Owner: `src/LogExplorer.jsx:760`
- Scope and affected surfaces: Single text node in the top bar. No other surface renders the wordmark.
- Uncertainty: None.

## Design decision

Change the wordmark text from `DocumentsDb` to `DocumentsDB` so the primary brand element matches the product name the same app prints in its status strip and page title. This is a pure copy correction; no styling changes.

## Reuse

- Reuse the existing wordmark `<span>` and its style verbatim (`fontSize: 20, fontWeight: 600, letterSpacing: "0.2px"`).
- Exemplar: `src/LogExplorer.jsx:66`, `:77`, `:629` (the "DocumentsDB" spelling already used in-app).

## Changes

1. `src/LogExplorer.jsx:760`
   - Change: Replace the text `DocumentsDb` with `DocumentsDB` inside the wordmark `<span>`.
   - Preserve: The span's styling, the adjacent `events` label, and top-bar layout.
   - Verify: The top-bar wordmark reads "DocumentsDB".

## Scope

- Inherit: Top bar (only consumer).
- Verify: None.
- Exclude: The lowercase `events` sub-label is intentional and unrelated — do not touch it.

## Validation

- Product: Load the app; the header brand reads "DocumentsDB".
- Interface: Top bar in both `ingestOpen` and collapsed states (wordmark is unaffected by either).
- System: No token or component changes; nothing parallel introduced.
- Repository: `grep -n "DocumentsDb\b" src/LogExplorer.jsx` → returns no matches (only "DocumentsDB").

## Stop conditions

- Stop if the wordmark span has been refactored away from `:760` or now sources its text from a variable; re-locate the single render site before editing.

## Design documentation

- After acceptance and validation: None. No design doc exists to update.
