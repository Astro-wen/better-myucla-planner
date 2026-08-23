export type MoveDirection = "up" | "down";

export interface ReorderStep {
  courseId: string;
  direction: MoveDirection;
}

export function clampTargetIndex(targetIndex: number, itemCount: number): number {
  if (!Number.isInteger(targetIndex)) {
    throw new Error("That position isn't valid.");
  }

  if (itemCount < 1) {
    throw new Error("The class list is empty.");
  }

  if (targetIndex < 0 || targetIndex >= itemCount) {
    throw new Error(`That position isn't valid. Pick a spot from 1 to ${itemCount}.`);
  }

  return targetIndex;
}

export function planAdjacentMoves(
  order: readonly string[],
  courseId: string,
  targetIndex: number
): ReorderStep[] {
  const currentIndex = order.indexOf(courseId);

  if (currentIndex === -1) {
    throw new Error("Couldn't find that class.");
  }

  clampTargetIndex(targetIndex, order.length);

  const direction: MoveDirection = targetIndex < currentIndex ? "up" : "down";
  const stepCount = Math.abs(targetIndex - currentIndex);

  return Array.from({ length: stepCount }, () => ({ courseId, direction }));
}

export function expectedOrderAfterStep(
  order: readonly string[],
  courseId: string,
  direction: MoveDirection
): string[] {
  const currentIndex = order.indexOf(courseId);
  if (currentIndex === -1) {
    throw new Error("That class disappeared while it was moving.");
  }

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= order.length) {
    throw new Error("That class is already at the edge of the list.");
  }

  const nextOrder = [...order];
  [nextOrder[currentIndex], nextOrder[nextIndex]] = [
    nextOrder[nextIndex],
    nextOrder[currentIndex]
  ];
  return nextOrder;
}

export function ordersMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * One native "up" click that brings `current` closer to `target`.
 *
 * Batched rearranging is expressed as a target permutation rather than a list
 * of independent moves: the first position that disagrees names the course
 * that has to come up. Recomputing this after every server round trip means a
 * run self-corrects instead of replaying a stale script.
 */
export function nextStepTowardOrder(
  current: readonly string[],
  target: readonly string[]
): ReorderStep | null {
  if (current.length !== target.length) {
    throw new Error("The number of classes changed, so reordering stopped.");
  }
  for (let index = 0; index < target.length; index += 1) {
    const wanted = target[index];
    if (current[index] === wanted) continue;
    if (current.indexOf(wanted) === -1) {
      throw new Error("The new order lists a class that isn't on the page.");
    }
    return { courseId: wanted, direction: "up" };
  }
  return null;
}

/** How many native clicks the whole rearrangement will cost. */
export function countStepsToOrder(
  current: readonly string[],
  target: readonly string[]
): number {
  let order = [...current];
  let steps = 0;
  const limit = order.length * order.length;
  for (;;) {
    const step = nextStepTowardOrder(order, target);
    if (!step) return steps;
    order = expectedOrderAfterStep(order, step.courseId, step.direction);
    steps += 1;
    if (steps > limit) {
      throw new Error("Couldn't find a safe way to reach that order.");
    }
  }
}

/** Pure list move used for optimistic, local-only rearranging. */
export function moveWithinOrder(
  order: readonly string[],
  courseId: string,
  targetIndex: number
): string[] {
  const from = order.indexOf(courseId);
  if (from === -1) {
    throw new Error("Couldn't find that class.");
  }
  clampTargetIndex(targetIndex, order.length);
  const next = order.filter((id) => id !== courseId);
  next.splice(targetIndex, 0, courseId);
  return next;
}

/** Same courses, any arrangement. */
export function sameCourseSet(
  left: readonly string[],
  right: readonly string[]
): boolean {
  if (left.length !== right.length) return false;
  const seen = new Set(left);
  return seen.size === left.length && right.every((id) => seen.has(id));
}
