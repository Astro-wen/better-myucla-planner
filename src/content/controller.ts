import { FixturePlannerAdapter, type CourseSnapshot } from "../adapters/planner-adapter";
import { ordersMatch, planAdjacentMoves } from "../domain/reorder";
import {
  AnnotationRepository,
  COLOR_OPTIONS,
  type AnnotationColor,
  type CourseAnnotation
} from "../storage/annotations";
import { ReorderQueue, type QueueProgress } from "./operation-queue";

const OWNED_ATTRIBUTE = "data-planner-lift-owned";
const TOOLBAR_ID = "planner-lift-toolbar";

export class PlannerController {
  private readonly repository = new AnnotationRepository();
  private readonly queue: ReorderQueue;
  private annotations: Record<string, CourseAnnotation> = {};
  private observer: MutationObserver | null = null;
  private reconcileQueued = false;
  private draggedCourseId: string | null = null;
  private contractHealthy = false;
  private status: QueueProgress = {
    kind: "warning",
    message: "Demo mode. Real MyUCLA actions stay locked.",
    completed: 0,
    total: 0
  };

  constructor(private readonly adapter: FixturePlannerAdapter) {
    this.queue = new ReorderQueue(adapter, (progress) => {
      this.status = progress;
      this.renderStatus();
    });
  }

  async start(): Promise<void> {
    this.attachEvents();
    this.observer = new MutationObserver(() => this.scheduleReconcile());
    this.observer.observe(document.body, { childList: true, subtree: true });

    const contract = this.adapter.inspectContract();
    if (contract.ok) {
      this.annotations = await this.repository.getContext(this.adapter.getContextKey());
    }

    this.reconcile();
  }

  dispose(): void {
    this.queue.cancel();
    this.observer?.disconnect();
    this.detachEvents();
    document.querySelectorAll(`[${OWNED_ATTRIBUTE}]`).forEach((node) => node.remove());
    document.querySelectorAll<HTMLElement>("[data-bf-course-card]").forEach((card) => {
      delete card.dataset.plColor;
      card.classList.remove("pl-drop-target");
    });
  }

  private attachEvents(): void {
    document.addEventListener("click", this.onClick);
    document.addEventListener("change", this.onChange);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("dragstart", this.onDragStart);
    document.addEventListener("dragover", this.onDragOver);
    document.addEventListener("dragleave", this.onDragLeave);
    document.addEventListener("drop", this.onDrop);
    document.addEventListener("dragend", this.onDragEnd);
  }

  private detachEvents(): void {
    document.removeEventListener("click", this.onClick);
    document.removeEventListener("change", this.onChange);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("dragstart", this.onDragStart);
    document.removeEventListener("dragover", this.onDragOver);
    document.removeEventListener("dragleave", this.onDragLeave);
    document.removeEventListener("drop", this.onDrop);
    document.removeEventListener("dragend", this.onDragEnd);
  }

  private scheduleReconcile(): void {
    if (this.reconcileQueued) {
      return;
    }
    this.reconcileQueued = true;
    window.requestAnimationFrame(() => {
      this.reconcileQueued = false;
      this.reconcile();
    });
  }

  private reconcile(): void {
    const contract = this.adapter.inspectContract();
    if (!contract.ok) {
      this.contractHealthy = false;
      this.status = {
        kind: "error",
        message: contract.reason || "The page layout changed, so reordering is paused.",
        completed: 0,
        total: 0
      };
      this.renderStatus();
      return;
    }

    this.contractHealthy = true;

    this.ensureToolbar();
    contract.courses.forEach((course, index) => {
      this.ensureCardTools(course, index, contract.courses.length);
      this.applyAnnotation(course);
    });
    this.renderStatus();
  }

  private ensureToolbar(): void {
    if (document.getElementById(TOOLBAR_ID)) {
      return;
    }

    const root = this.adapter.getRoot();
    if (!root?.parentElement) {
      return;
    }

    const toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    toolbar.className = "pl-toolbar";
    toolbar.setAttribute(OWNED_ATTRIBUTE, "true");

    const title = document.createElement("strong");
    title.textContent = "Better MyUCLA · Demo";

    const status = document.createElement("span");
    status.className = "pl-status";
    status.dataset.plStatus = "true";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.dataset.plAction = "cancel";
    cancelButton.textContent = "Cancel this run";

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.dataset.plAction = "clear-all-annotations";
    clearButton.textContent = "Clear local colors and tags";

    toolbar.append(title, status, cancelButton, clearButton);
    root.parentElement.insertBefore(toolbar, root);
  }

