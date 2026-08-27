import { MyUclaPlannerAdapter } from "../adapters/myucla-adapter";
import type { CourseSnapshot } from "../adapters/planner-adapter";
import { countStepsToOrder, moveWithinOrder, ordersMatch } from "../domain/reorder";
import { AnnotationRepository, type CourseAnnotation } from "../storage/annotations";
import {
  clearDraft,
  readDraft,
  readLayoutSettings,
  readViewState,
  saveDraft,
  saveViewState,
  watchLayoutSettings
} from "../storage/settings";
import { releaseBootHold } from "./boot-hold";
import {
  applyHeadline,
  markHeaderRows,
  readHeadline,
  restoreHeadline,
  restoreWeekGrid,
  tidyWeekGrid,
  unmarkHeaderRows
} from "./page-polish";
import { FastReorderCoordinator } from "./fast-reorder";
import { buildFinalsWeek, type FinalsEntry } from "./finals-week";
import {
  conflictCodes,
  inspectCourse,
  matchesCourse,
  summarizeStatus,
  type CourseInsight
} from "./plan-insights";
import type { QueueProgress } from "./operation-queue";
import {
  remainingMinutes,
  watchSessionCountdown,
  type SessionCountdown
} from "./session-clock";

const OWNED_ATTRIBUTE = "data-planner-lift-owned";
const TOOLBAR_ID = "planner-lift-toolbar";
const ACTIONBAR_ID = "planner-lift-actionbar";
const TOPBAR_ID = "planner-lift-topbar";
const JUMP_ID = "planner-lift-jump";
const RESUME_KEY = "plannerLift.afterSync.v1";
/** Rough cost of one MyUCLA postback, used only to phrase the wait in seconds. */
const SECONDS_PER_STEP = 1.2;
/** Only mention the session when it is close enough to threaten unsaved work. */
const SESSION_WARN_MINUTES = 20;
/** Plans at least this long open collapsed the first time they are seen. */
const BIG_PLAN_COURSES = 8;
/** How long the "where did it go" chip stays before it fades on its own. */
const JUMP_CHIP_MS = 7000;
/** How close to the window edge a drag has to get before the page follows. */
const DRAG_EDGE_PX = 110;
/** Fastest auto-scroll, in pixels per frame, reached at the very edge. */
const DRAG_SCROLL_MAX = 26;
/** MyUCLA's own section header, so our controls can ride along in it. */
const SECTION_TITLE_SELECTOR = "#plannerSectionClip.classPlanner_SectionTitle";
/** Study-list limits are set per College, so link out rather than guess one. */
const UNIT_LIMIT_URL =
  "https://registrar.ucla.edu/registration-classes/enrollment-appointments-and-passes/undergraduate-student-enrollment-passes";

/**
 * MyUCLA already ships this icon font and uses it for its own ordering arrows,
 * so reusing the class names keeps the injected controls visually native.
 */
const ICONS = {
  grip: "icon-reorder",
  top: "icon-double-angle-up",
  tag: "icon-tag",
  chevron: "icon-chevron-down",
  more: "icon-ellipsis-horizontal",
  search: "icon-search",
  up: "icon-arrow-up",
  down: "icon-arrow-down"
} as const;

function makeIcon(iconClass: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = iconClass;
  span.setAttribute("aria-hidden", "true");
  return span;
}

function describeDuration(steps: number): string {
  const seconds = Math.max(1, Math.round(steps * SECONDS_PER_STEP));
  if (seconds < 60) return `about ${seconds}s`;
  return `about ${Math.round(seconds / 60)} min`;
}

/** "Class 14: Economics" and a long title are too much for a one-line chip. */
function shortLabel(label: string): string {
  const withoutIndex = label.replace(/^\s*Class\s*\d+\s*:\s*/i, "");
  const [head] = withoutIndex.split(" - ");
  return (head || withoutIndex).trim().slice(0, 40) || "This class";
}

interface DragCard {
  id: string;
  node: HTMLElement;
  height: number;
}

interface DragState {
  courseId: string;
  pointerId: number;
  handle: HTMLElement;
  /** Document-space, not viewport-space: the page moves under a long drag. */
  startPageY: number;
  lastClientY: number;
  fromIndex: number;
  toIndex: number;
  cards: DragCard[];
  autoScrollFrame: number | null;
}

/** What the student just asked for, so the result can be explained back. */
interface MoveIntent {
  courseId: string;
  fromIndex: number;
  targetIndex: number;
}

const IDLE_STATUS: QueueProgress = { kind: "idle", message: "", completed: 0, total: 0 };

export class MyUclaPlannerController {
  private readonly repository = new AnnotationRepository();
  private readonly fastCoordinator: FastReorderCoordinator;
  private annotations: Record<string, CourseAnnotation> = {};
  private observer: MutationObserver | null = null;
  private reconcileQueued = false;
  private contractHealthy = false;
  private courses: CourseSnapshot[] = [];
  private insights = new Map<string, CourseInsight>();
  private searchQuery = "";
  private saving = false;
  private drag: DragState | null = null;
  private settleTimer: number | null = null;
  private jumpTimer: number | null = null;
  /** Set only when the one useful next step is reloading the page. */
  private offerReload = false;
  /**
   * Off by default. Restyling MyUCLA's own list is opt-in: a page students
   * already know beats a tidier page they have to relearn mid-enrollment.
   */
  private tidyLayout = false;
  private stopLayoutWatch: (() => void) | null = null;
  private jumpTarget: { courseId: string; fromIndex: number } | null = null;
  private readonly collapsedCourses = new Set<string>();
  private readonly openTagEditors = new Set<string>();
  /** The order MyUCLA has. Non-null only while local edits are unsaved. */
  private savedOrder: string[] | null = null;
  /** The arrangement the student has built but not saved yet. */
  private desiredOrder: string[] | null = null;
  /** Courses the student moved by hand, so the count matches what they did. */
  private readonly movedByUser = new Set<string>();
  private restorableDraft: { savedOrder: string[]; desiredOrder: string[]; moved: string[] } | null =
    null;
  private lastRoot: HTMLElement | null = null;
  private lastCourseCount = -1;
  private viewStateSeen = false;
  private sessionCountdown: SessionCountdown | null = null;
  private stopSessionWatch: (() => void) | null = null;
  private status: QueueProgress = IDLE_STATUS;

  constructor(private readonly adapter: MyUclaPlannerAdapter) {
    this.fastCoordinator = new FastReorderCoordinator(adapter, (progress) => {
      this.status = progress;
      this.renderStatus();
    });
  }

  async start(): Promise<void> {
    const contract = this.adapter.inspectContract();
    if (!contract.ok) return;

    const contextKey = this.adapter.getContextKey();
    this.annotations = await this.repository.getContext(contextKey);
    const view = await readViewState(contextKey);
    this.viewStateSeen = view.seen;
    this.tidyLayout = (await readLayoutSettings()).tidy;
    this.stopLayoutWatch = watchLayoutSettings(({ tidy }) => this.setTidyLayout(tidy));
    view.collapsed.forEach((id) => this.collapsedCourses.add(id));
    this.attachEvents();
    this.observer = new MutationObserver((records) => {
      if (!this.isExtensionOnlyMutation(records)) this.scheduleReconcile();
    });
    // The plan lives inside the `ctl00_main_wrapper` UpdatePanel, whose contents
    // are replaced wholesale on every partial postback (a colour change, an
    // official ordering click, anything). Observing the table itself means the
    // observer dies with it, so watch a node that outlives the panel instead.
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.stopSessionWatch = watchSessionCountdown((countdown) => {
      this.sessionCountdown = countdown;
      this.renderSaveState();
    });
    this.reconcile();
    this.restoreAfterSync();
    await this.loadDraft(contextKey);
    releaseBootHold();
  }

