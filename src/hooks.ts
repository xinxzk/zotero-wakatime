import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { ReadingTracker } from "./modules/readingTracker";
import { createZToolkit } from "./utils/ztoolkit";

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

  ztoolkit.log("Zotero WakaTime main window loaded", win.location.href);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  ztoolkit.log("Zotero WakaTime main window unloaded", win.location.href);
}

function onShutdown(): void {
  addon.data.tracker?.stop();
  unregisterNotifier();
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
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
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

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
