import { MyUclaPlannerAdapter } from "../adapters/myucla-adapter";
import { expectedOrderAfterStep, ordersMatch, planAdjacentMoves } from "../domain/reorder";
import type { QueueProgress, ProgressListener } from "./operation-queue";

const PENDING_KEY = "plannerLift.pendingReorder.v1";
const TAB_MARKER_KEY = "plannerLift.operationId.v1";
const MAX_STEPS = 20;
const MAX_AGE_MS = 5 * 60 * 1000;

interface PendingReorder {
  schemaVersion: 1;
  operationId: string;
  contextKey: string;
  courseId: string;
  targetIndex: number;
  expectedOrder: string[];
  completed: number;
  total: number;
  expiresAt: number;
}

interface CoordinatorOptions {
  stepDelayMs?: number;
  watchdogMs?: number;
}

function isSafeCourseId(value: unknown): value is string {
  return typeof value === "string" && /^myucla-class-\d{5,12}$/.test(value);
}

function normalizePending(value: unknown): PendingReorder | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<PendingReorder>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.operationId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(candidate.operationId) ||
    typeof candidate.contextKey !== "string" ||
    !/^myucla-\d{2}[A-Z]-plan-\d{1,12}$/.test(candidate.contextKey) ||
    !isSafeCourseId(candidate.courseId) ||
    !Number.isInteger(candidate.targetIndex) ||
    !Array.isArray(candidate.expectedOrder) ||
    candidate.expectedOrder.length < 1 ||
    candidate.expectedOrder.length > 100 ||
    !candidate.expectedOrder.every(isSafeCourseId) ||
    new Set(candidate.expectedOrder).size !== candidate.expectedOrder.length ||
    !Number.isInteger(candidate.completed) ||
    !Number.isInteger(candidate.total) ||
    typeof candidate.expiresAt !== "number"
  ) {
    return null;
  }

  if (
    candidate.targetIndex! < 0 ||
    candidate.targetIndex! >= candidate.expectedOrder.length ||
    candidate.completed! < 0 ||
    candidate.total! < 1 ||
    candidate.total! > MAX_STEPS ||
    candidate.completed! > candidate.total!
  ) {
    return null;
  }

  return candidate as PendingReorder;
}

function getTabMarker(): string | null {
  try {
    return window.sessionStorage.getItem(TAB_MARKER_KEY);
  } catch {
    return null;
  }
}

function setTabMarker(operationId: string): boolean {
  try {
    window.sessionStorage.setItem(TAB_MARKER_KEY, operationId);
    return true;
  } catch {
    return false;
  }
}

function clearTabMarker(): void {
  try {
    window.sessionStorage.removeItem(TAB_MARKER_KEY);
  } catch {
    // If storage is unavailable, the pending record still expires quickly.
  }
}

async function readPending(): Promise<PendingReorder | null> {
  if (!globalThis.chrome?.storage?.local) {
    return null;
  }
  const result = await chrome.storage.local.get(PENDING_KEY);
  return normalizePending(result[PENDING_KEY]);
}

async function writePending(pending: PendingReorder): Promise<void> {
  await chrome.storage.local.set({ [PENDING_KEY]: pending });
}

async function clearPending(): Promise<void> {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.remove(PENDING_KEY);
  }
}

export class NavigationReorderCoordinator {
  private active = false;
  private watchdogId: number | null = null;
  private readonly stepDelayMs: number;
  private readonly watchdogMs: number;

  constructor(
    private readonly adapter: MyUclaPlannerAdapter,
    private readonly onProgress: ProgressListener,
    options: CoordinatorOptions = {}
  ) {
    this.stepDelayMs = options.stepDelayMs ?? 700;
    this.watchdogMs = options.watchdogMs ?? 8_000;
  }

  get isRunning(): boolean {
    return this.active;
  }

  async moveTo(courseId: string, targetIndex: number): Promise<void> {
    if (this.active || getTabMarker()) {
      throw new Error("This tab already has a MyUCLA reorder running.");
    }

    const order = this.adapter.getOrder();
    const steps = planAdjacentMoves(order, courseId, targetIndex);
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
      throw new Error(`This needs ${steps.length} moves, over the safe limit of ${MAX_STEPS}.`);
    }

    const operationId = crypto.randomUUID();
    const pending: PendingReorder = {
      schemaVersion: 1,
      operationId,
      contextKey: this.adapter.getContextKey(),
      courseId,
      targetIndex,
      expectedOrder: [...order],
      completed: 0,
      total: steps.length,
      expiresAt: Date.now() + MAX_AGE_MS
    };

