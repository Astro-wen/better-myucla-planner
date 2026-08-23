# Changelog

## 0.10.2 — 2026-08-23

Copy and packaging only. No behaviour changed.

- The extension's own description no longer promises what it will not do. It
  now says what saving actually does: it replays your arrangement through
  MyUCLA's own up and down buttons. The old line ended "never enrolls for
  you", which is true and reads like a disclaimer on a bottle.
- The install guide gained a recorded demo, and its screenshot of the
  extension card was retaken to match the new description.
- `harness/verify-install.mjs` walks the published install steps end to end:
  it zips `dist` the way the release workflow does, unzips it, side-loads the
  unpacked folder into a clean Chrome profile, and checks that the card
  appears without errors and that all seventeen classes get their controls.

## 0.10.1 — 2026-08-23

**0.10.0 changed too much at once, and it is now off by default.**

Everything 0.10.0 did to MyUCLA's own markup was a defensible individual call
and a bad call taken together. Students know this page. Reshaping the class
list, the card titles and the weekly grid in one release means relearning a
familiar tool in the middle of enrollment week, and a page you have to relearn
is worse than a page that is slightly untidy. Reported plainly by the student
using it, which is the only test that counts.

- The Class Planner looks exactly as it did in 0.9.1 again: MyUCLA's own two
  paragraphs per card, its own per-class column headers, its own weekly grid.
- The 0.10.0 work is kept behind one switch in the popup, **Tidy up MyUCLA's
  own layout**, off by default. Flipping it restores the page instantly rather
  than waiting for a reload, in either direction.
- Nothing about the extension's own controls changed. Reordering, the landing
  chip, the bottom save bar and the drag auto-scroll are all still on.

The **Reload page** button on a failed save stays, because that was a bug fix
rather than a change of appearance.

Lesson recorded in `HANDOFF.md`: our own injected controls are ours to design,
but MyUCLA's markup is the students' habit, and changing it is opt-in.

## 0.10.0 — 2026-08-23

The first version aimed at MyUCLA's own presentation rather than at our own
controls. Three findings from a full product read of the live page, written up
in `docs/UX_AUDIT.md`.

**The class list repeated its column header sixteen times.** Every class prints
its own `Change / Section / Status / Info / Days / Time / Location / Units /
Instructor` row: 144 header cells for nine distinct words, measured on a real
sixteen-class plan.

- Only the first class the student can actually see keeps its header, and that
  one is now a small uppercase caption rather than a grey band.
- Removing them exposed a second problem: each class is its own `<table>`, so
  every card sized its columns from its own content and the Time column moved
  by up to eighty pixels from one class to the next. All nine-column tables now
  share one fixed grid, so the list finally reads as one table.
- The shared grid is applied only to the exact nine-column shape in the
  contract. Anything else keeps MyUCLA's automatic layout.

**A class was split across the one string students actually use.** MyUCLA
prints `Class 15: Management` and `170 - Real Estate Finance and Investments` as
two paragraphs, so the identity a student scans for, searches for, and types
into the enrollment page is cut in half with the title wedged between the
pieces.

- One line now leads with `MANAGEMENT 170`, title beside it.
- MyUCLA's paragraphs are hidden, never rewritten, so the adapter still reads
  the official label and everything is reversible.
- Parsing is fail-closed: unless both paragraphs match exactly, the card is left
  exactly as MyUCLA drew it.
- Cards lost roughly a third of their height, which also means fewer moves send
  a card off screen.

**MyUCLA's weekly grid was illegible where the week is hardest.** Each meeting
is an absolutely positioned box at `overflow: hidden`, 14px text in a box as
short as 48px, three lines separated by `<br>`. Long room names wrapped and were
cut in half by the bottom edge.

- Each run becomes one line that ends in an ellipsis instead of a cut, the
  course code is bold, and the full string moves to the `title` attribute so a
  30px-wide column still tells you what it is on hover.
- The conflict marker moves to the corner instead of sitting mid-sentence.
- MyUCLA's `<br>` and `.hide-above-small` responsive pair is left intact and
  the new layout applies only above their breakpoint.

**Corrections**

- `saveChanges` never fell back to `NavigationReorderCoordinator`, though
  `README.md` and `HANDOFF.md` both said it did. The claim is gone. When the
  offscreen frame cannot be trusted nothing is written, the arrangement is kept,
  and the error now carries a **Reload page** button instead of telling the
  student to reload and leaving them to find it.
