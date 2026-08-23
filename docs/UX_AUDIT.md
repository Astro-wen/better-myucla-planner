# Class Planner: a product and UX audit

Written 2026-08-22 from the live page, signed in, during an active second pass.
Numbers below are measured, not estimated. No real course data is reproduced
here.

Measured shape of the page:

| | |
| --- | --- |
| Page height | 5,633px |
| Viewport | 741px, so 7.6 screens |
| Clickable elements | 395 |
| Class list section | 3,731px, 66% of the page |
| `<th>` cells inside the class list | 144, for 16 classes |
| Classes in plan | 16 |

---

## 1. The page is organised by feature, not by task

A student opens this page during enrollment with one job: get into classes.
What they meet, in order, is a page title, a paragraph of instructions, a term
selector, a disclaimer about a term they are not in, a row of file-management
links, a red sentence about their enrollment pass, a timestamp, a weekly grid,
an optimizer, a search box, and then, 1,900px down, the list they came for.

The list is two thirds of the page and it is the fourth thing you reach.

**What a task-first page would lead with:** what is open, what still needs a
decision, how many units are left, and how long the pass stays open. All four
facts exist on the page today, in four different places, none of them at the
top.

---

## 2. Things that could simply be deleted

Ranked by pixels recovered per unit of risk.

1. **The 9-column table header, repeated 16 times.** Every class prints its own
   `Change / Section / Status / Info / Days / Time / Location / Units /
   Instructor` header, and classes with a lecture plus a discussion print it
   twice. That is 144 header cells restating the same nine words. Print it once
   at the top of the list, or drop the header entirely and label the fields
   inline. This is the single largest redundancy on the page.
2. **The term, printed twice.** A grey bar says `Fall 2026` on the left and a
   dropdown says `Fall 2026` on the right, side by side, in the same strip. The
   dropdown alone does both jobs.
3. **A Summer Sessions disclaimer, shown in a Fall term.** Three lines
   explaining the difference between two summer terms, permanently occupying
   the top of the page regardless of which term is selected.
4. **`All times are in Pacific Time (PT)`** as its own line. True of every time
   on every UCLA page.
5. **The intro paragraph.** Two lines describing what a class planner is, to
   someone already using it.
6. **`In Study List but Not In Current Plan`.** A full blue section header,
   with a collapse control and a help icon, wrapping one sentence whose content
   is "there is nothing here". A section that has nothing to say should not
   claim a header.
7. **`Find a Class and Enroll`** appears in the sidebar *and* on the search
   section's title bar, three inches apart.
8. **The Voter Registration panel** on the page a student uses during
   enrollment week. It belongs on the home page.

---

## 3. Plans are named after the moment they were created

The current plan is called `6/1/26 1:28 PM`. The plan picker offers
`Primary: 6/1/26 1:28 PM`.

The entire point of having multiple plans is comparing them, and a timestamp
cannot be compared to another timestamp. `Rename Plan` exists, but a default
this bad guarantees that most students never have two distinguishable plans.

**Fix:** default to `Fall 2026 Plan 1`, and show the timestamp as secondary
text. Cost: one line of code. Effect: the multi-plan feature becomes usable.

---

## 4. The class card splits the one identity a student thinks in

A card reads:

```
Class 15: Management
170 - Real Estate Finance and Investments
```

Nobody says "Management 170". They say **MGMT 170**, and that is the string
they scan for, search for, and type into the enrollment page. The page leads
with `Class 15:`, which is a row number, and then splits the subject from the
catalogue number across two lines with the title wedged between them.

**Fix:** `MGMT 170` bold on the first line, the title beneath it, the row
number as a quiet prefix or not at all.

---

## 5. Controls that misrepresent what they are

- **`Grid View: ☑ | Agenda View: ☐`** are mutually exclusive, drawn as two
  independent checkboxes. That is a radio group, or better a two-item segmented
  control. As drawn, the obvious question "what happens if I tick both" has no
  answer.
- Worse, `Study List: ☑ | Plan: ☑ | Alternates: ☐` sit in the *same*
  pipe-separated row, in the *same* checkbox style, and they are genuinely
  independent filters. Five identical controls in one row doing two different
  jobs.
- **`Grid size: + −`** with no current value, no range, and no memory of what
  you last chose.
- **`Delete Plan`** sits between `Save a Copy...` and `Load Plan` in a row of
  pipe-separated text links, styled identically to `Print`. An irreversible
  action given the same visual weight as printing.
- **The `Change` column.** The darkest, highest-contrast cell in every row of
  every class is a dark blue header-styled box containing a pencil. It reads as
  a table header, it is the leftmost thing your eye lands on, and it is an
  action most students take rarely. The most prominent element in the list is
  not the most important one.

---

## 6. Time is formatted for a database, not a person

- `Study List refreshed at 3:34:43 PM`. Second-level precision on a number
  whose only useful reading is "how stale is this". `Refreshed 12 minutes ago`
  answers the question; the exact second never will.
- The enrollment window is shown as `Begins 06/25/26 4:00pm` and
  `Ends 10/09/26 11:59pm` in a table, *and* as a separate red sentence saying
  the pass is currently active. Two renderings of one fact, neither of which
  says the thing that matters: how long you have left.
- The appointment table headers are `Units\nMax` and `Units\nLeft`, which wrap
  into something that reads as `Units Units / Max Left`.

---

## 7. The weekly grid breaks exactly where the week is hard

Covered in detail in `PAIN_POINTS.md`. In short: `div.planneritembox` is
`overflow: hidden` with 14px text in an 86px box holding three or more lines,
so room names are cut mid-word; overlapping classes split the column into
unreadable slivers; and 42 conflict markers are drawn without ever saying what
conflicts with what.

---

## 8. The gaps between panels are where the real work happens

Every fact a student needs during second pass is on this page. None of the
connections are.

- `Units Left: 3.0` is in the sidebar. The units per class are in the list.
  Nothing adds them up against each other.
- Whether you are **already enrolled** in a class or merely **hoping** for it
  is one word inside a table cell, styled like every other word. It is the
  single fact that changes what you do with a card.
- The ordering of the plan is the student's own priority and the optimizer
  reads it, and nothing on the page ever says so, which makes an entire feature
  look decorative.
- `Personal Entries` asks for a start and end time as two dropdowns with 96
  options each, in 15-minute steps from 12:00 AM.

---

## 9. Notes for this project

- **A BruinWalk extension is already installed on this browser** and is
  injecting instructor rating badges into the class list. Building our own
  rating integration would duplicate a tool the student already has. Drop it
  from the roadmap unless they say otherwise.
- **The documented fallback does not exist.** `HANDOFF.md` and `README.md` say
  `FastReorderCoordinator` falls back to `NavigationReorderCoordinator`.
  `MyUclaPlannerController.saveChanges` only ever calls the fast one; on
  `unavailable` it shows an error and stops. Either wire the fallback or stop
  claiming it. Seen live: a stale tab produced
  `The background page has different classes than this one`, which is correct
  advice but a dead end.
- That error should carry a **Reload** button rather than telling the student
  to reload.

---

## What I would actually change first, as a product call

1. Print the table header once, not sixteen times. Biggest reduction in visual
   noise for the least risk.
2. Make the weekly grid legible. Highest perceived quality gain per line of
   CSS.
3. Lead each card with `MGMT 170`.
4. Give the enrollment pass one sentence with a countdown, at the top, and
   delete its other two renderings.
5. Default plan names to `Fall 2026 Plan 1`.

Items 1 to 3 are things an extension can do. Items 4 and 5 are things only
UCLA can do, and are worth sending to UIT as feedback.