  private ensureCardTools(course: CourseSnapshot, index: number, total: number): void {
    let tools = course.node.querySelector<HTMLElement>(`:scope > [${OWNED_ATTRIBUTE}]`);
    if (!tools) {
      tools = document.createElement("div");
      tools.className = "pl-card-tools";
      tools.setAttribute(OWNED_ATTRIBUTE, "true");
      tools.dataset.courseId = course.id;

      const topButton = this.createActionButton("top", "Move to top");

      const positionLabel = document.createElement("label");
      positionLabel.textContent = "Position";
      const positionSelect = document.createElement("select");
      positionSelect.dataset.plPosition = "true";
      positionSelect.setAttribute("aria-label", `${course.label} position`);
      positionLabel.append(positionSelect);

      const moveButton = this.createActionButton("move", "Move");

      const dragHandle = this.createActionButton("drag", "⠿ Drag");
      dragHandle.classList.add("pl-drag-handle");
      dragHandle.draggable = true;
      dragHandle.title = "Drag onto another card, or press Alt + ↑/↓";

      const colorLabel = document.createElement("label");
      colorLabel.textContent = "Color";
      const colorSelect = document.createElement("select");
      colorSelect.dataset.plColor = "true";
      colorSelect.setAttribute("aria-label", `${course.label} color`);
      const colorNames: Record<AnnotationColor, string> = {
        none: "None",
        blue: "Blue",
        green: "Green",
        yellow: "Yellow",
        purple: "Purple",
        red: "Red",
        gray: "Gray"
      };
      COLOR_OPTIONS.forEach((color) => {
        const option = document.createElement("option");
        option.value = color;
        option.textContent = colorNames[color];
        colorSelect.append(option);
      });
      colorLabel.append(colorSelect);

      const tagLabel = document.createElement("label");
      tagLabel.textContent = "Tag";
      const tagInput = document.createElement("input");
      tagInput.type = "text";
      tagInput.maxLength = 24;
      tagInput.placeholder = "First choice / backup";
      tagInput.dataset.plTag = "true";
      tagInput.setAttribute("aria-label", `${course.label} tag`);
      tagLabel.append(tagInput);

      tools.append(topButton, positionLabel, moveButton, dragHandle, colorLabel, tagLabel);
      course.node.append(tools);
    }

    tools.dataset.courseId = course.id;
    const positionSelect = tools.querySelector<HTMLSelectElement>("[data-pl-position]");
    let rebuiltPositionOptions = false;
    if (positionSelect && positionSelect.options.length !== total) {
      positionSelect.replaceChildren();
      for (let position = 1; position <= total; position += 1) {
        const option = document.createElement("option");
        option.value = String(position - 1);
        option.textContent = String(position);
        positionSelect.append(option);
      }
      rebuiltPositionOptions = true;
    }
    if (positionSelect && rebuiltPositionOptions) {
      positionSelect.value = String(index);
    }
  }

  private createActionButton(action: string, label: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.plAction = action;
    button.textContent = label;
    return button;
  }

