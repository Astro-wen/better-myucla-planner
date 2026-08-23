import type { MoveDirection } from "../domain/reorder";
import type { ContractResult, CourseSnapshot } from "./planner-adapter";

const PAGE_ORIGIN = "https://be.my.ucla.edu";
const PAGE_PATH = "/ClassPlanner/ClassPlan.aspx";
const ROOT_SELECTOR =
  "#ctl00_MainContent_classPlanPanel #panelPlan #div_landing > table";
const CARD_SELECTOR = ":scope > tbody.courseItem";
const TERM_SELECTOR = "#ctl00_MainContent_termSessionChooser_TermChooser";
const PLAN_ID_SELECTOR = "#ctl00_MainContent_planIDField";
const FORM_ID = "aspnetForm";
const TRACKER_FIELD = "ctl00_MainContent_planClassListView_clCommandFieldTracker";
const COMMAND_FIELD = "ctl00_MainContent_planClassListView_clCommandField";
const MAX_COURSES = 100;

function extractNumericClassId(card: HTMLElement): string | null {
  const className = [...card.classList].find((value) => /^Class\d{5,12}$/.test(value));
  return className ? className.slice("Class".length) : null;
}

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled class";
}

export const plannerPageUrl = `${PAGE_ORIGIN}${PAGE_PATH}`;

function readOfficialLabel(labelHost: HTMLElement): string {
  const copy = labelHost.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[data-planner-lift-owned]").forEach((node) => node.remove());
  return normalizeLabel(copy.textContent || "");
}

function actionPath(form: HTMLFormElement): string | null {
  try {
    const base = form.ownerDocument.defaultView?.location.href;
    if (!base) return null;
    return new URL(form.getAttribute("action") || "", base).pathname;
  } catch {
    return null;
  }
}

export class MyUclaPlannerAdapter {
  readonly profileName = "myucla-class-plan-v1";
  readonly supportsLocalColor = false;
  readonly usesFullNavigation = true;

  /**
   * The adapter is bound to one document so the exact same strict contract can
   * validate the visible page and an offscreen same-origin Class Planner frame.
   */
  constructor(private readonly doc: Document = document) {}

  private get view(): Window {
    const view = this.doc.defaultView;
    if (!view) {
      throw new Error("Couldn't reach the MyUCLA page.");
    }
    return view;
  }

  getDocument(): Document {
    return this.doc;
  }

  getRoot(): HTMLElement | null {
    return this.doc.querySelector<HTMLElement>(ROOT_SELECTOR);
  }

  getContextKey(): string {
    const term = this.doc.querySelector<HTMLSelectElement>(TERM_SELECTOR)?.value || "";
    const planId = this.doc.querySelector<HTMLInputElement>(PLAN_ID_SELECTOR)?.value || "";
    if (!/^\d{2}[A-Z]$/.test(term) || !/^\d{1,12}$/.test(planId)) {
      throw new Error("The MyUCLA term or plan ID didn't pass the safety check.");
    }
    return `myucla-${term}-plan-${planId}`;
  }

  inspectContract(): ContractResult {
    let location: Location;
    try {
      location = this.view.location;
    } catch {
      return { ok: false, reason: "This isn't the verified MyUCLA Class Planner page.", courses: [] };
    }
    if (location.origin !== PAGE_ORIGIN || location.pathname !== PAGE_PATH) {
      return { ok: false, reason: "This isn't the verified MyUCLA Class Planner page.", courses: [] };
    }

    const roots = this.doc.querySelectorAll<HTMLElement>(ROOT_SELECTOR);
    if (roots.length !== 1) {
      return { ok: false, reason: "There isn't exactly one MyUCLA class list on this page.", courses: [] };
    }

    const term = this.doc.querySelectorAll<HTMLSelectElement>(TERM_SELECTOR);
    const plan = this.doc.querySelectorAll<HTMLInputElement>(PLAN_ID_SELECTOR);
    if (
      term.length !== 1 ||
      plan.length !== 1 ||
      !/^\d{2}[A-Z]$/.test(term[0].value) ||
      !/^\d{1,12}$/.test(plan[0].value)
    ) {
      return {
        ok: false,
        reason: "The MyUCLA term or plan ID didn't pass the safety check.",
        courses: []
      };
    }

    const root = roots[0];
    const form = root.closest<HTMLFormElement>("form");
    if (
      !form ||
      form.id !== FORM_ID ||
      form.method.toLowerCase() !== "post" ||
      actionPath(form) !== PAGE_PATH
    ) {
      return { ok: false, reason: "MyUCLA's page form changed.", courses: [] };
    }

    const cards = [...root.querySelectorAll<HTMLElement>(CARD_SELECTOR)];
    if (cards.length === 0 || cards.length > MAX_COURSES) {
      return { ok: false, reason: "The number of classes on the page isn't safe to work with.", courses: [] };
    }

    const courses: CourseSnapshot[] = [];
    for (const card of cards) {
      const numericId = extractNumericClassId(card);
      const labelHost = card.querySelector<HTMLElement>(
        ":scope > tr:first-child > td.SubjectAreaName_ClassName"
      );
      const toolsHost = card.querySelector<HTMLElement>(
        ":scope > tr:first-child > td.linkPanelRight"
      );
      const ordering = toolsHost?.querySelector<HTMLElement>(":scope > div.OrderingButtons");

      if (!numericId || !labelHost || !toolsHost || !ordering) {
        return { ok: false, reason: "At least one MyUCLA class card changed shape.", courses: [] };
      }

      for (const direction of ["up", "down"] as const) {
        const selector = `button.move${direction}Class`;
        const buttons = ordering.querySelectorAll<HTMLElement>(selector);
        if (
          buttons.length !== 1 ||
          !this.isSafeMoveButton(buttons[0], card, numericId, direction, form)
        ) {
          return {
            ok: false,
            reason: `MyUCLA's ${direction} reorder button didn't pass the strict allowlist.`,
            courses: []
          };
        }
      }

      courses.push({
        id: `myucla-class-${numericId}`,
        label: readOfficialLabel(labelHost),
        node: card
      });
    }

    if (new Set(courses.map(({ id }) => id)).size !== courses.length) {
      return { ok: false, reason: "Two MyUCLA classes share the same ID.", courses: [] };
    }

    return { ok: true, courses };
  }

