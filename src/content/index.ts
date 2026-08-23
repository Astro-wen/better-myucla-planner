import { FixturePlannerAdapter, isFixturePlannerPage } from "../adapters/planner-adapter";
import { MyUclaPlannerAdapter, isMyUclaPlannerPage } from "../adapters/myucla-adapter";
import { readEnabled, watchEnabled } from "../storage/settings";
import { applyBootHold, releaseBootHold } from "./boot-hold";
import { publishSessionSettings } from "./session-keep";
import { PlannerController } from "./controller";
import { MyUclaPlannerController } from "./myucla-controller";

type ActivePlannerController = PlannerController | MyUclaPlannerController;

declare global {
  interface Window {
    __plannerLiftController?: ActivePlannerController;
    __plannerLiftWatching?: boolean;
  }
}

function createController(): ActivePlannerController | null {
  if (isMyUclaPlannerPage()) {
    return new MyUclaPlannerController(new MyUclaPlannerAdapter());
  }
  if (isFixturePlannerPage()) {
    return new PlannerController(new FixturePlannerAdapter());
  }
  return null;
}

export async function startPlannerLift(): Promise<ActivePlannerController | null> {
  window.__plannerLiftController?.dispose();
  window.__plannerLiftController = undefined;

  if (!(await readEnabled())) return null;

  const controller = createController();
  if (!controller) return null;

  window.__plannerLiftController = controller;
  await controller.start();
  return controller;
}

export function stopPlannerLift(): void {
  window.__plannerLiftController?.dispose();
  window.__plannerLiftController = undefined;
  releaseBootHold();
}

function whenDomReady(run: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}

// The script runs at document_start so the reload hold lands before first paint.
applyBootHold();

// Independent of the on/off switch: it only mirrors a preference the student set.
publishSessionSettings();

if (!window.__plannerLiftWatching) {
  window.__plannerLiftWatching = true;
  watchEnabled((enabled) => {
    if (enabled) void startPlannerLift();
    else stopPlannerLift();
  });
}

whenDomReady(() => void startPlannerLift());
