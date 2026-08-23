// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}

import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MyUclaPlannerAdapter } from "../../src/adapters/myucla-adapter";
import { FastReorderCoordinator, type PlannerFrame } from "../../src/content/fast-reorder";

const PLANNER_URL = "https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx";
const TRACKER = "ctl00_MainContent_planClassListView_clCommandFieldTracker";
const COMMAND = "ctl00_MainContent_planClassListView_clCommandField";
const IDS = ["26440403", "26511217", "26691534", "26770021"];

function command(direction: "up" | "down", id: string): string {
  const action = direction === "up" ? "moveupClass" : "movedownClass";
  return `courseListAction($(".maincontentpanel")[0].id, "${TRACKER}", "${COMMAND}", "${action}|${id}!0"); return false;`;
}

function card(id: string, index: number, total: number): string {
  return `
    <tbody class="Class${id} courseItem itemClass">
      <tr>
        <td class="SubjectAreaName_ClassName">Course ${id}</td>
        <td class="linkPanelRight"><div class="OrderingButtons">
          <button id="muClass${id}" class="link moveupClass"
            title="Move this Class up in the list" aria-label="Move this Class up in the list"
            onclick='${command("up", id)}' style="visibility:${index === 0 ? "hidden" : "visible"}"></button>
          <button id="mdClass${id}" class="link movedownClass"
            title="Move this Class down in the list" aria-label="Move this Class down in the list"
            onclick='${command("down", id)}' style="visibility:${index === total - 1 ? "hidden" : "visible"}"></button>
        </div></td>
      </tr>
    </tbody>`;
}

function markup(order: readonly string[], planId = "1234567", term = "26F"): string {
  return `
    <form id="aspnetForm" method="post" action="/ClassPlanner/ClassPlan.aspx">
      <select id="ctl00_MainContent_termSessionChooser_TermChooser">
        <option value="${term}" selected>Term</option>
      </select>
      <input id="ctl00_MainContent_planIDField" value="${planId}" />
      <div id="ctl00_MainContent_classPlanPanel"><div id="panelPlan">
        <div id="div_landing"><table>
          ${order.map((id, index) => card(id, index, order.length)).join("")}
        </table></div>
      </div></div>
    </form>`;
}

/**
 * Stands in for the offscreen planner iframe. Every native button click swaps
 * the two adjacent courses server-side, exactly like MyUCLA does, and then
 * re-renders the whole document as a fresh navigation.
 */
class FakePlannerFrame implements PlannerFrame {
  readonly loads: string[][] = [];
  private dom: JSDOM;
  private pendingLoad: (() => void) | null = null;
  disposed = false;

  constructor(
    private order: string[],
    private readonly options: { planId?: string; term?: string; failFirstLoad?: boolean } = {}
  ) {
    this.dom = this.render();
  }

  private render(): JSDOM {
    const dom = new JSDOM(markup(this.order, this.options.planId, this.options.term), {
      url: PLANNER_URL,
      runScripts: "outside-only"
    });
    const win = dom.window as unknown as Record<string, unknown>;
    win.$ = () => [{ id: "maincontentpanel" }];
    win.courseListAction = () => undefined;

    dom.window.document.addEventListener("click", (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest?.("button.moveupClass, button.movedownClass");
      if (!button) return;
      const id = button.id.slice(button.id.startsWith("muClass") ? 7 : 7);
      const direction = button.classList.contains("moveupClass") ? -1 : 1;
      const from = this.order.indexOf(id);
      const to = from + direction;
      [this.order[from], this.order[to]] = [this.order[to], this.order[from]];
      this.loads.push([...this.order]);
      this.dom = this.render();
      this.pendingLoad?.();
    });
    return dom;
  }

  getDocument(): Document | null {
    return this.dom.window.document as unknown as Document;
  }

  waitForUpdate(isReady: () => boolean): Promise<boolean> {
    if (this.options.failFirstLoad) {
      this.options.failFirstLoad = false;
      return Promise.resolve(false);
    }
    const check = (): boolean => {
      try {
        return isReady();
      } catch {
        return false;
      }
    };
    if (check()) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      this.pendingLoad = () => {
        this.pendingLoad = null;
        resolve(check());
      };
    });
  }

  dispose(): void {
    this.disposed = true;
  }
}

function courseIds(order: readonly string[]): string[] {
  return order.map((id) => `myucla-class-${id}`);
}

/** Target order that lifts one class to the top and keeps the rest in place. */
function toTop(id: string): string[] {
  return courseIds([id, ...IDS.filter((other) => other !== id)]);
}

function pageAdapter(order: readonly string[]): MyUclaPlannerAdapter {
  document.body.innerHTML = markup(order);
  return new MyUclaPlannerAdapter();
}

