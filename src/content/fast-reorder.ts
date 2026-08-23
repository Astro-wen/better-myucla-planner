import { MyUclaPlannerAdapter, plannerPageUrl } from "../adapters/myucla-adapter";
import {
  countStepsToOrder,
  expectedOrderAfterStep,
  nextStepTowardOrder,
  ordersMatch,
  sameCourseSet
} from "../domain/reorder";
import type { ProgressListener } from "./operation-queue";

const FRAME_ID = "planner-lift-sync-frame";
const DEFAULT_LOAD_TIMEOUT_MS = 15_000;
const POLL_MS = 120;
const DEFAULT_MAX_STEPS = 120;

export type FastReorderResult =
  | { status: "done"; steps: number }
  | { status: "cancelled" }
  | { status: "failed"; reason: string }
  /** The offscreen planner frame could not be trusted; caller should fall back. */
  | { status: "unavailable"; reason: string };

/**
 * The offscreen planner surface. Extracted so tests can drive the exact same
 * coordinator without a live network load.
 */
export interface PlannerFrame {
  getDocument(): Document | null;
  /**
   * Resolves once `isReady` holds. MyUCLA's Class Planner lives inside an
   * ASP.NET UpdatePanel, so an ordering click may come back as an async partial
   * postback that never fires a frame `load` event. Waiting on the DOM instead
   * of on navigation handles both shapes.
   */
  waitForUpdate(isReady: () => boolean, timeoutMs: number): Promise<boolean>;
  dispose(): void;
}

interface FastReorderOptions {
  loadTimeoutMs?: number;
  maxSteps?: number;
  openFrame?: () => PlannerFrame;
}

class IframePlannerFrame implements PlannerFrame {
  private readonly frame: HTMLIFrameElement;

  constructor() {
    document.getElementById(FRAME_ID)?.remove();
    const frame = document.createElement("iframe");
    frame.id = FRAME_ID;
    frame.title = "Better MyUCLA background sync";
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("data-planner-lift-owned", "true");
    frame.style.cssText =
      "position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:0;opacity:0;pointer-events:none;";
    document.body.append(frame);
    frame.src = plannerPageUrl;
    this.frame = frame;
  }

  getDocument(): Document | null {
    try {
      return this.frame.contentDocument;
    } catch {
      return null;
    }
  }

  waitForUpdate(isReady: () => boolean, timeoutMs: number): Promise<boolean> {
    const frame = this.frame;
    const check = (): boolean => {
      try {
        return isReady();
      } catch {
        return false;
      }
    };
    if (check()) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ready: boolean): void => {
        if (settled) return;
        settled = true;
        window.clearInterval(poll);
        window.clearTimeout(timer);
        frame.removeEventListener("load", onLoad);
        resolve(ready);
      };
      // A full navigation resolves on `load`; a partial postback resolves on the
      // poll. Whichever happens first wins.
      const onLoad = (): void => {
        window.setTimeout(() => {
          if (check()) finish(true);
        }, 0);
      };
      const poll = window.setInterval(() => { if (check()) finish(true); }, POLL_MS);
      const timer = window.setTimeout(() => finish(false), timeoutMs);
      frame.addEventListener("load", onLoad);
    });
  }

  dispose(): void {
    this.frame.remove();
    document.getElementById(FRAME_ID)?.remove();
  }
}

/**
 * Runs the same strictly whitelisted native move buttons, but inside an
 * offscreen same-origin Class Planner frame. MyUCLA still performs and persists
 * every single adjacent swap itself; the only thing that changes is that the
 * visible page no longer has to navigate once per swap.
 *
 * Every safety property of the visible flow is kept: exact page contract, exact
 * button allowlist, one move per full frame load, and a full expected-order
 * check after each load. Anything unexpected stops the run immediately.
 */
export class FastReorderCoordinator {
  private frame: PlannerFrame | null = null;
  private active = false;
  private cancelled = false;
  private readonly loadTimeoutMs: number;
  private readonly maxSteps: number;
  private readonly openFrame: () => PlannerFrame;

  constructor(
    private readonly adapter: MyUclaPlannerAdapter,
    private readonly onProgress: ProgressListener,
    options: FastReorderOptions = {}
  ) {
    this.loadTimeoutMs = options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
    this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    this.openFrame = options.openFrame ?? (() => new IframePlannerFrame());
  }

  get isRunning(): boolean {
    return this.active;
  }

  cancel(): void {
    if (!this.active) return;
    this.cancelled = true;
  }

  /**
   * Rearranges the whole plan in one run.
   *
   * `baselineOrder` is what the server still has; `targetOrder` is what the
   * student rearranged the visible list into. Batching matters: one save is one
   * confirmation, one background run, and one reload, no matter how many
   * courses moved.
   */
  async applyOrder(
    targetOrder: readonly string[],
    baselineOrder: readonly string[]
  ): Promise<FastReorderResult> {
    if (this.active) {
      return { status: "failed", reason: "A reorder is already running." };
    }
    if (!document.body) {
      return { status: "unavailable", reason: "Saving in the background doesn't work here." };
    }

    let total: number;
    try {
      total = countStepsToOrder(baselineOrder, targetOrder);
    } catch (error) {
      return {
        status: "failed",
        reason: error instanceof Error ? error.message : "Couldn't plan this reorder."
      };
    }
    if (total === 0) return { status: "done", steps: 0 };
    if (total > this.maxSteps) {
      return {
        status: "failed",
        reason: `This needs ${total} moves, over the safe limit of ${this.maxSteps}.`
      };
    }

    const contextKey = this.adapter.getContextKey();
    this.active = true;
    this.cancelled = false;
    this.report("running", "Saving to MyUCLA\u2026", 0, total);

    try {
      return await this.run(targetOrder, baselineOrder, contextKey, total);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Saving in the background failed.";
      return { status: "failed", reason };
    } finally {
      this.teardown();
      this.active = false;
    }
  }