- A BruinWalk extension is already injecting instructor ratings into this class
  list, so a rating integration of our own is off the roadmap.

## 0.9.1 — 2026-08-22

**A long drag was impossible.** Reported from the real page: grab a class near
the bottom of a 16-class plan, drag toward the top, and the page does not
follow. The pointer cannot leave the window, so the card stops at the top edge
and #15 can never reach #1. Dragging only ever worked within one screenful.

- Hold near the top or bottom edge and the page now scrolls to you, ramping up
  quadratically over the last 110px so a nudge creeps and a hard press moves.
- Drag distance is now measured in document space, not viewport space.
  Previously the card was positioned from `clientY`, which is measured against
  a viewport that was itself moving, so any scroll during a drag would have
  slid the card out from under the cursor.
- The lifted card gets a shadow and paints above MyUCLA's section bar, so it
  reads as picked up.
- Nothing is dimmed during a drag any more. A drag from #14 to #1 pushes
  thirteen cards, and fading all of them to make one stand out cost more than
  it bought.

Verified in the harness: from index 13, holding at the top edge scrolls 2,243px
and the card lands at index 0.

## 0.9.0 — 2026-08-22

First version written after actually looking at the live page rather than at a
fixture. Three findings drove almost every change in it.

**Finding 1: the injected UI looked bolted on because it was.** Every Class
Planner section has a `#2C5E91` title bar with a 7px radius, and MyUCLA already
parks that section's actions on the right of it — `Find a Class and Enroll`
sits there on the search section. Our toolbar was a bare row floating on white
above the list.

- The toolbar now mounts inside MyUCLA's own `Class Plan` title bar
  (`#plannerSectionClip`), right-aligned, in the page's own idiom. If that bar
  is ever missing the old placement is still there as a fallback.
- Controls on that bar get the inverse treatment: white outlines on blue, and
  UCLA gold reserved for the one action waiting on the student.

**Finding 2: the per-class controls were a second row of icons.**
`td.linkPanelRight` is ~300px wide and MyUCLA's colour swatch plus up/down
arrows use only ~73px of it, so there was never a reason to wrap.

- Our controls now sit on the same line as the native ones, separated by a
  hairline so it stays obvious which buttons belong to the page:
  `[colour] ↑ ↓ │ ≡ ⌃⌃ #3▾ ◇ ⌄`.
- The position control was a bare number, which reads as a label. It now shows
  `#3` with a caret, and its dropdown carries a `Move to position` group
  heading so the verb is stated once.

**Finding 3: a class card is a quarter of the screen.** A real 17-class plan is
~5,800px tall with ~200px cards. "Move to #2" from #13 sends the card two
thousand pixels away, and the old build simply let it vanish with no trace —
which is why it felt like everything jumped to the top no matter what you
picked.

- The page is never scrolled for the student. An anchor card is pinned so the
  rows that shifted above them do not drag the view.
- The card is no longer dragged across a distance nobody can follow; the
  neighbours animate closing the gap instead.
- The card that landed flashes pale yellow.
- When it lands off screen, a chip slides in at the edge it left through:
  `↑ ANTHRO 7 → #2  [Show me] [Undo]`, gone after seven seconds. Following it
  is the student's choice, not ours.

**Save had to follow the student.** With the toolbar in the section header,
Save was a full screen above someone rearranging class 14 of 17. Unsaved
changes, the restore-a-draft offer, and save progress now live in a bar pinned
to the bottom of the window, which is also where they belong on their own
merits.

**Everything is English**, and the popup was rewritten around one question a
student would actually ask: what does this thing do? It now leads with what the
extension adds, and explains the keep-alive switch in terms of the thing that
bites — MyUCLA counts clicks as presence, and reading is not clicking.

**Removed**

- The `Better MyUCLA · N classes · N units · N conflicts` header line. The
  conflict information is on the cards where it is useful, and the rest was
  noise in a header. Only a `1 of 3` count survives, shown only while a filter
  is actually hiding classes.
- Compact mode, and the persisted `compact` view-state field with it.

**Added: a UI harness.** `harness/` drives the built extension against an
invented Class Planner that satisfies the real DOM contract, under headless
Chromium. Layout, motion, and "does move-to-#N land on #N" can now be checked
without an account and without touching a real plan.