  private applyAnnotation(course: CourseSnapshot): void {
    const annotation = this.annotations[course.id] || { color: "none", tag: "" };
    if (annotation.color === "none") {
      delete course.node.dataset.plColor;
    } else {
      course.node.dataset.plColor = annotation.color;
    }

    const tools = course.node.querySelector<HTMLElement>(`:scope > [${OWNED_ATTRIBUTE}]`);
    const colorSelect = tools?.querySelector<HTMLSelectElement>("[data-pl-color]");
    const tagInput = tools?.querySelector<HTMLInputElement>("[data-pl-tag]");
    if (colorSelect && document.activeElement !== colorSelect) {
      colorSelect.value = annotation.color;
    }
    if (tagInput && document.activeElement !== tagInput) {
      tagInput.value = annotation.tag;
    }

    let badge = course.node.querySelector<HTMLElement>("[data-pl-tag-badge]");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "pl-tag-badge";
      badge.dataset.plTagBadge = "true";
      badge.setAttribute(OWNED_ATTRIBUTE, "true");
      course.node.querySelector(".pl-course-copy")?.append(badge);
    }
    if (badge.textContent !== annotation.tag) {
      badge.textContent = annotation.tag;
    }
  }

  private renderStatus(): void {
    const status = document.querySelector<HTMLElement>("[data-pl-status]");
    if (!status) {
      return;
    }
    if (status.textContent !== this.status.message) {
      status.textContent = this.status.message;
    }
    status.dataset.kind = this.status.kind;

    const cancelButton = document.querySelector<HTMLButtonElement>(
      '[data-pl-action="cancel"]'
    );
    if (cancelButton) {
      cancelButton.disabled = !this.queue.isRunning;
    }

    const reorderDisabled = this.queue.isRunning || !this.contractHealthy;
    document
      .querySelectorAll<HTMLButtonElement>(
        '[data-pl-action="top"], [data-pl-action="move"], [data-pl-action="drag"]'
      )
      .forEach((button) => {
        button.disabled = reorderDisabled;
        if (button.dataset.plAction === "drag") {
          button.draggable = !reorderDisabled;
        }
      });
  }

  private requestMove = async (courseId: string, targetIndex: number): Promise<void> => {
    try {
      const course = this.adapter.getCourse(courseId);
      const order = this.adapter.getOrder();
      const steps = planAdjacentMoves(order, courseId, targetIndex);
      if (steps.length === 0) {
        this.status = {
          kind: "success",
          message: `${course.label} is already in spot ${targetIndex + 1}.`,
          completed: 0,
          total: 0
        };
        this.renderStatus();
        return;
      }

      const confirmed = window.confirm(
        `Move "${course.label}" to spot ${targetIndex + 1}.\n\n` +
          `This clicks the page's own move button ${steps.length} times, one after another. ` +
          `The demo isn't connected to MyUCLA.`
      );
      if (!confirmed) {
        return;
      }

      if (!ordersMatch(this.adapter.getOrder(), order)) {
        throw new Error("The class order changed while you were confirming. Please try again.");
      }

      await this.queue.moveTo(courseId, targetIndex);
      this.renderStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      this.status = { kind: "error", message, completed: 0, total: 0 };
      this.renderStatus();
    }
  };

  private onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const actionButton = target.closest<HTMLButtonElement>("[data-pl-action]");
    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.plAction;
    if (action === "cancel") {
      this.queue.cancel();
      return;
    }

    if (action === "clear-all-annotations") {
      void this.clearAllAnnotations();
      return;
    }

    const tools = actionButton.closest<HTMLElement>(`[${OWNED_ATTRIBUTE}][data-course-id]`);
    const courseId = tools?.dataset.courseId;
    if (!courseId) {
      return;
    }

    if (action === "top") {
      void this.requestMove(courseId, 0);
      return;
    }

    if (action === "move") {
      const targetIndex = Number(
        tools.querySelector<HTMLSelectElement>("[data-pl-position]")?.value
      );
      void this.requestMove(courseId, targetIndex);
    }
  };

  private onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement || target instanceof HTMLInputElement)) {
      return;
    }

    const tools = target.closest<HTMLElement>(`[${OWNED_ATTRIBUTE}][data-course-id]`);
    const courseId = tools?.dataset.courseId;
    if (!courseId) {
      return;
    }

    if (target.matches("[data-pl-color], [data-pl-tag]")) {
      void this.saveAnnotation(courseId, tools);
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches('[data-pl-action="drag"]')) {
      return;
    }

    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const tools = target.closest<HTMLElement>(`[${OWNED_ATTRIBUTE}][data-course-id]`);
    const courseId = tools?.dataset.courseId;
    if (!courseId) {
      return;
    }
    const order = this.adapter.getOrder();
    const currentIndex = order.indexOf(courseId);
    const targetIndex = event.key === "ArrowUp" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex >= 0 && targetIndex < order.length) {
      void this.requestMove(courseId, targetIndex);
    }
  };

  private onDragStart = (event: DragEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches('[data-pl-action="drag"]')) {
      return;
    }
    const tools = target.closest<HTMLElement>(`[${OWNED_ATTRIBUTE}][data-course-id]`);
    this.draggedCourseId = tools?.dataset.courseId || null;
    if (this.draggedCourseId && event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "planner-lift-reorder");
    }
  };

  private onDragOver = (event: DragEvent): void => {
    if (!this.draggedCourseId) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const card = target.closest<HTMLElement>("[data-bf-course-card]");
    if (!card) {
      return;
    }
    event.preventDefault();
    card.classList.add("pl-drop-target");
  };

  private onDragLeave = (event: DragEvent): void => {
    const target = event.target;
    if (target instanceof Element) {
      target.closest<HTMLElement>("[data-bf-course-card]")?.classList.remove("pl-drop-target");
    }
  };

  private onDrop = (event: DragEvent): void => {
    const sourceId = this.draggedCourseId;
    this.clearDropTargets();
    this.draggedCourseId = null;
    if (!sourceId) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const targetCard = target.closest<HTMLElement>("[data-bf-course-card][data-bf-course-id]");
    const targetId = targetCard?.dataset.bfCourseId;
    if (!targetId) {
      return;
    }
    event.preventDefault();
    const targetIndex = this.adapter.getOrder().indexOf(targetId);
    void this.requestMove(sourceId, targetIndex);
  };

  private onDragEnd = (): void => {
    this.draggedCourseId = null;
    this.clearDropTargets();
  };

  private clearDropTargets(): void {
    document.querySelectorAll(".pl-drop-target").forEach((node) => {
      node.classList.remove("pl-drop-target");
    });
  }

  private async saveAnnotation(courseId: string, tools: HTMLElement): Promise<void> {
    const colorValue = tools.querySelector<HTMLSelectElement>("[data-pl-color]")?.value || "none";
    const color = COLOR_OPTIONS.includes(colorValue as AnnotationColor)
      ? (colorValue as AnnotationColor)
      : "none";
    const tag = tools.querySelector<HTMLInputElement>("[data-pl-tag]")?.value || "";
    const annotation = { color, tag: tag.trim().slice(0, 24) };
    this.annotations[courseId] = annotation;
    await this.repository.save(this.adapter.getContextKey(), courseId, annotation);
    this.reconcile();
  }

  private async clearAllAnnotations(): Promise<void> {
    const confirmed = window.confirm("Clear every color and tag this extension saved on this computer?");
    if (!confirmed) {
      return;
    }
    await this.repository.clearAll();
    this.annotations = {};
    this.status = {
      kind: "success",
      message: "Cleared all local colors and tags.",
      completed: 0,
      total: 0
    };
    this.reconcile();
  }
}
