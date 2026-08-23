# Better MyUCLA

An unofficial Chrome extension that makes the MyUCLA Class Planner less painful
to use. It works on exactly one page:

```
https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx
```

It is a UI layer. It never enrolls, drops, waitlists, polls for seats, or
touches credentials. When it saves a new order it does so by clicking MyUCLA's
own up/down buttons, one validated click at a time.

**Status:** working local beta, `0.10.2`. Not on the Chrome Web Store. Not made
by, endorsed by, or affiliated with UCLA.

Pull requests are welcome and are reviewed by the maintainer before anything
merges. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md).

**Trying it as a student:** the install guide is at
<https://astro-wen.github.io/better-myucla-planner/>, and the loadable zip is on
the [latest release](https://github.com/Astro-wen/better-myucla-planner/releases/latest).

**Working on it:** `dist/` is not committed. Clone, `npm install`,
`npm run build`, then load `dist/` as an unpacked extension.

---

## This file is the tracker

Everything a person or an agent needs to pick this project up starts here:

| Question | File |
| --- | --- |
| What is the state of play, what changed last, what is next? | this file |
| Version-by-version history and the reasoning behind each change | `CHANGELOG.md` |
| Architecture, seams, and the traps already paid for | `HANDOFF.md` |
| The exact MyUCLA DOM contract, verified on the live page | `docs/MYUCLA_CONTRACT.md` |
| Where the Class Planner hurts, ranked by value over effort | `docs/PAIN_POINTS.md` |
| A product and UX read of the page, including what UCLA should fix | `docs/UX_AUDIT.md` |
| What data may be stored and what may never be | `PRIVACY.md` |
| The rules no change is allowed to break | `AGENTS.md` |
| How to propose a change, and what CI will check | `CONTRIBUTING.md` |
| What a student reads before installing | `site/index.html` |

Every version bump updates this file's status line, adds a `CHANGELOG.md`
entry, and refreshes `HANDOFF.md` if the architecture moved.

---

## What it does today

### Reordering

MyUCLA moves a class one place per click, and each click is a full postback. A
class at position 13 needs eleven clicks and eleven page loads to reach
position 2.

- Drag a class anywhere in the plan, send it to the top in one click, or pick a
  position from the `#3` control on its row. `Alt + ↑/↓` works from the grip.
- A drag can cross the whole plan: hold near the top or bottom edge and the
  page scrolls to you.
- Rearranging is **local and free**. Nothing reaches MyUCLA until you press
  Save, so you can try three arrangements without paying for any of them.
- Save states what it is about to do (`4 classes moved · about 12s`) and that
  click is the authorization for the whole batch.
- The batch runs in an offscreen same-origin Class Planner frame, so the
  visible page reloads once at the end instead of once per step. If that frame
  cannot be trusted, nothing is written at all: your arrangement is kept and a
  Reload button appears. (`NavigationReorderCoordinator` still exists as a
  one-move-per-reload engine but is not wired in. See `HANDOFF.md`.)
- Any mismatch in page, term, plan, DOM, button, or expected order stops the
  run immediately.

### Where things went

A course card is roughly a quarter of the screen, so most moves send the card
out of view. Instead of scrolling the page for you:

- The view stays exactly where you were reading.
- The card that landed flashes pale yellow.
- If it landed off screen, a chip appears at the edge it left through:
  `↑ ANTHRO 7 → #2  [Show me] [Undo]`. It fades after seven seconds.
- Unsaved changes live in a bar pinned to the bottom of the window, so Save is
  reachable from anywhere in a five-thousand-pixel plan.

### Reading the plan

- Each card shows which classes it actually clashes with, in time or in final
  exam, read from MyUCLA's own popover payload. No guessing, no per-card
  clicking.
- Collapse a class, or all of them, and the seat status stays on the title
  line. Plans of eight or more open collapsed.
- Filter by course, instructor, page text, or your own note.
- Private notes per class, up to 24 characters, stored on this computer only.
- An unsaved arrangement survives a logout or a stray navigation for 24 hours
  and is offered back.

### Optional: tidy up MyUCLA's own layout

**Off by default.** Students know this page, and a familiar page that is
slightly untidy beats a tidy page they have to relearn during enrollment week.
0.10.0 turned this on for everyone and that was the wrong call; the switch in
the popup is the right one. Turned on, it:

- leads each class with the code you scan for, `MANAGEMENT 170`, instead of
  splitting it across two paragraphs with the title in between;
- prints the nine column labels once for the whole list rather than once per
  class, and puts every section table on one shared column grid;
- stops MyUCLA's weekly grid cutting room names in half: one line per field, an
  ellipsis when it does not fit, the full string on hover.

Switching it off restores MyUCLA's markup immediately, without a reload.
Everything it touches fails closed: a card whose two paragraphs do not match
the known shape, or a table that is not exactly nine columns, is left exactly
as MyUCLA drew it.

### Staying signed in

MyUCLA counts only clicks as presence, so reading a plan for fifteen minutes
signs you out. With the switch on, scrolling and mouse movement count too:
never on a timer, never in a background tab, at most once a minute, and it
stops after a cap you choose. MyUCLA's ~4 hour hard limit is untouched.

---

## Deliberately not built

Each of these was considered and declined. Read the reason before building it.

- **A weekly grid.** MyUCLA already ships one on this page, with Study List /
  Plan / Alternates toggles and a grid/agenda switch. Rebuilding it would be
  worse and redundant.
- **Auto-enroll, seat polling, waitlist sniping.** Out of scope, permanently.
- **Unit-cap dates.** The second-pass cap is a College-specific study-list
  limit, not a universal number. A wrong number during enrollment is worse than
  no number, so the menu links to the Registrar instead.
- **GE tags.** Not in the Class Planner DOM, college-specific, and a wrong tag
  can cost a graduation requirement. Use a note.
- **Background heartbeat or auto re-login.** Needs credentials and Duo, which
  this project never touches.
- **Bruinwalk ratings, DARS, PTE/ECR reminders.** Not in this version. Any of
  them needs its own privacy review first.

---

## Build and load

```bash
npm install
npm run typecheck
npm test
npm run build
```

Then in Chrome: `chrome://extensions` → Developer mode → Load unpacked →
select `dist/`. Open or reload Class Planner. After changing source you must
rebuild **and** press Reload on the extension card.

### Checking the UI without an account

`harness/` runs the built extension against a local stand-in for Class Planner
that reproduces the real DOM contract, so layout and motion can be checked
without logging in and without touching a real plan.

```bash
node harness/run.mjs idle       # first paint, and scrolled
node harness/run.mjs position   # move class 13 to #2, screenshot before/after
node harness/run.mjs top        # one-click move to top from off screen
node harness/run.mjs drag       # drag #14 to #1, holding at the top edge
node harness/run.mjs default    # the list as MyUCLA draws it (switch off)
node harness/run.mjs tidy       # the same list with the layout switch on
node harness/probe-position.mjs # does "move to #N" actually land on N?
```

Before publishing a release, `node harness/verify-install.mjs` walks the
install guide the way a student would: it zips `dist` exactly as the release
workflow does, unzips it, side-loads the unpacked folder into a clean Chrome
profile, then checks the extension card carries no errors and that every class
on the page really gets its controls.

The install guide's two Chrome screenshots come from
`node harness/chrome-extensions-page.mjs`, which side-loads `dist/` into a
throwaway profile and photographs `chrome://extensions` with Developer mode
off and on.

Screenshots land in `harness/shots/`. The fixture is entirely invented; never
paste a real plan into it.

---

## State of play

Verified on the live page on 2026-08-22, read-only unless noted:

- The section title bars are `#2C5E91` with a 7px radius, and MyUCLA already
  parks section actions on the right of them. Our toolbar now rides in the
  `Class Plan` bar for that reason.
- `td.linkPanelRight` is ~300px wide and MyUCLA's own controls use ~73px, which
  is why our row now fits beside them instead of underneath.
- A 17-class plan is ~5,800px tall with ~200px cards, so almost every move
  leaves the viewport. That is what the landing chip is for.

Open questions and next candidates, roughly in order:

1. Watch one real *mutating* save end to end. A single-step move has been
   verified; a multi-step batch through the offscreen frame has not been
   watched on the live page.
2. Seat pressure at a glance. `Waitlist: 12 of 15 Taken` and
   `Closed Class Full (36)` are already on the page; a small bar would make
   seventeen of them scannable. Read-only, no extra requests.
3. Back-to-back gaps. Meeting times are already rendered; flagging a ten-minute
   gap across campus is pure arithmetic on data we have.
4. Local export/import of notes, with schema validation and an explicit user
   action.
5. Bruinwalk, only as a separate read-only integration with a documented
   source, caching, rate limits, a visible failure state, and a privacy review.

Corrections found on 2026-08-22:

- `saveChanges` never falls back to `NavigationReorderCoordinator`, though the
  docs claimed it did. The claim is gone and that error now carries a Reload
  button. Wiring the real fallback is still open, and would mean one live
  postback per step against MyUCLA, so it needs its own decision.
- A BruinWalk extension is already injecting instructor ratings into this
  student's class list, so a rating integration of our own would duplicate a
  tool they already run.

Known limits: the extension must be loaded and reloaded by hand; notes stay in
this browser; view state resets on some MyUCLA re-renders; and the folder is
not a Git repository.

---

## License

MIT, see [`LICENSE`](LICENSE).

Better MyUCLA is a personal project. It is not made by, endorsed by, or
affiliated with UCLA, and "MyUCLA" and "UCLA" belong to the university.