**Not built, after checking:** a weekly grid. MyUCLA already ships one on this
page, with Study List / Plan / Alternates toggles and a grid/agenda switch.

## 0.8.0 — 2026-08-20

**Conflicts, corrected twice and now actually useful.** 0.6.1 stopped counting a
layout wrapper as a conflict, but over-corrected: time conflicts carry no class,
no aria-label and no distinct icon. MyUCLA keeps the real answer inside the
popover payload behind each warning triangle:

```html
<div class="popover_section_title warning light">Warning: Time Conflicts</div>
<ul class='bulleted_list'><li>DESMA 10</li><li>ENGR 170</li></ul>
```

- Conflicts are now read from that payload, split into time and final-exam.
- Each card shows which courses it actually clashes with, so answering "what
  does this collide with" no longer costs one popover click per course.
- The toolbar count (`N 门有冲突`) is finally truthful.

**Session: presence, not a heartbeat.** On the Class Planner `keepAlive` is
empty — there is no MyUCLA heartbeat — and `Timeout.js` only extends on
`mousedown keydown click`. Scrolling through a plan for fifteen minutes counts
as absent, and signs the student out. With the student's explicit request:

- Scrolling, wheel, mouse movement, keys and touch now count as presence.
- Never on a timer, never while the tab is hidden or the window unfocused,
  never more than once a minute, and it stops after a cap (default 60 minutes;
  30 / 60 / 120 / off in the popup).
- It calls MyUCLA's own `ExtendSession`; the extension builds no requests.
- Walk away and the session still expires on its original schedule. The ~4 hour
  absolute cap is untouched, and auto re-login remains out of scope — that needs
  credentials and Duo, which this project never touches.

The popup gained the keep-alive switch and its cap.

## 0.7.0 — 2026-08-20

- **已选上 N 学分** in the toolbar, summed only from sections MyUCLA has already
  marked `Enrolled`, with the Units column located by header rather than by
  position. This is the number a study-list limit applies to; a plan-wide total
  is not, since nobody enrols in their whole plan.
- **An interrupted arrangement can be recovered.** Unsaved rearrangements are
  kept locally (course identifiers only, 24-hour expiry) and offered back after
  a timeout, a stray navigation, or a re-login — but only while MyUCLA's own
  order is still the one the draft was built on. Stale drafts are dropped
  silently.
- A link to the Registrar's enrollment-pass and study-list-limit page in the
  overflow menu.

Deliberately not built — see the notes in `HANDOFF.md`:

- Hard-coded "22 units" / petition dates. The Registrar states the second-pass
  cap is "the maximum units allowed by their College or school study-list
  limit", and excess-unit petitions open *with* second pass rather than on a
  separate date. There is no single correct number or date to display.
- GE requirement tags. The data is not on the Class Planner page, GE credit is
  college-specific, and getting it wrong costs a student a graduation
  requirement. The existing per-course note field covers the same need at zero
  risk.
- An automatic session keep-alive. See `docs/MYUCLA_CONTRACT.md`.

## 0.6.2 — 2026-08-20

- **The numbers snapped back the moment you pressed save.** `saveChanges` called
  `restoreLabels()` and cleared the pending state up front, so MyUCLA's original
  `Class N:` numbering returned while the list still showed the student's
  arrangement — the page disagreed with itself for the whole save. The
  arrangement, its renumbering and its position chips now stay exactly as the
  student left them until the reload replaces the page.
- **"后台页面顺序与当前页面不一致" now self-heals.** The visible page can be
  behind the server (a stale tab, or an earlier run that landed after we stopped
  watching). The arrangement is a complete order, so as long as the offscreen
  frame holds the same set of courses it is still exactly achievable: the engine
  starts from whatever the server really has and re-plans. It only refuses when
  the course set itself differs, which a refresh genuinely is the fix for.
- A postback arriving mid-save no longer reverts what the student is watching.

## 0.6.1 — 2026-08-20

Diagnosed from the live page: the Class Planner sits inside the
`ctl00_main_wrapper` ASP.NET **UpdatePanel**, so a colour change or an official
ordering click can come back as an async partial postback that replaces the
panel's contents without any navigation. Three reported problems were all this.