  private async run(
    targetOrder: readonly string[],
    baselineOrder: readonly string[],
    contextKey: string,
    estimatedTotal: number
  ): Promise<FastReorderResult> {
    const frame = this.startFrame();
    const ready = await frame.waitForUpdate(
      () => this.readOrder(frame) !== null,
      this.loadTimeoutMs
    );
    if (!ready) {
      return { status: "unavailable", reason: "The background MyUCLA page didn't load in time." };
    }

    let expectedOrder: string[] = [...baselineOrder];
    let total = estimatedTotal;
    let completed = 0;
    let first = true;

    for (let guard = 0; guard <= estimatedTotal + total + 2; guard += 1) {
      if (this.cancelled) return { status: "cancelled" };

      const frameAdapter = this.readFrameAdapter(frame);
      if (!frameAdapter) {
        return this.stop(first, "Couldn't read the background MyUCLA page.");
      }

      const contract = frameAdapter.inspectContract();
      if (!contract.ok) {
        return this.stop(
          first,
          contract.reason || "The background MyUCLA page didn't pass the safety check."
        );
      }

      let frameContextKey: string;
      try {
        frameContextKey = frameAdapter.getContextKey();
      } catch {
        return this.stop(first, "Couldn't check the term or plan on the background MyUCLA page.");
      }
      if (frameContextKey !== contextKey) {
        // A fresh GET can land on a different default plan or term. Never issue
        // ordering commands against a list we did not verify.
        return this.stop(
          first,
          first
            ? "The background page opened a different plan."
            : "The term or plan changed while saving."
        );
      }

      const order = frameAdapter.getOrder();

      if (first) {
        // The visible page can be behind the server — a stale tab, or an earlier
        // run that landed after we stopped watching. The student's arrangement
        // is a complete order, so as long as it covers the same courses it is
        // still exactly achievable; start from whatever the server really has.
        if (!sameCourseSet(order, targetOrder)) {
          return this.stop(true, "The background page has different classes than this one.");
        }
        expectedOrder = [...order];
        try {
          total = countStepsToOrder(order, targetOrder);
        } catch (error) {
          return {
            status: "failed",
            reason: error instanceof Error ? error.message : "Couldn't plan this reorder."
          };
        }
        if (total === 0) {
          this.report("success", "Saved", 0, 0);
          return { status: "done", steps: 0 };
        }
        if (total > this.maxSteps) {
          return {
            status: "failed",
            reason: `This needs ${total} moves, over the safe limit of ${this.maxSteps}.`
          };
        }
        this.report("running", "Saving to MyUCLA\u2026", 0, total);
        first = false;
      } else if (!ordersMatch(order, expectedOrder)) {
        return {
          status: "failed",
          reason: "The background page order doesn't match the last confirmed step, so this stopped."
        };
      }

      let step;
      try {
        step = nextStepTowardOrder(order, targetOrder);
      } catch (error) {
        return {
          status: "failed",
          reason: error instanceof Error ? error.message : "Couldn't work out the next safe move."
        };
      }
      if (!step) {
        this.report("success", "Saved", completed, total);
        return { status: "done", steps: completed };
      }
      if (completed >= total) {
        return { status: "failed", reason: "Used every confirmed move, but the order still isn't right." };
      }

      const nextExpectedOrder = expectedOrderAfterStep(order, step.courseId, step.direction);

      let button: HTMLButtonElement;
      try {
        button = frameAdapter.getMoveButton(step.courseId, step.direction);
      } catch {
        return {
          status: "failed",
          reason: "The MyUCLA reorder button stopped working, so this stopped safely."
        };
      }

      const settled = frame.waitForUpdate(() => {
        const seen = this.readOrder(frame);
        return seen !== null && ordersMatch(seen, nextExpectedOrder);
      }, this.loadTimeoutMs);
      button.click();
      if (!(await settled)) {
        return { status: "failed", reason: "MyUCLA didn't finish this move in time." };
      }

      expectedOrder = nextExpectedOrder;
      completed += 1;
      this.report("running", "Saving to MyUCLA\u2026", completed, total);
    }

    return { status: "failed", reason: "This took more moves than expected, so it stopped safely." };
  }

  /** Before the first click nothing has changed, so the caller can fall back. */
  private stop(beforeAnyClick: boolean, reason: string): FastReorderResult {
    return beforeAnyClick ? { status: "unavailable", reason } : { status: "failed", reason };
  }

  private readFrameAdapter(frame: PlannerFrame): MyUclaPlannerAdapter | null {
    const doc = frame.getDocument();
    return doc ? new MyUclaPlannerAdapter(doc) : null;
  }

  /** Current course order inside the frame, or null while it is unreadable. */
  private readOrder(frame: PlannerFrame): string[] | null {
    const adapter = this.readFrameAdapter(frame);
    if (!adapter) return null;
    const contract = adapter.inspectContract();
    return contract.ok ? contract.courses.map(({ id }) => id) : null;
  }

  private startFrame(): PlannerFrame {
    this.teardown();
    this.frame = this.openFrame();
    return this.frame;
  }

  private teardown(): void {
    this.frame?.dispose();
    this.frame = null;
  }

  private report(
    kind: "running" | "success",
    message: string,
    completed: number,
    total: number
  ): void {
    this.onProgress({ kind, message, completed, total });
  }
}
