# Better MyUCLA — Agent handoff

Last updated: 2026-08-23  
Current version: `0.10.1`  
Status: working local beta; build is ready in `dist/`

`README.md` is the project tracker and the place to start. This file is the
architecture and trap list.

## Start here

This is a Manifest V3 Chrome extension for the exact page:

`https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx`

It enhances the existing UI and reuses MyUCLA's native ordering buttons. It is not an enrollment bot and must never automate enrollment-state changes.

Quick verification:

```bash
npm install
npm run typecheck
npm test -- --run
npm run build
```

Last verified result: TypeScript passed, 50 tests passed across 11 files, and the build completed.

Session timeouts (verified in page source, 2026-08-20): `Timeout.js` extends the
idle timer on any `mousedown keydown click` and, when `keepAlive` is set, pings
every two minutes. MyUCLA opens its own warning dialogs (`#divFeatureTimeout`,
`#divMaxTimeout`). Do not rebuild a general-purpose countdown on top of that.

The plan is inside the `ctl00_main_wrapper` UpdatePanel — see
`docs/MYUCLA_CONTRACT.md`. Never attach a MutationObserver to the course table,
never wait only on an iframe `load` event, and never assume `beforeunload` will
catch a MyUCLA-initiated re-render.

Real-page gotchas already paid for — do not regress these:

- `#div_landing > table` interleaves `tbody.course_divider` between course
  `tbody.courseItem` nodes. Anything that walks or restyles rows must account
  for them.
- CSS custom properties declared on our injected elements do **not** reach the
  official course table. Declare tokens on `.pl-plan-root` as well, or every
  `var()` there silently drops the whole declaration.
- The page ships Bootstrap base rules; injected form controls need element-name
  specificity, including `box-sizing` for `input[type=search]`.

Live-page read-only verification on 2026-08-20 confirmed the offscreen frame is
readable, same-origin, and shows the same term/Plan/order as the visible page.
A first real *mutating* run has still not been watched — do that with a course
that only needs one or two steps.

## What is implemented

### Safe server-persisted ordering

Two engines share one contract. `FastReorderCoordinator` is tried first;
`NavigationReorderCoordinator` is the fallback.

`src/content/fast-reorder.ts` (default path):

- Opens one offscreen same-origin `ClassPlan.aspx` frame.
- Requires the frame's contract and term/Plan context key to match before any
  click. The course *order* may legitimately differ (a stale visible page), so
  the run re-plans from the server's real order as long as the course *set*
  matches; a different set returns `unavailable` and the controller falls back.
- After the first click the full expected order must match exactly, every step.
- Clicks one strictly whitelisted native button per full frame load, then
  revalidates the entire expected order.
- Maximum 60 adjacent native moves per action; cancellable at any step.
- The visible page is never reordered by the extension; it reloads once when the
  run ends, restoring scroll position.

`src/content/navigation-reorder.ts` (fallback path, unchanged):

- One native move per full *page* navigation, with a chrome.storage write-ahead
  record and a sessionStorage tab marker so only the initiating tab resumes.
- Maximum 20 moves, 5-minute pending-operation expiry.

Shared:

- Stops on page, term, Plan, DOM, button, or order mismatch.

Confirmation model (changed in 0.6.0): rearranging is local and writes nothing.
The single `保存` button names the number of changes and the estimated wait, and
is the explicit authorisation for the whole batch. This is a deliberate reading
of the "retain user confirmation" rule, not a relaxation of it — the student now
authorises every server write with one informed, deliberate click instead of
being trained to dismiss a confirmation per drag.

Realm note: `MyUclaPlannerAdapter` takes a `Document`, and its button check reads
`HTMLButtonElement` from that document's own view. A bare `instanceof` against
the top frame's constructor is always false for offscreen-frame nodes.

### Where the UI lives (changed in 0.9.0)

Measured on the live page on 2026-08-22:

- Every Class Planner section has a `.classPlanner_SectionTitle` bar: `#2C5E91`,
  7px radius, 5px padding, white 14px ProximaNova. MyUCLA parks that section's
  own actions on the right of it. The plan toolbar therefore mounts **inside**
  `#plannerSectionClip` and adds `pl-host-bar` to it (removed on dispose). The
  old placement above the table survives as a fallback.
- `td.linkPanelRight` is ~300px wide; `.OrderingButtons` uses ~73px. Card
  controls are an `inline-block` beside them, not a second row underneath.
  Do not restore `width: 100%` on `.pl-card-tools`.
