/**
 * Finals week, as one week.
 *
 * MyUCLA's own grid on this page draws the ten weeks of instruction. Finals
 * week is a different week and nothing anywhere draws it, so every card carries
 * its own `Final Exam:` line and the student reads seventeen of them one at a
 * time. `docs/PAIN_POINTS.md` #6.
 *
 * Everything here is derived from strings MyUCLA already rendered. No requests,
 * no writes, no stored data. Where a line cannot be read it is shown unplaced
 * rather than guessed at, because an exam drawn on the wrong day is worse than
 * an exam the view admits it could not place.
 */

import type { FinalExam } from "./plan-insights";

export interface FinalsEntry {
  /** The course code exactly as the plan list shows it. */
  label: string;
  exam: FinalExam;
  /** Settled, rather than still being decided. MyUCLA's own word for it. */
  enrolled: boolean;
}

interface PlacedExam extends FinalsEntry {
  day: string;
  startMinutes: number;
  endMinutes: number;
  /** Minutes to the next exam that day, when that gap is short enough to hurt. */
  gapAfter: number | null;
  /** Classes whose exam runs over the top of this one. */
  clashWith: string[];
}

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * UCLA's finals week runs Saturday to Friday, so the calendar is anchored to
 * the Saturday on or before the first exam rather than to a hardcoded date.
 */
const WEEK_STARTS_ON = 6;
const WEEK_LENGTH = 7;

/**
 * Two exams with an hour or less between them is the fact a sorted list hides:
 * "Friday: 2" and "you hand one in at 11am and sit down again at 11:30" are
 * different pieces of news.
 */
const TIGHT_GAP_MINUTES = 60;

function toUtcDate(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

/** The Saturday on or before this date. */
function weekAnchor(date: Date): Date {
  const shift = (date.getUTCDay() - WEEK_STARTS_ON + 7) % 7;
  return addDays(date, -shift);
}

function isPlaced(entry: FinalsEntry): boolean {
  const { day, startMinutes, endMinutes } = entry.exam;
  return day !== null && startMinutes !== null && endMinutes !== null;
}

/**
 * Rows come from the exams on the page, not from a hardcoded table of UCLA's
 * exam slots. A hardcoded slot table is a claim about the university that this
 * page cannot check, and `docs/ROADMAP.md` already declined unit-cap dates for
 * that reason: a wrong number during finals is worse than no number.
 */
function readSlots(placed: PlacedExam[]): { startMinutes: number; endMinutes: number; label: string }[] {
  const slots = new Map<string, { startMinutes: number; endMinutes: number; label: string }>();
  placed.forEach((exam) => {
    const key = `${exam.startMinutes}-${exam.endMinutes}`;
    if (slots.has(key)) return;
    slots.set(key, {
      startMinutes: exam.startMinutes,
      endMinutes: exam.endMinutes,
      // MyUCLA's own wording for this range, sliced out of its own sentence.
      label: exam.exam.timeText || ""
    });
  });
  return [...slots.values()].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes
  );
}

/**
 * Two exams that overlap and two exams half an hour apart are different kinds
 * of news. The second is a hard day. The first cannot happen — a student cannot
 * sit two exams at once, so an overlap is something to take to the department
 * now, not to revise around.
 *
 * The overlap is arithmetic on the two lines the page already printed, and both
 * blocks are visible in the same column, so nothing here is an inference the
 * student cannot check by looking.
 */
function markDayPressure(placed: PlacedExam[]): void {
  const byDay = new Map<string, PlacedExam[]>();
  placed.forEach((exam) => {
    const list = byDay.get(exam.day) || [];
    list.push(exam);
    byDay.set(exam.day, list);
  });

  byDay.forEach((list) => {
    list.sort((a, b) => a.startMinutes - b.startMinutes);

    list.forEach((exam, index) => {
      list.forEach((other, otherIndex) => {
        if (index === otherIndex) return;
        const overlaps =
          exam.startMinutes < other.endMinutes && other.startMinutes < exam.endMinutes;
        if (overlaps && !exam.clashWith.includes(other.label)) exam.clashWith.push(other.label);
      });
    });

    list.forEach((exam, index) => {
      const next = list[index + 1];
      if (!next) return;
      // An overlap is already reported as an overlap; it is not also a gap.
      if (exam.clashWith.length > 0 || next.clashWith.length > 0) return;
      const gap = next.startMinutes - exam.endMinutes;
      if (gap >= 0 && gap <= TIGHT_GAP_MINUTES) exam.gapAfter = gap;
    });
  });
}

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildBlock(doc: Document, exam: PlacedExam): HTMLElement {
  const block = element(doc, "div", "pl-finals-block");
  // A class you are already enrolled in and a class you are still hoping for
  // are different things to revise for. `docs/PAIN_POINTS.md` #4.
  if (exam.enrolled) block.classList.add("pl-finals-enrolled");
  block.append(element(doc, "span", "pl-finals-code", exam.label));
  // MyUCLA's own sentence, verbatim. The grid decides where this sits; it never
  // decides how it reads.
  block.append(element(doc, "span", "pl-finals-when", exam.exam.timeText || exam.exam.text));
  block.title = exam.exam.text;

  if (exam.clashWith.length > 0) {
    block.classList.add("pl-finals-clash");
    const warning = element(doc, "span", "pl-finals-clash-note");
    // MyUCLA's own icon font, the same one its `planConflict` markers use.
    const icon = element(doc, "span", "icon-warning-sign pl-finals-icon");
    icon.setAttribute("aria-hidden", "true");
    warning.append(icon);
    warning.append(
      doc.createTextNode(`Same time as ${exam.clashWith.join(", ")}`)
    );
    block.append(warning);
  }

  if (exam.gapAfter !== null) {
    block.classList.add("pl-finals-tight");
    const gap = element(
      doc,
      "span",
      "pl-finals-gap",
      exam.gapAfter === 0
        ? "next exam starts as this one ends"
        : `${exam.gapAfter} min until the next one`
    );
    block.append(gap);
  }
  return block;
}

