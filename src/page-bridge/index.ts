/**
 * Runs in the page's own JavaScript world, which is the only place MyUCLA's
 * session helpers exist. It does two narrow things and nothing else.
 *
 * 1. Forwards MyUCLA's two timeout counters to the extension.
 * 2. Optionally counts *reading* as presence.
 *
 * On (2): `IWE/js/Timeout.js` extends the idle timer on `mousedown keydown
 * click` only, and on the Class Planner `keepAlive` is empty, so no heartbeat
 * runs. A student scrolling through a seventeen-course plan for fifteen minutes
 * is plainly at the keyboard, and gets signed out anyway. This closes that gap
 * and nothing more: it never fires on a timer, never while the tab is hidden or
 * unfocused, never more than once a minute, and stops entirely after a cap. If
 * the student walks away, the session times out exactly as it would have.
 */
const TIMEOUT_CHANNEL = "better-myucla/session-timeout/v1";
const KEEP_CHANNEL = "better-myucla/session-keep/v1";
const POLL_MS = 15_000;
const MIN_EXTEND_GAP_MS = 60_000;
const PRESENCE_EVENTS = [
  "scroll",
  "wheel",
  "mousemove",
  "keydown",
  "pointerdown",
  "touchstart"
] as const;

type Countdown = { feature: number | null; max: number | null };

function readMinutes(name: string): number | null {
  const value = (window as unknown as Record<string, unknown>)[name];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 24 * 60) return null;
  return Math.floor(value);
}

function publish(): void {
  const payload: Countdown = {
    feature: readMinutes("featureTimeoutMinutes"),
    max: readMinutes("maxTimeoutMinutes")
  };
  if (payload.feature === null && payload.max === null) return;
  window.postMessage({ channel: TIMEOUT_CHANNEL, ...payload }, window.location.origin);
}

publish();
window.setInterval(publish, POLL_MS);

// ---------------------------------------------------------------- presence

const loadedAt = Date.now();
let keepAlive = false;
let capMs = 0;
let lastExtendAt = 0;

function withinCap(): boolean {
  return capMs === 0 || Date.now() - loadedAt <= capMs;
}

function present(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

function onPresence(): void {
  if (!keepAlive || !withinCap() || !present()) return;
  const now = Date.now();
  if (now - lastExtendAt < MIN_EXTEND_GAP_MS) return;
  const extend = (window as unknown as Record<string, unknown>).ExtendSession;
  if (typeof extend !== "function") return;
  lastExtendAt = now;
  try {
    // MyUCLA's own call, with its own throttle and its own CSRF token.
    (extend as (toKeepAlive: boolean) => void)(false);
  } catch {
    // The page owns this; a failure is not ours to handle.
  }
}

for (const type of PRESENCE_EVENTS) {
  window.addEventListener(type, onPresence, { passive: true, capture: true });
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data as Record<string, unknown> | null;
  if (!data || data.channel !== KEEP_CHANNEL || data.request === true) return;
  keepAlive = data.keepAlive === true;
  const cap = data.capMinutes;
  capMs = typeof cap === "number" && cap > 0 && cap <= 24 * 60 ? cap * 60_000 : 0;
});

window.postMessage({ channel: KEEP_CHANNEL, request: true }, window.location.origin);
