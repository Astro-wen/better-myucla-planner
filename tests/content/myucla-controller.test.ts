// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://be.my.ucla.edu/ClassPlanner/ClassPlan.aspx"}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MyUclaPlannerAdapter } from "../../src/adapters/myucla-adapter";
import { MyUclaPlannerController } from "../../src/content/myucla-controller";

const TRACKER = "ctl00_MainContent_planClassListView_clCommandFieldTracker";
const COMMAND = "ctl00_MainContent_planClassListView_clCommandField";
const ids = ["26440403", "26511217", "26691534"];

function command(direction: "up" | "down", id: string): string {
  const action = direction === "up" ? "moveupClass" : "movedownClass";
  return `courseListAction($(".maincontentpanel")[0].id, "${TRACKER}", "${COMMAND}", "${action}|${id}!0"); return false;`;
}

function card(
  id: string,
  index: number,
  label: string,
  status: string,
  conflict = false,
  total: number = ids.length
): string {
  return `
    <tbody class="Class${id} courseItem itemClass">
      <tr>
        <td class="SubjectAreaName_ClassName"><p>Class ${index + 1}: ${label}</p></td>
        <td class="linkPanelRight"><div class="OrderingButtons">
          <input class="colorpicker" type="color" />
          <button id="muClass${id}" class="link moveupClass"
            title="Move this Class up in the list" aria-label="Move this Class up in the list"
            onclick='${command("up", id)}' style="visibility:${index === 0 ? "hidden" : "visible"}"></button>
          <button id="mdClass${id}" class="link movedownClass"
            title="Move this Class down in the list" aria-label="Move this Class down in the list"
            onclick='${command("down", id)}' style="visibility:${index === total - 1 ? "hidden" : "visible"}"></button>
        </div></td>
      </tr>
      <tr><td>${conflict ? '<a class="uit-clickover-bottom" data-content="&lt;div class=&quot;popover_section_title warning light&quot;&gt;Warning: Time Conflict&lt;/div&gt;&lt;ul class=&#39;bulleted_list&#39;&gt;&lt;li&gt;COM SCI 35L&lt;/li&gt;&lt;/ul&gt;"><span class="icon-warning-sign"></span></a>' : ""}</td></tr>
      <tr><td><table class="coursetable"><tr><td>${status}</td></tr></table></td></tr>
    </tbody>`;
}

const LABELS: Record<string, string> = {
  [ids[0]]: "LING 1",
  [ids[1]]: "RUSSN C124C",
  [ids[2]]: "COM SCI 35L"
};
const STATUSES: Record<string, string> = {
  [ids[0]]: "Open: 4 of 100 Left",
  [ids[1]]: "Waitlisted Class Full (20)",
  [ids[2]]: "Enrolled Class Full (120)"
};

function planPanelHtml(order: readonly string[] = ids): string {
  return `<div id="panelPlan"><div id="div_landing"><table>
      ${order
        .map((id, index) =>
          card(id, index, LABELS[id], STATUSES[id], id === ids[2], order.length)
        )
        .join("")}
    </table></div></div>`;
}

function render(): void {
  document.body.innerHTML = `
    <form id="aspnetForm" method="post" action="/ClassPlanner/ClassPlan.aspx">
      <select id="ctl00_MainContent_termSessionChooser_TermChooser">
        <option value="26F" selected>Fall</option>
      </select>
      <input id="ctl00_MainContent_planIDField" value="1234567" />
      <div id="ctl00_MainContent_classPlanPanel">${planPanelHtml()}</div>
    </form>`;
}

