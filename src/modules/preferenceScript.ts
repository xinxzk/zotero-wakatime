import { config } from "../../package.json";
import { setPref } from "../utils/prefs";

export async function registerPrefsScripts(_window: Window) {
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
      columns: [],
      rows: [],
    };
  } else {
    addon.data.prefs.window = _window;
  }
  bindPrefEvents();
}

function bindPrefEvents() {
  const doc = addon.data.prefs?.window.document;
  doc
    ?.querySelector(`#zotero-prefpane-${config.addonRef}-heartbeat-interval`)
    ?.addEventListener("change", (e: Event) => {
      const input = e.target as HTMLInputElement;
      const interval = Math.max(30, Number(input.value) || 120);
      input.value = `${interval}`;
    });

  doc
    ?.querySelector(`#zotero-prefpane-${config.addonRef}-api-base-url`)
    ?.addEventListener("change", (e: Event) => {
      const input = e.target as HTMLInputElement;
      const apiBaseUrl = normalizeApiBaseUrl(input.value);
      input.value = apiBaseUrl;
      setPref("apiBaseUrl", apiBaseUrl);
    });

  const toolbarIconCheckbox = doc?.querySelector(
    `#zotero-prefpane-${config.addonRef}-show-toolbar-icon`,
  );
  const syncToolbarButtons = () => {
    addon.data.prefs?.window.setTimeout(() => {
      addon.hooks.syncToolbarButtons();
    }, 0);
  };
  toolbarIconCheckbox?.addEventListener("command", syncToolbarButtons);
  toolbarIconCheckbox?.addEventListener("change", syncToolbarButtons);
}

function normalizeApiBaseUrl(value: string): string {
  const fallback = "https://api.wakatime.com/api/v1";
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.replace(/\/+$/, "");
}
