import { config } from "../../package.json";

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
}
