# State of play, and what is deliberately not built

Split out of `README.md`, which is now a front door rather than a notebook.
This is the notebook.

---

## Verified on the live page

Read-only observations from 2026-08-22 unless noted. These are the numbers
behind decisions that otherwise look arbitrary.

- MyUCLA's section title bars are `#2C5E91` with a 7px radius, and MyUCLA
  already parks section actions on the right of them. Our toolbar rides in the
  `Class Plan` bar for that reason rather than floating above the list.
- `td.linkPanelRight` is ~300px wide and MyUCLA's own controls use ~73px, which
  is why our row fits beside them instead of underneath.
- A 17-class plan is ~5,800px tall with ~200px cards, so almost every move
  sends the card out of view. That is what the landing chip exists for.
- Chrome blocks `chrome://` navigation from an automation extension, so the
  install screenshots are taken by a separate Playwright profile with the
  extension side-loaded. See `harness/chrome-extensions-page.mjs`.

Corrections found the same day, both worth remembering:

- `saveChanges` never fell back to `NavigationReorderCoordinator`, though the
  docs claimed it did. The claim is gone and that error now carries a Reload
  button. Wiring a real fallback is still open, and would mean one live
  postback per step against MyUCLA, so it needs its own decision.
- A BruinWalk extension is already injecting instructor ratings into this
  student's class list, so a rating integration of our own would duplicate a
  tool they already run.

---

## Open questions, roughly in order

1. **Watch one real mutating save end to end.** A single-step move has been
   verified on the live page. A multi-step batch through the offscreen frame
   has not.
2. **Seat pressure at a glance.** `Waitlist: 12 of 15 Taken` and
   `Closed Class Full (36)` are already in the DOM. A small bar would make
   seventeen of them scannable. Read-only, no extra requests.
3. **Back-to-back gaps.** Meeting times are already rendered, so flagging a
   ten-minute gap across campus is arithmetic on data already in hand.
4. **Local export and import of notes,** with schema validation and an explicit
   user action for each direction.
5. **Bruinwalk,** only as a separate read-only integration with a documented
   source, caching, rate limits, a visible failure state, and a privacy review
   of its own.

Known limits today: the extension is loaded and reloaded by hand, notes stay in
one browser, and view state resets on some MyUCLA re-renders.

---

## Deliberately not built

Each of these was considered and declined. Read the reason before building it.

- **A weekly grid.** MyUCLA already ships one on this page, with Study List /
  Plan / Alternates toggles and a grid/agenda switch. Rebuilding it would be
  worse and redundant.
- **Auto-enroll, seat polling, waitlist sniping.** Out of scope permanently,
  not "not yet".
- **Unit-cap dates.** The second-pass cap is a College-specific study-list
  limit, not a universal number. A wrong number during enrollment week is worse
  than no number, so the menu links to the Registrar instead.
- **GE tags.** Not in the Class Planner DOM, college-specific, and a wrong tag
  can cost a graduation requirement. Use a note.
- **Background heartbeat or auto re-login.** Would need credentials and Duo,
  which this project stays clear of entirely.
- **DARS and PTE/ECR reminders.** Each would need its own privacy review first.

---

## The optional layout switch

**Off by default, and it stays that way.** 0.10.0 restyled MyUCLA's own markup
for everyone and that was the wrong call: students know this page, and a
familiar page that is slightly untidy beats a tidy page they have to relearn
during enrollment week. 0.10.1 put it behind a switch in the popup.

Turned on, it:

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

---

## Everything else it does today

- **Where things went.** After a move the viewport stays where you were
  reading, the card that landed flashes pale yellow, and if it landed off
  screen a chip appears at the edge it left through:
  `↑ ANTHRO 7 → #2 [Show me] [Undo]`, fading after seven seconds.
- **Clashes.** Each card lists the classes it actually collides with, in time
  or in final exam, read from MyUCLA's own popover payload rather than guessed.
- **Collapse.** Per class or all at once, with seat status kept on the title
  line. Plans of eight or more open collapsed.
- **Filter** by course, instructor, page text, or your own note.
- **Notes,** up to 24 characters per class, in `chrome.storage.local`.
- **Draft recovery.** An unsaved arrangement survives a logout or a stray
  navigation for 24 hours and is offered back.
- **Staying signed in.** MyUCLA counts only clicks as presence, so reading a
  plan for fifteen minutes signs you out. With the switch on, scrolling and
  mouse movement count too: never on a timer, never in a background tab, at
  most once a minute, and it stops after a cap you choose. MyUCLA's ~4 hour
  hard limit is untouched.