- Anything pending lives in `#planner-lift-actionbar`, fixed to the bottom of
  the window: unsaved changes, the restore-a-draft offer, and save progress.
  `html.pl-has-actionbar` exists so the landing chip can dodge it.
- A 17-class plan is ~5,800px tall with 163-246px cards. Assume every move
  leaves the viewport.

### Local/read-only enhancements

- Up to 24-character local tags.
- Search current cards by course, instructor/page text, or tag.
- Per-course collapse and collapse/expand all. Compact mode was removed in
  0.9.0 along with its persisted `compact` view-state field.
- `src/content/page-polish.ts` changes MyUCLA's own markup, and is **gated
  behind the `plannerLift.layout.v1` switch, which is off by default**. This is
  a product rule, not a technical one: our own injected controls are ours to
  design, but MyUCLA's markup is what students already have in their hands, and
  reshaping it is opt-in. 0.10.0 shipped it on for everyone and had to be
  reverted in 0.10.1. Do not turn it back on by default.
  Three further rules hold there: read only text MyUCLA already rendered, never rewrite it (hide the
  original and add ours beside it), and bail out on any shape that does not
  match the contract exactly. Everything it does is undone in `dispose`.
  - The weekly grid lives outside `getRoot()` and MyUCLA re-renders it from its
    own toggles, so `needsReconcile` watches for an untidied `.planneritembox`.
  - The shared column grid is applied only when a `table.coursetable` header row
    has exactly nine cells. Do not widen that check; a different column count
    with fixed widths would misalign every row.
  - A bare `<td>` cannot be parsed from `innerHTML` in a test. Wrap fixtures in
    a `<table>`.
- Drag measures in **document space** (`pageY`), never `clientY`. The page
  scrolls under a long drag, so a viewport-relative delta slides the card out
  from under the cursor. Edge auto-scroll runs on its own rAF loop and
  recomputes the drag from `lastClientY + scrollY` after each scroll step.
- Move feedback: the view is never scrolled for the student. `animateToOrder`
  pins an anchor card, skips the FLIP for a card travelling further than one
  viewport, flashes the landing spot, and raises a chip naming the new position
  with Show me / Undo when the landing spot is off screen.
- Cached course snapshots and status text; search does not re-run the full DOM contract.
- Extension-owned DOM mutations are ignored to prevent reconcile loops.
- Reorder confirmation is an inline page bar instead of a blocking browser dialog; confirmation is still required.
- Existing MyUCLA color picker, multiple Plans, optimizer, and conflict UI are preserved.

## Real-page facts already verified

On 2026-08-19, with the user logged in and explicitly authorizing a minimal test:

1. A native up/down click submitted the MyUCLA form and caused full-page navigation.
2. The expected adjacent pair swapped.
3. A normal refresh retained the changed order, confirming server persistence rather than a DOM-only reorder.
4. The inverse native move restored the original order, and another refresh confirmed restoration.
5. No Enroll, Drop, Remove, Exchange, or Waitlist action was clicked.

Do not repeat live mutation tests casually. If a future DOM change makes revalidation necessary, use one adjacent move, record the original order, immediately restore it, and retain explicit user confirmation.

Exact sanitized selectors and button rules are in `docs/MYUCLA_CONTRACT.md`.

## Architecture map

- `public/manifest.json` — exact URL match and the single `storage` permission.
  Two content scripts: the isolated-world extension, and a page-world bridge
  that reads MyUCLA's timeout counters and nothing else.
- `src/page-bridge/index.ts` — the page-world bridge (reads two numbers, posts
  them same-origin, never writes to the page).
- `src/content/session-clock.ts` — validates those messages and derives the chip.
- `src/content/boot-hold.ts` — the quiet-reload hold.
- `src/content/index.ts` — selects the real MyUCLA controller or local fixture controller.
- `src/adapters/myucla-adapter.ts` — strict real-page DOM and native-button allowlist, bound to one `Document`.
- `src/content/fast-reorder.ts` — offscreen-frame reorder engine and the `PlannerFrame` seam used by tests.
- `src/content/myucla-controller.ts` — toolbar, bottom action bar, card controls,
  filtering, collapse state, tags, move feedback, confirmation UI.
- `src/content/navigation-reorder.ts` — cross-navigation one-step reorder coordinator.
- `src/content/plan-insights.ts` — pure read-only status detection, filtering, and summary logic.
- `src/domain/reorder.ts` — adjacent-move planning and expected-order functions.
- `src/storage/annotations.ts` — validated local tag storage.
- `public/injected.css` — real-page styles; selectors are namespaced with `pl-`.
  Tokens mirror the live page (see `docs/MYUCLA_CONTRACT.md`), and form controls
  need element-name specificity to beat MyUCLA's Bootstrap base rules.
