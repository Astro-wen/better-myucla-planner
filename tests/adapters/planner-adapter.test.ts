// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FixturePlannerAdapter,
  isFixturePlannerPage
} from "../../src/adapters/planner-adapter";

interface CardOptions {
  id?: string;
  title?: string;
  duplicateUp?: boolean;
  omitDown?: boolean;
  upTag?: "button" | "div";
  upLabel?: string;
  upText?: string;
  upFormAction?: string;
}

function cardMarkup({
  id = "course-1",
  title = "Course 1",
  duplicateUp = false,
  omitDown = false,
  upTag = "button",
  upLabel = `Move ${title} up`,
  upText = "Up",
  upFormAction
}: CardOptions = {}): string {
  const up = `<${upTag} type="button" data-bf-native-action="up" aria-label="${upLabel}">${upText}</${upTag}>`;
  const wrappedUp = upFormAction ? `<form action="${upFormAction}">${up}</form>` : up;

  return `
    <article data-bf-course-card data-bf-course-id="${id}">
      <h3 data-bf-course-title>${title}</h3>
      ${wrappedUp}
      ${duplicateUp ? up : ""}
      ${omitDown ? "" : `<button type="button" data-bf-native-action="down" aria-label="Move ${title} down">Down</button>`}
      <button type="button" data-bf-dangerous-action="enroll">Enroll</button>
    </article>
  `;
}

function renderRoot(cards: string, attributes = ""): void {
  document.body.innerHTML = `
    <main
      data-bf-profile="fixture-v1"
      data-bf-course-list
      data-bf-term="2026F"
      data-bf-plan="main"
      ${attributes}
    >${cards}</main>
  `;
}

describe("FixturePlannerAdapter safety contract", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("accepts the exact fixture profile and returns stable ordered courses", () => {
    renderRoot(
      cardMarkup({ id: "a", title: "Alpha" }) + cardMarkup({ id: "b", title: "Beta" })
    );
    const adapter = new FixturePlannerAdapter();

    expect(isFixturePlannerPage()).toBe(true);
    expect(adapter.inspectContract()).toMatchObject({ ok: true });
    expect(adapter.getOrder()).toEqual(["a", "b"]);
    expect(adapter.getCourses().map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" }
    ]);
    expect(adapter.getContextKey()).toBe("2026F::main");
  });

  it("rejects a missing root, an empty list, a blank ID, and duplicate IDs", () => {
    const adapter = new FixturePlannerAdapter();

    expect(adapter.inspectContract()).toMatchObject({ ok: false, courses: [] });

    renderRoot("");
    expect(adapter.inspectContract()).toMatchObject({
      ok: false,
      reason: expect.stringContaining("class list is empty")
    });

    renderRoot(cardMarkup({ id: "" }));
    expect(adapter.inspectContract()).toMatchObject({
      ok: false,
      reason: expect.stringContaining("no safe, stable ID")
    });

    renderRoot(cardMarkup({ id: "same" }) + cardMarkup({ id: "same" }));
    expect(adapter.inspectContract()).toMatchObject({
      ok: false,
      reason: expect.stringContaining("share the same ID")
    });
  });

  it("rejects missing, duplicate, non-button, and direction-mismatched controls", () => {
    const adapter = new FixturePlannerAdapter();

    renderRoot(cardMarkup({ omitDown: true }));
    expect(adapter.inspectContract()).toMatchObject({ ok: false });

    renderRoot(cardMarkup({ duplicateUp: true }));
    expect(adapter.inspectContract()).toMatchObject({
      ok: false,
      reason: expect.stringContaining("isn't exactly one up button")
    });

    renderRoot(cardMarkup({ upTag: "div" }));
    expect(adapter.inspectContract()).toMatchObject({
      ok: false,
      reason: expect.stringContaining("didn't pass the safety check")
    });

    renderRoot(cardMarkup({ upLabel: "Move Course 1 sideways", upText: "Move" }));
    expect(adapter.inspectContract()).toMatchObject({
      ok: false,
      reason: expect.stringContaining("didn't pass the safety check")
    });
  });

  it("rejects duplicate roots, reserved IDs, submit buttons, and form overrides", () => {
    const adapter = new FixturePlannerAdapter();

    renderRoot(cardMarkup());
    document.body.insertAdjacentHTML(
      "beforeend",
      `<main data-bf-profile="fixture-v1" data-bf-course-list data-bf-term="2026F" data-bf-plan="backup">${cardMarkup({ id: "other" })}</main>`
    );
    expect(adapter.inspectContract()).toMatchObject({
      ok: false,
      reason: expect.stringContaining("more than one class list")
    });

    renderRoot(cardMarkup({ id: "__proto__" }));
    expect(adapter.inspectContract()).toMatchObject({ ok: false });

    renderRoot(cardMarkup().replace('type="button" data-bf-native-action="up"', 'type="submit" data-bf-native-action="up"'));
    expect(adapter.inspectContract()).toMatchObject({ ok: false });

    renderRoot(cardMarkup().replace('type="button" data-bf-native-action="up"', 'type="button" formaction="/move" data-bf-native-action="up"'));
    expect(adapter.inspectContract()).toMatchObject({ ok: false });
  });

  it.each(["/enroll", "/drop", "/exchange", "/waitlist", "/pte", "/ecr"])(
    "rejects a spoofed move control inside dangerous form action %s",
    (action) => {
      renderRoot(cardMarkup({ upFormAction: action }));

      expect(new FixturePlannerAdapter().inspectContract()).toMatchObject({
        ok: false,
        reason: expect.stringContaining("didn't pass the safety check")
      });
    }
  );

  it("rejects a spoofed move control inside a hyphenated /wait-list form action", () => {
    renderRoot(cardMarkup({ upFormAction: "/wait-list" }));

    expect(new FixturePlannerAdapter().inspectContract()).toMatchObject({
      ok: false,
      reason: expect.stringContaining("didn't pass the safety check")
    });
  });

  it("rejects every form-owned move control in the fixture profile", () => {
    renderRoot(cardMarkup({ upFormAction: "/harmless-looking-path" }));

    expect(new FixturePlannerAdapter().inspectContract()).toMatchObject({
      ok: false,
      reason: expect.stringContaining("didn't pass the safety check")
    });
  });

  it("selects only the allowlisted move button and never the nearby Enroll control", () => {
    renderRoot(cardMarkup());
    const adapter = new FixturePlannerAdapter();
    const enroll = document.querySelector<HTMLButtonElement>("[data-bf-dangerous-action]")!;
    const enrollClick = vi.fn();
    enroll.addEventListener("click", enrollClick);

    const move = adapter.getMoveButton("course-1", "up");
    expect(move.dataset.bfNativeAction).toBe("up");
    expect(move).not.toBe(enroll);

    move.click();
    expect(enrollClick).not.toHaveBeenCalled();
  });

  it("refuses a disabled move button at execution time", () => {
    renderRoot(cardMarkup());
    const adapter = new FixturePlannerAdapter();
    document.querySelector<HTMLButtonElement>('[data-bf-native-action="up"]')!.disabled = true;

    expect(adapter.inspectContract()).toMatchObject({ ok: true });
    expect(() => adapter.getMoveButton("course-1", "up")).toThrow("isn't available right now");
  });
});