  dispose(): void {
    this.cancelDrag();
    this.restoreLabels();
    this.savedOrder = null;
    this.desiredOrder = null;
    this.movedByUser.clear();
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    this.fastCoordinator.cancel();
    this.observer?.disconnect();
    this.stopSessionWatch?.();
    this.stopSessionWatch = null;
    this.stopLayoutWatch?.();
    this.stopLayoutWatch = null;
    this.detachEvents();
    this.hideJumpChip();
    restoreWeekGrid(document);
    restoreHeadline(document);
    unmarkHeaderRows(document);
    document.documentElement.classList.remove("pl-has-actionbar");
    document.querySelectorAll(`[${OWNED_ATTRIBUTE}]`).forEach((node) => node.remove());
    document
      .querySelectorAll<HTMLElement>(".pl-host-bar")
      .forEach((node) => node.classList.remove("pl-host-bar"));
    this.adapter.getRoot()?.classList.remove("pl-plan-root", "pl-dragging", "pl-syncing");
    document.querySelectorAll<HTMLElement>("tbody.courseItem").forEach((node) => {
      node.classList.remove(
        "pl-drag-active",
        "pl-drag-shifted",
        "pl-filtered-out",
        "pl-course-collapsed",
        "pl-just-moved",
        "pl-lead-card"
      );
      node.style.transform = "";
      node.style.transition = "";
    });
  }

  private attachEvents(): void {
    document.addEventListener("click", this.onClick);
    document.addEventListener("input", this.onInput);
    document.addEventListener("change", this.onChange);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("pointerdown", this.onPointerDown);
    document.addEventListener("pointermove", this.onPointerMove);
    document.addEventListener("pointerup", this.onPointerUp);
    document.addEventListener("pointercancel", this.onPointerUp);
  }

  private detachEvents(): void {
    document.removeEventListener("click", this.onClick);
    document.removeEventListener("input", this.onInput);
    document.removeEventListener("change", this.onChange);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("pointerdown", this.onPointerDown);
    document.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerup", this.onPointerUp);
    document.removeEventListener("pointercancel", this.onPointerUp);
  }

  /** Flipping the switch must restore MyUCLA's markup immediately, not on the
   *  next reload. */
  private setTidyLayout(tidy: boolean): void {
    if (this.tidyLayout === tidy) return;
    this.tidyLayout = tidy;
    if (!tidy) {
      restoreWeekGrid(document);
      restoreHeadline(document);
      unmarkHeaderRows(document);
    }
    this.reconcile();
  }

  private scheduleReconcile(): void {
    if (this.reconcileQueued || this.drag) return;
    this.reconcileQueued = true;
    window.requestAnimationFrame(() => {
      this.reconcileQueued = false;
      if (this.needsReconcile()) this.reconcile();
    });
  }

  /**
   * Watching `document.body` means unrelated MyUCLA activity also wakes us, so
   * bail out cheaply unless the plan was actually re-rendered.
   */
  private needsReconcile(): boolean {
    const root = this.adapter.getRoot();
    if (!root) return false;
    if (root !== this.lastRoot) return true;
    if (!document.getElementById(TOOLBAR_ID)) return true;
    const cards = root.querySelectorAll(":scope > tbody.courseItem").length;
    if (cards !== this.lastCourseCount) return true;
    // MyUCLA re-renders the weekly grid on its own toggles, which does not
    // touch the plan table but does undo our line wrapping.
    if (
      this.tidyLayout &&
      document.querySelector("#gridDiv .planneritembox:not([data-pl-grid])")
    ) {
      return true;
    }
    return (
      root.querySelectorAll(`[${OWNED_ATTRIBUTE}][data-pl-real-tools]`).length !== cards
    );
  }

  private isExtensionOnlyMutation(records: MutationRecord[]): boolean {
    return records.length > 0 && records.every((record) => {
      if (record.target instanceof Element && record.target.closest(`[${OWNED_ATTRIBUTE}]`)) {
        return true;
      }
      const changed = [...record.addedNodes, ...record.removedNodes];
      return changed.length > 0 && changed.every((node) => {
        return (
          node instanceof Element &&
          (node.matches(`[${OWNED_ATTRIBUTE}]`) || Boolean(node.closest(`[${OWNED_ATTRIBUTE}]`)))
        );
      });
    });
  }

  private reconcile(): void {
    const contract = this.adapter.inspectContract();
    if (!contract.ok) {
      this.contractHealthy = false;
      this.status = {
        kind: "error",
        message: contract.reason || "MyUCLA's page layout changed, so reordering stopped.",
        completed: 0,
        total: 0
      };
      this.renderStatus();
      return;
    }

    this.contractHealthy = true;
    this.courses = contract.courses;
    this.lastRoot = this.adapter.getRoot();
    this.lastCourseCount = contract.courses.length;
    this.applyFirstRunView(contract.courses);
    // After a postback the contract lists courses in MyUCLA's order; the student
    // may be looking at an unsaved arrangement, and the card tools have to be
    // numbered against what is actually on screen.
    const effectiveOrder = this.reconcileUnsavedOrder(
      contract.courses.map(({ id }) => id)
    );
    const termYear = this.adapter.getTermYear();
    this.insights = new Map(
      contract.courses.map((course) => [course.id, inspectCourse(course, termYear)])
    );
    const root = this.adapter.getRoot();
    root?.classList.add("pl-plan-root");
    root?.classList.toggle("pl-syncing", this.saving);
    if (!this.drag) this.clearDragArtifacts();
    this.ensureToolbar();
    this.ensureActionBar();
    if (this.tidyLayout) {
      if (root) markHeaderRows(root);
      // The weekly grid is MyUCLA's, lives outside the plan table, and is
      // re-rendered by its own toggles, so it is re-checked on every pass.
      tidyWeekGrid(document);
    }
    const byId = new Map(contract.courses.map((course) => [course.id, course]));
    effectiveOrder.forEach((id, index) => {
      const course = byId.get(id);
      if (!course) return;
      this.ensureCardTools(course, index, effectiveOrder.length);
      if (this.tidyLayout) applyHeadline(this.adapter.getLabelHost(course));
      this.applyAnnotation(course);
    });
    if (this.isDirty) this.renumberLabels(effectiveOrder);
    this.applyViewState();
  }

  // ---------------------------------------------------------------- toolbar

  /**
   * A partial postback re-renders the plan from the server, which silently wipes
   * an unsaved arrangement. Work out which happened and either put the student's
   * arrangement back or tell them it is gone — never quietly lose it.
   */
  private reconcileUnsavedOrder(serverOrder: readonly string[]): string[] {
    const baseline = this.savedOrder;
    const desired = this.desiredOrder;
    if (!baseline || !desired) return [...serverOrder];

    if (ordersMatch(serverOrder, desired)) return [...desired];

    if (this.saving) {
      // A postback during a save must not undo what the student is watching.
      this.applyOrderToDom(desired);
      return [...desired];
    }

    if (ordersMatch(serverOrder, baseline)) {
      // MyUCLA re-rendered without changing the order, so the arrangement is
      // still valid; put it back.
      this.applyOrderToDom(desired);
      return [...desired];
    }

    // The saved order itself moved under us. Adopt what MyUCLA now has.
    this.clearDirtyState();
    this.restoreLabels();
    this.setStatus(
      "warning",
      "MyUCLA reloaded the plan in a different order, so your unsaved changes were dropped."
    );
    return [...serverOrder];
  }

  private applyFirstRunView(courses: readonly CourseSnapshot[]): void {
    if (this.viewStateSeen || courses.length < BIG_PLAN_COURSES) return;
    this.viewStateSeen = true;
    courses.forEach((course) => this.collapsedCourses.add(course.id));
    this.persistViewState();
  }

