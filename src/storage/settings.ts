export const ENABLED_KEY = "plannerLift.enabled.v1";

/** The extension is on unless the user has explicitly switched it off. */
export async function readEnabled(): Promise<boolean> {
  if (!globalThis.chrome?.storage?.local) return true;
  const stored = await chrome.storage.local.get(ENABLED_KEY);
  return stored[ENABLED_KEY] !== false;
}

export function watchEnabled(listener: (enabled: boolean) => void): () => void {
  if (!globalThis.chrome?.storage?.onChanged) return () => undefined;
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ): void => {
    if (areaName !== "local" || !(ENABLED_KEY in changes)) return;
    listener(changes[ENABLED_KEY]?.newValue !== false);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

const VIEW_KEY = "plannerLift.view.v1";
const MAX_TRACKED_COURSES = 100;

export interface ViewState {
  collapsed: string[];
  /** False until the student has expressed a preference for this plan. */
  seen: boolean;
}

const EMPTY_VIEW: ViewState = { collapsed: [], seen: false };

function isCourseId(value: unknown): value is string {
  return typeof value === "string" && /^myucla-class-\d{5,12}$/.test(value);
}

/**
 * Only non-sensitive layout preferences. Saving them matters because our own
 * post-save reload would otherwise throw away whatever view the student chose.
 */
export async function readViewState(contextKey: string): Promise<ViewState> {
  if (!globalThis.chrome?.storage?.local) return EMPTY_VIEW;
  const stored = await chrome.storage.local.get(VIEW_KEY);
  const all = stored[VIEW_KEY];
  if (!all || typeof all !== "object") return EMPTY_VIEW;
  const entry = (all as Record<string, unknown>)[contextKey];
  if (!entry || typeof entry !== "object") return EMPTY_VIEW;
  const candidate = entry as Partial<ViewState>;
  return {
    collapsed: Array.isArray(candidate.collapsed)
      ? candidate.collapsed.filter(isCourseId).slice(0, MAX_TRACKED_COURSES)
      : [],
    seen: true
  };
}

export async function saveViewState(contextKey: string, state: ViewState): Promise<void> {
  if (!globalThis.chrome?.storage?.local) return;
  const stored = await chrome.storage.local.get(VIEW_KEY);
  const all =
    stored[VIEW_KEY] && typeof stored[VIEW_KEY] === "object"
      ? { ...(stored[VIEW_KEY] as Record<string, unknown>) }
      : {};
  all[contextKey] = {
    collapsed: state.collapsed.filter(isCourseId).slice(0, MAX_TRACKED_COURSES),
    seen: true
  };
  await chrome.storage.local.set({ [VIEW_KEY]: all });
}

const DRAFT_KEY = "plannerLift.draft.v1";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface OrderDraft {
  /** The order MyUCLA had when the student started rearranging. */
  savedOrder: string[];
  /** The arrangement they built but never saved. */
  desiredOrder: string[];
  moved: string[];
}

function courseIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.filter(isCourseId);
  if (list.length !== value.length || list.length > MAX_TRACKED_COURSES) return null;
  return new Set(list).size === list.length ? list : null;
}

/**
 * A session timeout or an accidental navigation should not cost the student the
 * arrangement they just built. Only course identifiers are kept, never any page
 * content, and the draft expires on its own.
 */
export async function readDraft(contextKey: string): Promise<OrderDraft | null> {
  if (!globalThis.chrome?.storage?.local) return null;
  const stored = await chrome.storage.local.get(DRAFT_KEY);
  const entry = (stored[DRAFT_KEY] as Record<string, unknown> | undefined)?.[contextKey];
  if (!entry || typeof entry !== "object") return null;

  const candidate = entry as Record<string, unknown>;
  if (typeof candidate.expiresAt !== "number" || candidate.expiresAt < Date.now()) {
    return null;
  }
  const savedOrder = courseIdList(candidate.savedOrder);
  const desiredOrder = courseIdList(candidate.desiredOrder);
  const moved = courseIdList(candidate.moved) ?? [];
  if (!savedOrder || !desiredOrder || savedOrder.length !== desiredOrder.length) {
    return null;
  }
  return { savedOrder, desiredOrder, moved };
}

