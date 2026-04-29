import { getPref } from "../utils/prefs";
import { WakaTimeClient } from "./wakatimeClient";

type ReaderContext = {
  entity: string;
  project: string;
};

export class ReadingTracker {
  private client = new WakaTimeClient();
  private current?: ReaderContext;
  private timerID?: number;
  private displayTimerID?: number;
  private statusBarTimerID?: number;
  private activeStartedAt?: number;
  private remoteTodaySeconds = 0;
  private todaySeconds = 0;
  private todayKey = this.getTodayKey();

  async handleTabSelection(
    tabID: string | number,
    tabData?: { [key: string]: any },
  ): Promise<void> {
    if (!getPref("enable")) {
      this.stop();
      return;
    }

    if (tabData?.type !== "reader") {
      this.stop();
      return;
    }

    const context = await this.resolveReaderContext(tabID, tabData);
    if (!context) {
      this.stop();
      return;
    }

    this.start(context);
  }

  stop(): void {
    if (this.timerID !== undefined) {
      clearInterval(this.timerID);
      this.timerID = undefined;
    }
    if (this.displayTimerID !== undefined) {
      clearInterval(this.displayTimerID);
      this.displayTimerID = undefined;
    }
    this.flushActiveTime();
    this.current = undefined;
    addon.hooks.syncToolbarButtons();
  }

  startStatusBarSync(): void {
    void this.refreshTodaySeconds();
    if (this.statusBarTimerID !== undefined) {
      clearInterval(this.statusBarTimerID);
    }
    this.statusBarTimerID = setInterval(
      () => {
        void this.refreshTodaySeconds();
      },
      5 * 60 * 1000,
    ) as unknown as number;
  }

  stopStatusBarSync(): void {
    if (this.statusBarTimerID !== undefined) {
      clearInterval(this.statusBarTimerID);
      this.statusBarTimerID = undefined;
    }
  }

  getReadingSeconds(): number {
    this.resetDailyTimeIfNeeded();
    return Math.floor(
      this.remoteTodaySeconds + this.todaySeconds + this.getActiveSeconds(),
    );
  }

  private start(context: ReaderContext): void {
    const interval = this.getHeartbeatInterval();
    if (!this.current) {
      this.activeStartedAt = Date.now();
    }
    this.current = context;

    if (this.timerID !== undefined) {
      clearInterval(this.timerID);
    }
    if (this.displayTimerID !== undefined) {
      clearInterval(this.displayTimerID);
    }

    void this.sendCurrentHeartbeat();
    this.timerID = setInterval(() => {
      void this.sendCurrentHeartbeat();
    }, interval * 1000) as unknown as number;
    this.displayTimerID = setInterval(() => {
      addon.hooks.syncToolbarButtons();
    }, 30 * 1000) as unknown as number;
    addon.hooks.syncToolbarButtons();
  }

  private async sendCurrentHeartbeat(): Promise<void> {
    if (!this.current || !getPref("enable")) {
      this.stop();
      return;
    }

    await this.client.sendHeartbeat({
      entity: this.current.entity,
      type: "app",
      category: "researching",
      project: this.current.project,
      time: Date.now() / 1000,
    });
    void this.refreshTodaySeconds();
  }

  private async resolveReaderContext(
    tabID: string | number,
    tabData?: { [key: string]: any },
  ): Promise<ReaderContext | undefined> {
    const item = await this.resolveReaderItem(tabID, tabData);
    if (!item) {
      return undefined;
    }

    const parentItem = this.getParentItem(item);
    const title = this.getItemTitle(parentItem);

    return {
      entity: getPref("includeTitle") ? title : `zotero-item-${parentItem.id}`,
      project: this.getProjectName(parentItem),
    };
  }

  private async resolveReaderItem(
    tabID: string | number,
    tabData?: { [key: string]: any },
  ): Promise<any | undefined> {
    const itemID =
      tabData?.itemID ??
      tabData?.itemId ??
      tabData?.selectedItemID ??
      tabData?.selectedItemId ??
      this.getReaderItemID(tabID);

    if (!itemID) {
      return undefined;
    }

    return Zotero.Items.get(itemID);
  }

  private getReaderItemID(tabID: string | number): number | undefined {
    try {
      const reader = (Zotero as any).Reader?.getByTabID?.(tabID);
      return (
        reader?.itemID ??
        reader?.itemId ??
        reader?._itemID ??
        reader?._itemId ??
        reader?._item?.id
      );
    } catch (e) {
      ztoolkit.log("Unable to resolve reader item", e);
      return undefined;
    }
  }

  private getParentItem(item: any): any {
    try {
      if (item.parentItemID) {
        return Zotero.Items.get(item.parentItemID);
      }
    } catch (e) {
      ztoolkit.log("Unable to resolve parent item", e);
    }
    return item;
  }

  private getItemTitle(item: any): string {
    const title = item.getField?.("title");
    if (title) {
      return title;
    }
    return `Zotero Item ${item.id}`;
  }

  private getProjectName(item: any): string {
    try {
      const collectionIDs = item.getCollections?.() || [];
      const collectionID = collectionIDs[0];
      if (collectionID) {
        const collection = Zotero.Collections.get(collectionID);
        if (collection?.name) {
          return collection.name;
        }
      }
    } catch (e) {
      ztoolkit.log("Unable to resolve collection name", e);
    }

    return `${getPref("defaultProject") || "Zotero Reading"}`;
  }

  private getHeartbeatInterval(): number {
    const interval = Number(getPref("heartbeatInterval")) || 120;
    return Math.max(30, interval);
  }

  private flushActiveTime(): void {
    this.resetDailyTimeIfNeeded();
    this.todaySeconds += this.getActiveSeconds();
    this.activeStartedAt = undefined;
  }

  private getActiveSeconds(): number {
    if (!this.activeStartedAt || !this.current) {
      return 0;
    }
    return Math.max(0, (Date.now() - this.activeStartedAt) / 1000);
  }

  private resetDailyTimeIfNeeded(): void {
    const todayKey = this.getTodayKey();
    if (todayKey === this.todayKey) {
      return;
    }
    this.todayKey = todayKey;
    this.remoteTodaySeconds = 0;
    this.todaySeconds = 0;
    this.activeStartedAt = this.current ? Date.now() : undefined;
    void this.refreshTodaySeconds();
  }

  private getTodayKey(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private async refreshTodaySeconds(): Promise<void> {
    const displayedSeconds = this.getReadingSeconds();
    const todaySeconds = await this.client.getTodaySeconds();
    if (todaySeconds === undefined) {
      return;
    }

    this.remoteTodaySeconds = Math.max(todaySeconds, displayedSeconds);
    this.todaySeconds = 0;
    this.activeStartedAt = this.current ? Date.now() : undefined;
    addon.hooks.syncToolbarButtons();
  }
}