    await writePending(pending);
    if (!setTabMarker(operationId)) {
      await clearPending();
      throw new Error("This tab can't save reorder progress, so nothing was moved.");
    }
    this.active = true;
    await this.advance(pending);
  }

  async resumePending(): Promise<boolean> {
    const marker = getTabMarker();
    if (!marker) {
      await this.removeExpiredOrOrphanedPending();
      return false;
    }

    const pending = await readPending();
    if (!pending || pending.operationId !== marker || pending.expiresAt < Date.now()) {
      await this.fail("The last reorder expired, so it didn't continue.");
      return false;
    }

    this.active = true;
    await this.advance(pending);
    return true;
  }

  async cancel(): Promise<void> {
    if (this.watchdogId !== null) {
      window.clearTimeout(this.watchdogId);
      this.watchdogId = null;
    }
    const pending = await readPending();
    await clearPending();
    clearTabMarker();
    this.active = false;
    this.onProgress({
      kind: "warning",
      message: pending
        ? "Stopped the rest of the moves. The page now shows MyUCLA's current order."
        : "There's no reorder waiting to continue.",
      completed: pending?.completed || 0,
      total: pending?.total || 0
    });
  }

  private async advance(pending: PendingReorder): Promise<void> {
    if (pending.contextKey !== this.adapter.getContextKey()) {
      await this.fail("The term or plan changed, so reordering stopped.", pending);
      return;
    }

    const actualOrder = this.adapter.getOrder();
    if (!ordersMatch(actualOrder, pending.expectedOrder)) {
      await this.fail(
        "The page order doesn't match the last confirmed step, so reordering stopped.",
        pending
      );
      return;
    }

    if (actualOrder[pending.targetIndex] === pending.courseId) {
      await clearPending();
      clearTabMarker();
      this.active = false;
      this.onProgress({
        kind: "success",
        message: `Made ${pending.completed} moves with MyUCLA's own buttons. MyUCLA saved them.`,
        completed: pending.completed,
        total: pending.total
      });
      return;
    }

    if (pending.completed >= pending.total) {
      await this.fail("Used every confirmed move, but the class isn't in that spot.", pending);
      return;
    }

    const nextStep = planAdjacentMoves(
      actualOrder,
      pending.courseId,
      pending.targetIndex
    )[0];
    if (!nextStep) {
      await this.fail("Couldn't work out the next safe move.", pending);
      return;
    }

    const nextExpectedOrder = expectedOrderAfterStep(
      actualOrder,
      nextStep.courseId,
      nextStep.direction
    );
    const writeAhead: PendingReorder = {
      ...pending,
      expectedOrder: nextExpectedOrder,
      completed: pending.completed + 1,
      expiresAt: Date.now() + MAX_AGE_MS
    };

    await writePending(writeAhead);
    this.onProgress({
      kind: "running",
      message: `Moving with MyUCLA's own buttons: ${writeAhead.completed}/${writeAhead.total} (the page will reload)`,
      completed: pending.completed,
      total: pending.total
    });

    await new Promise<void>((resolve) => window.setTimeout(resolve, this.stepDelayMs));
    if (getTabMarker() !== pending.operationId) {
      if (!this.active) {
        return;
      }
      await this.fail("The tab changed before this move ran, so reordering stopped.", pending);
      return;
    }
    if (!ordersMatch(this.adapter.getOrder(), actualOrder)) {
      await this.fail("The page changed before this move ran, so reordering stopped.", pending);
      return;
    }

    try {
      const button = this.adapter.getMoveButton(nextStep.courseId, nextStep.direction);
      button.click();
    } catch {
      await this.fail("The MyUCLA reorder button stopped working, so this stopped safely.", pending);
      return;
    }

    this.watchdogId = window.setTimeout(() => {
      this.watchdogId = null;
      void this.handleMissingNavigation(writeAhead);
    }, this.watchdogMs);
  }

  private async handleMissingNavigation(writeAhead: PendingReorder): Promise<void> {
    try {
      if (ordersMatch(this.adapter.getOrder(), writeAhead.expectedOrder)) {
        await this.advance(writeAhead);
        return;
      }
    } catch {
      // The page may be unloading; the next content-script instance will resume.
      return;
    }
    await this.fail("MyUCLA didn't finish updating the page in time.", writeAhead);
  }

  private async fail(message: string, pending?: PendingReorder): Promise<void> {
    await clearPending();
    clearTabMarker();
    this.active = false;
    this.onProgress({
      kind: "error",
      message,
      completed: pending?.completed || 0,
      total: pending?.total || 0
    });
  }

  private async removeExpiredOrOrphanedPending(): Promise<void> {
    const pending = await readPending();
    if (pending && pending.expiresAt < Date.now()) {
      await clearPending();
    }
  }
}

export const pendingReorderStorageKey = PENDING_KEY;
