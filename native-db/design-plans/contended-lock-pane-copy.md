# Show a "locked by the other user" state instead of "Seat is available" while a lock is held

Written against: 578bcc9a048a32f864636c62416971ed45b76749

## Evidence chain

- Surface: `public/index.html` — the User A / User B pane, in the runtime state where one user holds an open row lock and the other user's pane is idle. Rendered by `render()` (`public/index.html:169`), polled every 700ms from `/api/state`.
- Problem: When one user holds the lock, the other user's pane displays the status copy "Seat is available. Press Book to open a transaction." At the same moment the transaction log shows "User <holder> — acquired the row lock" (green `msg.lock`) and the standing hint (`public/index.html:128`) states that pressing Book "will hang until the first user presses Confirm (COMMIT) or Cancel (ROLLBACK)." Three on-screen texts within the same task disagree: the pane says "available," the log says "acquired the row lock," and the hint says a second Book will block.
- Design evidence: Direct user-facing content contradiction within one task. The runtime state already carries the fact that resolves it: `/api/state` returns `holders: { A: !!sessions.A, B: !!sessions.B }` (`src/server.ts:140`), and `render()` already reads `state.holders[user]` for the current pane (`public/index.html:176`). The final `else` branch (`public/index.html:193`) is reached whenever the pane's own user is not waiting, the seat is not `booked`, and the pane's own user does not hold the lock — it never inspects the *other* user's holder flag, so it prints "available" even while the other user's transaction is open.
- Owner: `public/index.html` — inline `render()` function and the inline `<style>` block (both in the same file).
- Scope and affected surfaces: single file, single function. Both panes inherit the branch symmetrically.
- Uncertainty: None on the contradiction or the data. The exact wording and visual treatment of the new state are a design choice — a recommended default is specified below.

## Design decision

Add a conditional branch to `render()` that fires when the *other* user holds the lock (and the seat is not yet booked and this pane's user is neither waiting nor the holder). In that branch, replace the misleading "Seat is available" copy with a status that tells the truth — the row is currently locked by the other user and a Book request will wait — while keeping the Book button enabled, because contention (the request blocking) is the entire point of the demo. This resolves the root problem: the pane copy stops contradicting the log and the hint, and the app narrates the contended state at the exact moment it matters.

## Reuse

- `--muted` (secondary text color, `public/index.html:16`) — for the informational status line.
- `--amber` / the existing `.waiting` treatment (`public/index.html:71`) is the established color for "blocked / waiting on the lock." Reuse the amber semantic so the pre-block hint matches the post-press spinner state a user will see next. Do not introduce a new color token.
- Exemplar: the existing `else if (booked)` non-owner branch (`public/index.html:182`) shows how to render an other-user state ("Seat <strong>${seat.label}</strong> was booked by User ${seat.bookedBy}.") — mirror its structure and its use of `seat.label` / the other user's letter.
- No new primitive is required; the existing tokens and status/button rendering pattern fully express this state.

## Changes

1. `public/index.html` — inside `render()`, in the `for (const user of ['A', 'B'])` loop, before the final `else` (`public/index.html:193`)
   - Change: Derive the other user (`const other = user === 'A' ? 'B' : 'A';`) and add a branch `else if (state.holders[other]) { ... }` placed after the `holdsThis` branch and before the current final `else`. In it:
     - Set the status to an amber-toned, truthful line, e.g.:
       `statusEl.innerHTML = '<span class="locked-hint">User ' + other + ' is holding the row lock — pressing Book will wait until they Confirm or Cancel.</span>';`
     - Keep an **enabled** Book button so the block can be demonstrated: `btns.innerHTML = '<button class="act book" data-a="book">Book</button>';`
     - Preserve the existing `btns.querySelectorAll('button[data-a]')` wiring that runs after the branch chain (`public/index.html:198`) — it already attaches the `onBook` handler to any `data-a="book"` button, so no handler code is duplicated.
   - Change (style): add a small rule to the inline `<style>` for `.locked-hint { color: var(--amber); font-weight: 600; }` so the pre-block state reads as "about to wait," consistent with `.waiting`. Do not restyle the existing `.status` default.
   - Preserve: the final `else` "Seat is available. Press Book to open a transaction." copy for the genuinely-idle case (no holder on either side); the `booked` and `holdsThis` branches; the identity colors (A blue / B pink); the 700ms poll; all server behavior.
   - Verify: With the server running, press Book on User A. User B's pane immediately shows the amber "User A is holding the row lock — pressing Book will wait…" line with an enabled Book button, and no pane reads "Seat is available" while the log shows the lock is held. Pressing Book on B still hangs (spinner) as before, then resolves on A's Confirm/Cancel.

## Scope

- Inherit: both panes (the branch is symmetric across `['A', 'B']`).
- Verify: the transition sequence — idle → other holds → this pane presses Book (spinner via existing `waiting` branch) → other Confirms (this pane becomes owner or seat booked) / other Cancels (returns to idle "available"). Confirm the new branch does not shadow the `waiting`, `booked`, or `holdsThis` branches (it must come after `holdsThis` and before the final `else`).
- Exclude: the raw color literals elsewhere in the file (`#262635`, `#08080e`, `#55556a`, `#f87171`, etc.), the missing hover states on action buttons, and the never-updated hardcoded `A1` chip/seat label — all out of scope for this plan.

## Validation

- Product: Two-user seat contention still works — second Book blocks at the DB and unblocks on the first user's Confirm/Cancel. No server change; behavior is unchanged.
- Interface: Exercise every `render()` branch — idle (both free), one holder / other idle (the new branch), waiting (spinner after pressing Book), booked-by-me, booked-by-other, and post-Reset. Check the mobile single-column layout (`max-width: 720px`) still fits the longer status line; the `.status` block has `min-height: 20px` and wraps, so verify no overflow.
- System: Confirm the new state reuses `--amber`/`.waiting` semantics and `--muted`, and that no parallel color or button pattern was introduced.
- Repository: `node -e "require('fs').readFileSync('public/index.html','utf8')"` → succeeds (file still parses); load `http://localhost:3000` after `npm run dev` and confirm the two panes render and the new branch appears when one side holds the lock.

## Stop conditions

- Stop if `/api/state` no longer returns `holders` (server contract changed) — the branch depends on it.
- Stop if the seat model becomes multi-seat (the single-seat `SEAT_ID = 1` assumption and the "the row lock" singular copy would need rework).
- Stop if scope must widen beyond this one status branch and its supporting style rule.

## Design documentation

- After acceptance and validation: none required (no `DESIGN.md` exists). Optionally, if a design doc is later created, record the decision: "Per-pane status must reflect the other user's lock state; the idle 'Seat is available' copy is shown only when neither user holds the lock."
