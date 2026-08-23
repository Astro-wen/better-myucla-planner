import { describe, expect, it } from "vitest";

import {
  clampTargetIndex,
  countStepsToOrder,
  expectedOrderAfterStep,
  moveWithinOrder,
  nextStepTowardOrder,
  ordersMatch,
  planAdjacentMoves
} from "../../src/domain/reorder";

describe("clampTargetIndex", () => {
  it("accepts both valid list boundaries", () => {
    expect(clampTargetIndex(0, 4)).toBe(0);
    expect(clampTargetIndex(3, 4)).toBe(3);
  });

  it.each([
    { target: -1, count: 4 },
    { target: 4, count: 4 },
    { target: 1.5, count: 4 }
  ])("rejects invalid target $target for $count items", ({ target, count }) => {
    expect(() => clampTargetIndex(target, count)).toThrow();
  });

  it("rejects an empty course list", () => {
    expect(() => clampTargetIndex(0, 0)).toThrow("The class list is empty.");
  });
});

describe("planAdjacentMoves", () => {
  const order = ["a", "b", "c", "d"];

  it("plans the minimum repeated upward moves needed to place a course", () => {
    const steps = planAdjacentMoves(order, "d", 0);

    expect(steps).toEqual([
      { courseId: "d", direction: "up" },
      { courseId: "d", direction: "up" },
      { courseId: "d", direction: "up" }
    ]);

    const finalOrder = steps.reduce(
      (current, step) => expectedOrderAfterStep(current, step.courseId, step.direction),
      [...order]
    );
    expect(finalOrder).toEqual(["d", "a", "b", "c"]);
  });

  it("plans downward moves and returns no steps when already in place", () => {
    expect(planAdjacentMoves(order, "a", 3)).toEqual([
      { courseId: "a", direction: "down" },
      { courseId: "a", direction: "down" },
      { courseId: "a", direction: "down" }
    ]);
    expect(planAdjacentMoves(order, "b", 1)).toEqual([]);
  });

  it("rejects unknown courses and invalid destinations", () => {
    expect(() => planAdjacentMoves(order, "missing", 0)).toThrow("Couldn't find that class.");
    expect(() => planAdjacentMoves(order, "a", order.length)).toThrow("Pick a spot from 1 to 4");
  });
});

describe("expectedOrderAfterStep", () => {
  it("swaps exactly one adjacent pair without mutating the input", () => {
    const original = ["a", "b", "c"];

    expect(expectedOrderAfterStep(original, "b", "up")).toEqual(["b", "a", "c"]);
    expect(expectedOrderAfterStep(original, "b", "down")).toEqual(["a", "c", "b"]);
    expect(original).toEqual(["a", "b", "c"]);
  });

  it("fails closed for a missing course or a boundary move", () => {
    expect(() => expectedOrderAfterStep(["a", "b"], "missing", "up")).toThrow(
      "disappeared while it was moving"
    );
    expect(() => expectedOrderAfterStep(["a", "b"], "a", "up")).toThrow(
      "already at the edge of the list"
    );
    expect(() => expectedOrderAfterStep(["a", "b"], "b", "down")).toThrow(
      "already at the edge of the list"
    );
  });
});

describe("ordersMatch", () => {
  it("requires identical values, order, and length", () => {
    expect(ordersMatch(["a", "b"], ["a", "b"])).toBe(true);
    expect(ordersMatch(["a", "b"], ["b", "a"])).toBe(false);
    expect(ordersMatch(["a", "b"], ["a", "b", "c"])).toBe(false);
  });
});

describe("batched permutation planning", () => {
  const order = ["a", "b", "c", "d"];

  it("names the course that must come up next", () => {
    expect(nextStepTowardOrder(order, ["c", "a", "b", "d"])).toEqual({
      courseId: "c",
      direction: "up"
    });
    expect(nextStepTowardOrder(order, order)).toBeNull();
  });

  it("counts every native click a rearrangement costs", () => {
    expect(countStepsToOrder(order, order)).toBe(0);
    expect(countStepsToOrder(order, ["b", "a", "c", "d"])).toBe(1);
    expect(countStepsToOrder(order, ["d", "c", "b", "a"])).toBe(6);
  });

  it("replays its own steps to reach the target exactly", () => {
    const target = ["d", "a", "c", "b"];
    let current = [...order];
    for (let guard = 0; guard < 50; guard += 1) {
      const step = nextStepTowardOrder(current, target);
      if (!step) break;
      current = expectedOrderAfterStep(current, step.courseId, step.direction);
    }
    expect(current).toEqual(target);
  });

  it("moves a course within a list without touching the others", () => {
    expect(moveWithinOrder(order, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveWithinOrder(order, "a", 3)).toEqual(["b", "c", "d", "a"]);
    expect(() => moveWithinOrder(order, "zz", 0)).toThrow();
    expect(() => moveWithinOrder(order, "a", 9)).toThrow();
  });

  it("rejects a target that is not a permutation of the current order", () => {
    expect(() => nextStepTowardOrder(order, ["a", "b", "c"])).toThrow();
    expect(() => nextStepTowardOrder(order, ["a", "b", "c", "zz"])).toThrow();
  });
});