function buildUnplaced(doc: Document, entries: FinalsEntry[]): HTMLElement {
  const strip = element(doc, "div", "pl-finals-rest");
  strip.append(
    element(
      doc,
      "p",
      "pl-finals-rest-title",
      entries.length === 1 ? "1 class is not on the calendar" : `${entries.length} classes are not on the calendar`
    )
  );
  const list = element(doc, "ul", "pl-finals-rest-list");
  entries.forEach((entry) => {
    const item = element(doc, "li", "pl-finals-rest-item");
    const code = element(doc, "span", "pl-finals-code", entry.label);
    if (entry.enrolled) code.classList.add("pl-finals-enrolled-code");
    item.append(code);
    // Verbatim again: this is exactly what the card says, unread and unedited.
    item.append(element(doc, "span", "pl-finals-when", entry.exam.text));
    list.append(item);
  });
  strip.append(list);
  return strip;
}

/**
 * Builds the panel. Returns an element in every case, including the two where
 * there is nothing to draw, so the caller never has to decide what an empty
 * finals week means.
 */
export function buildFinalsWeek(entries: FinalsEntry[], doc: Document = document): HTMLElement {
  const root = element(doc, "section", "pl-finals");
  root.setAttribute("aria-label", "Final exams for the classes in this plan");

  if (entries.length === 0) {
    root.append(
      element(doc, "p", "pl-finals-empty", "No class in this plan carries a final exam line.")
    );
    return root;
  }

  const placed: PlacedExam[] = [];
  const unplaced: FinalsEntry[] = [];
  entries.forEach((entry) => {
    if (isPlaced(entry) && toUtcDate(entry.exam.day as string)) {
      placed.push({
        ...entry,
        day: entry.exam.day as string,
        startMinutes: entry.exam.startMinutes as number,
        endMinutes: entry.exam.endMinutes as number,
        gapAfter: null,
        clashWith: []
      });
    } else {
      unplaced.push(entry);
    }
  });

  if (placed.length === 0) {
    root.append(
      element(
        doc,
        "p",
        "pl-finals-empty",
        "None of these classes states a final exam date, so there is no week to draw."
      )
    );
    root.append(buildUnplaced(doc, unplaced));
    return root;
  }

  const days = [...placed].map((exam) => exam.day).sort();
  const anchor = weekAnchor(toUtcDate(days[0]) as Date);
  const columns = Array.from({ length: WEEK_LENGTH }, (_, index) => addDays(anchor, index));
  const inWeek = new Set(columns.map(toDayKey));

  // An exam outside the anchored week is not forced into a column it does not
  // belong to; it drops to the strip with everything else that could not be
  // placed.
  const strays = placed.filter((exam) => !inWeek.has(exam.day));
  const onGrid = placed.filter((exam) => inWeek.has(exam.day));
  strays.forEach((exam) => unplaced.push(exam));

  markDayPressure(onGrid);
  const slots = readSlots(onGrid);

  const table = element(doc, "table", "pl-finals-grid");
  const head = doc.createElement("thead");
  const headRow = doc.createElement("tr");
  headRow.append(element(doc, "th", "pl-finals-corner", ""));
  columns.forEach((date) => {
    const cell = element(doc, "th", "pl-finals-day");
    cell.scope = "col";
    cell.append(element(doc, "span", "pl-finals-dayname", SHORT_DAY[date.getUTCDay()]));
    cell.append(
      element(
        doc,
        "span",
        "pl-finals-daydate",
        `${SHORT_MONTH[date.getUTCMonth()]} ${date.getUTCDate()}`
      )
    );
    headRow.append(cell);
  });
  head.append(headRow);
  table.append(head);

  const body = doc.createElement("tbody");
  slots.forEach((slot) => {
    const row = doc.createElement("tr");
    const label = element(doc, "th", "pl-finals-slot", slot.label);
    label.scope = "row";
    row.append(label);
    columns.forEach((date) => {
      const key = toDayKey(date);
      const cell = element(doc, "td", "pl-finals-cell");
      const sitting = onGrid.filter(
        (exam) =>
          exam.day === key &&
          exam.startMinutes === slot.startMinutes &&
          exam.endMinutes === slot.endMinutes
      );
      if (sitting.length === 0) cell.classList.add("pl-finals-free");
      sitting.forEach((exam) => cell.append(buildBlock(doc, exam)));
      row.append(cell);
    });
    body.append(row);
  });
  table.append(body);

  const scroller = element(doc, "div", "pl-finals-scroll");
  scroller.append(table);
  root.append(scroller);

  if (unplaced.length > 0) root.append(buildUnplaced(doc, unplaced));
  return root;
}
