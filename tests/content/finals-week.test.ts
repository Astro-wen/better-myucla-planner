// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { buildFinalsWeek, type FinalsEntry } from "../../src/content/finals-week";
import type { FinalExam } from "../../src/content/plan-insights";

function exam(day: string, start: number, end: number, timeText: string): FinalExam {
  return {
    text: `${day} ${timeText}`,
    dateText: day,
    timeText,
    day,
    startMinutes: start,
    endMinutes: end
  };
}

function unread(text: string): FinalExam {
  return { text, dateText: null, timeText: null, day: null, startMinutes: null, endMinutes: null };
}

const FRIDAY_MORNING = exam("2026-12-11", 8 * 60, 11 * 60, "8am-11am");
const FRIDAY_MIDDAY = exam("2026-12-11", 11 * 60 + 30, 14 * 60 + 30, "11:30am-2:30pm");
const WEDNESDAY = exam("2026-12-09", 8 * 60, 11 * 60, "8am-11am");

function entries(...list: (Omit<FinalsEntry, "enrolled"> & { enrolled?: boolean })[]): HTMLElement {
  return buildFinalsWeek(
    list.map((entry) => ({ enrolled: false, ...entry })),
    document
  );
}

describe("buildFinalsWeek", () => {
  it("anchors the week to the Saturday before the first exam and runs seven days", () => {
    const week = entries({ label: "COM SCI 35L", exam: WEDNESDAY });
    const headers = [...week.querySelectorAll(".pl-finals-day")].map((cell) =>
      (cell.textContent || "").trim()
    );

    expect(headers).toHaveLength(7);
    expect(headers[0]).toContain("Sat");
    expect(headers[0]).toContain("Dec 5");
    expect(headers[6]).toContain("Fri");
    expect(headers[6]).toContain("Dec 11");
  });

  it("names the gap when one exam lands on top of another", () => {
    const week = entries(
      { label: "STATS C161", exam: FRIDAY_MORNING },
      { label: "MATH 33B", exam: FRIDAY_MIDDAY }
    );

    const tight = week.querySelector(".pl-finals-tight");
    expect(tight?.textContent).toContain("STATS C161");
    expect(week.querySelector(".pl-finals-gap")?.textContent).toBe("30 min until the next one");
  });

  it("marks two exams at the same time in red, and names the other class", () => {
    const week = entries(
      { label: "MATH 33B", exam: FRIDAY_MORNING },
      { label: "PHYSICS 1B", exam: exam("2026-12-11", 8 * 60, 11 * 60, "8am-11am") }
    );

    const clashes = [...week.querySelectorAll(".pl-finals-clash")];
    expect(clashes).toHaveLength(2);
    expect(week.querySelector(".pl-finals-clash-note")?.textContent).toContain("PHYSICS 1B");
  });

  it("catches a partial overlap, not just an identical slot", () => {
    const week = entries(
      { label: "MATH 33B", exam: FRIDAY_MORNING },
      { label: "PHYSICS 1B", exam: exam("2026-12-11", 10 * 60, 13 * 60, "10am-1pm") }
    );

    expect(week.querySelectorAll(".pl-finals-clash")).toHaveLength(2);
  });

  it("reports an overlap as an overlap and not also as a tight gap", () => {
    const week = entries(
      { label: "MATH 33B", exam: FRIDAY_MORNING },
      { label: "PHYSICS 1B", exam: exam("2026-12-11", 8 * 60, 11 * 60, "8am-11am") }
    );

    expect(week.querySelector(".pl-finals-gap")).toBeNull();
  });

  it("does not call two exams that merely touch a clash", () => {
    const week = entries(
      { label: "MATH 33B", exam: FRIDAY_MORNING },
      { label: "PHYSICS 1B", exam: exam("2026-12-11", 11 * 60, 14 * 60, "11am-2pm") }
    );

    expect(week.querySelector(".pl-finals-clash")).toBeNull();
    expect(week.querySelector(".pl-finals-gap")?.textContent).toBe(
      "next exam starts as this one ends"
    );
  });

  it("leaves a comfortable day unmarked", () => {
    const week = entries(
      { label: "STATS C161", exam: WEDNESDAY },
      { label: "MATH 33B", exam: exam("2026-12-09", 15 * 60, 18 * 60, "3pm-6pm") }
    );

    expect(week.querySelector(".pl-finals-tight")).toBeNull();
  });

  it("prints MyUCLA's own wording for the slot and never rebuilds it", () => {
    const week = entries({ label: "MATH 33B", exam: FRIDAY_MIDDAY });

    expect(week.querySelector(".pl-finals-slot")?.textContent).toBe("11:30am-2:30pm");
  });

  it("keeps a class with no exam date beside the calendar rather than dropping it", () => {
    const week = entries(
      { label: "COM SCI 35L", exam: WEDNESDAY },
      { label: "ART 10", exam: unread("Consult instructor for method of evaluation") }
    );

    const rest = week.querySelector(".pl-finals-rest");
    expect(rest?.textContent).toContain("ART 10");
    expect(rest?.textContent).toContain("Consult instructor for method of evaluation");
    expect(week.querySelectorAll(".pl-finals-block")).toHaveLength(1);
  });

  it("does not force an exam outside the anchored week into a column", () => {
    const week = entries(
      { label: "COM SCI 35L", exam: WEDNESDAY },
      { label: "ART 10", exam: exam("2027-03-19", 8 * 60, 11 * 60, "8am-11am") }
    );

    expect(week.querySelector(".pl-finals-rest")?.textContent).toContain("ART 10");
    expect(week.querySelectorAll(".pl-finals-block")).toHaveLength(1);
  });

  it("says so when nothing states a date, rather than drawing an empty week", () => {
    const week = entries({ label: "ART 10", exam: unread("Consult instructor") });

    expect(week.querySelector(".pl-finals-grid")).toBeNull();
    expect(week.querySelector(".pl-finals-empty")?.textContent).toContain("no week to draw");
  });

  it("rings a class that is already enrolled, and leaves a planned one plain", () => {
    const week = entries(
      { label: "MATH 33B", exam: WEDNESDAY, enrolled: true },
      { label: "ART 10", exam: exam("2026-12-10", 15 * 60, 18 * 60, "3pm-6pm") }
    );

    const rung = [...week.querySelectorAll(".pl-finals-enrolled")];
    expect(rung).toHaveLength(1);
    expect(rung[0].textContent).toContain("MATH 33B");
  });

  it("says so when the plan carries no final exam line at all", () => {
    expect(entries().querySelector(".pl-finals-empty")).not.toBeNull();
  });
});