describe("FastReorderCoordinator", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("moves a course to the top with native clicks and no visible navigation", async () => {
    const adapter = pageAdapter(IDS);
    const frame = new FakePlannerFrame([...IDS]);
    const progress = vi.fn();
    const coordinator = new FastReorderCoordinator(adapter, progress, {
      openFrame: () => frame
    });

    const target = [IDS[3], IDS[0], IDS[1], IDS[2]].map((id) => `myucla-class-${id}`);
    const result = await coordinator.applyOrder(target, courseIds(IDS));

    expect(result).toEqual({ status: "done", steps: 3 });
    expect(frame.loads).toHaveLength(3);
    expect(frame.loads.at(-1)).toEqual([IDS[3], IDS[0], IDS[1], IDS[2]]);
    // Each server round trip carried exactly one adjacent swap.
    expect(frame.loads[0]).toEqual([IDS[0], IDS[1], IDS[3], IDS[2]]);
    expect(frame.disposed).toBe(true);
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ kind: "success", total: 3 });
    // The visible page was never navigated or reordered by the extension.
    expect(adapter.getOrder()).toEqual(IDS.map((id) => `myucla-class-${id}`));
  });

  it("reports unavailable when the offscreen frame shows another plan", async () => {
    const adapter = pageAdapter(IDS);
    const frame = new FakePlannerFrame([...IDS], { planId: "7654321" });
    const coordinator = new FastReorderCoordinator(adapter, vi.fn(), {
      openFrame: () => frame
    });

    const result = await coordinator.applyOrder(toTop(IDS[3]), courseIds(IDS));

    expect(result).toEqual({
      status: "unavailable",
      reason: "The background page opened a different plan."
    });
    expect(frame.loads).toHaveLength(0);
    expect(frame.disposed).toBe(true);
  });

  it("still reaches the target when the visible page was behind the server", async () => {
    const adapter = pageAdapter(IDS);
    // The server has since moved things; the student's arrangement is still a
    // complete order over the same courses, so it remains exactly achievable.
    const frame = new FakePlannerFrame([IDS[1], IDS[0], IDS[2], IDS[3]]);
    const coordinator = new FastReorderCoordinator(adapter, vi.fn(), {
      openFrame: () => frame
    });

    const target = toTop(IDS[3]);
    const result = await coordinator.applyOrder(target, courseIds(IDS));

    expect(result).toMatchObject({ status: "done" });
    expect(courseIds(frame.loads.at(-1)!)).toEqual(target);
  });

  it("refuses when the offscreen frame holds a different set of courses", async () => {
    const adapter = pageAdapter(IDS);
    const frame = new FakePlannerFrame([IDS[0], IDS[1], IDS[2]]);
    const coordinator = new FastReorderCoordinator(adapter, vi.fn(), {
      openFrame: () => frame
    });

    const result = await coordinator.applyOrder(toTop(IDS[3]), courseIds(IDS));

    expect(result).toEqual({
      status: "unavailable",
      reason: "The background page has different classes than this one."
    });
    expect(frame.loads).toHaveLength(0);
  });

  it("reports unavailable when the offscreen frame never loads", async () => {
    const adapter = pageAdapter(IDS);
    const frame = new FakePlannerFrame([...IDS], { failFirstLoad: true });
    const coordinator = new FastReorderCoordinator(adapter, vi.fn(), {
      openFrame: () => frame
    });

    const result = await coordinator.applyOrder(toTop(IDS[3]), courseIds(IDS));

    expect(result).toMatchObject({ status: "unavailable" });
    expect(frame.disposed).toBe(true);
  });

  it("refuses runs longer than the configured safety limit", async () => {
    const adapter = pageAdapter(IDS);
    const frame = new FakePlannerFrame([...IDS]);
    const coordinator = new FastReorderCoordinator(adapter, vi.fn(), {
      openFrame: () => frame,
      maxSteps: 2
    });

    const result = await coordinator.applyOrder(toTop(IDS[3]), courseIds(IDS));

    expect(result).toMatchObject({ status: "failed" });
    expect(frame.loads).toHaveLength(0);
  });
});

describe("FastReorderCoordinator batching", () => {
  it("applies several moves in a single run and a single frame", async () => {
    const adapter = pageAdapter(IDS);
    const frame = new FakePlannerFrame([...IDS]);
    const coordinator = new FastReorderCoordinator(adapter, vi.fn(), {
      openFrame: () => frame
    });

    // Two courses relocated at once: one run of 5 native swaps, not two runs.
    const target = courseIds([IDS[3], IDS[2], IDS[0], IDS[1]]);
    const result = await coordinator.applyOrder(target, courseIds(IDS));

    expect(result).toEqual({ status: "done", steps: 5 });
    expect(frame.loads.at(-1)).toEqual([IDS[3], IDS[2], IDS[0], IDS[1]]);
    expect(frame.disposed).toBe(true);
  });

  it("does nothing when the target order already matches", async () => {
    const adapter = pageAdapter(IDS);
    const frame = new FakePlannerFrame([...IDS]);
    const coordinator = new FastReorderCoordinator(adapter, vi.fn(), {
      openFrame: () => frame
    });

    const result = await coordinator.applyOrder(courseIds(IDS), courseIds(IDS));

    expect(result).toEqual({ status: "done", steps: 0 });
    expect(frame.loads).toHaveLength(0);
  });
});
