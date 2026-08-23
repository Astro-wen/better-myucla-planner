// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { FixturePlannerAdapter } from "../../src/adapters/planner-adapter";
import { ReorderQueue, type QueueProgress } from "../../src/content/operation-queue";

describe("ReorderQueue with full-card rerenders", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main
        data-bf-profile="fixture-v1"
        data-bf-course-list
        data-bf-term="2026F"
        data-bf-plan="main"
      ></main>
    `;
  });

  it("re-resolves fresh native buttons after every asynchronous rerender", async () => {
    let order = ["a", "b", "c"];
    let moveClicks = 0;
    const dangerousClick = vi.fn();
    const progress: QueueProgress[] = [];
    const root = document.querySelector<HTMLElement>("[data-bf-course-list]")!;

    const render = () => {
      const fragment = document.createDocumentFragment();

      order.forEach((courseId, index) => {
        const card = document.createElement("article");
        card.dataset.bfCourseCard = "true";
        card.dataset.bfCourseId = courseId;
        card.innerHTML = `
          <h3 data-bf-course-title>Course ${courseId}</h3>
          <button type="button" data-bf-native-action="up" aria-label="Move Course ${courseId} up">Up</button>
          <button type="button" data-bf-native-action="down" aria-label="Move Course ${courseId} down">Down</button>
          <button type="button" data-bf-dangerous-action="enroll">Enroll</button>
        `;

        const up = card.querySelector<HTMLButtonElement>('[data-bf-native-action="up"]')!;
        const down = card.querySelector<HTMLButtonElement>('[data-bf-native-action="down"]')!;
        up.disabled = index === 0;
        down.disabled = index === order.length - 1;

        const scheduleMove = (direction: "up" | "down") => {
          moveClicks += 1;
          window.setTimeout(() => {
            const currentIndex = order.indexOf(courseId);
            const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
            [order[currentIndex], order[targetIndex]] = [
              order[targetIndex],
              order[currentIndex]
            ];
            render();
          }, 0);
        };

        up.addEventListener("click", () => scheduleMove("up"));
        down.addEventListener("click", () => scheduleMove("down"));
        card
          .querySelector<HTMLButtonElement>("[data-bf-dangerous-action]")!
          .addEventListener("click", dangerousClick);
        fragment.append(card);
      });

      root.replaceChildren(fragment);
    };

    render();
    const adapter = new FixturePlannerAdapter();
    const queue = new ReorderQueue(adapter, (update) => progress.push(update));

    await queue.moveTo("c", 0);

    expect(order).toEqual(["c", "a", "b"]);
    expect(adapter.getOrder()).toEqual(["c", "a", "b"]);
    expect(moveClicks).toBe(2);
    expect(dangerousClick).not.toHaveBeenCalled();
    expect(progress.filter(({ kind }) => kind === "running")).toHaveLength(2);
    expect(progress.at(-1)).toMatchObject({ kind: "success", completed: 2, total: 2 });
    expect(queue.isRunning).toBe(false);
  });

  it("cancels a stalled step without retrying or reporting success", async () => {
    const root = document.querySelector<HTMLElement>("[data-bf-course-list]")!;
    root.innerHTML = `
      <article data-bf-course-card data-bf-course-id="a">
        <h3 data-bf-course-title>Course a</h3>
        <button type="button" data-bf-native-action="up" aria-label="Move Course a up" disabled>Up</button>
        <button type="button" data-bf-native-action="down" aria-label="Move Course a down">Down</button>
      </article>
      <article data-bf-course-card data-bf-course-id="b">
        <h3 data-bf-course-title>Course b</h3>
        <button type="button" data-bf-native-action="up" aria-label="Move Course b up">Up</button>
        <button type="button" data-bf-native-action="down" aria-label="Move Course b down" disabled>Down</button>
      </article>
    `;

    const progress: QueueProgress[] = [];
    const queue = new ReorderQueue(
      new FixturePlannerAdapter(),
      (update) => progress.push(update)
    );
    const moving = queue.moveTo("b", 0);

    queue.cancel();
    await moving;

    expect(progress.at(-1)).toMatchObject({ kind: "warning", completed: 0, total: 1 });
    expect(progress.some(({ kind }) => kind === "success")).toBe(false);
    expect(queue.isRunning).toBe(false);
  });

  it("stops when another actor changes the full order between steps", async () => {
    let order = ["a", "b", "c"];
    let moveClicks = 0;
    const progress: QueueProgress[] = [];
    const root = document.querySelector<HTMLElement>("[data-bf-course-list]")!;

    const render = () => {
      root.replaceChildren(
        ...order.map((courseId, index) => {
          const card = document.createElement("article");
          card.dataset.bfCourseCard = "true";
          card.dataset.bfCourseId = courseId;
          card.innerHTML = `
            <h3 data-bf-course-title>Course ${courseId}</h3>
            <button type="button" data-bf-native-action="up" aria-label="Move Course ${courseId} up">Up</button>
            <button type="button" data-bf-native-action="down" aria-label="Move Course ${courseId} down">Down</button>
          `;
          const up = card.querySelector<HTMLButtonElement>('[data-bf-native-action="up"]')!;
          const down = card.querySelector<HTMLButtonElement>('[data-bf-native-action="down"]')!;
          up.disabled = index === 0;
          down.disabled = index === order.length - 1;
          up.addEventListener("click", () => {
            moveClicks += 1;
            const currentIndex = order.indexOf(courseId);
            [order[currentIndex - 1], order[currentIndex]] = [
              order[currentIndex],
              order[currentIndex - 1]
            ];
            render();
            if (moveClicks === 1) {
              queueMicrotask(() => {
                order = ["b", "a", "c"];
                render();
              });
            }
          });
          return card;
        })
      );
    };

    render();
    const queue = new ReorderQueue(
      new FixturePlannerAdapter(),
      (update) => progress.push(update)
    );

    await expect(queue.moveTo("c", 0)).rejects.toThrow(
      "Something else changed the class order"
    );
    expect(moveClicks).toBe(1);
    expect(progress.at(-1)).toMatchObject({ kind: "error", completed: 1, total: 2 });
  });
});
