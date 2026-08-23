// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FixturePlannerAdapter } from "../../src/adapters/planner-adapter";
import { PlannerController } from "../../src/content/controller";

describe("PlannerController target-position workflow", () => {
  let controller: PlannerController | null = null;

  beforeEach(() => {
    document.body.innerHTML = `
      <main
        data-bf-profile="fixture-v1"
        data-bf-course-list
        data-bf-term="2026F"
        data-bf-plan="main"
      ></main>
    `;
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    controller?.dispose();
    controller = null;
    vi.restoreAllMocks();
  });

  it("preserves the selected destination through reconciliation and uses native buttons", async () => {
    let order = ["a", "b", "c"];
    let nativeMoveClicks = 0;
    const dangerousClick = vi.fn();
    const root = document.querySelector<HTMLElement>("[data-bf-course-list]")!;

    const render = () => {
      const fragment = document.createDocumentFragment();
      order.forEach((courseId, index) => {
        const card = document.createElement("article");
        card.dataset.bfCourseCard = "true";
        card.dataset.bfCourseId = courseId;
        card.innerHTML = `
          <div class="pl-course-copy"><h3 data-bf-course-title>Course ${courseId}</h3></div>
          <button type="button" data-bf-native-action="up" aria-label="Move Course ${courseId} up">Up</button>
          <button type="button" data-bf-native-action="down" aria-label="Move Course ${courseId} down">Down</button>
          <button type="button" data-bf-dangerous-action="enroll">Enroll</button>
        `;

        const up = card.querySelector<HTMLButtonElement>('[data-bf-native-action="up"]')!;
        const down = card.querySelector<HTMLButtonElement>('[data-bf-native-action="down"]')!;
        up.disabled = index === 0;
        down.disabled = index === order.length - 1;

        const move = (direction: "up" | "down") => {
          nativeMoveClicks += 1;
          const currentIndex = order.indexOf(courseId);
          const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
          [order[currentIndex], order[targetIndex]] = [order[targetIndex], order[currentIndex]];
          render();
        };

        up.addEventListener("click", () => move("up"));
        down.addEventListener("click", () => move("down"));
        card
          .querySelector<HTMLButtonElement>("[data-bf-dangerous-action]")!
          .addEventListener("click", dangerousClick);
        fragment.append(card);
      });
      root.replaceChildren(fragment);
    };

    render();
    controller = new PlannerController(new FixturePlannerAdapter());
    await controller.start();

    const select = document.querySelector<HTMLSelectElement>(
      '[data-bf-course-id="a"] [data-pl-position]'
    )!;
    select.value = "2";

    root.setAttribute("data-test-reconcile", "true");
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    expect(select.value).toBe("2");

    document
      .querySelector<HTMLButtonElement>('[data-bf-course-id="a"] [data-pl-action="move"]')!
      .click();

    await vi.waitFor(() => {
      expect(order).toEqual(["b", "c", "a"]);
    });
    expect(nativeMoveClicks).toBe(2);
    expect(dangerousClick).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>("[data-pl-status]")?.textContent).toContain(
      "Made 2 moves with the page's own buttons"
    );
  });

  it("waits safely for an initially empty planner to render", async () => {
    const root = document.querySelector<HTMLElement>("[data-bf-course-list]")!;
    controller = new PlannerController(new FixturePlannerAdapter());
    await controller.start();
    expect(document.querySelector("[data-planner-lift-owned]")).toBeNull();

    root.innerHTML = `
      <article data-bf-course-card data-bf-course-id="a">
        <div class="pl-course-copy"><h3 data-bf-course-title>Course a</h3></div>
        <button type="button" data-bf-native-action="up" aria-label="Move Course a up" disabled>Up</button>
        <button type="button" data-bf-native-action="down" aria-label="Move Course a down">Down</button>
      </article>
      <article data-bf-course-card data-bf-course-id="b">
        <div class="pl-course-copy"><h3 data-bf-course-title>Course b</h3></div>
        <button type="button" data-bf-native-action="up" aria-label="Move Course b up">Up</button>
        <button type="button" data-bf-native-action="down" aria-label="Move Course b down" disabled>Down</button>
      </article>
    `;

    await vi.waitFor(() => {
      expect(document.querySelector("#planner-lift-toolbar")).not.toBeNull();
      expect(document.querySelectorAll('[data-pl-action="top"]')).toHaveLength(2);
    });
  });
});
