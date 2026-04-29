import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { ReadingTracker } from "./modules/readingTracker";
import { createZToolkit } from "./utils/ztoolkit";
import { getPref } from "./utils/prefs";

const TOOLBAR_BUTTON_ID = "zotero-wakatime-dashboard-button";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  registerPrefs();
  registerNotifier();
  addon.data.tracker = new ReadingTracker();
  addon.data.tracker.startStatusBarSync();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  registerStyleSheet(win);
  syncToolbarButton(win);

  ztoolkit.log("Zotero WakaTime main window loaded", win.location.href);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  removeToolbarButton(win);
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  ztoolkit.log("Zotero WakaTime main window unloaded", win.location.href);
}

function onShutdown(): void {
  addon.data.tracker?.stop();
  addon.data.tracker?.stopStatusBarSync();
  unregisterNotifier();
  removeToolbarButtons();
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  const tabData = extraData?.[ids[0]];

  if (event == "select" && type == "tab" && tabData?.type == "reader") {
    await addon.data.tracker?.handleTabSelection(ids[0], tabData);
    return;
  }

  if (event == "select" && type == "tab") {
    addon.data.tracker?.stop();
  }
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

function onShortcuts(type: string) {
  switch (type) {
    default:
      break;
  }
}

function onDialogEvents(type: string) {
  switch (type) {
    default:
      break;
  }
}

function registerPrefs() {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/wakatime-96.png`,
  });
}

function registerNotifier() {
  const callback = {
    notify: async (
      event: string,
      type: string,
      ids: number[] | string[],
      extraData: { [key: string]: any },
    ) => {
      if (!addon?.data.alive) {
        unregisterNotifier();
        return;
      }
      await addon.hooks.onNotify(event, type, ids, extraData);
    },
  };

  addon.data.notifierID = Zotero.Notifier.registerObserver(callback, ["tab"]);

  Zotero.Plugins.addObserver({
    shutdown: ({ id }) => {
      if (id === addon.data.config.addonID) {
        unregisterNotifier();
      }
    },
  });
}

function unregisterNotifier() {
  if (!addon.data.notifierID) {
    return;
  }
  Zotero.Notifier.unregisterObserver(addon.data.notifierID);
  addon.data.notifierID = undefined;
}

function syncToolbarButtons(): void {
  Zotero.getMainWindows().forEach((win) => syncToolbarButton(win));
}

function registerStyleSheet(win: Window): void {
  const doc = win.document;
  const stylesID = "zotero-wakatime-styles";
  if (doc.getElementById(stylesID)) {
    return;
  }

  const styles = doc.createElement("link");
  styles.setAttribute("id", stylesID);
  styles.setAttribute("type", "text/css");
  styles.setAttribute("rel", "stylesheet");
  styles.setAttribute(
    "href",
    `chrome://${addon.data.config.addonRef}/content/zoteroPane.css`,
  );
  doc.documentElement?.appendChild(styles);
}

function syncToolbarButton(win: Window): void {
  if (!getPref("showToolbarIcon")) {
    removeToolbarButton(win);
    return;
  }

  const doc = win.document;
  const existingButton = doc.getElementById(TOOLBAR_BUTTON_ID);
  if (existingButton) {
    updateToolbarButton(existingButton);
    return;
  }

  const toolbar = findToolbarContainer(doc);
  if (!toolbar) {
    ztoolkit.log("Unable to find Zotero toolbar for WakaTime button");
    return;
  }

  const button = createToolbarButton(doc);
  const searchBox = doc.querySelector(
    "#zotero-tb-search, #zotero-search-box, #search-box",
  );
  const insertBefore = searchBox?.closest("toolbaritem") ?? searchBox;
  if (insertBefore?.parentElement === toolbar) {
    toolbar.insertBefore(button, insertBefore);
    return;
  }

  toolbar.appendChild(button);
}

function removeToolbarButtons(): void {
  Zotero.getMainWindows().forEach((win) => removeToolbarButton(win));
}

function removeToolbarButton(win: Window): void {
  win.document.getElementById(TOOLBAR_BUTTON_ID)?.remove();
}

function findToolbarContainer(doc: Document): Element | undefined {
  const searchBox = doc.querySelector(
    "#zotero-tb-search, #zotero-search-box, #search-box",
  );
  const searchToolbar = searchBox?.closest("toolbar");
  if (searchToolbar) {
    return searchToolbar;
  }

  return (
    doc.querySelector("#zotero-toolbar") ??
    doc.querySelector("#zotero-items-toolbar") ??
    doc.querySelector("#zotero-pane-toolbar") ??
    doc.querySelector("toolbar") ??
    undefined
  );
}

function createToolbarButton(doc: Document): Element {
  const button = (
    (doc as any).createXULElement?.("toolbarbutton") ??
    doc.createElement("toolbarbutton")
  ) as Element;
  const iconURI = `chrome://${addon.data.config.addonRef}/content/icons/wakatime-128.png`;

  button.setAttribute("id", TOOLBAR_BUTTON_ID);
  button.setAttribute("class", "toolbarbutton-1 chromeclass-toolbar-additional");
  button.setAttribute("image", iconURI);
  button.setAttribute(
    "style",
    [
      `list-style-image: url("${iconURI}");`,
      "--toolbarbutton-inner-padding: 4px;",
      "font-size: 13px;",
      "margin-inline-start: 6px;",
      "margin-inline-end: 8px;",
      "gap: 4px;",
      "--toolbarbutton-icon-fill-attention: currentColor;",
      "--toolbarbutton-icon-width: 18px;",
      "--toolbarbutton-icon-height: 18px;",
    ].join(" "),
  );
  button.addEventListener("command", openWakaTimeDashboard);
  updateToolbarButton(button);
  return button;
}

function updateToolbarButton(button: Element): void {
  const label = formatReadingTime(addon.data.tracker?.getReadingSeconds() ?? 0);
  button.setAttribute("label", label);
  button.setAttribute("tooltiptext", "Open WakaTime dashboard");
}

function openWakaTimeDashboard(): void {
  Zotero.launchURL(getDashboardUrl());
}

function formatReadingTime(totalSeconds: number): string {
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}hrs${minutes}mins`;
  }
  if (hours > 0) {
    return `${hours}hrs`;
  }
  return `${minutes}mins`;
}

function getDashboardUrl(): string {
  const apiBaseUrl = `${getPref("apiBaseUrl") || ""}`;
  if (!apiBaseUrl.includes("api.wakatime.com")) {
    try {
      const url = new URL(apiBaseUrl);
      url.hostname = url.hostname.replace(/^api\./, "");
      url.pathname = "/dashboard";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch (_e) {
      return "https://wakatime.com/dashboard";
    }
  }
  return "https://wakatime.com/dashboard";
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
  syncToolbarButtons,
};
