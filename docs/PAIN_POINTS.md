# Class Planner pain points

Observed on the live page on 2026-08-22, signed in, second pass active:
16 classes in the plan, 16.0 enrolled units, 19.0 max, 3.0 left.

Everything below stays inside `ClassPlan.aspx`, uses only data MyUCLA has
already rendered, and makes no extra requests. Ranked by value over effort.

---

## 1. The weekly grid is unreadable exactly where the week is busiest

MyUCLA ships its own grid on this page, and it is the right thing to have. But
each meeting is a `div.planneritembox`, absolutely positioned inside a
`div.timebox`, at `overflow: hidden` with 14px text in an 86px box holding
three or more lines. The result on a real plan:

- Room names are clipped mid-word: `Physics and Astronomy Building 1425`,
  `Bunche Hall 3153`, `Entrepreneur…`.
- Overlapping classes split the column, so Friday morning renders three classes
  as ~30px slivers with no readable text in any of them.
- 42 `span.icon-warning-sign.planConflict` markers are drawn, and the grid
  never says what any of them conflicts with.

**Fix, CSS only, no new data:** smaller and tighter type inside the block, the
course code bold on its own line, one line each for section and room with
`text-overflow: ellipsis` so nothing is cut mid-word, and a `title` on each
block built from that block's own text so hover gives the full string.
`.planneritembox.smallitem` shows the code alone.

Care: `.hide-small` / `.hide-above-small` inside each block are MyUCLA's
responsive variants. Do not collapse them into one.

**Effort:** small. **Risk:** low, presentation only.

---

## 2. Nothing answers "what still needs a decision from me"

With second pass open and 3.0 units left, the real question is: which planned
classes are still open, fit in the units I have left, and do not collide with
what I am already enrolled in?

Every input is on the page. Seat status per section, units per section,
enrolled state, and MyUCLA's own conflict payloads. Nothing puts them together,
so the student does it by eye across sixteen cards.

**Fix:** one line above the plan, derived and read-only:
`3.0 units left · 4 planned classes still open · 2 of those clash with your
Study List`. Clicking a part filters the list to those classes.

**Effort:** medium. **Risk:** low, but it must be visibly derived and must go
quiet the moment any input is unreadable. A wrong number here is worse than no
number.

---

## 3. Seat status is five different sentences

`Waitlist: 0 of 5 Taken`, `Closed Class Full (28)`, `Enrolled Class Full (40)`,
`Open: 12 of 150 Left`. Reading sixteen of those is slow, and the numbers are
not comparable at a glance.

**Fix:** keep MyUCLA's own sentence, add a two-tone bar beside it showing taken
against capacity, and reuse the one-word label already shown on collapsed
cards. Nothing is inferred that the sentence does not already state.

**Effort:** small. **Risk:** low.

---

## 4. A class you are already enrolled in looks like a class you are wishing for

That distinction changes what you do with the card, and right now it lives in
one word inside a table cell. A colour bar on the card edge, or a quiet mark on
the title line, separates "settled" from "still deciding" without adding text.

**Effort:** small. **Risk:** low.

---

## 5. Order has no stated meaning

Reordering matters because the plan order is the student's priority and the
Plan Optimizer reads it. The page never says so, which makes an entire feature
look decorative.

**Fix:** one sentence in the overflow menu, and the position numbers we already
render.

**Effort:** trivial.

---

## 6. Finals week is only visible one card at a time

Every card carries a `Final Exam:` line, and we already surface which classes
share a slot. What no view gives is finals week as a whole, which is where
"three exams on Friday" becomes visible.

**Fix:** a compact list, built from those lines, ordered by date, shown from
the overflow menu.

**Effort:** medium. **Risk:** low, but exam dates are load-bearing. Show
MyUCLA's own strings verbatim, and never reformat a date.

---

## 7. Seat counts go stale and only an absolute timestamp says so

MyUCLA prints `Study List refreshed at 3:34:43 PM` with its own Refresh link.
During enrollment that number matters, and an absolute time is harder to judge
than an age.

**Fix:** add `(12 min ago)` beside MyUCLA's own timestamp. Use MyUCLA's Refresh
link; add no polling and no timer.

**Effort:** trivial. **Risk:** low.

---

## Checked and deliberately not proposed

- **A weekly grid of our own.** MyUCLA already has one, with Study List / Plan
  / Alternates toggles and a grid/agenda switch. Improve theirs, do not replace
  it.
- **A units total.** The sidebar already shows Units Max, Units Left, and Total
  Enrolled Units for the term. Ours was redundant and was removed in 0.9.0.
- **Multi-plan management.** Rename, New, Save a Copy, Delete, Load and Print
  all exist above the plan.
- **A schedule optimizer.** Plan Optimizer exists.
- **Anything that enrolls, drops, waitlists, or watches seats.** Out of scope,
  permanently. See `AGENTS.md`.