/** MS AJAX replaces the whole UpdatePanel body on a partial postback. */
function partialPostback(order: readonly string[] = ids): void {
  document.getElementById("ctl00_MainContent_classPlanPanel")!.innerHTML =
    planPanelHtml(order);
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

function planOrder(): string[] {
  return [...document.querySelectorAll<HTMLElement>("#div_landing > table > tbody.courseItem")]
    .map((cardNode) => (cardNode.className.match(/Class(\d+)/) || [])[1]);
}

describe("MyUclaPlannerController UI", () => {
  let controller: MyUclaPlannerController | null = null;

  beforeEach(() => {
    render();
    const stored: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => Object.assign(stored, value)),
          remove: vi.fn(async (key: string) => delete stored[key])
        }
      }
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);
  });

  afterEach(() => {
    controller?.dispose();
    controller = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("adds a searchable summary without replacing official controls", async () => {
    const nativeCommands = [...document.querySelectorAll<HTMLButtonElement>("button.moveupClass")]
      .map((button) => button.getAttribute("onclick"));
    const adapter = new MyUclaPlannerAdapter();
    const contractSpy = vi.spyOn(adapter, "inspectContract");
    controller = new MyUclaPlannerController(adapter);
    await controller.start();
    await Promise.resolve();

    expect(document.querySelector("#planner-lift-toolbar")?.textContent).toContain(
      "Collapse all"
    );
    // The filter count is hidden until a filter is actually narrowing the list.
    expect(document.querySelector<HTMLElement>("[data-pl-count]")?.hidden).toBe(true);
    expect(document.querySelectorAll("input.colorpicker")).toHaveLength(3);
    expect(
      [...document.querySelectorAll<HTMLButtonElement>("button.moveupClass")].map((button) =>
        button.getAttribute("onclick")
      )
    ).toEqual(nativeCommands);

    const search = document.querySelector<HTMLInputElement>("[data-pl-search]")!;
    search.value = "russn";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelectorAll("tbody.courseItem.pl-filtered-out")).toHaveLength(2);
    expect(document.querySelector("[data-pl-count]")?.textContent).toBe("1 of 3");
    const checksAfterSearch = contractSpy.mock.calls.length;
    search.value = "russian";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(contractSpy).toHaveBeenCalledTimes(checksAfterSearch);

    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-pl-action="toggle-all"]')!.click();
    expect(document.querySelectorAll("tbody.courseItem.pl-course-collapsed")).toHaveLength(3);

    const nativeClicks = vi.fn();
    document
      .querySelectorAll("button.moveupClass, button.movedownClass")
      .forEach((button) => button.addEventListener("click", nativeClicks));

    expect(planOrder()).toEqual(ids);

    document.querySelector<HTMLButtonElement>(
      `[data-course-id="myucla-class-${ids[1]}"] [data-pl-action="top"]`
    )!.click();

    // Rearranging is local: the list moves, MyUCLA is not touched, and the
    // student is offered one save rather than a confirmation per drag.
    expect(planOrder()).toEqual([ids[1], ids[0], ids[2]]);
    expect(nativeClicks).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    const dirty = document.querySelector<HTMLElement>("[data-pl-dirty]")!;
    expect(dirty.hidden).toBe(false);
    expect(document.querySelector("[data-pl-dirty-text]")?.textContent).toContain(
      "1 class moved"
    );

    // A second rearrangement batches into the same pending save.
    document.querySelector<HTMLButtonElement>(
      `[data-course-id="myucla-class-${ids[2]}"] [data-pl-action="top"]`
    )!.click();
    expect(planOrder()).toEqual([ids[2], ids[1], ids[0]]);
    expect(nativeClicks).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>('[data-pl-action="discard"]')!.click();
    expect(planOrder()).toEqual(ids);
    expect(document.querySelector<HTMLElement>("[data-pl-dirty]")?.hidden).toBe(true);
    expect(nativeClicks).not.toHaveBeenCalled();
  });

  it("rebuilds itself after an UpdatePanel partial postback", async () => {
    controller = new MyUclaPlannerController(new MyUclaPlannerAdapter());
    await controller.start();
    await Promise.resolve();
    expect(document.querySelectorAll("[data-pl-real-tools]")).toHaveLength(3);

    // A colour change (or any MyUCLA action) replaces the panel body wholesale,
    // destroying our UI and the node the observer used to watch.
    partialPostback();
    expect(document.querySelectorAll("[data-pl-real-tools]")).toHaveLength(0);

    await settle();

    expect(document.querySelector("#planner-lift-toolbar")).not.toBeNull();
    expect(document.querySelectorAll("[data-pl-real-tools]")).toHaveLength(3);
  });

  it("restores an unsaved arrangement when a postback did not change the order", async () => {
    controller = new MyUclaPlannerController(new MyUclaPlannerAdapter());
    await controller.start();
    await Promise.resolve();

    document.querySelector<HTMLButtonElement>(
      `[data-course-id="myucla-class-${ids[1]}"] [data-pl-action="top"]`
    )!.click();
    expect(planOrder()).toEqual([ids[1], ids[0], ids[2]]);

    // MyUCLA re-renders the server order, which is still the original one.
    partialPostback(ids);
    await settle();

    expect(planOrder()).toEqual([ids[1], ids[0], ids[2]]);
    expect(document.querySelector<HTMLElement>("[data-pl-dirty]")?.hidden).toBe(false);
    // Position chips and MyUCLA's own "Class N:" numbers follow what is on
    // screen, not the order the server just re-rendered.
    const chip = (id: string): string =>
      document.querySelector<HTMLSelectElement>(
        `[data-course-id="myucla-class-${id}"] [data-pl-position]`
      )!.value;
    expect(chip(ids[1])).toBe("0");
    expect(chip(ids[0])).toBe("1");
    expect(
      document.querySelector<HTMLElement>(`tbody.Class${ids[1]} p`)!.textContent!.trim()
    ).toBe("Class 1: RUSSN C124C");
  });

  it("drops unsaved changes when MyUCLA's own order moved underneath", async () => {
    controller = new MyUclaPlannerController(new MyUclaPlannerAdapter());
    await controller.start();
    await Promise.resolve();

    document.querySelector<HTMLButtonElement>(
      `[data-course-id="myucla-class-${ids[1]}"] [data-pl-action="top"]`
    )!.click();
    expect(document.querySelector<HTMLElement>("[data-pl-dirty]")?.hidden).toBe(false);

    // Someone used an official arrow: the server order itself is different now.
    partialPostback([ids[2], ids[0], ids[1]]);
    await settle();

    expect(planOrder()).toEqual([ids[2], ids[0], ids[1]]);
    expect(document.querySelector<HTMLElement>("[data-pl-dirty]")?.hidden).toBe(true);
    expect(document.querySelector("[data-pl-status]")?.textContent).toContain(
      "unsaved changes were dropped"
    );
  });

  it("renumbers MyUCLA's own Class labels while an arrangement is unsaved", async () => {
    controller = new MyUclaPlannerController(new MyUclaPlannerAdapter());
    await controller.start();
    await Promise.resolve();

    const titleOf = (id: string): string =>
      document.querySelector<HTMLElement>(`tbody.Class${id} p`)!.textContent!.trim();
    expect(titleOf(ids[1])).toBe("Class 2: RUSSN C124C");

    document.querySelector<HTMLButtonElement>(
      `[data-course-id="myucla-class-${ids[1]}"] [data-pl-action="top"]`
    )!.click();
    expect(titleOf(ids[1])).toBe("Class 1: RUSSN C124C");
    expect(titleOf(ids[0])).toBe("Class 2: LING 1");

    document.querySelector<HTMLButtonElement>('[data-pl-action="discard"]')!.click();
    expect(titleOf(ids[1])).toBe("Class 2: RUSSN C124C");
    expect(titleOf(ids[0])).toBe("Class 1: LING 1");
  });

  it("keeps the arrangement and its renumbered labels while saving", async () => {
    controller = new MyUclaPlannerController(new MyUclaPlannerAdapter());
    await controller.start();
    await Promise.resolve();

    const title = (id: string): string =>
      document.querySelector<HTMLElement>(`tbody.Class${id} p`)!.textContent!.trim();
    const chip = (id: string): string =>
      document.querySelector<HTMLSelectElement>(
        `[data-course-id="myucla-class-${id}"] [data-pl-position]`
      )!.value;

    document.querySelector<HTMLButtonElement>(
      `[data-course-id="myucla-class-${ids[1]}"] [data-pl-action="top"]`
    )!.click();
    expect(title(ids[1])).toBe("Class 1: RUSSN C124C");
    expect(chip(ids[1])).toBe("0");

    // The offscreen frame cannot load under jsdom, so freeze its timers and
    // check the visible page the moment saving starts.
    vi.useFakeTimers();
    try {
      document.querySelector<HTMLButtonElement>('[data-pl-action="save"]')!.click();
      await Promise.resolve();

      // Saving must not quietly put MyUCLA's original numbering back while the
      // list is still showing the student's arrangement.
      expect(planOrder()).toEqual([ids[1], ids[0], ids[2]]);
      expect(title(ids[1])).toBe("Class 1: RUSSN C124C");
      expect(title(ids[0])).toBe("Class 2: LING 1");
      expect(chip(ids[1])).toBe("0");
      expect(document.querySelector("[data-pl-status]")?.textContent).toBe("Saving to MyUCLA\u2026");
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers back an arrangement that a logout interrupted", async () => {
    const key = "plannerLift.draft.v1";
    await chrome.storage.local.set({
      [key]: {
        "myucla-26F-plan-1234567": {
          savedOrder: ids.map((id) => `myucla-class-${id}`),
          desiredOrder: [ids[2], ids[0], ids[1]].map((id) => `myucla-class-${id}`),
          moved: [`myucla-class-${ids[2]}`],
          expiresAt: Date.now() + 60_000
        }
      }
    });

    controller = new MyUclaPlannerController(new MyUclaPlannerAdapter());
    await controller.start();
    await Promise.resolve();

    const offer = document.querySelector<HTMLElement>("[data-pl-draft]")!;
    expect(offer.hidden).toBe(false);
    expect(planOrder()).toEqual(ids);

    document.querySelector<HTMLButtonElement>('[data-pl-action="restore-draft"]')!.click();

    expect(planOrder()).toEqual([ids[2], ids[0], ids[1]]);
    expect(document.querySelector<HTMLElement>("[data-pl-dirty]")?.hidden).toBe(false);
    expect(offer.hidden).toBe(true);
  });

  it("drops a draft once MyUCLA's own order has moved on", async () => {
    await chrome.storage.local.set({
      "plannerLift.draft.v1": {
        "myucla-26F-plan-1234567": {
          savedOrder: [ids[1], ids[0], ids[2]].map((id) => `myucla-class-${id}`),
          desiredOrder: [ids[2], ids[1], ids[0]].map((id) => `myucla-class-${id}`),
          moved: [],
          expiresAt: Date.now() + 60_000
        }
      }
    });

    controller = new MyUclaPlannerController(new MyUclaPlannerAdapter());
    await controller.start();
    await Promise.resolve();

    expect(document.querySelector<HTMLElement>("[data-pl-draft]")?.hidden).toBe(true);
    expect(planOrder()).toEqual(ids);
  });
});
