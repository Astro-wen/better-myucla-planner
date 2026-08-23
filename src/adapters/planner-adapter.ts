import type { MoveDirection } from "../domain/reorder";

const ROOT_SELECTOR = '[data-bf-profile="fixture-v1"][data-bf-course-list]';
const CARD_SELECTOR = ":scope > [data-bf-course-card][data-bf-course-id]";
const DANGEROUS_ACTION_PATTERN =
  /\b(enroll|register|drop|remove|delete|withdraw|exchange|swap|wait[\s-]*list|pte|ecr|confirm|save|cart)\b|选课|退课|候补/i;
const SAFE_STORAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const RESERVED_STORAGE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_FIXTURE_COURSES = 100;

function isSafeStorageKey(value: string): boolean {
  return SAFE_STORAGE_KEY_PATTERN.test(value) && !RESERVED_STORAGE_KEYS.has(value);
}

export interface CourseSnapshot {
  id: string;
  label: string;
  node: HTMLElement;
}

export interface ContractResult {
  ok: boolean;
  reason?: string;
  courses: CourseSnapshot[];
}

export class FixturePlannerAdapter {
  readonly profileName = "fixture-v1";

  getRoot(): HTMLElement | null {
    return document.querySelector<HTMLElement>(ROOT_SELECTOR);
  }

  getContextKey(): string {
    const root = this.requireRoot();
    const term = root.dataset.bfTerm || "unknown-term";
    const plan = root.dataset.bfPlan || "unknown-plan";
    return `${term}::${plan}`;
  }

  inspectContract(): ContractResult {
    const roots = document.querySelectorAll<HTMLElement>(ROOT_SELECTOR);
    if (roots.length !== 1) {
      const reason =
        roots.length === 0
          ? "Couldn't find the verified demo page layout."
          : "There's more than one class list on this page.";
      return { ok: false, reason, courses: [] };
    }

    const root = roots[0];
    const term = root.dataset.bfTerm?.trim() || "";
    const plan = root.dataset.bfPlan?.trim() || "";
    if (
      !isSafeStorageKey(term) ||
      !isSafeStorageKey(plan) ||
      !isSafeStorageKey(`${term}::${plan}`)
    ) {
      return { ok: false, reason: "The demo plan ID didn't pass the safety check.", courses: [] };
    }

    const nodes = [...root.querySelectorAll<HTMLElement>(CARD_SELECTOR)];
    if (nodes.length === 0) {
      return { ok: false, reason: "The class list is empty.", courses: [] };
    }
    if (nodes.length > MAX_FIXTURE_COURSES) {
      return { ok: false, reason: "There are more classes than the demo allows.", courses: [] };
    }

    const courses = nodes.map((node) => ({
      id: node.dataset.bfCourseId?.trim() || "",
      label: (
        node.querySelector<HTMLElement>("[data-bf-course-title]")?.textContent?.trim() ||
        "Untitled class"
      ).slice(0, 120),
      node
    }));

    if (courses.some((course) => !isSafeStorageKey(course.id))) {
      return { ok: false, reason: "At least one class card has no safe, stable ID.", courses: [] };
    }

    const uniqueIds = new Set(courses.map((course) => course.id));
    if (uniqueIds.size !== courses.length) {
      return {
        ok: false,
        reason: "Two classes share the same ID, so reordering is off.",
        courses: []
      };
    }

    for (const course of courses) {
      for (const direction of ["up", "down"] as const) {
        const matches = course.node.querySelectorAll<HTMLElement>(
          `[data-bf-native-action="${direction}"]`
        );
        if (matches.length !== 1) {
          return {
            ok: false,
            reason: `There isn't exactly one ${direction} button on ${course.label}.`,
            courses: []
          };
        }

        if (!this.isSafeMoveButton(matches[0], course.node, direction)) {
          return {
            ok: false,
            reason: `The move buttons on ${course.label} didn't pass the safety check.`,
            courses: []
          };
        }
      }
    }

    return { ok: true, courses };
  }

  getCourses(): CourseSnapshot[] {
    const result = this.inspectContract();
    if (!result.ok) {
      throw new Error(result.reason || "This page didn't pass the safety check.");
    }
    return result.courses;
  }

  getOrder(): string[] {
    return this.getCourses().map((course) => course.id);
  }

  getCourse(courseId: string): CourseSnapshot {
    const course = this.getCourses().find((candidate) => candidate.id === courseId);
    if (!course) {
      throw new Error("Couldn't find that class. The page may have just changed.");
    }
    return course;
  }

  getMoveButton(courseId: string, direction: MoveDirection): HTMLButtonElement {
    const course = this.getCourse(courseId);
    const matches = course.node.querySelectorAll<HTMLButtonElement>(
      `button[data-bf-native-action="${direction}"]`
    );

    if (matches.length !== 1) {
      throw new Error("The page's move button isn't a single exact match, so this stopped.");
    }

    const button = matches[0];
    if (!this.isSafeMoveButton(button, course.node, direction)) {
      throw new Error("That move button isn't on the safety allowlist.");
    }

    if (button.disabled) {
      throw new Error("That move button isn't available right now.");
    }

    return button;
  }

  private requireRoot(): HTMLElement {
    const root = this.getRoot();
    if (!root) {
      throw new Error("The class list is no longer on this page.");
    }
    return root;
  }

  private isSafeMoveButton(
    element: HTMLElement,
    card: HTMLElement,
    direction: MoveDirection
  ): element is HTMLButtonElement {
    if (!(element instanceof HTMLButtonElement) || !card.contains(element)) {
      return false;
    }

    if (element.dataset.bfNativeAction !== direction) {
      return false;
    }

    // The fixture contract only allows inert buttons. A real MyUCLA form-based
    // control needs a separate, explicitly verified page profile.
    if (
      element.type !== "button" ||
      element.form ||
      element.hasAttribute("formaction") ||
      element.hasAttribute("formmethod") ||
      element.hasAttribute("formenctype")
    ) {
      return false;
    }

    const descriptor = [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("name"),
      element.getAttribute("value"),
      element.closest("form")?.getAttribute("action")
    ]
      .filter(Boolean)
      .join(" ");

    if (DANGEROUS_ACTION_PATTERN.test(descriptor)) {
      return false;
    }

    const expectedDirection = direction === "up" ? /\b(up|上移)\b/i : /\b(down|下移)\b/i;
    return expectedDirection.test(descriptor);
  }
}

export function isFixturePlannerPage(): boolean {
  return Boolean(document.querySelector(ROOT_SELECTOR));
}