  getCourses(): CourseSnapshot[] {
    const result = this.inspectContract();
    if (!result.ok) {
      throw new Error(result.reason || "The MyUCLA page didn't pass the safety check.");
    }
    return result.courses;
  }

  getOrder(): string[] {
    return this.getCourses().map(({ id }) => id);
  }

  getCourse(courseId: string): CourseSnapshot {
    const course = this.getCourses().find(({ id }) => id === courseId);
    if (!course) {
      throw new Error("Couldn't find that class. The page may have just changed.");
    }
    return course;
  }

  getMoveButton(courseId: string, direction: MoveDirection): HTMLButtonElement {
    const course = this.getCourse(courseId);
    const numericId = extractNumericClassId(course.node);
    const form = course.node.closest<HTMLFormElement>("form");
    const buttons = course.node.querySelectorAll<HTMLElement>(
      `:scope > tr:first-child > td.linkPanelRight > div.OrderingButtons button.move${direction}Class`
    );

    if (
      !numericId ||
      !form ||
      buttons.length !== 1 ||
      !this.isSafeMoveButton(buttons[0], course.node, numericId, direction, form)
    ) {
      throw new Error("That MyUCLA reorder button no longer matches the verified allowlist.");
    }

    const button = buttons[0];
    const style = this.view.getComputedStyle(button);
    if (button.disabled || style.visibility !== "visible" || style.display === "none") {
      throw new Error("That MyUCLA reorder button isn't available right now.");
    }
    return button;
  }

  getToolsHost(course: CourseSnapshot): HTMLElement {
    const host = course.node.querySelector<HTMLElement>(
      ":scope > tr:first-child > td.linkPanelRight"
    );
    if (!host) {
      throw new Error("Couldn't find the spot to add the class buttons.");
    }
    return host;
  }

  getLabelHost(course: CourseSnapshot): HTMLElement {
    const host = course.node.querySelector<HTMLElement>(
      ":scope > tr:first-child > td.SubjectAreaName_ClassName"
    );
    if (!host) {
      throw new Error("Couldn't find the spot to add the class label.");
    }
    return host;
  }

  getCourseIdFromNode(node: Element): string | null {
    const card = node.closest<HTMLElement>("tbody.courseItem");
    const numericId = card ? extractNumericClassId(card) : null;
    return numericId ? `myucla-class-${numericId}` : null;
  }

  private isSafeMoveButton(
    element: HTMLElement,
    card: HTMLElement,
    numericId: string,
    direction: MoveDirection,
    form: HTMLFormElement
  ): element is HTMLButtonElement {
    // `element` may belong to an offscreen same-origin planner frame, so the
    // constructor has to come from that frame's realm rather than this one.
    const ButtonConstructor = (this.view as unknown as {
      HTMLButtonElement?: typeof HTMLButtonElement;
    }).HTMLButtonElement;
    if (
      !ButtonConstructor ||
      !(element instanceof ButtonConstructor) ||
      !card.contains(element)
    ) {
      return false;
    }

    const actionName = direction === "up" ? "moveupClass" : "movedownClass";
    const idPrefix = direction === "up" ? "muClass" : "mdClass";
    const expectedLabel = `Move this Class ${direction} in the list`;
    const expectedOnclick =
      `courseListAction($(\".maincontentpanel\")[0].id, \"${TRACKER_FIELD}\", ` +
      `\"${COMMAND_FIELD}\", \"${actionName}|${numericId}!0\"); return false;`;
    const onclick = (element.getAttribute("onclick") || "").replace(/\s+/g, " ").trim();

    return (
      element.id === `${idPrefix}${numericId}` &&
      element.classList.contains("link") &&
      element.classList.contains(actionName) &&
      element.getAttribute("title") === expectedLabel &&
      element.getAttribute("aria-label") === expectedLabel &&
      element.getAttribute("type") === null &&
      element.form === form &&
      form.id === FORM_ID &&
      form.method.toLowerCase() === "post" &&
      actionPath(form) === PAGE_PATH &&
      !element.hasAttribute("formaction") &&
      !element.hasAttribute("formmethod") &&
      !element.hasAttribute("formenctype") &&
      onclick === expectedOnclick
    );
  }
}

export function isMyUclaPlannerPage(): boolean {
  return (
    window.location.origin === PAGE_ORIGIN &&
    window.location.pathname === PAGE_PATH &&
    document.querySelectorAll(ROOT_SELECTOR).length === 1
  );
}