  /**
   * MyUCLA gives every section a blue title bar and already parks that
   * section's actions on the right of it — "Find a Class and Enroll" sits there
   * on the search section. Riding in the "Class Plan" bar is therefore the one
   * placement that reads as part of the page rather than as a strip bolted on
   * above the list. If that bar ever disappears, fall back to our own row.
   */
  private ensureToolbar(): void {
    if (document.getElementById(TOOLBAR_ID)) return;
    const root = this.adapter.getRoot();
    if (!root?.parentElement) return;

    const bar = document.createElement("div");
    bar.id = TOOLBAR_ID;
    bar.className = "pl-bar";
    bar.setAttribute(OWNED_ATTRIBUTE, "true");
    bar.setAttribute("aria-label", "Plan tools");

    const main = document.createElement("div");
    main.className = "pl-bar-main";

    const search = document.createElement("input");
    search.type = "search";
    search.className = "pl-search";
    search.placeholder = "Filter classes";
    search.setAttribute("aria-label", "Filter the classes in this plan");
    search.dataset.plSearch = "true";
    // The toolbar is rebuilt after every partial postback; keep the filter.
    search.value = this.searchQuery;

    const count = document.createElement("span");
    count.className = "pl-count";
    count.dataset.plCount = "true";
    count.hidden = true;

    const collapseButton = this.createActionButton("toggle-all", "Collapse all");
    collapseButton.className = "pl-ghost";
    collapseButton.title = "Show or hide the section details on every class";

    const menuWrap = document.createElement("div");
    menuWrap.className = "pl-menu-wrap";
    const menuButton = this.createActionButton("menu", "");
    menuButton.className = "pl-icon";
    menuButton.title = "More";
    menuButton.setAttribute("aria-label", "More");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.append(makeIcon(ICONS.more));
    const menu = document.createElement("div");
    menu.className = "pl-menu";
    menu.dataset.plMenu = "true";
    menu.hidden = true;
    const note = document.createElement("p");
    note.className = "pl-menu-note";
    note.textContent =
      "Rearranging only changes this page. Save uses MyUCLA's own arrows to write the new order back, then reloads once.";
    const limitLink = document.createElement("a");
    limitLink.className = "pl-menu-item pl-menu-link";
    limitLink.href = UNIT_LIMIT_URL;
    limitLink.target = "_blank";
    limitLink.rel = "noopener noreferrer";
    limitLink.textContent = "Enrollment passes and unit limits";
    const finalsButton = this.createActionButton("finals", "Final exam week");
    finalsButton.className = "pl-menu-item pl-menu-quiet";
    finalsButton.title = "Every final exam in this plan, drawn as one week";
    const clearButton = this.createActionButton("clear-all-annotations", "Delete all my notes");
    clearButton.className = "pl-menu-item";
    menu.append(note, finalsButton, limitLink, clearButton);
    menuWrap.append(menuButton, menu);

    main.append(search, count, collapseButton, menuWrap);
    bar.append(main);

    const sectionTitle = document.querySelector<HTMLElement>(SECTION_TITLE_SELECTOR);
    if (sectionTitle) {
      sectionTitle.classList.add("pl-host-bar");
      bar.classList.add("pl-in-section");
      sectionTitle.append(bar);
    } else {
      root.parentElement.insertBefore(bar, root);
    }
    this.ensureActionBar();
  }

  /**
   * Unsaved changes have to stay reachable. A student rearranging class 14 of
   * 17 is a full screen below the section header, so the one pending action
   * follows them instead of waiting at the top of a five-thousand-pixel page.
   */
  private ensureActionBar(): void {
    if (document.getElementById(ACTIONBAR_ID)) return;

    const host = document.createElement("div");
    host.id = ACTIONBAR_ID;
    host.className = "pl-actionbar";
    host.setAttribute(OWNED_ATTRIBUTE, "true");
    host.hidden = true;

    const draft = document.createElement("div");
    draft.className = "pl-dirty pl-draft";
    draft.dataset.plDraft = "true";
    draft.hidden = true;
    const draftText = document.createElement("span");
    draftText.className = "pl-dirty-text";
    draftText.textContent = "You have an unsaved order from earlier";
    const dropDraft = this.createActionButton("drop-draft", "Discard");
    dropDraft.className = "pl-ghost";
    const restore = this.createActionButton("restore-draft", "Put it back");
    restore.className = "pl-solid";
    draft.append(draftText, dropDraft, restore);

    const dirty = document.createElement("div");
    dirty.className = "pl-dirty";
    dirty.dataset.plDirty = "true";
    dirty.hidden = true;
    const dirtyText = document.createElement("span");
    dirtyText.className = "pl-dirty-text";
    dirtyText.dataset.plDirtyText = "true";
    const discard = this.createActionButton("discard", "Undo all");
    discard.className = "pl-ghost";
    const save = this.createActionButton("save", "Save to MyUCLA");
    save.className = "pl-solid";
    dirty.append(dirtyText, discard, save);

    const feed = document.createElement("div");
    feed.className = "pl-feed";
    feed.dataset.plFeed = "true";
    feed.hidden = true;
    const status = document.createElement("span");
    status.className = "pl-status";
    status.dataset.plStatus = "true";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const stopButton = this.createActionButton("cancel", "Stop");
    stopButton.className = "pl-ghost pl-stop";
    // When a save cannot start, the fix is always a reload. Telling the
    // student to do it and making them find the button is one step too many.
    const reloadButton = this.createActionButton("reload", "Reload page");
    reloadButton.className = "pl-solid pl-reload";
    reloadButton.hidden = true;
    feed.append(status, stopButton, reloadButton);

    host.append(draft, dirty, feed);
    document.body.append(host);
  }

  /** The bottom bar exists only while it has something to say. */
  private renderActionBar(): void {
    const host = document.getElementById(ACTIONBAR_ID);
    if (!host) return;
    const shown = [...host.children].some(
      (child) => child instanceof HTMLElement && !child.hidden
    );
    host.hidden = !shown;
    document.documentElement.classList.toggle("pl-has-actionbar", shown);
  }

  // ------------------------------------------------------------ card module

  private ensureCardTools(course: CourseSnapshot, index: number, total: number): void {
    const { id: courseId, label: courseLabel } = course;
    const host = this.adapter.getToolsHost(course);
    let tools = host.querySelector<HTMLElement>(
      `:scope > [${OWNED_ATTRIBUTE}][data-pl-real-tools]`
    );

    if (!tools) {
      tools = document.createElement("div");
      tools.className = "pl-card-tools pl-real-tools";
      tools.setAttribute(OWNED_ATTRIBUTE, "true");
      tools.dataset.plRealTools = "true";

      const rail = document.createElement("div");
      rail.className = "pl-rail";

      const dragHandle = this.createActionButton("drag", "");
      dragHandle.className = "pl-grip";
      dragHandle.append(makeIcon(ICONS.grip));
      dragHandle.setAttribute("aria-label", `Drag ${courseLabel} to reorder`);

      const topButton = this.createActionButton("top", "");
      topButton.className = "pl-icon";
      topButton.title = "Move to the top of the plan";
      topButton.setAttribute("aria-label", `Move ${courseLabel} to the top`);
      topButton.append(makeIcon(ICONS.top));

      const positionSelect = document.createElement("select");
      positionSelect.className = "pl-pos";
      positionSelect.dataset.plPosition = "true";
      positionSelect.setAttribute("aria-label", `Position of ${courseLabel} in the plan`);
      positionSelect.title = "Move this class to a position";

      const tagButton = this.createActionButton("tag", "");
      tagButton.className = "pl-icon";
      tagButton.title = "Add a private note (stays on this computer)";
      tagButton.setAttribute("aria-label", `Note for ${courseLabel}`);
      tagButton.append(makeIcon(ICONS.tag));

      const collapseButton = this.createActionButton("toggle-course", "");
      collapseButton.className = "pl-icon pl-chevron";
      collapseButton.title = "Hide the section details";
      collapseButton.setAttribute("aria-label", `Hide details for ${courseLabel}`);
      collapseButton.append(makeIcon(ICONS.chevron));

      rail.append(dragHandle, topButton, positionSelect, tagButton, collapseButton);

      const tagEditor = document.createElement("div");
      tagEditor.className = "pl-tag-editor";
      tagEditor.dataset.plTagEditor = "true";
      tagEditor.hidden = true;
      const tagInput = document.createElement("input");
      tagInput.type = "text";
      tagInput.maxLength = 24;
      tagInput.placeholder = "e.g. required, backup, ask advisor";
      tagInput.dataset.plTag = "true";
      tagInput.setAttribute("aria-label", `Note for ${courseLabel}`);
      tagEditor.append(tagInput);

      tools.append(rail, tagEditor);
      host.append(tools);
    }

    tools.dataset.courseId = courseId;
    const positionSelect = tools.querySelector<HTMLSelectElement>("[data-pl-position]");
    // A bare number reads as a label rather than a control. The group heading
    // says the verb once, the closed control still shows just "#4", and the
    // stylesheet adds a caret so it looks like something you can open.
    if (positionSelect && positionSelect.options.length !== total) {
      positionSelect.replaceChildren();
      const group = document.createElement("optgroup");
      group.label = "Move to position";
      for (let position = 1; position <= total; position += 1) {
        const option = document.createElement("option");
        option.value = String(position - 1);
        option.textContent = `#${position}`;
        group.append(option);
      }
      positionSelect.append(group);
    }
    if (positionSelect && document.activeElement !== positionSelect) {
      positionSelect.value = String(index);
    }
  }

