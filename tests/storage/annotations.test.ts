// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnnotationRepository } from "../../src/storage/annotations";
import { readViewState, saveViewState } from "../../src/storage/settings";

const STORAGE_KEY = "plannerLift.annotations.v1";

describe("AnnotationRepository", () => {
  let stored: Record<string, unknown>;
  let remove: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stored = {};
    remove = vi.fn(async (key: string) => {
      delete stored[key];
    });
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => {
            Object.assign(stored, value);
          }),
          remove
        }
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores only bounded annotations under safe fixture keys", async () => {
    const repository = new AnnotationRepository();
    await repository.save("2026F::main", "demo-01", {
      color: "blue",
      tag: `  ${"x".repeat(40)}  `
    });

    expect(await repository.getContext("2026F::main")).toEqual({
      "demo-01": { color: "blue", tag: "x".repeat(24) }
    });
    await expect(
      repository.save("2026F::main", "__proto__", { color: "none", tag: "bad" })
    ).rejects.toThrow("safe to use as a local storage key");
  });

  it("sanitizes corrupted data and can remove all extension annotations", async () => {
    stored[STORAGE_KEY] = {
      schemaVersion: 1,
      contexts: {
        "2026F::main": {
          "demo-01": { color: "not-a-color", tag: "safe" },
          constructor: { color: "red", tag: "blocked" }
        }
      }
    };
    const repository = new AnnotationRepository();

    expect(await repository.getContext("2026F::main")).toEqual({
      "demo-01": { color: "none", tag: "safe" }
    });

    await repository.clearAll();
    expect(remove).toHaveBeenCalledWith(STORAGE_KEY);
    expect(stored[STORAGE_KEY]).toBeUndefined();
  });
});

describe("view state", () => {
  it("round-trips only layout preferences and rejects junk course ids", async () => {
    const stored: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => Object.assign(stored, value))
        }
      }
    });

    expect(await readViewState("myucla-26F-plan-1234567")).toEqual({
      collapsed: [],
      seen: false
    });

    await saveViewState("myucla-26F-plan-1234567", {
      collapsed: ["myucla-class-26440403", "not-a-course", "<script>"],
      seen: true
    });
    const restored = await readViewState("myucla-26F-plan-1234567");

    expect(restored).toEqual({
      collapsed: ["myucla-class-26440403"],
      seen: true
    });
    expect(await readViewState("myucla-26F-plan-9999999")).toEqual({
      collapsed: [],
      seen: false
    });
    vi.unstubAllGlobals();
  });
});
