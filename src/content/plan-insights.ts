import type { CourseSnapshot } from "../adapters/planner-adapter";

export type CourseFilter =
  | "all"
  | "tagged"
  | "open"
  | "waitlist"
  | "enrolled"
  | "closed"
  | "conflict";

export interface CourseConflicts {
  /** Course codes this one overlaps in meeting time. */
  time: string[];
  /** Course codes this one shares a final exam slot with. */
  exam: string[];
}

export interface CourseInsight {
  officialText: string;
  open: boolean;
  waitlist: boolean;
  enrolled: boolean;
  closed: boolean;
  conflicts: CourseConflicts;
}

const MAX_CONFLICT_ENTRIES = 20;
const COURSE_CODE = /^[A-Z][A-Z0-9 &/'.-]{1,24}\s\S{1,10}$/;

/**
 * MyUCLA already knows exactly which classes clash — it puts the list inside the
 * popover payload behind each little warning triangle. Nothing here is computed
 * or guessed; it is the page's own answer, read without making the student open
 * seventeen popovers to find it.
 */
export function readConflicts(course: CourseSnapshot): CourseConflicts {
  const time = new Set<string>();
  const exam = new Set<string>();

  course.node.querySelectorAll<HTMLElement>("[data-content]").forEach((node) => {
    const payload = node.getAttribute("data-content") || "";
    if (!/conflict/i.test(payload)) return;

    const holder = course.node.ownerDocument.createElement("div");
    // The payload is markup MyUCLA authored for its own popover; it is parsed
    // detached and only text is taken out of it.
    holder.innerHTML = payload;
    const heading = normalizeText(holder.textContent || "");
    const isExam = /final exam conflict/i.test(heading);
    const isTime = /time conflicts?/i.test(heading);
    if (!isExam && !isTime) return;

    const target = isExam ? exam : time;
    holder.querySelectorAll("li").forEach((item) => {
      const code = normalizeText(item.textContent || "");
      if (code && code.length <= 30 && COURSE_CODE.test(code) && target.size < MAX_CONFLICT_ENTRIES) {
        target.add(code);
      }
    });
  });

  return { time: [...time], exam: [...exam] };
}

export function hasConflict(insight: CourseInsight): boolean {
  return insight.conflicts.time.length > 0 || insight.conflicts.exam.length > 0;
}

export function conflictCodes(insight: CourseInsight): string[] {
  return [...new Set([...insight.conflicts.time, ...insight.conflicts.exam])];
}

export interface PlanSummary {
  total: number;
  visible: number;
  open: number;
  waitlist: number;
  enrolled: number;
  closed: number;
  conflict: number;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function readOfficialText(course: CourseSnapshot): string {
  const parts: string[] = [];
  const rows = course.node.querySelectorAll<HTMLElement>(
    ":scope > tr:not(:first-child)"
  );
  rows.forEach((row) => {
    const walker = row.ownerDocument.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (!node.parentElement?.closest("[data-planner-lift-owned]")) {
        parts.push(node.textContent || "");
      }
      node = walker.nextNode();
    }
  });
  return normalizeText(parts.join(" "));
}

export function inspectCourse(course: CourseSnapshot): CourseInsight {
  // Status, section, instructor, meeting, and exam data live below the first
  // course-header row. Reading those nodes directly avoids cloning large tables
  // on every search keystroke and also excludes our injected header controls.
  const officialText = readOfficialText(course);

  const enrolled = /\bEnrolled\b/i.test(officialText);
  return {
    officialText,
    open: /\bOpen\s*:/i.test(officialText),
    waitlist: /\bWaitlist(?:ed)?\b/i.test(officialText),
    enrolled,
    closed:
      /\bClosed\b/i.test(officialText) ||
      (/\bClass Full\b/i.test(officialText) && !enrolled),
    // `div.final_exam_info.exam_conflict` wraps the "Final Exam:" line on every
    // card, so the class is layout, not state. Time conflicts carry no class at
    // all — the truth lives in the popover payloads. See `readConflicts`.
    conflicts: readConflicts(course)
  };
}

export function matchesCourse(
  insight: CourseInsight,
  courseLabel: string,
  tag: string,
  query: string,
  filter: CourseFilter
): boolean {
  const normalizedQuery = normalizeText(query).toLocaleLowerCase();
  const matchesQuery =
    normalizedQuery.length === 0 ||
    `${courseLabel} ${tag} ${insight.officialText}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);

  if (!matchesQuery) {
    return false;
  }

  if (filter === "all") return true;
  if (filter === "tagged") return tag.trim().length > 0;
  if (filter === "conflict") return hasConflict(insight);
  return insight[filter];
}

export function summarizePlan(
  entries: Array<{ insight: CourseInsight; visible: boolean }>
): PlanSummary {
  return {
    total: entries.length,
    visible: entries.filter(({ visible }) => visible).length,
    open: entries.filter(({ insight }) => insight.open).length,
    waitlist: entries.filter(({ insight }) => insight.waitlist).length,
    enrolled: entries.filter(({ insight }) => insight.enrolled).length,
    closed: entries.filter(({ insight }) => insight.closed).length,
    conflict: entries.filter(({ insight }) => hasConflict(insight)).length
  };
}

export function insightLabels(insight: CourseInsight): string[] {
  const labels: string[] = [];
  if (insight.open) labels.push("Open");
  if (insight.waitlist) labels.push("Waitlist");
  if (insight.enrolled) labels.push("Enrolled");
  if (insight.closed && !insight.enrolled) labels.push("Full");
  if (hasConflict(insight)) labels.push("Conflict");
  return labels;
}

export interface StatusSummary {
  label: string;
  tone: "enrolled" | "open" | "mixed" | "waitlist" | "closed";
}

/**
 * One honest word for a collapsed card. A course can hold several sections with
 * different states, so "mixed" exists rather than picking whichever half sounds
 * better.
 */
export function summarizeStatus(insight: CourseInsight): StatusSummary | null {
  if (insight.enrolled) return { label: "Enrolled", tone: "enrolled" };
  if (insight.open && insight.closed) return { label: "Some open", tone: "mixed" };
  if (insight.open) return { label: "Open", tone: "open" };
  if (insight.waitlist) return { label: "Waitlist", tone: "waitlist" };
  if (insight.closed) return { label: "Full", tone: "closed" };
  return null;
}

const MAX_PLAUSIBLE_SECTION_UNITS = 30;

/**
 * Units the student is actually enrolled in, read only from the rows MyUCLA has
 * already rendered. This is the number a study-list limit applies to; the sum
 * over a whole plan is not, because nobody enrols in their whole plan.
 *
 * Column positions are read from the header rather than assumed.
 */
export function readEnrolledUnits(course: CourseSnapshot): number {
  let total = 0;
  course.node
    .querySelectorAll<HTMLTableElement>("table.coursetable")
    .forEach((table) => {
      const headers = [...table.rows]
        .flatMap((row) => [...row.cells])
        .filter((cell) => cell.tagName === "TH")
        .map((cell) => normalizeText(cell.textContent || "").toLowerCase());
      const unitsIndex = headers.indexOf("units");
      const statusIndex = headers.indexOf("status");
      if (unitsIndex === -1 || statusIndex === -1) return;

      for (const row of table.rows) {
        const cells = [...row.cells];
        if (cells.length <= Math.max(unitsIndex, statusIndex)) continue;
        if (cells[statusIndex].tagName === "TH") continue;
        if (!/\bEnrolled\b/i.test(cells[statusIndex].textContent || "")) continue;
        const units = Number.parseFloat(normalizeText(cells[unitsIndex].textContent || ""));
        if (Number.isFinite(units) && units >= 0 && units <= MAX_PLAUSIBLE_SECTION_UNITS) {
          total += units;
        }
      }
    });
  return total;
}

export function formatUnits(units: number): string {
  return Number.isInteger(units) ? String(units) : units.toFixed(1);
}
