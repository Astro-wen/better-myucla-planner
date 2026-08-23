import { FixturePlannerAdapter } from "../adapters/planner-adapter";
import {
  expectedOrderAfterStep,
  ordersMatch,
  planAdjacentMoves,
  type MoveDirection
} from "../domain/reorder";

const MAX_STEPS = 20;
const STEP_TIMEOUT_MS = 2_500;

export interface QueueProgress {
  kind: "idle" | "running" | "success" | "warning" | "error";
  message: string;
  completed: number;
  total: number;
}

export type ProgressListener = (progress: QueueProgress) => void;

export class ReorderQueue {
  private abortController: AbortController | null = null;

  constructor(
    private readonly adapter: FixturePlannerAdapter,
    private readonly onProgress: ProgressListener
  ) {}

  get isRunning(): boolean {
    return Boolean(this.abortController);
  }

  cancel(): void {
    this.abortController?.abort();
  }

  async moveTo(courseId: string, targetIndex: number): Promise<void> {
    if (this.isRunning) {
      throw new Error("A reorder is already running.");
    }

    const initialOrder = this.adapter.getOrder();
    const steps = planAdjacentMoves(initialOrder, courseId, targetIndex);

    if (steps.length === 0) {
      this.onProgress({
        kind: "success",
        message: "That class is already in that spot.",
        completed: 0,
        total: 0
      });
      return;
    }

    if (steps.length > MAX_STEPS) {
      throw new Error(
        `This needs ${steps.length} moves, over the demo's safe limit of ${MAX_STEPS}.`
      );
    }

    const controller = new AbortController();
    this.abortController = controller;
    let completed = 0;
    let expectedCurrentOrder = [...initialOrder];

    try {
      for (const step of steps) {
        if (controller.signal.aborted) {
          this.onProgress({
            kind: "warning",
            message: `Cancelled after ${completed} of ${steps.length} moves.`,
            completed,
            total: steps.length
          });
          return;
        }

        this.onProgress({
          kind: "running",
          message: `Moving with the page's own buttons: ${completed + 1}/${steps.length}`,
          completed,
          total: steps.length
        });

        expectedCurrentOrder = await this.performStep(
          step.courseId,
          step.direction,
          expectedCurrentOrder,
          controller.signal
        );
        completed += 1;
      }

      if (
        !ordersMatch(this.adapter.getOrder(), expectedCurrentOrder) ||
        expectedCurrentOrder[targetIndex] !== courseId
      ) {
        throw new Error("The final order doesn't match what you confirmed.");
      }

      this.onProgress({
        kind: "success",
        message: `Made ${completed} moves with the page's own buttons. This demo isn't connected to MyUCLA.`,
        completed,
        total: steps.length
      });
    } catch (error) {
      if (controller.signal.aborted) {
        this.onProgress({
          kind: "warning",
          message: `Cancelled. ${completed} of ${steps.length} moves are confirmed done.`,
          completed,
          total: steps.length
        });
        return;
      }

      const message = error instanceof Error ? error.message : "Something went wrong.";
      this.onProgress({
        kind: "error",
        message: `Stopped after ${completed} of ${steps.length} moves: ${message}`,
        completed,
        total: steps.length
      });
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  private async performStep(
    courseId: string,
    direction: MoveDirection,
    expectedBeforeOrder: readonly string[],
    signal: AbortSignal
  ): Promise<string[]> {
    const actualBeforeOrder = this.adapter.getOrder();
    if (!ordersMatch(actualBeforeOrder, expectedBeforeOrder)) {
      throw new Error("Something else changed the class order, so this stopped.");
    }

    const expectedOrder = expectedOrderAfterStep(expectedBeforeOrder, courseId, direction);
    const button = this.adapter.getMoveButton(courseId, direction);

    button.click();
    await waitForOrder(this.adapter, expectedOrder, signal);
    return expectedOrder;
  }
}

function waitForOrder(
  adapter: FixturePlannerAdapter,
  expectedOrder: readonly string[],
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let observer: MutationObserver | null = null;
    let timeoutId: number | null = null;

    const cleanup = () => {
      observer?.disconnect();
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      signal.removeEventListener("abort", onAbort);
    };

    const check = () => {
      try {
        if (ordersMatch(adapter.getOrder(), expectedOrder)) {
          cleanup();
          resolve();
          return true;
        }
      } catch (error) {
        cleanup();
        reject(error);
        return true;
      }
      return false;
    };

    const onAbort = () => {
      cleanup();
      reject(new Error("You cancelled this."));
    };

    if (check()) {
      return;
    }

    observer = new MutationObserver(() => check());
    observer.observe(document.body, { childList: true, subtree: true });
    signal.addEventListener("abort", onAbort, { once: true });
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("The page didn't update in time."));
    }, STEP_TIMEOUT_MS);
  });
}
