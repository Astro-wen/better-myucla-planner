const CHANNEL = "better-myucla/session-timeout/v1";

export interface SessionCountdown {
  /** Minutes until the idle/feature timeout, when MyUCLA reports one. */
  feature: number | null;
  /** Minutes until the absolute session cap. */
  max: number | null;
}

export type CountdownListener = (countdown: SessionCountdown) => void;

function sanitize(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 24 * 60) return null;
  return Math.floor(value);
}

/**
 * Listens for the page-world bridge. Only same-window, same-origin messages on
 * our own channel are accepted, and only two bounded numbers are read out.
 */
export function watchSessionCountdown(listener: CountdownListener): () => void {
  const handler = (event: MessageEvent): void => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.channel !== CHANNEL) return;
    const feature = sanitize(data.feature);
    const max = sanitize(data.max);
    if (feature === null && max === null) return;
    listener({ feature, max });
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

/** The soonest thing that will actually log the student out. */
export function remainingMinutes(countdown: SessionCountdown): number | null {
  const values = [countdown.feature, countdown.max].filter(
    (value): value is number => value !== null
  );
  return values.length > 0 ? Math.min(...values) : null;
}

export function countdownLevel(minutes: number): "calm" | "soon" | "urgent" {
  if (minutes <= 3) return "urgent";
  if (minutes <= 10) return "soon";
  return "calm";
}
