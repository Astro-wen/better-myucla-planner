// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}

import { beforeEach, describe, expect, it } from "vitest";

import {
  MyUclaPlannerAdapter,
  isMyUclaPlannerPage
} from "../../src/adapters/myucla-adapter";

const TRACKER = "ctl00_MainContent_planClassListView_clCommandFieldTracker";
const COMMAND = "ctl00_MainContent_planClassListView_clCommandField";

function onclick(direction: "up" | "down", id: string): string {
  const action = direction === "up" ? "moveupClass" : "movedownClass";
  return `courseListAction($(".maincontentpanel")[0].id, "${TRACKER}", "${COMMAND}", "${action}|${id}!0"); return false;`;
}

function courseCard(id: string, index: number, total: number): string {
  return `
    <tbody id="course-${index}" class="Class${id} courseItem itemClass">
      <tr>
        <td class="SubjectAreaName_ClassName">Course ${index + 1}</td>
        <td class="linkPanelRight">
          <div class="OrderingButtons">
            <input type="color" class="colorpicker" />
            <div class="noprint">
              <button
                id="muClass${id}"
                class="link moveupClass"
                title="Move this Class up in the list"
                aria-label="Move this Class up in the list"
                onclick='${onclick("up", id)}'
                style="visibility:${index === 0 ? "hidden" : "visible"}"
              ></button>
              <button
                id="mdClass${id}"
                class="link movedownClass"
                title="Move this Class down in the list"
                aria-label="Move this Class down in the list"
                onclick='${onclick("down", id)}'
                style="visibility:${index === total - 1 ? "hidden" : "visible"}"
              ></button>
            </div>
          </div>
        </td>
      </tr>
      <tr><td><div class="final_exam_info exam_conflict"></div></td></tr>
      <tr><td><table class="iweBodyTable coursetable"></table></td></tr>
    </tbody>
  `;
}

function renderPlanner(cards: string): void {
  document.body.innerHTML = `
    <form id="aspnetForm" method="post" action="/ClassPlanner/ClassPlan.aspx">
      <select id="ctl00_MainContent_termSessionChooser_TermChooser">
        <option value="26F" selected>Fall</option>
      </select>
      <input id="ctl00_MainContent_planIDField" type="hidden" value="1234567" />
      <div id="ctl00_MainContent_classPlanPanel">
        <section class="classPlanner_ClassesInPlanSection">
          <div id="panelPlan">
            <div class="classPlanner_SectionData">
              <div id="div_landing"><table>${cards}</table></div>
            </div>
          </div>
        </section>
      </div>
    </form>
  `;
}

describe("MyUclaPlannerAdapter verified contract", () => {
  beforeEach(() => {
    renderPlanner(
      courseCard("26440403", 0, 2) + courseCard("26511217", 1, 2)
    );
  });

  it("accepts the exact verified page and exposes stable local keys", () => {
    const adapter = new MyUclaPlannerAdapter();

    expect(isMyUclaPlannerPage()).toBe(true);
    expect(adapter.inspectContract()).toMatchObject({ ok: true });
    expect(adapter.getContextKey()).toBe("myucla-26F-plan-1234567");
    expect(adapter.getOrder()).toEqual([
      "myucla-class-26440403",
      "myucla-class-26511217"
    ]);
    const second = adapter.getCourse("myucla-class-26511217");
    expect(adapter.getToolsHost(second).className).toBe("linkPanelRight");
    expect(adapter.getLabelHost(second).className).toBe("SubjectAreaName_ClassName");
  });

  it("allows only visible, exact native movement buttons at execution time", () => {
    const adapter = new MyUclaPlannerAdapter();

    expect(() => adapter.getMoveButton("myucla-class-26440403", "up")).toThrow(
      "isn't available right now"
    );
    expect(
      adapter.getMoveButton("myucla-class-26511217", "up").classList.contains("moveupClass")
    ).toBe(true);
  });

  it("ignores its own local tag badge when reading the official course label", () => {
    const labelHost = document.querySelector<HTMLElement>(
      "tbody.courseItem td.SubjectAreaName_ClassName"
    )!;
    const badge = document.createElement("span");
    badge.dataset.plannerLiftOwned = "true";
    badge.textContent = "First choice";
    labelHost.append(badge);

    const adapter = new MyUclaPlannerAdapter();
    expect(adapter.getCourses()[0].label).toBe("Course 1");
  });

  it("fails closed for command changes, form overrides, and duplicate roots", () => {
    const adapter = new MyUclaPlannerAdapter();
    const up = document.querySelector<HTMLButtonElement>("button.moveupClass")!;

    up.setAttribute("onclick", onclick("up", "99999999"));
    expect(adapter.inspectContract()).toMatchObject({ ok: false });

    renderPlanner(courseCard("26440403", 0, 1));
    document
      .querySelector("button.moveupClass")!
      .setAttribute("formaction", "/ClassPlanner/ClassPlan.aspx");
    expect(adapter.inspectContract()).toMatchObject({ ok: false });

    renderPlanner(courseCard("26440403", 0, 1));
    document
      .querySelector("#ctl00_MainContent_classPlanPanel")!
      .insertAdjacentHTML(
        "beforeend",
        `<div id="panelPlan"><div id="div_landing"><table>${courseCard("26511217", 0, 1)}</table></div></div>`
      );
    expect(adapter.inspectContract()).toMatchObject({ ok: false });
  });
});
