// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { CourseSnapshot } from "../../src/adapters/planner-adapter";
import {
  conflictCodes,
  formatUnits,
  hasConflict,
  inspectCourse,
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
    conflicts: { time: [], exam: [] }
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