export async function saveDraft(contextKey: string, draft: OrderDraft): Promise<void> {
  if (!globalThis.chrome?.storage?.local) return;
  const stored = await chrome.storage.local.get(DRAFT_KEY);
  const all =
    stored[DRAFT_KEY] && typeof stored[DRAFT_KEY] === "object"
      ? { ...(stored[DRAFT_KEY] as Record<string, unknown>) }
      : {};
  all[contextKey] = { ...draft, expiresAt: Date.now() + DRAFT_TTL_MS };
  await chrome.storage.local.set({ [DRAFT_KEY]: all });
}

export async function clearDraft(contextKey: string): Promise<void> {
  if (!globalThis.chrome?.storage?.local) return;
  const stored = await chrome.storage.local.get(DRAFT_KEY);
  if (!stored[DRAFT_KEY] || typeof stored[DRAFT_KEY] !== "object") return;
  const all = { ...(stored[DRAFT_KEY] as Record<string, unknown>) };
  delete all[contextKey];
  await chrome.storage.local.set({ [DRAFT_KEY]: all });
}

const SESSION_KEY = "plannerLift.session.v1";
export const SESSION_CAP_CHOICES = [30, 60, 120, 0] as const;
const DEFAULT_CAP_MINUTES = 60;

export interface SessionSettings {
  /** Count reading as presence, not just clicking. */
  keepAlive: boolean;
  /** Stop counting presence this long after the page loaded. 0 = no cap. */
  capMinutes: number;
}

const DEFAULT_SESSION: SessionSettings = {
  keepAlive: true,
  capMinutes: DEFAULT_CAP_MINUTES
};

function normalizeCap(value: unknown): number {
  return SESSION_CAP_CHOICES.includes(value as never)
    ? (value as number)
    : DEFAULT_CAP_MINUTES;
}

export async function readSessionSettings(): Promise<SessionSettings> {
  if (!globalThis.chrome?.storage?.local) return DEFAULT_SESSION;
  const stored = await chrome.storage.local.get(SESSION_KEY);
  const entry = stored[SESSION_KEY];
  if (!entry || typeof entry !== "object") return DEFAULT_SESSION;
  const candidate = entry as Partial<SessionSettings>;
  return {
    keepAlive: candidate.keepAlive !== false,
    capMinutes: normalizeCap(candidate.capMinutes)
  };
}

export async function saveSessionSettings(settings: SessionSettings): Promise<void> {
  if (!globalThis.chrome?.storage?.local) return;
  await chrome.storage.local.set({
    [SESSION_KEY]: {
      keepAlive: settings.keepAlive === true,
      capMinutes: normalizeCap(settings.capMinutes)
    }
  });
}

export function watchSessionSettings(listener: () => void): () => void {
  if (!globalThis.chrome?.storage?.onChanged) return () => undefined;
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ): void => {
    if (areaName === "local" && SESSION_KEY in changes) listener();
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

const LAYOUT_KEY = "plannerLift.layout.v1";

export interface LayoutSettings {
  /**
   * Restyle MyUCLA's own class list and weekly grid. Off by default: students
   * know this page, and a familiar page that is slightly untidy beats a tidy
   * page they have to relearn during enrollment week.
   */
  tidy: boolean;
}

const DEFAULT_LAYOUT: LayoutSettings = { tidy: false };

export async function readLayoutSettings(): Promise<LayoutSettings> {
  if (!globalThis.chrome?.storage?.local) return DEFAULT_LAYOUT;
  const stored = await chrome.storage.local.get(LAYOUT_KEY);
  const entry = stored[LAYOUT_KEY];
  if (!entry || typeof entry !== "object") return DEFAULT_LAYOUT;
  return { tidy: (entry as Partial<LayoutSettings>).tidy === true };
}

export async function saveLayoutSettings(settings: LayoutSettings): Promise<void> {
  if (!globalThis.chrome?.storage?.local) return;
  await chrome.storage.local.set({ [LAYOUT_KEY]: { tidy: settings.tidy === true } });
}

export function watchLayoutSettings(listener: (settings: LayoutSettings) => void): () => void {
  if (!globalThis.chrome?.storage?.onChanged) return () => undefined;
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ): void => {
    if (areaName !== "local" || !(LAYOUT_KEY in changes)) return;
    const next = changes[LAYOUT_KEY]?.newValue;
    listener({ tidy: Boolean(next && typeof next === "object" && (next as LayoutSettings).tidy) });
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