- `src/storage/settings.ts` — the popup on/off switch, watched by the content script.
- `tests/` — DOM contract, queue, controller, insights, storage, and reorder tests.
- `harness/` — headless-Chromium preview. `fixture.mjs` builds an invented plan
  that satisfies the production contract (note: the native buttons must carry
  **no** `type` attribute, or `isSafeMoveButton` rejects them); `run.mjs` loads
  the built `dist/` against it and screenshots into `harness/shots/`;
  `probe-position.mjs` checks that "move to #N" lands on #N from every start.
  Use it before asking the user to reload the extension.
- `scripts/build.mjs` — bundles `dist/` with esbuild.

The fixture/demo adapter remains intentionally separate from the real adapter so looser demo markup cannot weaken the production contract.

## Storage and privacy

Persistent local storage:

- Tags keyed by validated term/Plan/course identifiers.

Temporary local storage during sorting:

- Target course, target position, expected full order, step count, expiry, and random operation ID.
- A random operation ID is also kept in page `sessionStorage` so only the initiating tab resumes.
- Pending state is cleared on success, cancel, failure, or expiry.

There is no fetch, XHR, WebSocket, beacon, telemetry, analytics SDK, or external server.

## Deliberately not built

Each of these was asked for and declined with a reason. Re-read the reason
before implementing one.

- **Unit-cap dates ("when can I go to 22 units", "when can I petition").** The
  Registrar states the second-pass cap is the student's *College or school
  study-list limit*, not a universal number, and excess-unit petitions open with
  second pass rather than on their own date. Any hard-coded number or date would
  be wrong for some students in some terms, during enrollment, when it matters
  most. The overflow menu links to the authoritative page instead.
- **GE requirement tags.** Not present in the Class Planner DOM, so it would
  require scraping the Schedule of Classes per course. GE credit is
  college-specific and a wrong tag can cost a graduation requirement. The
  local note field already lets a student write `GE 社科` and search for it.
- **Background session heartbeat / auto re-login.** Still not built. A timer-based
  ping keeps an unattended machine signed in, which is the exact thing the idle
  timeout protects, and re-login needs credentials and Duo. What *is* built
  (0.8.0) is narrower: MyUCLA's own extend call, fired only by real input on a
  visible, focused tab, at most once a minute, with a hard cap. See
  `docs/MYUCLA_CONTRACT.md`.

## Known limitations

- User must load or reload `dist/` manually through `chrome://extensions`.
- The extension has not been published to the Chrome Web Store.
- UI state such as active search, compact mode, and collapsed cards is session-only and resets after a MyUCLA full-page reorder.
- Tags stay in the local browser and do not sync to MyUCLA.
- Status summaries reflect the currently rendered MyUCLA page; they are not independently refreshed.
- Bruinwalk, DARS, reminders, additional seat polling, and automatic lecture/discussion/lab combination management are not implemented.
- The folder is not currently a Git repository.

## Recommended next work

Kept in `README.md` under "State of play" so there is one list, not two. The
short version: watch a real multi-step save end to end, then seat-pressure
bars, then back-to-back gap warnings, then note export/import. Bruinwalk only
as a separate read-only integration with its own privacy review. Avoid DARS and
automated course-combination generation; both substantially expand
sensitive-data and correctness risk.

Do not rebuild a weekly grid. MyUCLA ships one on this page.

### Getting a build onto a macOS user's machine from a Linux sandbox

The mounted folder refuses `unlink`, so `tar x` and `rm -rf dist` both fail with
EPERM, and the user's `node_modules/esbuild` is a darwin binary that will not
run under `device_bash`. What works: build `dist/` in the Linux sandbox, ship it
as a tarball, extract to `/tmp` on the device, and `cat file > dest` over each
existing path. Then the user presses Reload on the extension card.

## Handoff checklist

- Read `AGENTS.md`, this file, `PRIVACY.md`, and `docs/MYUCLA_CONTRACT.md`.
- Preserve the user's existing files and unrelated changes.
- Run tests before and after changes.
- Rebuild `dist/` after source or public asset changes.
- Update `CHANGELOG.md`, this status, and the README when behavior changes.
- Never place real logged-in page data in repository files or tool output intended for sharing.
