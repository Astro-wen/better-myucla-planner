// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MyUclaPlannerAdapter } from "../../src/adapters/myucla-adapter";
import {
  NavigationReorderCoordinator,
  pendingReorderStorageKey
} from "../../src/content/navigation-reorder";
import type { QueueProgress } from "../../src/content/operation-queue";

const TRACKER = "ctl00_MainContent_planClassListView_clCommandFieldTracker";
const COMMAND = "ctl00_MainContent_planClassListView_clCommandField";
const ids = ["26440403", "26511217", "26691534"];

function card(id: string, index: number, total: number): string {
  const command = (direction: "up" | "down") => {
    const action = direction === "up" ? "moveupClass" : "movedownClass";
    return `courseListAction($(".maincontentpanel")[0].id, "${TRACKER}", "${COMMAND}", "${action}|${id}!0"); return false;`;
  };
  return `
    <tbody class="Class${id} courseItem itemClass">
      <tr>
        <td class="SubjectAreaName_ClassName">Course</td>
        <td class="linkPanelRight"><div class="OrderingButtons"><div class="noprint">
          <button id="muClass${id}" class="link moveupClass"
            title="Move this Class up in the list" aria-label="Move this Class up in the list"
            onclick='${command("up")}' style="visibility:${index === 0 ? "hidden" : "visible"}"></button>
          <button id="mdClass${id}" class="link movedownClass"
            title="Move this Class down in the list" aria-label="Move this Class down in the list"
            onclick='${command("down")}' style="visibility:${index === total - 1 ? "hidden" : "visible"}"></button>
        </div></div></td>
      </tr><tr><td></td></tr><tr><td><table></table></td></tr>
    </tbody>`;
}

function render(order: string[]): void {
  document.body.innerHTML = `
    <form id="aspnetForm" method="post" action="/ClassPlanner/ClassPlan.aspx">
      <select id="ctl00_MainContent_termSessionChooser_TermChooser">
        <option value="26F" selected>Fall</option>
      </select>
      <input id="ctl00_MainContent_planIDField" value="1234567" />
      <div id="ctl00_MainContent_classPlanPanel"><div id="panelPlan">
        <div id="div_landing"><table>${order
          .map((id, index) => card(id, index, order.length))
          .join("")}</table></div>
      </div></div>
    </form>`;
}

describe("NavigationReorderCoordinator", () => {
  let stored: Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers();
    stored = {};
    window.sessionStorage.clear();
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => Object.assign(stored, value)),
          remove: vi.fn(async (key: string) => {
            delete stored[key];
          })
        }
      }
    });
    vi.spyOn(HTMLButtonElement.prototype, "click").mockImplementation(function (
      this: HTMLButtonElement
    ) {
      this.dispatchEvent(new Event("planner-lift-test-click"));
    });
    render(ids);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses a write-ahead record to resume one native click per full navigation", async () => {
    const clicks: string[] = [];
    const progress: QueueProgress[] = [];
    const attachClickRecorders = () => {
      document.querySelectorAll<HTMLButtonElement>("button.moveupClass").forEach((button) => {
        button.addEventListener("planner-lift-test-click", () => {
          clicks.push(button.id);
        });
      });
    };
    attachClickRecorders();

    const first = new NavigationReorderCoordinator(
      new MyUclaPlannerAdapter(),
      (update) => progress.push(update),
      { stepDelayMs: 0, watchdogMs: 60_000 }
    );
    const started = first.moveTo(`myucla-class-${ids[2]}`, 0);
    await vi.advanceTimersByTimeAsync(0);
    await started;

    expect(clicks).toEqual([`muClass${ids[2]}`]);
    expect(stored[pendingReorderStorageKey]).toMatchObject({
      completed: 1,
      total: 2,
      expectedOrder: [
        `myucla-class-${ids[0]}`,
        `myucla-class-${ids[2]}`,
        `myucla-class-${ids[1]}`
      ]
    });

    render([ids[0], ids[2], ids[1]]);
    attachClickRecorders();
    const second = new NavigationReorderCoordinator(
      new MyUclaPlannerAdapter(),
      (update) => progress.push(update),
      { stepDelayMs: 0, watchdogMs: 60_000 }
    );
    const resumed = second.resumePending();
    await vi.advanceTimersByTimeAsync(0);
    await resumed;

    expect(clicks).toEqual([`muClass${ids[2]}`, `muClass${ids[2]}`]);
    expect(stored[pendingReorderStorageKey]).toMatchObject({
      completed: 2,
      expectedOrder: [
        `myucla-class-${ids[2]}`,
        `myucla-class-${ids[0]}`,
        `myucla-class-${ids[1]}`
      ]
    });

    render([ids[2], ids[0], ids[1]]);
    const third = new NavigationReorderCoordinator(
      new MyUclaPlannerAdapter(),
      (update) => progress.push(update)
    );
    await third.resumePending();

    expect(stored[pendingReorderStorageKey]).toBeUndefined();
    expect(window.sessionStorage.getItem("plannerLift.operationId.v1")).toBeNull();
    expect(progress.at(-1)).toMatchObject({ kind: "success", completed: 2, total: 2 });
  });

  it("stops and clears state when the reloaded order is not the write-ahead order", async () => {
    const progress: QueueProgress[] = [];
    const first = new NavigationReorderCoordinator(
      new MyUclaPlannerAdapter(),
      (update) => progress.push(update),
      { stepDelayMs: 0, watchdogMs: 60_000 }
    );
    const started = first.moveTo(`myucla-class-${ids[2]}`, 0);
    await vi.advanceTimersByTimeAsync(0);
    await started;

    render([ids[1], ids[0], ids[2]]);
    const resumed = new NavigationReorderCoordinator(
      new MyUclaPlannerAdapter(),
      (update) => progress.push(update)
    );
    await resumed.resumePending();

    expect(stored[pendingReorderStorageKey]).toBeUndefined();
    expect(progress.at(-1)).toMatchObject({ kind: "error" });
    expect(progress.at(-1)?.message).toContain("doesn't match the last confirmed step");
  });
});
