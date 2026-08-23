export const COLOR_OPTIONS = ["none", "blue", "green", "yellow", "purple", "red", "gray"] as const;
export type AnnotationColor = (typeof COLOR_OPTIONS)[number];

export interface CourseAnnotation {
  color: AnnotationColor;
  tag: string;
}

interface AnnotationStore {
  schemaVersion: 1;
  contexts: Record<string, Record<string, CourseAnnotation>>;
}

const STORAGE_KEY = "plannerLift.annotations.v1";
const EMPTY_STORE: AnnotationStore = { schemaVersion: 1, contexts: {} };
const SAFE_KEY_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_CONTEXTS = 24;
const MAX_COURSES_PER_CONTEXT = 100;

function normalizeTag(tag: string): string {
  return tag.trim().slice(0, 24);
}

function isKnownColor(value: string): value is AnnotationColor {
  return (COLOR_OPTIONS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSafeKey(value: string, label: string): void {
  if (!SAFE_KEY_PATTERN.test(value) || RESERVED_KEYS.has(value)) {
    throw new Error(`${label} isn't safe to use as a local storage key.`);
  }
}

function normalizeStore(value: unknown): AnnotationStore {
  const normalized: AnnotationStore = { schemaVersion: 1, contexts: {} };
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.contexts)) {
    return normalized;
  }

  for (const [contextKey, rawContext] of Object.entries(value.contexts).slice(0, MAX_CONTEXTS)) {
    if (
      !SAFE_KEY_PATTERN.test(contextKey) ||
      RESERVED_KEYS.has(contextKey) ||
      !isRecord(rawContext)
    ) {
      continue;
    }

    const context: Record<string, CourseAnnotation> = {};
    for (const [courseId, rawAnnotation] of Object.entries(rawContext).slice(
      0,
      MAX_COURSES_PER_CONTEXT
    )) {
      if (
        !SAFE_KEY_PATTERN.test(courseId) ||
        RESERVED_KEYS.has(courseId) ||
        !isRecord(rawAnnotation) ||
        typeof rawAnnotation.color !== "string" ||
        typeof rawAnnotation.tag !== "string"
      ) {
        continue;
      }
      context[courseId] = {
        color: isKnownColor(rawAnnotation.color) ? rawAnnotation.color : "none",
        tag: normalizeTag(rawAnnotation.tag)
      };
    }
    normalized.contexts[contextKey] = context;
  }
  return normalized;
}

export class AnnotationRepository {
  private memoryFallback: AnnotationStore = structuredClone(EMPTY_STORE);

  async getContext(contextKey: string): Promise<Record<string, CourseAnnotation>> {
    assertSafeKey(contextKey, "The plan ID");
    const store = await this.readStore();
    return structuredClone(store.contexts[contextKey] || {});
  }

  async save(
    contextKey: string,
    courseId: string,
    annotation: CourseAnnotation
  ): Promise<void> {
    assertSafeKey(contextKey, "The plan ID");
    assertSafeKey(courseId, "The class ID");
    const store = await this.readStore();
    const context = store.contexts[contextKey] || {};
    context[courseId] = {
      color: isKnownColor(annotation.color) ? annotation.color : "none",
      tag: normalizeTag(annotation.tag)
    };
    store.contexts[contextKey] = context;
    await this.writeStore(store);
  }

  async clearContext(contextKey: string): Promise<void> {
    assertSafeKey(contextKey, "The plan ID");
    const store = await this.readStore();
    delete store.contexts[contextKey];
    await this.writeStore(store);
  }

  async clearAll(): Promise<void> {
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.remove(STORAGE_KEY);
      return;
    }

    this.memoryFallback = structuredClone(EMPTY_STORE);
  }

  private async readStore(): Promise<AnnotationStore> {
    if (globalThis.chrome?.storage?.local) {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return normalizeStore(result[STORAGE_KEY]);
    }

    return normalizeStore(this.memoryFallback);
  }

  private async writeStore(store: AnnotationStore): Promise<void> {
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEY]: normalizeStore(store) });
      return;
    }

    this.memoryFallback = normalizeStore(store);
  }
}