- **The extension vanished after changing a colour.** The MutationObserver was
  attached to the course `<table>`, which the postback discards, so it never
  fired again and nothing was ever rebuilt. It now watches `document.body` and
  re-injects, guarded by a cheap check so unrelated page activity is ignored.
- **Dragging appeared unable to reorder, then showed a red timeout.** The
  offscreen engine waited for an iframe `load` event that a partial postback
  never fires, so every step timed out after 15s. It now waits for the expected
  order to appear in the frame, which covers navigation and partial postbacks.
- **Unsaved arrangements were silently lost** on a postback (`beforeunload` does
  not fire for these). The controller now compares the re-rendered order against
  the saved baseline: same order means the arrangement is restored, a different
  order means MyUCLA moved things itself and the student is told.

Also fixed:

- **Every course was reported as conflicting.** `div.final_exam_info
  .exam_conflict` wraps the "Final Exam:" line on all 17 cards — it is layout,
  not state. Conflicts now count only MyUCLA's explicit conflict control, which
  on the test plan means 2 rather than 17.
- MyUCLA prints `Class N:` into each title; those numbers now follow an unsaved
  arrangement and are restored on save or discard.
- The collapse chevron pointed the wrong way (up while already collapsed).
- A postback during a drag could strand the drag outline on a card.
- The toolbar rebuild no longer drops an active search filter.
- Plans of 8 or more courses now open collapsed the first time, then remember
  whatever the student chooses.

## 0.6.0 — 2026-08-20

Reordering is now batched. Dragging, `置顶`, the position chip and `Alt + ↑/↓`
only rearrange the visible list; nothing reaches MyUCLA until the student clicks
one save that states how many changes and roughly how long it will take.

- One confirmation, one background run, one reload per save session instead of
  per move. The drag handle no longer greys out after a single drag.
- `撤销` restores the order MyUCLA still has, so trying an arrangement is free.
- A `beforeunload` guard fires only while there are unsaved moves.
- `nextStepTowardOrder` / `countStepsToOrder` plan a whole target permutation
  and recompute after every round trip, so a run self-corrects rather than
  replaying a stale script.
- The wait is phrased in seconds, not native click counts.

UI:

- Removed the blue panel behind the toolbar. It is now a plain control row with
  a hairline under it; the only emphasised element is the unsaved-changes pill.
- Collapsed cards keep their seat status on the title line (`有空位`, `候补`,
  `已满`, `部分有位`, `已选上`, plus `· 冲突`), so collapsing costs nothing.
- Compact mode and per-course collapse now persist per term/Plan, because our
  own post-save reload used to throw them away.

Removed:

- The always-on session countdown chip. MyUCLA already opens its own
  "Session Ending Soon" dialog, any click silently extends the idle timer, and a
  permanent clock mostly taught a wrong mental model. Remaining time now appears
  only inside the unsaved-changes pill, and only under 20 minutes, where it
  actually predicts losing work.

## 0.5.0 — 2026-08-20

Fixes found by running 0.4.x on the real page:

- **Stray horizontal rules.** MyUCLA puts a `tbody.course_divider` between every
  course. Our row spacing spread those out into floating lines. They are now
  hidden while the card treatment is on.
- **Card styling silently dropped.** The design tokens were declared only on our
  own elements, and the official course table is a sibling, not a descendant, so
  every `var()` in the card rules was invalid at computed-value time — no border,
  no white fill, no radius. Tokens are now declared on `.pl-plan-root` too.
- **Position chips went stale** after an optimistic drag; they now follow the
  displayed order.

Perceived-cost work:

- Replaced the spinner pill with a 2px page-load style hairline at the top edge.
  Saving order is plumbing; it should read as the page working, not as a task
  the student has to supervise.
- The reload after a sync now holds the plan area back for a beat and fades it
  in, so it settles instead of flashing. The stylesheet reveals it on its own if
  the script never runs.
- The confirmation shrank to a single small pill (`LING 1 → 第 2 位`), with the
  step count kept in its tooltip rather than shouted in the bar.

New:

- A session countdown chip in the toolbar. MyUCLA logs students out on a timer
  and they usually find out by being bounced to the login page mid-task; the
  chip turns amber under 10 minutes and red under 3 so they can refresh first.
  A page-world bridge reads only MyUCLA's own two timeout counters and forwards
  them; it calls nothing, extends nothing, and sends nothing off the page.

## 0.4.1 — 2026-08-20

