const BOOT_CLASS = "pl-boot";
const RESUME_KEY = "plannerLift.afterSync.v1";
const FAILSAFE_MS = 2_000;

/**
 * Runs at document_start after a sync reload. Holding the plan area back for a
 * beat turns the reload into a settle instead of a flash of half-styled rows.
 * The stylesheet reveals it on its own if this script never gets to.
 */
export function applyBootHold(): void {
  try {
    if (!window.sessionStorage.getItem(RESUME_KEY)) return;
  } catch {
    return;
  }
  document.documentElement.classList.add(BOOT_CLASS);
  window.setTimeout(releaseBootHold, FAILSAFE_MS);
}

export function releaseBootHold(): void {
  document.documentElement.classList.remove(BOOT_CLASS);
}