  private applyAnnotation(course: CourseSnapshot): void {
    const courseId = course.id;
    const annotation = this.annotations[courseId] || { color: "none", tag: "" };
    const tools = this.findTools(courseId);
    const input = tools?.querySelector<HTMLInputElement>("[data-pl-tag]");
    if (input && document.activeElement !== input) input.value = annotation.tag;

    const labelHost = this.adapter.getLabelHost(course);
    let badge = labelHost.querySelector<HTMLElement>(":scope > [data-pl-tag-badge]");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "pl-tag-badge";
      badge.dataset.plTagBadge = "true";
      badge.setAttribute(OWNED_ATTRIBUTE, "true");
      labelHost.append(badge);
    }
    if (badge.textContent !== annotation.tag) badge.textContent = annotation.tag;
  }

  /**
   * Collapsing a card is only worth doing if it does not cost the one fact the
   * student came for, so the seat status rides along on the title line.
   */
  private applyStatusBadge(course: CourseSnapshot, insight: CourseInsight): void {
    const labelHost = this.adapter.getLabelHost(course);
    let badge = labelHost.querySelector<HTMLElement>(":scope > [data-pl-status-badge]");
    const summary = summarizeStatus(insight);
    if (!summary) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "pl-status-badge";
      badge.dataset.plStatusBadge = "true";
      badge.setAttribute(OWNED_ATTRIBUTE, "true");
      labelHost.append(badge);
    }
    if (badge.textContent !== summary.label) badge.textContent = summary.label;
    badge.dataset.tone = summary.tone;
  }

  /**
   * MyUCLA hides "what does this clash with" one click deep, per course. With a
   * seventeen-course plan that is seventeen clicks to answer one question, so
   * put its own answer on the card. Codes only — which of them to give up is the
   * student's call, not ours.
   */
  private applyConflictBadge(course: CourseSnapshot, insight: CourseInsight): void {
    const labelHost = this.adapter.getLabelHost(course);
    let badge = labelHost.querySelector<HTMLElement>(":scope > [data-pl-conflict-badge]");
    const codes = conflictCodes(insight);
    if (codes.length === 0) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "pl-conflict-badge";
      badge.dataset.plConflictBadge = "true";
      badge.setAttribute(OWNED_ATTRIBUTE, "true");
      labelHost.append(badge);
    }
    const shown = codes.slice(0, 2).join(", ");
    const text =
      codes.length > 2
        ? `Clashes with ${shown} +${codes.length - 2}`
        : `Clashes with ${shown}`;
    if (badge.textContent !== text) badge.textContent = text;

    const detail: string[] = [];
    if (insight.conflicts.time.length > 0) {
      detail.push(`Same meeting time as ${insight.conflicts.time.join(", ")}`);
    }
    if (insight.conflicts.exam.length > 0) {
      detail.push(`Same final exam slot as ${insight.conflicts.exam.join(", ")}`);
    }
    badge.title = detail.join("\n");
  }

  private findTools(courseId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `[${OWNED_ATTRIBUTE}][data-pl-real-tools][data-course-id="${courseId}"]`
    );
  }

  private orderedNodes(): Map<string, HTMLElement> {
    return new Map(this.courses.map((course) => [course.id, course.node]));
  }

  // -------------------------------------------------------------- view state

  private applyViewState(): void {
    let visibleCount = 0;

    this.courses.forEach((course) => {
      const insight = this.insights.get(course.id) || inspectCourse(course, this.adapter.getTermYear());
      const annotation = this.annotations[course.id] || { color: "none", tag: "" };
      const visible = matchesCourse(
        insight,
        course.label,
        annotation.tag,
        this.searchQuery,
        "all"
      );
      if (visible) visibleCount += 1;
      const collapsed = this.collapsedCourses.has(course.id);
      course.node.classList.toggle("pl-filtered-out", !visible);
      course.node.classList.toggle("pl-course-collapsed", collapsed);
      this.applyStatusBadge(course, insight);
      this.applyConflictBadge(course, insight);

      const tools = this.findTools(course.id);
      const collapse = tools?.querySelector<HTMLButtonElement>(
        '[data-pl-action="toggle-course"]'
      );
      if (collapse) {
        // Points down to expand, up to collapse.
        collapse.classList.toggle("pl-flipped", !collapsed);
        collapse.title = collapsed ? "Show the section details" : "Hide the section details";
        collapse.setAttribute("aria-expanded", String(!collapsed));
      }
      const editor = tools?.querySelector<HTMLElement>("[data-pl-tag-editor]");
      if (editor) editor.hidden = !this.openTagEditors.has(course.id);
      const tagButton = tools?.querySelector<HTMLButtonElement>('[data-pl-action="tag"]');
      if (tagButton) {
        tagButton.classList.toggle("pl-on", annotation.tag.trim().length > 0);
        tagButton.setAttribute("aria-expanded", String(this.openTagEditors.has(course.id)));
      }
    });

    this.markLeadingCard();
    // Enrolled units are not summarised here on purpose: MyUCLA's own
    // "Enrollment Appts" panel on this page already shows Units Max and Units
    // Left, which is the pair that actually governs a study list.
    this.renderFilterCount(visibleCount, this.courses.length);

    const toggleAll = document.querySelector<HTMLButtonElement>(
      '[data-pl-action="toggle-all"]'
    );
    if (toggleAll) {
      const allCollapsed =
        this.courses.length > 0 &&
        this.courses.every((course) => this.collapsedCourses.has(course.id));
      toggleAll.textContent = allCollapsed ? "Expand all" : "Collapse all";
    }
    this.renderStatus();
  }

  /**
   * Nine column labels do not need printing sixteen times. The first class the
   * student can actually see keeps its header; the rest hide theirs, and the
   * stylesheet quiets the one that stays.
   */
  private markLeadingCard(): void {
    let claimed = false;
    this.courses.forEach((course) => {
      const node = course.node;
      const eligible =
        !claimed &&
        !node.classList.contains("pl-filtered-out") &&
        !node.classList.contains("pl-course-collapsed");
      node.classList.toggle("pl-lead-card", eligible);
      if (eligible) claimed = true;
    });
  }

  /**
   * The only count worth a permanent slot is the one that explains why classes
   * are missing from the list. Everything else was noise in the header.
   */
  private renderFilterCount(visible: number, total: number): void {
    const host = document.querySelector<HTMLElement>("[data-pl-count]");
    if (!host) return;
    const filtering = this.searchQuery.trim().length > 0;
    host.hidden = !filtering;
    const text = visible === 0 ? "no matches" : `${visible} of ${total}`;
    if (host.textContent !== text) host.textContent = text;
    host.classList.toggle("pl-no-match", visible === 0);
  }

  private persistViewState(): void {
    if (!this.contractHealthy) return;
    void saveViewState(this.adapter.getContextKey(), {
      collapsed: [...this.collapsedCourses],
      seen: true
    }).catch(() => undefined);
  }

  private createActionButton(action: string, label: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.plAction = action;
    if (label) button.textContent = label;
    return button;
  }

  private renderStatus(): void {
    const feed = document.querySelector<HTMLElement>("[data-pl-feed]");
    const status = document.querySelector<HTMLElement>("[data-pl-status]");
    if (feed) feed.hidden = this.status.kind === "idle";
    if (status) {
      if (status.textContent !== this.status.message) status.textContent = this.status.message;
      status.dataset.kind = this.status.kind;
    }

    const busy = this.saving || this.fastCoordinator.isRunning;
    const cancel = document.querySelector<HTMLButtonElement>('[data-pl-action="cancel"]');
    if (cancel) cancel.hidden = !busy;
    const reload = document.querySelector<HTMLButtonElement>('[data-pl-action="reload"]');
    if (reload) reload.hidden = !this.offerReload || busy;

    const blocked = busy || !this.contractHealthy;
    const filtered = this.searchQuery.trim().length > 0;
    document
      .querySelectorAll<HTMLButtonElement>('[data-pl-action="top"]')
      .forEach((button) => {
        button.disabled = blocked;
      });
    document
      .querySelectorAll<HTMLSelectElement>("[data-pl-position]")
      .forEach((select) => {
        select.disabled = blocked;
      });
    document
      .querySelectorAll<HTMLButtonElement>('[data-pl-action="drag"]')
      .forEach((button) => {
        const dragDisabled = blocked || filtered;
        button.disabled = dragDisabled;
        button.title = filtered
          ? "Clear the filter before dragging"
          : "Drag to reorder, or Alt + \u2191 / \u2193";
      });
    document.getElementById(TOOLBAR_ID)?.setAttribute("aria-busy", String(busy));
    this.renderSaveState();
    this.renderDraftOffer();
    this.renderActionBar();
    this.renderTopbar();
  }

  // ----------------------------------------------------- batched rearranging

  private get isDirty(): boolean {
    return this.savedOrder !== null;
  }

  private currentOrder(): string[] {
    return this.adapter.getOrder();
  }

  private pendingSteps(): number {
    if (!this.savedOrder || !this.desiredOrder) return 0;
    try {
      return countStepsToOrder(this.savedOrder, this.desiredOrder);
    } catch {
      return 0;
    }
  }

  private renderSaveState(): void {
    const host = document.querySelector<HTMLElement>("[data-pl-dirty]");
    const text = document.querySelector<HTMLElement>("[data-pl-dirty-text]");
    if (!host || !text) return;

    const steps = this.pendingSteps();
    if (!this.isDirty || steps === 0 || this.saving) {
      host.hidden = true;
      return;
    }

    host.hidden = false;

    const moved = this.movedCourseCount();
    const parts = [
      moved === 1 ? "1 class moved" : `${moved} classes moved`,
      describeDuration(steps)
    ];
    // MyUCLA's own dialogs already handle ordinary session timeouts. The only
    // thing worth saying here is that unsaved work is about to be at risk.
    const minutes = this.sessionCountdown
      ? remainingMinutes(this.sessionCountdown)
      : null;
    if (minutes !== null && minutes <= SESSION_WARN_MINUTES) {
      parts.push(`signed out in ${minutes} min`);
    }
    const label = parts.join(" \u00b7 ");
    if (text.textContent !== label) text.textContent = label;
    text.classList.toggle(
      "pl-urgent",
      minutes !== null && minutes <= SESSION_WARN_MINUTES
    );
  }

  /**
   * Moving one course shifts its neighbours too, but the student only did one
   * thing. Count what they touched, not every index that changed underneath.
   */
  private movedCourseCount(): number {
    const baseline = this.savedOrder;
    if (!baseline) return 0;
    const current = this.desiredOrder ?? this.currentOrder();
    let moved = 0;
    for (const id of this.movedByUser) {
      if (current.indexOf(id) !== baseline.indexOf(id)) moved += 1;
    }
    return moved || 1;
  }

  /**
   * Rearranging is local and free. Nothing reaches MyUCLA until the student
   * saves, so they can try three or four arrangements without paying for each.
   */
  private applyLocalMove(courseId: string, targetIndex: number): void {
    try {
      if (!this.contractHealthy || this.saving) return;
      const current = this.currentOrder();
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= current.length) {
        throw new Error("That position isn't valid.");
      }
      const fromIndex = current.indexOf(courseId);
      const next = moveWithinOrder(current, courseId, targetIndex);
      if (ordersMatch(next, current)) return;

      if (!this.isDirty) {
        this.savedOrder = [...current];
        window.addEventListener("beforeunload", this.onBeforeUnload);
      }
      this.movedByUser.add(courseId);
      this.desiredOrder = [...next];
      this.animateToOrder(next, { courseId, fromIndex, targetIndex });
      this.persistDraft();
      this.setStatus("idle", "");
    } catch (error) {
      this.setStatus("error", error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  private discardChanges(): void {
    const baseline = this.savedOrder;
    this.clearDirtyState();
    if (baseline) this.animateToOrder(baseline);
    this.restoreLabels();
    this.reconcile();
    this.setStatus("idle", "");
  }

  private persistDraft(): void {
    const savedOrder = this.savedOrder;
    const desiredOrder = this.desiredOrder;
    if (!savedOrder || !desiredOrder || !this.contractHealthy) return;
    void saveDraft(this.adapter.getContextKey(), {
      savedOrder: [...savedOrder],
      desiredOrder: [...desiredOrder],
      moved: [...this.movedByUser]
    }).catch(() => undefined);
  }

  private forgetDraft(): void {
    this.restorableDraft = null;
    if (!this.contractHealthy) return;
    void clearDraft(this.adapter.getContextKey()).catch(() => undefined);
  }

  /**
   * A timeout, a stray navigation, or a re-login should not cost the student the
   * arrangement they built. Offer it back, but only while MyUCLA's own order is
   * still the one the draft was built on.
   */
  private async loadDraft(contextKey: string): Promise<void> {
    if (this.isDirty || !this.contractHealthy) return;
    const draft = await readDraft(contextKey);
    if (!draft) return;
    if (!ordersMatch(draft.savedOrder, this.currentOrder())) {
      await clearDraft(contextKey).catch(() => undefined);
      return;
    }
    if (ordersMatch(draft.savedOrder, draft.desiredOrder)) return;
    this.restorableDraft = draft;
    this.renderDraftOffer();
  }

  private restoreDraft(): void {
    const draft = this.restorableDraft;
    this.restorableDraft = null;
    if (!draft || !ordersMatch(draft.savedOrder, this.currentOrder())) {
      this.renderDraftOffer();
      return;
    }
    this.savedOrder = [...draft.savedOrder];
    this.desiredOrder = [...draft.desiredOrder];
    draft.moved.forEach((id) => this.movedByUser.add(id));
    window.addEventListener("beforeunload", this.onBeforeUnload);
    this.animateToOrder(draft.desiredOrder);
    this.renderDraftOffer();
    this.setStatus("idle", "");
  }

  private renderDraftOffer(): void {
    const host = document.querySelector<HTMLElement>("[data-pl-draft]");
    if (host) host.hidden = this.restorableDraft === null;
  }

  private clearDirtyState(): void {
    this.forgetDraft();
    this.savedOrder = null;
    this.desiredOrder = null;
    this.movedByUser.clear();
    window.removeEventListener("beforeunload", this.onBeforeUnload);
  }

  private onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.isDirty || this.saving) return;
    event.preventDefault();
    event.returnValue = "";
  };

  /**
   * The save click is the authorisation: the button states how many changes and
   * roughly how long, and nothing is written to MyUCLA before it.
   */
  private async saveChanges(): Promise<void> {
    if (!this.isDirty || this.saving) return;
    const baseline = this.savedOrder!;
    const target = this.desiredOrder ?? this.currentOrder();
    if (ordersMatch(baseline, target)) {
      this.discardChanges();
      return;
    }

    // Keep the arrangement — and MyUCLA's renumbered "Class N:" labels — exactly
    // as the student left them for the whole save. Reverting them mid-save made
    // the list disagree with itself. The beforeunload guard goes now because the
    // reload at the end is ours and deliberate.
    this.saving = true;
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    this.adapter.getRoot()?.classList.add("pl-syncing");
    this.setStatus("running", "Saving to MyUCLA\u2026");

    const result = await this.fastCoordinator.applyOrder(target, baseline);
    this.saving = false;

    if (result.status !== "unavailable") {
      // Whatever happened, MyUCLA is now the authority; the reload adopts it and
      // discards our local bookkeeping along with the page.
      this.clearDirtyState();
    }
    if (result.status === "done") {
      this.setStatus("success", "Saved");
      this.reloadSoon("Your new order is saved in MyUCLA.");
      return;
    }
    if (result.status === "cancelled") {
      this.setStatus("warning", "Stopped. The moves that already went through are saved.");
      this.reloadSoon("Saving stopped.");
      return;
    }
    if (result.status === "failed") {
      this.setStatus("error", result.reason);
      this.reloadSoon("Saving stopped. Reloading MyUCLA's current order.");
      return;
    }

    // Nothing was written, so the student keeps the arrangement they built.
    window.addEventListener("beforeunload", this.onBeforeUnload);
    this.adapter.getRoot()?.classList.remove("pl-syncing");
    this.setStatus("error", result.reason, true);
  }

  private reloadSoon(flash: string): void {
    try {
      window.sessionStorage.setItem(
        RESUME_KEY,
        JSON.stringify({ scrollY: Math.round(window.scrollY), flash: flash.slice(0, 120) })
      );
    } catch {
      // Restoring scroll is a nicety; never block the reload on storage.
    }
    window.setTimeout(() => window.location.reload(), 320);
  }

  private restoreAfterSync(): void {
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(RESUME_KEY);
      window.sessionStorage.removeItem(RESUME_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { scrollY?: unknown; flash?: unknown };
      if (typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)) {
        window.requestAnimationFrame(() => window.scrollTo(0, Number(parsed.scrollY)));
      }
      if (typeof parsed.flash === "string" && parsed.flash) {
        this.setStatus("success", parsed.flash);
        window.setTimeout(() => {
          if (this.status.kind === "success") this.setStatus("idle", "");
        }, 5_000);
      }
    } catch {
      // Ignore malformed session state.
    }
  }

  private setStatus(
    kind: QueueProgress["kind"],
    message: string,
    offerReload = false
  ): void {
    this.offerReload = offerReload;
    this.status = {
      kind,
      message,
      completed: kind === "running" ? this.status.completed : 0,
      total: kind === "running" ? this.status.total : 0
    };
    this.renderStatus();
  }

  /**
   * Saving is plumbing. Show it the way a page shows its own loading: a hairline
   * at the top edge, no spinner and no step counter to supervise.
   */
  private renderTopbar(): void {
    const existing = document.getElementById(TOPBAR_ID);
    if (!this.saving) {
      existing?.remove();
      return;
    }

    let bar = existing;
    if (!bar) {
      bar = document.createElement("div");
      bar.id = TOPBAR_ID;
      bar.className = "pl-topbar";
      bar.setAttribute(OWNED_ATTRIBUTE, "true");
      bar.setAttribute("aria-hidden", "true");
      bar.style.width = "8%";
      document.body.append(bar);
    }

    const { completed, total } = this.status;
    // Never reach 100% until the reload actually lands.
    bar.style.width = `${total > 0 ? 8 + Math.round((completed / total) * 84) : 8}%`;
  }

  // ------------------------------------------------------------ FLIP motion

  /** Moves the official course nodes without any motion, then settles state. */
  private applyOrderToDom(order: readonly string[]): void {
    const root = this.adapter.getRoot();
    if (!root) return;
    const nodes = this.orderedNodes();
    for (const id of order) {
      const node = nodes.get(id);
      if (node) root.append(node);
    }
    this.syncPositionChips(order);
    if (this.isDirty) this.renumberLabels(order);
    else this.restoreLabels();
    // Our own structural writes must not look like a MyUCLA re-render.
    this.observer?.takeRecords();
    this.renderStatus();
  }

  /**
   * MyUCLA prints "Class N:" into each title. While an arrangement is unsaved
   * those numbers disagree with the list the student is looking at, so renumber
   * them and put the originals back on save, discard, or re-render.
   */
  private renumberLabels(order: readonly string[]): void {
    const byId = new Map(this.courses.map((course) => [course.id, course]));
    order.forEach((id, index) => {
      const course = byId.get(id);
      if (!course) return;
      const label = this.adapter
        .getLabelHost(course)
        .querySelector<HTMLElement>(":scope > p");
      if (!label) return;
      if (label.dataset.plOriginalLabel === undefined) {
        label.dataset.plOriginalLabel = label.textContent || "";
      }
      const original = label.dataset.plOriginalLabel;
      const renumbered = original.replace(/^(\s*Class\s*)\d+(\s*:)/i, `$1${index + 1}$2`);
      if (label.textContent !== renumbered) label.textContent = renumbered;
    });
  }

  private restoreLabels(): void {
    document
      .querySelectorAll<HTMLElement>("[data-pl-original-label]")
      .forEach((label) => {
        const original = label.dataset.plOriginalLabel;
        if (original !== undefined && label.textContent !== original) {
          label.textContent = original;
        }
        delete label.dataset.plOriginalLabel;
      });
    this.observer?.takeRecords();
  }

  /**
   * A course card is roughly a quarter of the viewport, so "move to #2" from
   * #13 sends it two thousand pixels away. Three rules keep that readable:
   *
   *  1. Never move the page. Whatever the student was reading stays put, which
   *     means compensating scroll for the rows that shifted above them.
   *  2. Animate the neighbours closing the gap, but do not drag the card itself
   *     across a distance nobody can follow.
   *  3. When it lands off screen, say where it went and offer a ride — instead
   *     of hijacking the scroll position to show them.
   */
  private animateToOrder(order: readonly string[], move?: MoveIntent): void {
    const root = this.adapter.getRoot();
    if (!root) return;
    const nodes = this.orderedNodes();

    const before = new Map<string, number>();
    nodes.forEach((node, id) => before.set(id, node.getBoundingClientRect().top));
    const anchorId = this.pickScrollAnchor(nodes, before, move?.courseId);

    this.applyOrderToDom(order);
    this.holdScroll(anchorId, nodes, before);

    const movedNode = move ? nodes.get(move.courseId) ?? null : null;
    const flip: Array<[HTMLElement, number]> = [];
    nodes.forEach((node, id) => {
      const delta = (before.get(id) ?? 0) - node.getBoundingClientRect().top;
      if (Math.abs(delta) <= 0.5) return;
      // Following the card itself across a full screen is a blur, not motion.
      if (node === movedNode && Math.abs(delta) > window.innerHeight) return;
      flip.push([node, delta]);
    });

    for (const [node, delta] of flip) {
      node.style.transition = "none";
      node.style.transform = `translateY(${delta}px)`;
    }
    void root.getBoundingClientRect();
    window.requestAnimationFrame(() => {
      for (const [node] of flip) {
        node.style.transition = "";
        node.style.transform = "";
      }
    });

    if (move) this.reportMove(move, movedNode);
  }

  /**
   * Keep the topmost card the student can actually see pinned where it is. The
   * moved card is a bad anchor — it is the one thing that is supposed to move.
   */
  private pickScrollAnchor(
    nodes: Map<string, HTMLElement>,
    before: Map<string, number>,
    movedId?: string
  ): string | null {
    let best: string | null = null;
    let bestTop = Number.POSITIVE_INFINITY;
    nodes.forEach((_node, id) => {
      if (id === movedId) return;
      const top = before.get(id);
      if (top === undefined || top < 0 || top > window.innerHeight) return;
      if (top < bestTop) {
        bestTop = top;
        best = id;
      }
    });
    return best;
  }

  private holdScroll(
    anchorId: string | null,
    nodes: Map<string, HTMLElement>,
    before: Map<string, number>
  ): void {
    if (!anchorId) return;
    const node = nodes.get(anchorId);
    const wanted = before.get(anchorId);
    if (!node || wanted === undefined) return;
    const drift = node.getBoundingClientRect().top - wanted;
    if (Math.abs(drift) > 0.5) window.scrollBy(0, drift);
  }

  /**
   * If the landing spot is on screen, a flash is enough. If it is not, the card
   * has silently vanished, and that is the whole complaint — so name where it
   * went, and let the student decide whether to follow it.
   */
  private reportMove(move: MoveIntent, node: HTMLElement | null): void {
    if (!node) return;
    // A filtered-out card has no box at all, so "off screen" cannot be read
    // from its position. Say it plainly instead of guessing a direction.
    if (node.getClientRects().length === 0) {
      this.hideJumpChip();
      this.setStatus("success", `Moved to #${move.targetIndex + 1}, hidden by the filter.`);
      return;
    }
    const rect = node.getBoundingClientRect();
    const above = rect.bottom < 8;
    const below = rect.top > window.innerHeight - 8;
    this.flashCard(node);
    if (!above && !below) {
      this.hideJumpChip();
      return;
    }
    const course = this.courses.find(({ id }) => id === move.courseId);
    this.showJumpChip({
      courseId: move.courseId,
      fromIndex: move.fromIndex,
      toIndex: move.targetIndex,
      direction: above ? "up" : "down",
      label: shortLabel(course?.label ?? "")
    });
  }

  private flashCard(node: HTMLElement): void {
    node.classList.remove("pl-just-moved");
    // Restart the animation even when the same card is moved twice in a row.
    void node.offsetWidth;
    node.classList.add("pl-just-moved");
    window.setTimeout(() => node.classList.remove("pl-just-moved"), 1400);
  }

  private showJumpChip(state: {
    courseId: string;
    fromIndex: number;
    toIndex: number;
    direction: "up" | "down";
    label: string;
  }): void {
    this.hideJumpChip();
    this.jumpTarget = { courseId: state.courseId, fromIndex: state.fromIndex };

    const chip = document.createElement("div");
    chip.id = JUMP_ID;
    chip.className = `pl-jump pl-jump-${state.direction}`;
    chip.setAttribute(OWNED_ATTRIBUTE, "true");
    chip.setAttribute("role", "status");

    const arrow = makeIcon(state.direction === "up" ? ICONS.up : ICONS.down);
    arrow.classList.add("pl-jump-arrow");

    const text = document.createElement("span");
    text.className = "pl-jump-text";
    text.textContent = `${state.label} → #${state.toIndex + 1}`;

    const show = this.createActionButton("jump-show", "Show me");
    show.className = "pl-jump-action";
    const undo = this.createActionButton("jump-undo", "Undo");
    undo.className = "pl-jump-action";

    chip.append(arrow, text, show, undo);
    this.jumpHost().append(chip);

    this.jumpTimer = window.setTimeout(() => this.hideJumpChip(), JUMP_CHIP_MS);
  }

  private jumpHost(): HTMLElement {
    return document.body;
  }

  private hideJumpChip(): void {
    if (this.jumpTimer !== null) {
      window.clearTimeout(this.jumpTimer);
      this.jumpTimer = null;
    }
    this.jumpTarget = null;
    document.getElementById(JUMP_ID)?.remove();
  }

  private jumpToMovedCourse(): void {
    const target = this.jumpTarget;
    this.hideJumpChip();
    if (!target) return;
    const node = this.orderedNodes().get(target.courseId);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    this.flashCard(node);
  }

  private undoLastMove(): void {
    const target = this.jumpTarget;
    this.hideJumpChip();
    if (!target) return;
    this.applyLocalMove(target.courseId, target.fromIndex);
  }

  private syncPositionChips(order: readonly string[]): void {
    order.forEach((id, index) => {
      const select = this.findTools(id)?.querySelector<HTMLSelectElement>(
        "[data-pl-position]"
      );
      if (select && document.activeElement !== select) select.value = String(index);
    });
  }

  // ------------------------------------------------------------------ drag

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const handle = event.target.closest<HTMLButtonElement>('[data-pl-action="drag"]');
    if (!handle || handle.disabled || this.drag) return;

    const tools = handle.closest<HTMLElement>(`[${OWNED_ATTRIBUTE}][data-course-id]`);
    const courseId = tools?.dataset.courseId;
    if (!courseId) return;

    const nodes = this.orderedNodes();
    const cards: DragCard[] = this.currentOrder().flatMap((id) => {
      const node = nodes.get(id);
      return node ? [{ id, node, height: node.getBoundingClientRect().height }] : [];
    });
    const fromIndex = cards.findIndex((card) => card.id === courseId);
    if (fromIndex === -1 || cards.some(({ height }) => height <= 0)) return;

    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    this.clearSettleTimer();
    this.drag = {
      courseId,
      pointerId: event.pointerId,
      handle,
      startPageY: event.pageY,
      lastClientY: event.clientY,
      fromIndex,
      toIndex: fromIndex,
      cards,
      autoScrollFrame: null
    };
    this.adapter.getRoot()?.classList.add("pl-dragging");
    cards[fromIndex].node.classList.add("pl-drag-active");
    this.startAutoScroll();
  };

  private onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    drag.lastClientY = event.clientY;
    this.updateDrag(event.pageY);
  };

  /**
   * A pointer cannot leave the window, so without this a plan taller than the
   * screen simply cannot be dragged from #15 to #1: the card reaches the top
   * edge and stops. Hold near an edge and the page comes to you, at a speed
   * that ramps up the closer you get.
   */
  private startAutoScroll(): void {
    const step = (): void => {
      const drag = this.drag;
      if (!drag) return;
      drag.autoScrollFrame = window.requestAnimationFrame(step);

      const height = window.innerHeight;
      let speed = 0;
      if (drag.lastClientY < DRAG_EDGE_PX) {
        const depth = (DRAG_EDGE_PX - drag.lastClientY) / DRAG_EDGE_PX;
        speed = -DRAG_SCROLL_MAX * depth * depth;
      } else if (drag.lastClientY > height - DRAG_EDGE_PX) {
        const depth = (drag.lastClientY - (height - DRAG_EDGE_PX)) / DRAG_EDGE_PX;
        speed = DRAG_SCROLL_MAX * depth * depth;
      }
      if (speed === 0) return;

      const before = window.scrollY;
      window.scrollBy(0, speed);
      if (window.scrollY === before) return;
      // The pointer has not moved, but the document under it has, so the drag
      // has to be recomputed from the new document-space position.
      this.updateDrag(drag.lastClientY + window.scrollY);
    };
    step();
  }

  private stopAutoScroll(drag: DragState): void {
    if (drag.autoScrollFrame !== null) {
      window.cancelAnimationFrame(drag.autoScrollFrame);
      drag.autoScrollFrame = null;
    }
  }

  private updateDrag(pageY: number): void {
    const drag = this.drag;
    if (!drag) return;

    const delta = pageY - drag.startPageY;
    const { cards, fromIndex } = drag;
    cards[fromIndex].node.style.transform = `translateY(${delta}px)`;

    let toIndex = fromIndex;
    if (delta > 0) {
      let travelled = 0;
      for (let index = fromIndex + 1; index < cards.length; index += 1) {
        travelled += cards[index].height;
        if (delta < travelled - cards[index].height / 2) break;
        toIndex = index;
      }
    } else if (delta < 0) {
      let travelled = 0;
      for (let index = fromIndex - 1; index >= 0; index -= 1) {
        travelled += cards[index].height;
        if (-delta < travelled - cards[index].height / 2) break;
        toIndex = index;
      }
    }

    drag.toIndex = toIndex;
    const shift = cards[fromIndex].height;
    cards.forEach((card, index) => {
      if (index === fromIndex) return;
      let offset = 0;
      if (index > fromIndex && index <= toIndex) offset = -shift;
      if (index < fromIndex && index >= toIndex) offset = shift;
      const next = offset === 0 ? "" : `translateY(${offset}px)`;
      if (card.node.style.transform !== next) card.node.style.transform = next;
      card.node.classList.toggle("pl-drag-shifted", offset !== 0);
    });
  };

  private onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.stopAutoScroll(drag);
    const { courseId, fromIndex, toIndex } = drag;
    drag.handle.releasePointerCapture?.(event.pointerId);
    this.cancelDrag();
    if (toIndex !== fromIndex) this.applyLocalMove(courseId, toIndex);
  };

  private cancelDrag(): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    this.stopAutoScroll(drag);
    const root = this.adapter.getRoot();
    drag.cards.forEach((card) => {
      card.node.style.transform = "";
      card.node.classList.remove("pl-drag-active", "pl-drag-shifted");
    });
    this.clearSettleTimer();
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = null;
      root?.classList.remove("pl-dragging");
    }, 220);
  }

  /** A postback mid-drag can strand the drag styling on a card. */
  private clearDragArtifacts(): void {
    document
      .querySelectorAll<HTMLElement>("tbody.courseItem.pl-drag-active, tbody.courseItem.pl-drag-shifted")
      .forEach((node) => {
        node.classList.remove("pl-drag-active", "pl-drag-shifted");
        node.style.transform = "";
      });
    this.adapter.getRoot()?.classList.remove("pl-dragging");
  }

  private clearSettleTimer(): void {
    if (this.settleTimer !== null) {
      window.clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
  }

  // ---------------------------------------------------------------- events

  private onInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-pl-search]")) {
      return;
    }
    this.searchQuery = target.value.slice(0, 120);
    this.applyViewState();
  };

  /**
   * Finals week on one week. Read-only, built from the `Final Exam:` line each
   * card already carries, and thrown away again on the next toggle. It is not a
   * second copy of MyUCLA's weekly grid: that one draws the ten teaching weeks,
   * and nothing on this page draws finals week at all.
   */
  private toggleFinalsWeek(): void {
    const open = document.querySelector<HTMLElement>("[data-pl-finals]");
    if (open) {
      open.remove();
      return;
    }

    const root = this.adapter.getRoot();
    if (!root || !root.parentElement) return;

    const entries: FinalsEntry[] = [];
    this.courses.forEach((course) => {
      const insight = this.insights.get(course.id) || inspectCourse(course, this.adapter.getTermYear());
      if (!insight.finalExam) return;
      // The code a student scans for, when the two paragraphs parse. The full
      // official label otherwise, rather than a guess at a shorter one.
      const headline = readHeadline(this.adapter.getLabelHost(course));
      entries.push({
        label: headline ? headline.code : course.label,
        exam: insight.finalExam,
        enrolled: insight.enrolled
      });
    });

    const panel = document.createElement("div");
    panel.className = "pl-finals-host";
    panel.dataset.plFinals = "true";

    const bar = document.createElement("div");
    bar.className = "pl-finals-bar";
    const title = document.createElement("h3");
    title.className = "pl-finals-title";
    title.textContent = "Final exam week";
    const close = this.createActionButton("close-finals", "Close");
    close.className = "pl-ghost";
    bar.append(title, close);

    panel.append(bar, buildFinalsWeek(entries));
    root.parentElement.insertBefore(panel, root);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  private onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("[data-pl-action]");
    if (!button) {
      this.closeMenu();
      return;
    }

    const action = button.dataset.plAction;
    if (action !== "menu") this.closeMenu();

    if (action === "cancel") {
      this.fastCoordinator.cancel();
      return;
    }
    if (action === "reload") {
      window.removeEventListener("beforeunload", this.onBeforeUnload);
      window.location.reload();
      return;
    }
    if (action === "save") {
      void this.saveChanges();
      return;
    }
    if (action === "discard") {
      this.discardChanges();
      return;
    }
    if (action === "restore-draft") {
      this.restoreDraft();
      return;
    }
    if (action === "drop-draft") {
      this.forgetDraft();
      this.renderDraftOffer();
      return;
    }
    if (action === "menu") {
      const menu = document.querySelector<HTMLElement>("[data-pl-menu]");
      if (!menu) return;
      menu.hidden = !menu.hidden;
      button.setAttribute("aria-expanded", String(!menu.hidden));
      return;
    }
    if (action === "finals") {
      this.toggleFinalsWeek();
      return;
    }
    if (action === "close-finals") {
      document.querySelector("[data-pl-finals]")?.remove();
      return;
    }
    if (action === "clear-all-annotations") {
      void this.clearAllAnnotations();
      return;
    }
    if (action === "jump-show") {
      this.jumpToMovedCourse();
      return;
    }
    if (action === "jump-undo") {
      this.undoLastMove();
      return;
    }
    if (action === "toggle-all") {
      const allCollapsed =
        this.courses.length > 0 &&
        this.courses.every((course) => this.collapsedCourses.has(course.id));
      this.collapsedCourses.clear();
      if (!allCollapsed) {
        this.courses.forEach((course) => this.collapsedCourses.add(course.id));
      }
      this.applyViewState();
      this.persistViewState();
      return;
    }

    const tools = button.closest<HTMLElement>(`[${OWNED_ATTRIBUTE}][data-course-id]`);
    const courseId = tools?.dataset.courseId;
    if (!courseId) return;

    if (action === "top") {
      this.applyLocalMove(courseId, 0);
    } else if (action === "toggle-course") {
      if (this.collapsedCourses.has(courseId)) this.collapsedCourses.delete(courseId);
      else this.collapsedCourses.add(courseId);
      this.applyViewState();
      this.persistViewState();
    } else if (action === "tag") {
      if (this.openTagEditors.has(courseId)) this.openTagEditors.delete(courseId);
      else this.openTagEditors.add(courseId);
      this.applyViewState();
      if (this.openTagEditors.has(courseId)) {
        this.findTools(courseId)?.querySelector<HTMLInputElement>("[data-pl-tag]")?.focus();
      }
    }
  };

  private closeMenu(): void {
    const menu = document.querySelector<HTMLElement>("[data-pl-menu]");
    if (menu && !menu.hidden) {
      menu.hidden = true;
      document
        .querySelector<HTMLButtonElement>('[data-pl-action="menu"]')
        ?.setAttribute("aria-expanded", "false");
    }
  }

  private onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const tools = target.closest<HTMLElement>(`[${OWNED_ATTRIBUTE}][data-course-id]`);
    const courseId = tools?.dataset.courseId;
    if (!courseId) return;

    if (target instanceof HTMLInputElement && target.matches("[data-pl-tag]")) {
      void this.saveTag(courseId, target.value);
      return;
    }
    if (target instanceof HTMLSelectElement && target.matches("[data-pl-position]")) {
      this.applyLocalMove(courseId, Number(target.value));
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      if (this.drag) {
        const drag = this.drag;
        drag.handle.releasePointerCapture?.(drag.pointerId);
        this.cancelDrag();
        return;
      }
      this.closeMenu();
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches('[data-pl-action="drag"]')) {
      return;
    }
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const tools = target.closest<HTMLElement>(`[${OWNED_ATTRIBUTE}][data-course-id]`);
    const courseId = tools?.dataset.courseId;
    if (!courseId) return;
    const order = this.currentOrder();
    const current = order.indexOf(courseId);
    const destination = event.key === "ArrowUp" ? current - 1 : current + 1;
    if (destination >= 0 && destination < order.length) {
      this.applyLocalMove(courseId, destination);
    }
  };

  // ------------------------------------------------------------------- tags

  private async saveTag(courseId: string, value: string): Promise<void> {
    const annotation = { color: "none" as const, tag: value.trim().slice(0, 24) };
    this.annotations[courseId] = annotation;
    await this.repository.save(this.adapter.getContextKey(), courseId, annotation);
    const course = this.courses.find(({ id }) => id === courseId);
    if (course) this.applyAnnotation(course);
    this.applyViewState();
  }

  private async clearAllAnnotations(): Promise<void> {
    if (!window.confirm("Delete every note you have saved on this computer?")) return;
    await this.repository.clearAll();
    this.annotations = {};
    this.openTagEditors.clear();
    this.setStatus("success", "All notes deleted.");
    this.reconcile();
  }
}