- Matched the injected UI to the live Class Planner design system: ProximaNova,
  `#0055A6` / `#2C5E91` blues, `#E6F1F7` panel fill, 7px radius, and MyUCLA's own
  `icon-*` font for every control glyph.
- Gave each official course `<tbody>` a real card outline, following the page's
  actual three-row / `rowspan=2` cell layout.
- Raised control specificity over the page's Bootstrap base rules
  (`select{width:220px}`, `input{width:206px}`, `input[type=search]` content-box).
- Dropped the blocking sync overlay for a small corner progress pill.
- Drag now commits optimistically: the card stays where it was dropped and the
  list slides (FLIP) while the background sync runs, then one reload confirms.
- Replaced the popup's demo launcher with a single on/off switch; the content
  script starts and disposes live when the switch changes.
- Confirmed on the live page that a same-origin offscreen `ClassPlan.aspx` frame
  is readable and matches the visible plan, and that MyUCLA has no move-to-index
  command — `!0` is a constant suffix on every command, not a distance.

## 0.4.0 — 2026-08-20

- Added a background sync engine: the multi-step native reorder now runs inside an
  offscreen same-origin Class Planner frame, so the visible page reloads **once**
  at the end instead of once per adjacent swap.
- Kept every safety property of the old flow: exact page contract, exact native
  button allowlist, one move per full frame load, full expected-order check after
  each load, user confirmation, and cancel.
- Falls back to the original per-navigation flow when the offscreen frame cannot
  be trusted (blocked frame, different plan/term, or order mismatch).
- Restores scroll position and shows a short result message after the final reload.
- Rebuilt the injected UI: single compact toolbar, chip counters, icon-only card
  controls, and an overflow menu for rarely used actions.
- Replaced the confusing `主选 / 保底` tag placeholder with a hidden-by-default
  note field explained in plain language.
- Replaced the `置顶 / 位置 / 移动` button cluster with a position chip that moves
  the course when changed, plus a dedicated top button.
- Replaced HTML5 drag-and-drop with pointer dragging: neighbours slide out of the
  way in real time and `Esc` cancels.
- Gave each official course row a card treatment with spacing, rounded corners,
  and drag/hover states.

## 0.3.2 — 2026-08-20

- Replaced the large blocking reorder `window.confirm` with a compact inline confirmation bar.
- Kept explicit confirmation before any native MyUCLA ordering operation.
- Added controller coverage for opening and cancelling the inline confirmation.

## 0.3.1 — 2026-08-19

- Simplified the toolbar to product name, course/conflict count, search, compact mode, and one collapse toggle.
- Removed the status-filter dropdown and per-course status badges from the real-page UI.
- Reduced each course control row to drag, top, target position, move, collapse, and a small tag field.
- Cached verified course snapshots instead of repeating the full DOM contract during search and view changes.
- Replaced full course-card cloning with direct text-node reading below the header row.
- Ignored extension-owned DOM mutations to prevent unnecessary reconciliation loops.
- Added regression checks ensuring search neither clones cards nor re-runs the full contract.

## 0.3.0 — 2026-08-19

- Renamed the product UI to Better MyUCLA.
- Added plan search across rendered course/instructor text and local tags.
- Added Open, Waitlist, Enrolled, full/Closed, tagged, and conflict filters.
- Added plan status summary using only already-rendered MyUCLA information.
- Added per-course collapse, collapse/expand all, compact mode, and reset view.
- Redesigned the real-page toolbar and per-course sorting controls.
- Added read-only plan-insight tests and real-controller UI integration tests.
- Increased the verified suite to 42 passing tests across 9 files.

## 0.2.0 — 2026-08-19

- Added the exact MyUCLA Class Planner URL permission.
- Added the strict real-page DOM adapter and native sorting-button allowlist.
- Added server-persisted top, target-position, drag, and keyboard ordering.
- Added safe resume across MyUCLA full-page navigation with write-ahead order checks.
- Added local tags while preserving the official MyUCLA color picker.
- Verified native ordering behavior and restored the original live-page order.
- Added the privacy statement and sanitized MyUCLA DOM contract.

## 0.1.0 — 2026-08-19

- Created the local fixture prototype.
- Implemented adjacent-move planning, safety checks, annotations, demo UI, and initial tests.
- Kept real MyUCLA access disabled pending page verification.
