// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { CourseSnapshot } from "../../src/adapters/planner-adapter";
import {
  conflictCodes,
  formatUnits,
  hasConflict,
  inspectCourse,
  readFinalExam,
  insightLabels,
  matchesCourse,
  readEnrolledUnits,
  summarizePlan,
  summarizeStatus
} from "../../src/content/plan-insights";

function course(html: string): CourseSnapshot {
  const node = document.createElement("tbody");
  node.innerHTML = `<tr><td>Course header</td></tr>${html}`;
  return { id: "course-1", label: "COM SCI 35L", node };
}

describe("plan insights", () => {
  it("summarizes official statuses and ignores extension-owned text", () => {
    const cloneSpy = vi.spyOn(HTMLElement.prototype, "cloneNode");
    const insight = inspectCourse(
      course(`
        <tr><td>Open: 4 of 100 Left</td></tr>
        <tr><td><a class="uit-clickover-bottom" data-content="&lt;div class=&quot;popover_section_title warning light&quot;&gt;Warning: Time Conflict&lt;/div&gt;&lt;ul class=&#39;bulleted_list&#39;&gt;&lt;li&gt;COM SCI 35L&lt;/li&gt;&lt;/ul&gt;"><span class="icon-warning-sign"></span></a></td></tr>
        <tr><td data-planner-lift-owned>Waitlisted</td></tr>
      `)
    );

    expect(insight).toMatchObject({ open: true, waitlist: false });
    expect(insight.conflicts.time).toEqual(["COM SCI 35L"]);
    expect(insightLabels(insight)).toEqual(["Open", "Conflict"]);
    expect(cloneSpy).not.toHaveBeenCalled();
    cloneSpy.mockRestore();
  });

  it("searches official text and local tags, then applies status filters", () => {
    const insight = inspectCourse(course("<tr><td>Waitlisted Class Full (120)</td></tr>"));

    expect(matchesCourse(insight, "COM SCI 35L", "主选", "35l", "all")).toBe(true);
    expect(matchesCourse(insight, "COM SCI 35L", "主选", "主选", "tagged")).toBe(true);
    expect(matchesCourse(insight, "COM SCI 35L", "", "", "waitlist")).toBe(true);
    expect(matchesCourse(insight, "COM SCI 35L", "", "economics", "all")).toBe(false);
  });

  it("counts all statuses while keeping a separate visible result count", () => {
    const open = inspectCourse(course("<tr><td>Open: 2 of 20 Left</td></tr>"));
    const closed = inspectCourse(course("<tr><td>Closed Class Full (20)</td></tr>"));

    expect(
      summarizePlan([
        { insight: open, visible: true },
        { insight: closed, visible: false }
      ])
    ).toMatchObject({ total: 2, visible: 1, open: 1, closed: 1 });
  });
});

describe("summarizeStatus", () => {
  const base = {
    officialText: "",
    open: false,
    waitlist: false,
    enrolled: false,
    closed: false,
    conflicts: { time: [], exam: [] },
    finalExam: null
  };

  it("prefers the state the student can act on, and admits mixed sections", () => {
    expect(summarizeStatus({ ...base, enrolled: true, closed: true })?.label).toBe("Enrolled");
    expect(summarizeStatus({ ...base, open: true, closed: true })?.label).toBe("Some open");
    expect(summarizeStatus({ ...base, open: true })?.label).toBe("Open");
    expect(summarizeStatus({ ...base, waitlist: true })?.label).toBe("Waitlist");
    expect(summarizeStatus({ ...base, closed: true })?.label).toBe("Full");
    expect(summarizeStatus(base)).toBeNull();
  });
});

describe("conflict detection", () => {
  const finalExamRow = `
    <tr><td>
      <div class="final_exam_info exam_conflict">Final Exam: None listed / Consult instructor</div>
      <span class="icon-warning-sign"></span>
    </td></tr>`;

  const popover = (content: string): string =>
    `<tr><td><a class="uit-clickover-bottom" data-content="${content.replace(/"/g, "&quot;")}">
      <span class="icon-warning-sign"></span></a></td></tr>`;

  it("ignores the exam_conflict layout wrapper that every card carries", () => {
    // MyUCLA puts `final_exam_info exam_conflict` on all 17 cards of a plan, so
    // matching that class reported a conflict for every single course.
    expect(hasConflict(inspectCourse(course(finalExamRow)))).toBe(false);
  });

  it("ignores warning popovers that are not about conflicts", () => {
    const note = popover(
      `<div class="popover_section_title">Additional Information</div><ul><li>MCD BIO 60</li></ul>`
    );
    expect(hasConflict(inspectCourse(course(finalExamRow + note)))).toBe(false);
  });

  it("reads which courses actually clash, by time and by final exam", () => {
    const snapshot = course(
      finalExamRow +
        popover(
          `<div class="popover_section_title warning light">Warning: Time Conflicts</div>` +
            `<ul class='bulleted_list'><li>DESMA 10</li><li>ENGR 170</li></ul>`
        ) +
        popover(
          `<div class="popover_section_title warning light">Final Exam Conflict</div>` +
            `<ul class='bulleted_list'><li>COM SCI 35L</li></ul>`
        )
    );
    const insight = inspectCourse(snapshot);
    expect(insight.conflicts.time).toEqual(["DESMA 10", "ENGR 170"]);
    expect(insight.conflicts.exam).toEqual(["COM SCI 35L"]);
    expect(hasConflict(insight)).toBe(true);
    expect(conflictCodes(insight)).toEqual(["DESMA 10", "ENGR 170", "COM SCI 35L"]);
  });

  it("does not treat popover prose as a course code", () => {
    const snapshot = course(
      popover(
        `<div class="popover_section_title">Warning: Time Conflict</div>` +
          `<ul><li>Students should consult the department before enrolling in this section.</li></ul>`
      )
    );
    expect(inspectCourse(snapshot).conflicts.time).toEqual([]);
  });
});

