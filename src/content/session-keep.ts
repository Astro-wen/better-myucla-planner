import { readSessionSettings, watchSessionSettings } from "../storage/settings";

const KEEP_CHANNEL = "better-myucla/session-keep/v1";

function post(settings: { keepAlive: boolean; capMinutes: number }): void {
  window.postMessage(
    { channel: KEEP_CHANNEL, keepAlive: settings.keepAlive, capMinutes: settings.capMinutes },
    window.location.origin
  );
}

/**
 * Bridges the popup's session preference into the page world, which is the only
 * place MyUCLA's own extend call lives. Pushes on start, on every change, and
 * whenever the page-world half asks for it (whichever side loads first).
 */
export function publishSessionSettings(): () => void {
  let disposed = false;

  const send = (): void => {
    if (disposed) return;
    void readSessionSettings()
      .then((settings) => {
        if (!disposed) post(settings);
      })
      .catch(() => undefined);
  };

  const onRequest = (event: MessageEvent): void => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.channel !== KEEP_CHANNEL || data.request !== true) return;
    send();
  };

  window.addEventListener("message", onRequest);
  const stopWatching = watchSessionSettings(send);
  send();

  return () => {
    disposed = true;
    window.removeEventListener("message", onRequest);
    stopWatching();
  };
}
