import {
  ENABLED_KEY,
  readEnabled,
  readLayoutSettings,
  readSessionSettings,
  saveLayoutSettings,
  saveSessionSettings
} from "../storage/settings";

const toggle = document.getElementById("toggle") as HTMLInputElement | null;
const state = document.getElementById("state");
const keepAlive = document.getElementById("keep-alive") as HTMLInputElement | null;
const cap = document.getElementById("cap") as HTMLSelectElement | null;
const capRow = document.getElementById("cap-row");
const tidy = document.getElementById("tidy") as HTMLInputElement | null;

function renderEnabled(enabled: boolean): void {
  if (toggle) toggle.checked = enabled;
  if (state) {
    state.textContent = enabled
      ? "On. Active on the Class Planner page."
      : "Off. Class Planner looks exactly as MyUCLA made it.";
  }
}

function renderSession(settings: { keepAlive: boolean; capMinutes: number }): void {
  if (keepAlive) keepAlive.checked = settings.keepAlive;
  if (cap) cap.value = String(settings.capMinutes);
  if (capRow) capRow.hidden = !settings.keepAlive;
}

void readEnabled().then(renderEnabled);
void readSessionSettings().then(renderSession);
void readLayoutSettings().then(({ tidy: on }) => {
  if (tidy) tidy.checked = on;
});

tidy?.addEventListener("change", () => {
  void saveLayoutSettings({ tidy: tidy.checked });
});

toggle?.addEventListener("change", () => {
  const enabled = toggle.checked;
  renderEnabled(enabled);
  void chrome.storage.local.set({ [ENABLED_KEY]: enabled });
});

function persistSession(): void {
  const settings = {
    keepAlive: keepAlive?.checked === true,
    capMinutes: Number(cap?.value ?? 60)
  };
  renderSession(settings);
  void saveSessionSettings(settings);
}

keepAlive?.addEventListener("change", persistSession);
cap?.addEventListener("change", persistSession);