describe("readEnrolledUnits", () => {
  const table = (rows: string): string =>
    `<tr><td><table class="coursetable">
      <tr><th>Change</th><th>Section</th><th>Status</th><th>Info</th><th>Days</th>
          <th>Time</th><th>Location</th><th>Units</th><th>Instructor</th></tr>
      ${rows}
    </table></td></tr>`;
  const row = (status: string, units: string): string =>
    `<tr><td></td><td>Lec 1</td><td>${status}</td><td></td><td>MW</td>
         <td>10am</td><td>Dodd 170</td><td>${units}</td><td>TA</td></tr>`;

  it("adds up only the sections the student is enrolled in", () => {
    const snapshot = course(
      table(
        `${row("Enrolled Class Full (40)", "4.0")}
         ${row("Enrolled Class Full (40)", "0.0")}
         ${row("Open: 6 of 396 Left", "5.0")}
         ${row("Waitlisted Class Full (20)", "4.0")}`
      )
    );
    expect(readEnrolledUnits(snapshot)).toBe(4);
  });

  it("reads the Units column by header, not by position", () => {
    const snapshot = course(
      `<tr><td><table class="coursetable">
        <tr><th>Status</th><th>Units</th></tr>
        <tr><td>Enrolled Class Full (40)</td><td>2.5</td></tr>
      </table></td></tr>`
    );
    expect(readEnrolledUnits(snapshot)).toBe(2.5);
  });

  it("ignores implausible or unreadable unit values", () => {
    const snapshot = course(table(`${row("Enrolled", "999")}${row("Enrolled", "n/a")}`));
    expect(readEnrolledUnits(snapshot)).toBe(0);
  });

  it("formats whole units without a stray decimal", () => {
    expect(formatUnits(12)).toBe("12");
    expect(formatUnits(12.5)).toBe("12.5");
  });
});

/**
 * The exact shape captured read-only from a signed-in Class Planner on
 * 2026-08-27. Two spans, and every line terminated by a bare `<br>`, so
 * `textContent` reads `8am-11amCheck back on ...` with nothing to split on.
 */
function examRow(body: string): string {
  return `<tr><td><div class="final_exam_info exam_conflict"><span style="font-weight: bold; ">Final Exam:</span> <span style="display: inline-block; vertical-align: top;">${body}</span></div></td></tr>`;
}

const ADVISORY = "Check back on 11/23/2026 (Monday of 9th week) for final exam location";

describe("readFinalExam", () => {
  it("keeps MyUCLA's own line and places it on the calendar", () => {
    const exam = readFinalExam(
      course(examRow(`Wednesday December 9, 2026 8am-11am<br>${ADVISORY}<br>`))
    );

    expect(exam).toEqual({
      text: "Wednesday December 9, 2026 8am-11am",
      day: "2026-12-09",
      startMinutes: 8 * 60,
      endMinutes: 11 * 60
    });
  });

  it("reads half-hour times on both sides of noon", () => {
    const exam = readFinalExam(
      course(examRow(`Friday December 11, 2026 11:30am-2:30pm<br>${ADVISORY}<br>`))
    );

    expect(exam).toMatchObject({ startMinutes: 11 * 60 + 30, endMinutes: 14 * 60 + 30 });
  });

  it("keeps a class with no dated exam, and does not pretend it has one", () => {
    const exam = readFinalExam(
      course(examRow("Consult instructor for method of evaluation<br>"))
    );

    expect(exam).toEqual({
      text: "Consult instructor for method of evaluation",
      day: null,
      startMinutes: null,
      endMinutes: null
    });
  });

  it("leaves a line unplaced when the weekday and the date disagree", () => {
    // December 9 2026 is a Wednesday. One of these two facts is wrong and there
    // is no way to tell which, so the exam is kept and not drawn.
    const exam = readFinalExam(
      course(examRow(`Tuesday December 9, 2026 8am-11am<br>${ADVISORY}<br>`))
    );

    expect(exam).toMatchObject({ text: "Tuesday December 9, 2026 8am-11am", day: null });
  });

  it("leaves a line unplaced when it ends before it starts", () => {
    const exam = readFinalExam(course(examRow("Friday December 11, 2026 3pm-11am<br>")));

    expect(exam).toMatchObject({ day: null, startMinutes: null });
  });

  it("does not read the location advisory as part of the exam", () => {
    const exam = readFinalExam(
      course(examRow(`Friday December 11, 2026 8am-11am<br>${ADVISORY}<br>`))
    );

    expect(exam?.text).not.toContain("Check back");
  });

  it("returns null when the card has no final exam line at all", () => {
    expect(readFinalExam(course("<tr><td>Open: 4 of 100 Left</td></tr>"))).toBeNull();
  });
});
