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
    this.current = undefined;
  }

  private start(context: ReaderContext): void {
    const interval = this.getHeartbeatInterval();
    this.current = context;

    if (this.timerID !== undefined) {
      clearInterval(this.timerID);
    }

    void this.sendCurrentHeartbeat();
    this.timerID = setInterval(() => {
      void this.sendCurrentHeartbeat();
    }, interval * 1000) as unknown as number;
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
}
